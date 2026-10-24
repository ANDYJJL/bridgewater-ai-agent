from __future__ import annotations

import csv
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
    try:
        return int(fact.get("fiscal_year"))
    except (TypeError, ValueError):
        return None


def _metric_value(filing: dict[str, Any], key: str) -> float | None:
    return parse_float((filing.get("computed_metrics") or {}).get(key))


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


def _provenance(source: str, source_field: str | None, classification: str) -> dict[str, Any]:
    return {
        "source": source,
        "source_field": source_field,
        "classification": classification,
    }


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _feature_rows(path: str | Path) -> dict[str, dict[str, str]]:
    return {row.get("ticker", ""): row for row in read_csv_rows(path) if row.get("ticker")}


def _latest_market_price(market_dir: str | Path, ticker: str) -> tuple[float | None, str | None]:
    path = Path(market_dir) / f"{ticker}_prices.csv"
    if not path.exists():
        return None, None
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in reversed(rows):
        price = parse_float(row.get("adjusted_close")) or parse_float(row.get("close"))
        if price is not None:
            return price, row.get("date")
    return None, None


def _growth_start(filing: dict[str, Any], feature_row: dict[str, str], limitations: list[str]) -> float:
    raw_growth = _metric_value(filing, "revenue_growth")
    if raw_growth is None:
        raw_growth = parse_float(feature_row.get("revenue_growth"))
    if raw_growth is None:
        limitations.append("revenue_growth_missing_default_used")
        return 0.03
    capped = _clamp(raw_growth * 0.5, 0.02, 0.18)
    if capped != raw_growth:
        limitations.append("revenue_growth_assumption_capped_for_dcf_stability")
    return capped


def _margin(filing: dict[str, Any], numerator_key: str, metric_key: str, revenue: float | None, default: float, limitations: list[str]) -> float:
    metric = _metric_value(filing, metric_key)
    if metric is not None:
        return _clamp(metric, -0.25, 0.90)
    numerator = _fact_value(filing, numerator_key)
    if numerator is not None and revenue and revenue > 0:
        return _clamp(numerator / revenue, -0.25, 0.90)
    limitations.append(f"{metric_key}_missing_default_used")
    return default


def _discount_rate(feature_row: dict[str, str], limitations: list[str]) -> float:
    volatility = parse_float(feature_row.get("60d_volatility"))
    if volatility is None:
        limitations.append("discount_rate_default_used_missing_cost_of_capital_data")
        return 0.09
    limitations.append("discount_rate_estimated_from_short_term_volatility_proxy")
    if volatility >= 0.025:
        return 0.10
    if volatility <= 0.015:
        return 0.08
    return 0.09


def _terminal_growth(revenue_growth: float) -> float:
    return _clamp(revenue_growth * 0.15, 0.02, 0.03)


def _shares_outstanding(filing: dict[str, Any]) -> float | None:
    for key in ("shares_outstanding", "weighted_average_shares", "common_shares_outstanding"):
        value = _fact_value(filing, key)
        if value is not None:
            return value
    return None


