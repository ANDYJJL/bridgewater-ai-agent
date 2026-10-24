from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from tools.milestone04_common import TARGET_TICKERS, clamp, parse_float, read_json, utc_now_iso, write_json


BASE_MARGIN_OF_SAFETY = 0.15
MIN_MARGIN_OF_SAFETY = 0.10
MAX_MARGIN_OF_SAFETY = 0.40
SIMULATED_SHARES_OUTSTANDING_REASON = (
    "actual shares outstanding unavailable; simulated for demo entry price using "
    "dcf_equity_value / latest_market_price"
)


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


def _filing_share_count(filing: dict[str, Any]) -> float | None:
    facts = filing.get("facts") or {}
    for key in ("shares_outstanding", "weighted_average_shares", "common_shares_outstanding"):
        fact = facts.get(key) or {}
        value = parse_float(fact.get("value"))
        if value is not None:
            return value
    return None


def _simulated_share_count(dcf_equity_value: float | None, latest_market_price: float | None) -> float | None:
    if dcf_equity_value is None or latest_market_price is None or latest_market_price <= 0:
        return None
    return dcf_equity_value / latest_market_price


def _scorecard_for_ticker(payload: dict[str, Any], ticker: str) -> dict[str, Any]:
    for item in payload.get("scorecards", []) or []:
        if item.get("ticker") == ticker:
            return item
    return {}


def _valuation_sensitivity_indicator(scorecard: dict[str, Any]) -> dict[str, Any]:
    for indicator in scorecard.get("indicators", []) or []:
        if str(indicator.get("name", "")).strip().lower() == "valuation sensitivity":
            return indicator
    return {}


def _stress_downside(stress_payload: dict[str, Any], ticker: str) -> float | None:
    ranges = stress_payload.get("ticker_level_impact_ranges") or {}
    value = ranges.get(ticker)
    if isinstance(value, list) and value:
        numbers = [parse_float(item) for item in value]
        numbers = [item for item in numbers if item is not None]
        if numbers:
            return min(numbers)
    return None


def _add_adjustment(adjustments: list[dict[str, Any]], reason: str, adjustment: float, source: str) -> None:
    adjustments.append(
        {
            "reason": reason,
            "adjustment": round(adjustment, 6),
            "source": source,
        }
    )


def _margin_of_safety(
    *,
    dcf: dict[str, Any],
    scorecard: dict[str, Any],
    stress_payload: dict[str, Any],
    ticker: str,
) -> tuple[float, list[dict[str, Any]]]:
    adjustments: list[dict[str, Any]] = [
        {
            "reason": "base_margin_of_safety",
            "adjustment": BASE_MARGIN_OF_SAFETY,
            "source": "hardcoded_default",
        }
    ]
    confidence = parse_float(scorecard.get("confidence_score"))
    if confidence is not None and confidence < 0.50:
        _add_adjustment(adjustments, "low_indicator_evidence_confidence", 0.05, "data/processed/indicator_scorecards.json")
    if stress_payload.get("pm_review_required") or scorecard.get("pm_approval_required"):
        _add_adjustment(adjustments, "pm_review_required", 0.03, "data/processed/portfolio_stress_test.json")

    downside = _stress_downside(stress_payload, ticker)
    if downside is not None:
        if downside <= -0.20:
            _add_adjustment(adjustments, "large_stress_test_downside", 0.07, "data/processed/portfolio_stress_test.json")
        elif downside <= -0.10:
            _add_adjustment(adjustments, "moderate_stress_test_downside", 0.04, "data/processed/portfolio_stress_test.json")

    valuation_indicator = _valuation_sensitivity_indicator(scorecard)
    valuation_score = parse_float(valuation_indicator.get("score"))
    if valuation_score is not None and valuation_score < 0:
        _add_adjustment(adjustments, "negative_valuation_sensitivity_indicator", 0.04, "data/processed/indicator_scorecards.json")

    assumption_heavy_limitations = [
        item
        for item in dcf.get("limitations", []) or []
        if "assumption" in str(item) or "default" in str(item) or "proxy" in str(item) or "capped" in str(item)
    ]
    if assumption_heavy_limitations:
        _add_adjustment(adjustments, "dcf_assumption_heavy_or_proxy_based", 0.04, "data/processed/dcf_valuations.json")

    total = sum(float(item["adjustment"]) for item in adjustments)
    return round(clamp(total, MIN_MARGIN_OF_SAFETY, MAX_MARGIN_OF_SAFETY), 6), adjustments


def _entry_status(latest_market_price: float | None, entry_price: float | None, fair_value: float | None) -> str:
    if entry_price is None or fair_value is None:
        return "unavailable"
    if latest_market_price is None:
        return "unavailable"
    tolerance = max(abs(fair_value), abs(entry_price), abs(latest_market_price), 1.0) * 1e-9
    if latest_market_price <= entry_price + tolerance:
        return "attractive_entry"
    if latest_market_price <= fair_value + tolerance:
        return "watchlist_below_fair_value"
    return "above_fair_value"


