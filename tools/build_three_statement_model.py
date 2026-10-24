from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tools.milestone04_common import TARGET_TICKERS, parse_float, read_csv_rows, read_json, utc_now_iso, write_json


DEFAULT_TAX_RATE = 0.21
DEFAULT_DEPRECIATION_PCT_REVENUE = 0.03
DEFAULT_CAPEX_PCT_REVENUE = 0.05
DEFAULT_NWC_PCT_REVENUE = 0.02


def _fact_value(filing: dict[str, Any], key: str) -> float | None:
    fact = (filing.get("facts") or {}).get(key) or {}
    return parse_float(fact.get("value"))


def _fact_year(filing: dict[str, Any], key: str) -> int | None:
    fact = (filing.get("facts") or {}).get(key) or {}
    value = fact.get("fiscal_year")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _metric_value(filing: dict[str, Any], key: str) -> float | None:
    return parse_float((filing.get("computed_metrics") or {}).get(key))


def _feature_rows(path: str | Path) -> dict[str, dict[str, str]]:
    return {row.get("ticker", ""): row for row in read_csv_rows(path) if row.get("ticker")}


def _company_theses(path: str | Path) -> dict[str, dict[str, Any]]:
    payload = read_json(path, default=[])
    if not isinstance(payload, list):
        return {}
    return {item.get("ticker"): item for item in payload if isinstance(item, dict) and item.get("ticker")}


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _round_or_none(value: float | None, digits: int = 6) -> float | None:
    return round(value, digits) if value is not None else None


def _display_billions(value: float | None) -> float | None:
    return round(value / 1_000_000_000, 2) if value is not None else None


def _fact_provenance(filing: dict[str, Any], key: str) -> dict[str, Any]:
    fact = (filing.get("facts") or {}).get(key) or {}
    value = parse_float(fact.get("value"))
    return {
        "source": "processed_filing_evidence",
        "source_path": "data/processed/filing_evidence.json",
        "source_field": f"facts.{key}.value",
        "fact_name": fact.get("fact_name"),
        "fiscal_year": fact.get("fiscal_year"),
        "form": fact.get("form"),
        "classification": "actual" if value is not None else "unavailable",
    }


def _assumption_provenance(source: str, source_field: str | None, classification: str = "assumption") -> dict[str, Any]:
    return {
        "source": source,
        "source_field": source_field,
        "classification": classification,
    }


def _growth_assumption(filing: dict[str, Any], feature_row: dict[str, str], limitations: list[str]) -> float:
    raw_growth = _metric_value(filing, "revenue_growth")
    if raw_growth is None:
        raw_growth = parse_float(feature_row.get("revenue_growth"))
    if raw_growth is None:
        limitations.append("revenue_growth_missing_default_used")
        return 0.03
    capped = _clamp(raw_growth * 0.5, 0.02, 0.18)
    if capped != raw_growth:
        limitations.append("revenue_growth_assumption_capped_for_projection_stability")
    return capped


def _margin_assumption(
    filing: dict[str, Any],
    numerator_key: str,
    metric_key: str,
    revenue: float | None,
    default_value: float,
    limitations: list[str],
) -> float:
    metric = _metric_value(filing, metric_key)
    if metric is not None:
        return _clamp(metric, -0.25, 0.90)
    numerator = _fact_value(filing, numerator_key)
    if numerator is not None and revenue and revenue > 0:
        return _clamp(numerator / revenue, -0.25, 0.90)
    limitations.append(f"{metric_key}_missing_default_used")
    return default_value