def _project_fcf(
    *,
    base_year: int,
    revenue: float,
    revenue_growth_start: float,
    operating_margin: float,
    tax_rate: float,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    previous_revenue = revenue
    current_revenue = revenue
    for index in range(1, 6):
        growth = max(revenue_growth_start * (1 - (index - 1) * 0.10), 0.02)
        current_revenue = current_revenue * (1 + growth)
        operating_income = current_revenue * operating_margin
        nopat = operating_income * (1 - tax_rate)
        depreciation = current_revenue * DEFAULT_DEPRECIATION_PCT_REVENUE
        capex = current_revenue * DEFAULT_CAPEX_PCT_REVENUE
        change_nwc = max(current_revenue - previous_revenue, 0.0) * DEFAULT_NWC_PCT_REVENUE
        fcf = nopat + depreciation - capex - change_nwc
        rows.append(
            {
                "year": base_year + index,
                "revenue_growth": round(growth, 6),
                "revenue": round(current_revenue, 2),
                "operating_income": round(operating_income, 2),
                "nopat": round(nopat, 2),
                "depreciation": round(depreciation, 2),
                "capital_expenditures": round(capex, 2),
                "change_in_net_working_capital": round(change_nwc, 2),
                "free_cash_flow": round(fcf, 2),
            }
        )
        previous_revenue = current_revenue
    return rows


def _present_value(value: float, discount_rate: float, year_index: int) -> float:
    return value / ((1 + discount_rate) ** year_index)


def _enterprise_value_from_projection(projection: list[dict[str, Any]], discount_rate: float, terminal_growth_rate: float) -> tuple[list[dict[str, Any]], float | None, float, float | None]:
    pv_rows: list[dict[str, Any]] = []
    pv_fcf_total = 0.0
    for index, row in enumerate(projection, start=1):
        fcf = float(row["free_cash_flow"])
        pv_fcf = _present_value(fcf, discount_rate, index)
        pv_rows.append({"year": row["year"], "present_value": round(pv_fcf, 2)})
        pv_fcf_total += pv_fcf
    if not projection or discount_rate <= terminal_growth_rate:
        return pv_rows, None, pv_fcf_total, None
    terminal_fcf = float(projection[-1]["free_cash_flow"]) * (1 + terminal_growth_rate)
    terminal_value = terminal_fcf / (discount_rate - terminal_growth_rate)
    pv_terminal_value = _present_value(terminal_value, discount_rate, len(projection))
    return pv_rows, terminal_value, pv_fcf_total, pv_terminal_value


def _sensitivity_table(projection: list[dict[str, Any]], discount_rate: float, terminal_growth_rate: float) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for rate in sorted({round(discount_rate - 0.01, 4), round(discount_rate, 4), round(discount_rate + 0.01, 4)}):
        for growth in sorted({round(terminal_growth_rate - 0.005, 4), round(terminal_growth_rate, 4), round(terminal_growth_rate + 0.005, 4)}):
            if rate <= growth:
                value = None
            else:
                _, _, pv_fcf_total, pv_terminal = _enterprise_value_from_projection(projection, rate, growth)
                value = pv_fcf_total + pv_terminal if pv_terminal is not None else None
            rows.append(
                {
                    "discount_rate": rate,
                    "terminal_growth_rate": growth,
                    "enterprise_value": _round_or_none(value, 2),
                }
            )
    return rows


def _build_ticker_dcf(ticker: str, filing: dict[str, Any], feature_row: dict[str, str], market_dir: str | Path) -> dict[str, Any]:
    limitations: list[str] = []
    revenue = _fact_value(filing, "revenue")
    base_year = _fact_year(filing, "revenue") or 2026
    if revenue is None or revenue <= 0:
        limitations.append("revenue_missing_dcf_projection_unavailable")
        revenue = 0.0
    revenue_growth_start = _growth_start(filing, feature_row, limitations)
    operating_margin = _margin(filing, "operating_income", "operating_margin", revenue, 0.20, limitations)
    tax_rate = DEFAULT_TAX_RATE
    limitations.append("tax_rate_default_assumption_used")
    limitations.append("depreciation_capex_and_working_capital_are_assumption_based")
    discount_rate = _discount_rate(feature_row, limitations)
    terminal_growth_rate = _terminal_growth(revenue_growth_start)
    projection = _project_fcf(
        base_year=base_year,
        revenue=revenue,
        revenue_growth_start=revenue_growth_start,
        operating_margin=operating_margin,
        tax_rate=tax_rate,
    ) if revenue > 0 else []
    pv_rows, terminal_value, pv_fcf_total, pv_terminal_value = _enterprise_value_from_projection(projection, discount_rate, terminal_growth_rate)
    enterprise_value = pv_fcf_total + pv_terminal_value if pv_terminal_value is not None else None

    cash = _fact_value(filing, "cash")
    debt = _fact_value(filing, "debt")
    net_debt = (debt or 0.0) - (cash or 0.0) if debt is not None or cash is not None else None
    if net_debt is None:
        limitations.append("net_debt_unavailable")
    shares = _shares_outstanding(filing)
    if shares is None:
        limitations.append("shares_outstanding_unavailable_implied_share_price_not_calculated")
    equity_value = enterprise_value - net_debt if enterprise_value is not None and net_debt is not None else None
    implied_share_price = equity_value / shares if equity_value is not None and shares and shares > 0 else None
    latest_market_price, price_date = _latest_market_price(market_dir, ticker)
    if latest_market_price is None:
        limitations.append("latest_market_price_unavailable")
    upside_downside_pct = (
        (implied_share_price - latest_market_price) / latest_market_price
        if implied_share_price is not None and latest_market_price and latest_market_price > 0
        else None
    )
    revenue_growth_source = (
        "processed_filing_evidence"
        if _metric_value(filing, "revenue_growth") is not None
        else "stock_features"
        if parse_float(feature_row.get("revenue_growth")) is not None
        else "default_assumption"
    )
    operating_margin_source = "processed_filing_evidence" if _metric_value(filing, "operating_margin") is not None else "default_assumption"

    return {
        "ticker": ticker,
        "valuation_date": price_date or utc_now_iso()[:10],
        "base_free_cash_flow": projection[0]["free_cash_flow"] if projection else None,
        "projection_years": 5,
        "revenue_growth_assumptions": [row["revenue_growth"] for row in projection],
        "margin_assumptions": {
            "operating_margin": round(operating_margin, 6),
            "tax_rate": tax_rate,
            "depreciation_pct_revenue": DEFAULT_DEPRECIATION_PCT_REVENUE,
            "capex_pct_revenue": DEFAULT_CAPEX_PCT_REVENUE,
            "nwc_pct_incremental_revenue": DEFAULT_NWC_PCT_REVENUE,
        },
        "free_cash_flow_projection": projection,
        "discount_rate": discount_rate,
        "terminal_growth_rate": terminal_growth_rate,
        "terminal_value": _round_or_none(terminal_value, 2),
        "present_value_of_fcf": pv_rows,
        "enterprise_value": _round_or_none(enterprise_value, 2),
        "net_debt": _round_or_none(net_debt, 2),
        "equity_value": _round_or_none(equity_value, 2),
        "shares_outstanding": _round_or_none(shares, 2),
        "implied_share_price": _round_or_none(implied_share_price, 6),
        "latest_market_price": _round_or_none(latest_market_price, 6),
        "upside_downside_pct": _round_or_none(upside_downside_pct),
        "sensitivity_table": _sensitivity_table(projection, discount_rate, terminal_growth_rate) if projection else [],
        "display_values": {
            "base_free_cash_flow_usd_billions": _display_billions(projection[0]["free_cash_flow"] if projection else None),
            "terminal_value_usd_billions": _display_billions(terminal_value),
            "enterprise_value_usd_billions": _display_billions(enterprise_value),
            "net_debt_usd_billions": _display_billions(net_debt),
            "equity_value_usd_billions": _display_billions(equity_value),
            "latest_market_price": _round_or_none(latest_market_price, 2),
            "implied_share_price": _round_or_none(implied_share_price, 2),
            "upside_downside_pct": _round_or_none(upside_downside_pct * 100, 1) if upside_downside_pct is not None else None,
        },
        "provenance": {
            "base_free_cash_flow": {
                "source": "derived_calculation",
                "classification": "projection",
                "formula": "NOPAT plus depreciation minus capex and working-capital assumptions",
            },
            "revenue_growth_assumptions": _provenance(revenue_growth_source, "computed_metrics.revenue_growth", "estimate"),
            "margin_assumptions": {
                "operating_margin": _provenance(operating_margin_source, "computed_metrics.operating_margin", "estimate"),
                "tax_rate": _provenance("hardcoded_default", "DEFAULT_TAX_RATE", "assumption"),
                "depreciation_pct_revenue": _provenance("hardcoded_default", "DEFAULT_DEPRECIATION_PCT_REVENUE", "assumption"),
                "capex_pct_revenue": _provenance("hardcoded_default", "DEFAULT_CAPEX_PCT_REVENUE", "assumption"),
                "nwc_pct_incremental_revenue": _provenance("hardcoded_default", "DEFAULT_NWC_PCT_REVENUE", "assumption"),
            },
            "discount_rate": _provenance("stock_features" if feature_row.get("60d_volatility") else "hardcoded_default", "60d_volatility", "estimate"),
            "terminal_growth_rate": _provenance("derived_calculation", "revenue_growth_start * 0.15 clamped to 2%-3%", "assumption"),
            "terminal_value": _provenance("derived_calculation", "terminal_fcf / (discount_rate - terminal_growth_rate)", "estimate"),
            "present_value_of_fcf": _provenance("derived_calculation", "free_cash_flow / (1 + discount_rate) ^ year", "estimate"),
            "enterprise_value": _provenance("derived_calculation", "present_value_of_fcf + present_value_of_terminal_value", "estimate"),
            "net_debt": {
                "source": "processed_filing_evidence",
                "source_path": "data/processed/filing_evidence.json",
                "source_field": "facts.debt.value - facts.cash.value",
                "classification": "actual" if net_debt is not None else "unavailable",
            },
            "equity_value": _provenance("derived_calculation", "enterprise_value - net_debt", "estimate" if equity_value is not None else "unavailable"),
            "shares_outstanding": _fact_provenance(filing, "shares_outstanding"),
            "implied_share_price": _provenance("derived_calculation", "equity_value / shares_outstanding", "estimate" if implied_share_price is not None else "unavailable"),
            "latest_market_price": {
                "source": "raw_market_price_file",
                "source_path": f"data/raw/market/{ticker}_prices.csv",
                "source_field": "adjusted_close",
                "classification": "actual" if latest_market_price is not None else "unavailable",
            },
            "upside_downside_pct": _provenance("derived_calculation", "(implied_share_price - latest_market_price) / latest_market_price", "estimate" if upside_downside_pct is not None else "unavailable"),
            "sensitivity_table": _provenance("derived_calculation", "discount-rate and terminal-growth scenario grid", "estimate"),
        },
        "data_sources": {
            "filing_evidence": "data/processed/filing_evidence.json",
            "stock_features": "data/processed/stock_features.csv",
            "market_prices": f"data/raw/market/{ticker}_prices.csv",
        },
        "presentation_guidance": {
            "not_investment_recommendation": True,
            "recommended_display_scale": "USD billions",
            "label_dcf_outputs_as": "assumption-based estimate",
            "do_not_show_implied_share_price_when_unavailable": True,
            "show_limitations_with_model": True,
        },
        "limitations": sorted(set(limitations + (filing.get("data_limitations") or []))),
    }


def build_dcf_valuations(
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    stock_features_path: str = "data/processed/stock_features.csv",
    market_dir: str = "data/raw/market",
    model_predictions_path: str = "data/processed/model_predictions.json",
    output_path: str = "data/processed/dcf_valuations.json",
) -> dict[str, Any]:
    filing_payload = read_json(filing_evidence_path, default={})
    filings = filing_payload.get("tickers", {}) if isinstance(filing_payload, dict) else {}
    features = _feature_rows(stock_features_path)
    valuations = {
        ticker: _build_ticker_dcf(
            ticker=ticker,
            filing=filings.get(ticker, {}) if isinstance(filings, dict) else {},
            feature_row=features.get(ticker, {}),
            market_dir=market_dir,
        )
        for ticker in TARGET_TICKERS
    }
    payload = {
        "tool_name": "build_dcf_model",
        "generated_at": utc_now_iso(),
        "valuations": valuations,
    }
    write_json(output_path, payload)
    return payload


if __name__ == "__main__":
    print(json.dumps(build_dcf_valuations(), indent=2))
