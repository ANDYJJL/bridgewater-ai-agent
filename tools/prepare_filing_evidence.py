from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tools.milestone04_common import SEC_CIK_BY_TICKER, TARGET_TICKERS, parse_float, utc_now_iso, write_json


FACT_CANDIDATES = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss"],
    "assets": ["Assets"],
    "liabilities": ["Liabilities"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "debt": [
        "LongTermDebtAndFinanceLeaseObligations",
        "LongTermDebtNoncurrent",
        "LongTermDebtCurrent",
        "LongTermDebt",
    ],
}

INCOME_FACT_KEYS = {"revenue", "gross_profit", "operating_income", "net_income"}
BALANCE_FACT_KEYS = {"assets", "liabilities", "cash", "debt"}
ANNUAL_FORMS = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"}


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _latest_filing(submissions: dict[str, Any] | None, form_type: str) -> dict[str, Any] | None:
    if not submissions:
        return None
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    filing_dates = recent.get("filingDate", [])
    primary_docs = recent.get("primaryDocument", [])
    for index, form in enumerate(forms):
        if form == form_type:
            return {
                "form": form,
                "accession_number": accessions[index] if index < len(accessions) else None,
                "filing_date": filing_dates[index] if index < len(filing_dates) else None,
                "primary_document": primary_docs[index] if index < len(primary_docs) else None,
            }
    return None