def _build_projection_years(
    *,
    base_year: int,
    base_revenue: float,
    revenue_growth: float,
    gross_margin: float,
    operating_margin: float,
    tax_rate: float,
    depreciation_pct_revenue: float,
    capex_pct_revenue: float,
    nwc_pct_revenue: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    income_projection: list[dict[str, Any]] = []
    cash_flow_projection: list[dict[str, Any]] = []
    revenue = base_revenue
    previous_revenue = base_revenue
    for index in range(1, 6):
        year = base_year + index
        year_growth = max(revenue_growth * (1 - (index - 1) * 0.10), 0.02)
        revenue = revenue * (1 + year_growth)
        gross_profit = revenue * gross_margin
        operating_income = revenue * operating_margin
        tax_expense = max(operating_income, 0.0) * tax_rate
        net_income = operating_income - tax_expense
        depreciation = revenue * depreciation_pct_revenue
        capex = revenue * capex_pct_revenue
        change_in_nwc = max(revenue - previous_revenue, 0.0) * nwc_pct_revenue
        free_cash_flow = net_income + depreciation - capex - change_in_nwc
        income_projection.append(
            {
                "year": year,
                "revenue_growth": round(year_growth, 6),
                "revenue": round(revenue, 2),
                "gross_profit": round(gross_profit, 2),
                "operating_income": round(operating_income, 2),
                "tax_expense": round(tax_expense, 2),
                "net_income": round(net_income, 2),
            }
        )
        cash_flow_projection.append(
            {
                "year": year,
                "net_income": round(net_income, 2),
                "depreciation": round(depreciation, 2),
                "capital_expenditures": round(capex, 2),
                "change_in_net_working_capital": round(change_in_nwc, 2),
                "free_cash_flow": round(free_cash_flow, 2),
            }
        )
        previous_revenue = revenue
    return income_projection, cash_flow_projection


def _build_ticker_model(ticker: str, filing: dict[str, Any], feature_row: dict[str, str], thesis: dict[str, Any]) -> dict[str, Any]:
    limitations: list[str] = []
    revenue = _fact_value(filing, "revenue")
    gross_profit = _fact_value(filing, "gross_profit")
    operating_income = _fact_value(filing, "operating_income")
    net_income = _fact_value(filing, "net_income")
    cash = _fact_value(filing, "cash")
    debt = _fact_value(filing, "debt")
    assets = _fact_value(filing, "assets")
    liabilities = _fact_value(filing, "liabilities")
    base_year = _fact_year(filing, "revenue") or _fact_year(filing, "net_income") or 2026
    reported_revenue = revenue

    if revenue is None or revenue <= 0:
        limitations.append("revenue_missing_projection_unavailable")
        revenue = 0.0

    revenue_growth = _growth_assumption(filing, feature_row, limitations)
    gross_margin = _margin_assumption(filing, "gross_profit", "gross_margin", revenue, 0.45, limitations)
    operating_margin = _margin_assumption(filing, "operating_income", "operating_margin", revenue, 0.20, limitations)
    tax_rate = DEFAULT_TAX_RATE
    limitations.append("tax_rate_default_assumption_used")
    limitations.append("depreciation_capex_and_working_capital_are_assumption_based")

    if revenue > 0:
        income_projection, cash_flow_projection = _build_projection_years(
            base_year=base_year,
            base_revenue=revenue,
            revenue_growth=revenue_growth,
            gross_margin=gross_margin,
            operating_margin=operating_margin,
            tax_rate=tax_rate,
            depreciation_pct_revenue=DEFAULT_DEPRECIATION_PCT_REVENUE,
            capex_pct_revenue=DEFAULT_CAPEX_PCT_REVENUE,
            nwc_pct_revenue=DEFAULT_NWC_PCT_REVENUE,
        )
    else:
        income_projection = []
        cash_flow_projection = []

    debt_to_assets = _metric_value(filing, "debt_to_assets")
    if debt_to_assets is None and debt is not None and assets and assets > 0:
        debt_to_assets = debt / assets

    revenue_growth_source = (
        "processed_filing_evidence"
        if _metric_value(filing, "revenue_growth") is not None
        else "stock_features"
        if parse_float(feature_row.get("revenue_growth")) is not None
        else "default_assumption"
    )
    gross_margin_source = "processed_filing_evidence" if _metric_value(filing, "gross_margin") is not None else "default_assumption"
    operating_margin_source = "processed_filing_evidence" if _metric_value(filing, "operating_margin") is not None else "default_assumption"
    historical_inputs = {
        "revenue": _round_or_none(reported_revenue, 2),
        "gross_profit": _round_or_none(gross_profit, 2),
        "operating_income": _round_or_none(operating_income, 2),
        "net_income": _round_or_none(net_income, 2),
        "cash": _round_or_none(cash, 2),
        "debt": _round_or_none(debt, 2),
        "assets": _round_or_none(assets, 2),
        "liabilities": _round_or_none(liabilities, 2),
    }
    assumptions = {
        "projection_years": 5,
        "revenue_growth_start": round(revenue_growth, 6),
        "revenue_growth_tapers_by": 0.10,
        "gross_margin": round(gross_margin, 6),
        "operating_margin": round(operating_margin, 6),
        "tax_rate": tax_rate,
        "depreciation_pct_revenue": DEFAULT_DEPRECIATION_PCT_REVENUE,
        "capex_pct_revenue": DEFAULT_CAPEX_PCT_REVENUE,
        "nwc_pct_incremental_revenue": DEFAULT_NWC_PCT_REVENUE,
    }
    key_metrics = {
        "gross_margin": round(gross_margin, 6),
        "operating_margin": round(operating_margin, 6),
        "net_margin": _round_or_none(net_income / revenue if revenue and net_income is not None else None),
        "projected_year_5_revenue": income_projection[-1]["revenue"] if income_projection else None,
        "projected_year_5_free_cash_flow": cash_flow_projection[-1]["free_cash_flow"] if cash_flow_projection else None,
    }

    return {
        "ticker": ticker,
        "company_name": thesis.get("company_name"),
        "base_year": base_year,
        "historical_inputs": historical_inputs,
        "assumptions": assumptions,
        "income_statement_projection": income_projection,
        "cash_flow_projection": cash_flow_projection,
        "balance_sheet_stub": {
            "cash": _round_or_none(cash, 2),
            "debt": _round_or_none(debt, 2),
            "assets": _round_or_none(assets, 2),
            "liabilities": _round_or_none(liabilities, 2),
            "net_debt": _round_or_none((debt or 0.0) - (cash or 0.0), 2) if debt is not None or cash is not None else None,
            "debt_to_assets": _round_or_none(debt_to_assets),
        },
        "key_metrics": key_metrics,
        "display_values": {
            "historical_inputs_usd_billions": {key: _display_billions(value) for key, value in historical_inputs.items()},
            "projected_year_5_revenue_usd_billions": _display_billions(key_metrics["projected_year_5_revenue"]),
            "projected_year_5_free_cash_flow_usd_billions": _display_billions(key_metrics["projected_year_5_free_cash_flow"]),
            "gross_margin_pct": _round_or_none(gross_margin * 100, 1),
            "operating_margin_pct": _round_or_none(operating_margin * 100, 1),
        },
        "provenance": {
            "base_year": _fact_provenance(filing, "revenue"),
            "historical_inputs": {key: _fact_provenance(filing, key) for key in historical_inputs},
            "assumptions": {
                "revenue_growth_start": _assumption_provenance(revenue_growth_source, "computed_metrics.revenue_growth", "estimate"),
                "gross_margin": _assumption_provenance(gross_margin_source, "computed_metrics.gross_margin", "estimate"),
                "operating_margin": _assumption_provenance(operating_margin_source, "computed_metrics.operating_margin", "estimate"),
                "tax_rate": _assumption_provenance("hardcoded_default", "DEFAULT_TAX_RATE"),
                "depreciation_pct_revenue": _assumption_provenance("hardcoded_default", "DEFAULT_DEPRECIATION_PCT_REVENUE"),
                "capex_pct_revenue": _assumption_provenance("hardcoded_default", "DEFAULT_CAPEX_PCT_REVENUE"),
                "nwc_pct_incremental_revenue": _assumption_provenance("hardcoded_default", "DEFAULT_NWC_PCT_REVENUE"),
            },
            "income_statement_projection": {
                "source": "derived_calculation",
                "classification": "projection",
                "formula": "base revenue grown by tapered growth; margins and tax assumptions applied",
            },
            "cash_flow_projection": {
                "source": "derived_calculation",
                "classification": "projection",
                "formula": "net income plus depreciation minus capex and working-capital assumptions",
            },
        },
        "data_sources": {
            "filing_evidence": "data/processed/filing_evidence.json",
            "stock_features": "data/processed/stock_features.csv",
            "company_thesis": "data/thesis/company_theses.json",
        },
        "presentation_guidance": {
            "not_investment_recommendation": True,
            "recommended_display_scale": "USD billions",
            "label_projection_fields_as": "assumption-based estimate",
            "show_limitations_with_model": True,
        },
        "limitations": sorted(set(limitations + (filing.get("data_limitations") or []))),
    }


def build_three_statement_models(
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    stock_features_path: str = "data/processed/stock_features.csv",
    company_theses_path: str = "data/thesis/company_theses.json",
    output_path: str = "data/processed/three_statement_models.json",
) -> dict[str, Any]:
    filing_payload = read_json(filing_evidence_path, default={})
    filings = filing_payload.get("tickers", {}) if isinstance(filing_payload, dict) else {}
    features = _feature_rows(stock_features_path)
    theses = _company_theses(company_theses_path)
    models = {
        ticker: _build_ticker_model(
            ticker=ticker,
            filing=filings.get(ticker, {}) if isinstance(filings, dict) else {},
            feature_row=features.get(ticker, {}),
            thesis=theses.get(ticker, {}),
        )
        for ticker in TARGET_TICKERS
    }
    payload = {
        "tool_name": "build_three_statement_model",
        "generated_at": utc_now_iso(),
        "models": models,
    }
    write_json(output_path, payload)
    return payload


if __name__ == "__main__":
    print(json.dumps(build_three_statement_models(), indent=2))