def _round_or_none(value: float | None, digits: int = 6) -> float | None:
    return round(value, digits) if value is not None else None


def _build_ticker_entry_price(
    *,
    ticker: str,
    dcf: dict[str, Any],
    three_statement: dict[str, Any],
    scorecard: dict[str, Any],
    stress_payload: dict[str, Any],
    filing: dict[str, Any],
    market_dir: str | Path,
    enable_simulated_shares_fallback: bool = False,
) -> dict[str, Any]:
    limitations: list[str] = []
    dcf_equity_value = parse_float(dcf.get("equity_value"))
    dcf_shares = parse_float(dcf.get("shares_outstanding"))
    filing_shares = _filing_share_count(filing)
    latest_market_price = parse_float(dcf.get("latest_market_price"))
    valuation_date = dcf.get("valuation_date")
    if latest_market_price is None:
        latest_market_price, market_date = _latest_market_price(market_dir, ticker)
        valuation_date = valuation_date or market_date
    if latest_market_price is None:
        limitations.append("latest_market_price_unavailable")
    if dcf_equity_value is None:
        limitations.append("dcf_equity_value_unavailable")

    shares_outstanding = dcf_shares if dcf_shares is not None else filing_shares
    shares_outstanding_source = "actual" if shares_outstanding is not None else "unavailable"
    shares_outstanding_is_simulated = False
    simulated_shares_outstanding_reason = None
    if shares_outstanding is None and enable_simulated_shares_fallback:
        simulated_shares = _simulated_share_count(dcf_equity_value, latest_market_price)
        if simulated_shares is not None:
            shares_outstanding = simulated_shares
            shares_outstanding_source = "simulated"
            shares_outstanding_is_simulated = True
            simulated_shares_outstanding_reason = SIMULATED_SHARES_OUTSTANDING_REASON
            limitations.append("shares_outstanding_simulated_for_demo_entry_price")

    if shares_outstanding is None:
        limitations.append("shares_outstanding_unavailable_entry_price_not_calculated")

    margin_of_safety, risk_adjustments = _margin_of_safety(
        dcf=dcf,
        scorecard=scorecard,
        stress_payload=stress_payload,
        ticker=ticker,
    )
    implied_fair_value = dcf_equity_value / shares_outstanding if dcf_equity_value is not None and shares_outstanding and shares_outstanding > 0 else None
    entry_price = implied_fair_value * (1 - margin_of_safety) if implied_fair_value is not None else None
    current_vs_entry = (
        (latest_market_price - entry_price) / entry_price
        if latest_market_price is not None and entry_price and entry_price > 0
        else None
    )
    current_vs_fair = (
        (latest_market_price - implied_fair_value) / implied_fair_value
        if latest_market_price is not None and implied_fair_value and implied_fair_value > 0
        else None
    )
    status = _entry_status(latest_market_price, entry_price, implied_fair_value)
    inherited_limitations = (dcf.get("limitations") or []) + (three_statement.get("limitations") or [])

    return {
        "ticker": ticker,
        "valuation_date": valuation_date or utc_now_iso()[:10],
        "latest_market_price": _round_or_none(latest_market_price, 6),
        "dcf_equity_value": _round_or_none(dcf_equity_value, 2),
        "shares_outstanding": _round_or_none(shares_outstanding, 2),
        "shares_outstanding_source": shares_outstanding_source,
        "shares_outstanding_is_simulated": shares_outstanding_is_simulated,
        "simulated_shares_outstanding_reason": simulated_shares_outstanding_reason,
        "implied_fair_value_per_share": _round_or_none(implied_fair_value, 6),
        "margin_of_safety": margin_of_safety,
        "entry_price": _round_or_none(entry_price, 6),
        "current_price_vs_entry_price_pct": _round_or_none(current_vs_entry),
        "current_price_vs_fair_value_pct": _round_or_none(current_vs_fair),
        "entry_status": status,
        "risk_adjustments": risk_adjustments,
        "assumptions": {
            "base_margin_of_safety": BASE_MARGIN_OF_SAFETY,
            "min_margin_of_safety": MIN_MARGIN_OF_SAFETY,
            "max_margin_of_safety": MAX_MARGIN_OF_SAFETY,
            "entry_price_formula": "implied_fair_value_per_share * (1 - margin_of_safety)",
            "not_a_price_target_or_trade_recommendation": True,
            "simulated_shares_fallback_enabled": enable_simulated_shares_fallback,
            "simulated_shares_formula": "dcf_equity_value / latest_market_price",
        },
        "limitations": sorted(set(limitations + inherited_limitations)),
        "provenance": {
            "dcf_equity_value": {
                "source": "data/processed/dcf_valuations.json",
                "source_field": f"valuations.{ticker}.equity_value",
                "classification": "estimate" if dcf_equity_value is not None else "unavailable",
            },
            "shares_outstanding": {
                "source": (
                    "simulated_demo_fallback"
                    if shares_outstanding_is_simulated
                    else "data/processed/dcf_valuations.json or data/processed/filing_evidence.json"
                ),
                "source_field": (
                    "dcf_equity_value / latest_market_price"
                    if shares_outstanding_is_simulated
                    else f"valuations.{ticker}.shares_outstanding or tickers.{ticker}.facts.*shares*.value"
                ),
                "classification": shares_outstanding_source,
            },
            "latest_market_price": {
                "source": "data/processed/dcf_valuations.json or data/raw/market/{TICKER}_prices.csv",
                "source_field": f"valuations.{ticker}.latest_market_price or {ticker}_prices.adjusted_close",
                "classification": "actual" if latest_market_price is not None else "unavailable",
            },
            "margin_of_safety": {
                "source": "derived_risk_adjustment",
                "source_field": "indicator_scorecards, portfolio_stress_test, dcf limitations",
                "classification": "assumption",
            },
            "entry_price": {
                "source": "derived_calculation",
                "source_field": "implied_fair_value_per_share * (1 - margin_of_safety)",
                "classification": "estimate" if entry_price is not None else "unavailable",
            },
        },
        "display_values": {
            "latest_market_price": _round_or_none(latest_market_price, 2),
            "dcf_equity_value_usd_billions": _round_or_none(dcf_equity_value / 1_000_000_000, 2) if dcf_equity_value is not None else None,
            "implied_fair_value_per_share": _round_or_none(implied_fair_value, 2),
            "margin_of_safety_pct": _round_or_none(margin_of_safety * 100, 1),
            "entry_price": _round_or_none(entry_price, 2),
            "current_price_vs_entry_price_pct": _round_or_none(current_vs_entry * 100, 1) if current_vs_entry is not None else None,
            "current_price_vs_fair_value_pct": _round_or_none(current_vs_fair * 100, 1) if current_vs_fair is not None else None,
        },
        "presentation_guidance": (
            "For analyst review only. Not a trade approval. "
            "Entry price is illustrative because share count is simulated."
            if shares_outstanding_is_simulated
            else "For analyst review only. Not a trade approval."
        ),
    }