def _normalized_fy(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_fact_series(companyfacts: dict[str, Any] | None, fact_names: list[str]) -> tuple[list[dict[str, Any]], str | None]:
    if not companyfacts:
        return [], None

    us_gaap = companyfacts.get("facts", {}).get("us-gaap", {})
    for fact_name in fact_names:
        fact_payload = us_gaap.get(fact_name)
        if not isinstance(fact_payload, dict):
            continue
        units = fact_payload.get("units", {})
        for unit_name, observations in units.items():
            if not isinstance(observations, list):
                continue
            cleaned = []
            for obs in observations:
                value = parse_float(obs.get("val"))
                if value is None:
                    continue
                cleaned.append(
                    {
                        "fact_name": fact_name,
                        "unit": unit_name,
                        "value": value,
                        "fy": _normalized_fy(obs.get("fy")),
                        "fp": obs.get("fp"),
                        "end": obs.get("end"),
                        "filed": obs.get("filed"),
                        "form": obs.get("form"),
                    }
                )
            if cleaned:
                cleaned.sort(
                    key=lambda item: (
                        item.get("fy") or -1,
                        str(item.get("end") or ""),
                        str(item.get("filed") or ""),
                    )
                )
                return cleaned, fact_name
    return [], None


def _is_annual_income_observation(observation: dict[str, Any]) -> bool:
    return observation.get("fp") == "FY" and str(observation.get("form") or "") in ANNUAL_FORMS


def _is_annual_balance_observation(observation: dict[str, Any]) -> bool:
    form = str(observation.get("form") or "")
    return form in ANNUAL_FORMS or observation.get("fp") == "FY"


def _select_latest_for_fy(series: list[dict[str, Any]], fiscal_year: int) -> dict[str, Any] | None:
    candidates = [item for item in series if item.get("fy") == fiscal_year]
    return candidates[-1] if candidates else None


def _pick_income_anchor_year(fact_series_store: dict[str, list[dict[str, Any]]]) -> int | None:
    annual_revenue = [item for item in fact_series_store.get("revenue", []) if _is_annual_income_observation(item)]
    if not annual_revenue:
        return None

    candidate_years = sorted({item["fy"] for item in annual_revenue if item.get("fy") is not None}, reverse=True)
    for fiscal_year in candidate_years:
        if _select_latest_for_fy(annual_revenue, fiscal_year):
            return fiscal_year
    return None


def _build_fact_output(observation: dict[str, Any] | None, fact_name: str | None) -> dict[str, Any]:
    return {
        "fact_name": fact_name,
        "value": observation.get("value") if observation else None,
        "period_end": observation.get("end") if observation else None,
        "filed": observation.get("filed") if observation else None,
        "unit": observation.get("unit") if observation else None,
        "fiscal_year": observation.get("fy") if observation else None,
        "fiscal_period": observation.get("fp") if observation else None,
        "form": observation.get("form") if observation else None,
    }


def _safe_margin(
    numerator_fact: dict[str, Any],
    denominator_fact: dict[str, Any],
    metric_name: str,
    data_limitations: list[str],
) -> float | None:
    numerator = numerator_fact.get("value")
    denominator = denominator_fact.get("value")
    numerator_fy = numerator_fact.get("fiscal_year")
    denominator_fy = denominator_fact.get("fiscal_year")

    if numerator is None or denominator is None:
        data_limitations.append(f"{metric_name}:missing_required_fact")
        return None
    if denominator <= 0:
        data_limitations.append(f"{metric_name}:non_positive_revenue")
        return None
    if numerator_fy is None or denominator_fy is None or numerator_fy != denominator_fy:
        data_limitations.append(f"{metric_name}:fiscal_year_misalignment")
        return None
    return round(numerator / denominator, 6)


def _safe_revenue_growth(series: list[dict[str, Any]], data_limitations: list[str]) -> float | None:
    annual = [item for item in series if _is_annual_income_observation(item) and item.get("fy") is not None]
    if len(annual) < 2:
        data_limitations.append("revenue_growth:insufficient_annual_revenue_history")
        return None

    latest = annual[-1]
    prior_candidates = [item for item in annual[:-1] if item.get("fy") is not None and item["fy"] < latest["fy"]]
    if not prior_candidates:
        data_limitations.append("revenue_growth:no_prior_annual_revenue")
        return None

    prior = prior_candidates[-1]
    if prior["value"] in (None, 0):
        data_limitations.append("revenue_growth:invalid_prior_revenue")
        return None
    if latest["fy"] - prior["fy"] > 1:
        data_limitations.append("revenue_growth:non_consecutive_fiscal_years")
        return None
    return round((latest["value"] - prior["value"]) / abs(prior["value"]), 6)


def _safe_debt_to_assets(
    debt_fact: dict[str, Any],
    liabilities_fact: dict[str, Any],
    assets_fact: dict[str, Any],
    data_limitations: list[str],
) -> float | None:
    assets = assets_fact.get("value")
    assets_fy = assets_fact.get("fiscal_year")
    if assets is None or assets <= 0:
        data_limitations.append("debt_to_assets:missing_or_non_positive_assets")
        return None

    numerator_fact = debt_fact if debt_fact.get("value") is not None else liabilities_fact
    numerator_label = "debt" if debt_fact.get("value") is not None else "liabilities"
    numerator = numerator_fact.get("value")
    numerator_fy = numerator_fact.get("fiscal_year")
    if numerator is None:
        data_limitations.append("debt_to_assets:missing_debt_and_liabilities")
        return None
    if numerator_fy is None or assets_fy is None or numerator_fy != assets_fy:
        data_limitations.append(f"debt_to_assets:{numerator_label}_assets_fiscal_year_misalignment")
        return None
    return round(numerator / assets, 6)


def prepare_filing_evidence(
    sec_root: str = "data/raw/sec",
    output_path: str = "data/processed/filing_evidence.json",
) -> dict[str, Any]:
    root = Path(sec_root)
    tickers: dict[str, Any] = {}

    for ticker in TARGET_TICKERS:
        submissions = _load_json(root / ticker / "submissions.json")
        companyfacts = _load_json(root / ticker / "companyfacts.json")

        facts: dict[str, Any] = {}
        fact_series_store: dict[str, list[dict[str, Any]]] = {}
        fact_name_map: dict[str, str | None] = {}
        data_flags: dict[str, bool] = {
            "submissions_available": submissions is not None,
            "companyfacts_available": companyfacts is not None,
        }
        data_limitations: list[str] = []

        for key, candidates in FACT_CANDIDATES.items():
            series, fact_name = _extract_fact_series(companyfacts, candidates)
            fact_series_store[key] = series
            fact_name_map[key] = fact_name
            data_flags[f"{key}_available"] = bool(series)

        income_anchor_year = _pick_income_anchor_year(fact_series_store)
        if income_anchor_year is None:
            data_limitations.append("income_facts:no_annual_revenue_anchor_year")

        for key in INCOME_FACT_KEYS:
            selected = None
            if income_anchor_year is not None:
                annual_series = [item for item in fact_series_store.get(key, []) if _is_annual_income_observation(item)]
                selected = _select_latest_for_fy(annual_series, income_anchor_year)
                if selected is None and annual_series:
                    data_limitations.append(f"{key}:missing_for_anchor_fiscal_year_{income_anchor_year}")
            facts[key] = _build_fact_output(selected, fact_name_map[key])

        for key in BALANCE_FACT_KEYS:
            annual_series = [item for item in fact_series_store.get(key, []) if _is_annual_balance_observation(item)]
            selected = annual_series[-1] if annual_series else None
            if selected is None:
                data_limitations.append(f"{key}:missing_annual_balance_fact")
            facts[key] = _build_fact_output(selected, fact_name_map[key])

        facts["income_anchor_fiscal_year"] = income_anchor_year

        computed_metrics = {
            "revenue_growth": _safe_revenue_growth(fact_series_store["revenue"], data_limitations),
            "gross_margin": _safe_margin(facts["gross_profit"], facts["revenue"], "gross_margin", data_limitations),
            "operating_margin": _safe_margin(
                facts["operating_income"], facts["revenue"], "operating_margin", data_limitations
            ),
            "debt_to_assets": _safe_debt_to_assets(
                facts["debt"], facts["liabilities"], facts["assets"], data_limitations
            ),
        }

        tickers[ticker] = {
            "ticker": ticker,
            "cik": SEC_CIK_BY_TICKER[ticker],
            "latest_10k": _latest_filing(submissions, "10-K"),
            "latest_10q": _latest_filing(submissions, "10-Q"),
            "facts": facts,
            "computed_metrics": computed_metrics,
            "data_availability_flags": data_flags,
            "data_limitations": sorted(set(data_limitations)),
        }

    result = {
        "tool_name": "prepare_filing_evidence",
        "generated_at": utc_now_iso(),
        "sec_root": str(sec_root),
        "tickers": tickers,
    }
    write_json(output_path, result)
    return result


if __name__ == "__main__":
    print(json.dumps(prepare_filing_evidence(), indent=2))