def build_entry_price_models(
    dcf_valuations_path: str = "data/processed/dcf_valuations.json",
    three_statement_models_path: str = "data/processed/three_statement_models.json",
    indicator_scorecards_path: str = "data/processed/indicator_scorecards.json",
    portfolio_stress_test_path: str = "data/processed/portfolio_stress_test.json",
    model_predictions_path: str = "data/processed/model_predictions.json",
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    market_dir: str = "data/raw/market",
    output_path: str = "data/processed/entry_price_models.json",
    enable_simulated_shares_fallback: bool = False,
) -> dict[str, Any]:
    dcf_payload = read_json(dcf_valuations_path, default={})
    three_statement_payload = read_json(three_statement_models_path, default={})
    scorecard_payload = read_json(indicator_scorecards_path, default={})
    stress_payload = read_json(portfolio_stress_test_path, default={})
    filing_payload = read_json(filing_evidence_path, default={})
    dcf_valuations = dcf_payload.get("valuations", {}) if isinstance(dcf_payload, dict) else {}
    three_statement_models = three_statement_payload.get("models", {}) if isinstance(three_statement_payload, dict) else {}
    filings = filing_payload.get("tickers", {}) if isinstance(filing_payload, dict) else {}
    entry_prices = {
        ticker: _build_ticker_entry_price(
            ticker=ticker,
            dcf=dcf_valuations.get(ticker, {}) if isinstance(dcf_valuations, dict) else {},
            three_statement=three_statement_models.get(ticker, {}) if isinstance(three_statement_models, dict) else {},
            scorecard=_scorecard_for_ticker(scorecard_payload, ticker),
            stress_payload=stress_payload if isinstance(stress_payload, dict) else {},
            filing=filings.get(ticker, {}) if isinstance(filings, dict) else {},
            market_dir=market_dir,
            enable_simulated_shares_fallback=enable_simulated_shares_fallback,
        )
        for ticker in TARGET_TICKERS
    }
    payload = {
        "tool_name": "build_entry_price_model",
        "generated_at": utc_now_iso(),
        "entry_prices": entry_prices,
    }
    write_json(output_path, payload)
    return payload


if __name__ == "__main__":
    print(json.dumps(build_entry_price_models(), indent=2))
