from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from tools.milestone04_common import TARGET_TICKERS, clamp, parse_float, utc_now_iso, write_json


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _read_feature_rows(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return {row["ticker"]: row for row in rows if row.get("ticker")}


def _normalized_score(value: float | None, positive_threshold: float, negative_threshold: float, inverse: bool) -> float:
    if value is None:
        return 0.0
    if positive_threshold == negative_threshold:
        raw = 0.0
    elif value >= positive_threshold:
        raw = 1.0
    elif value <= negative_threshold:
        raw = -1.0
    else:
        midpoint = (positive_threshold + negative_threshold) / 2
        scale = max(abs(positive_threshold - midpoint), abs(negative_threshold - midpoint), 1e-9)
        raw = (value - midpoint) / scale
    if inverse:
        raw *= -1
    return round(clamp(raw, -1.0, 1.0), 6)


def _recommendation_band(score: float) -> str:
    if score >= 0.45:
        return "accumulate"
    if score >= 0.1:
        return "hold"
    if score <= -0.45:
        return "avoid"
    if score <= -0.1:
        return "reduce"
    return "review"


def score_stock_indicators(
    stock_features_path: str = "data/processed/stock_features.csv",
    model_predictions_path: str = "data/processed/model_predictions.json",
    indicator_config_path: str = "data/indicators/indicator_config.json",
    portfolio_path: str = "data/portfolio/demo_portfolio.json",
    mandate_path: str = "data/mandates/demo_pm_mandate.json",
    news_evidence_path: str = "data/processed/news_evidence.json",
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    output_path: str = "data/processed/indicator_scorecards.json",
) -> dict[str, Any]:
    feature_rows = _read_feature_rows(Path(stock_features_path))
    predictions = _read_json(Path(model_predictions_path)).get("predictions", {})
    indicator_config = _read_json(Path(indicator_config_path))
    portfolio = _read_json(Path(portfolio_path))
    mandate = _read_json(Path(mandate_path))
    news_evidence = _read_json(Path(news_evidence_path))
    filing_evidence = _read_json(Path(filing_evidence_path)).get("tickers", {})

    portfolio_weights = {item.get("ticker"): item.get("weight") for item in portfolio.get("positions", [])}
    articles = news_evidence.get("articles", [])

    scorecards = []
    for ticker in TARGET_TICKERS:
        row = feature_rows.get(ticker, {})
        prediction = predictions.get(ticker, {})
        filing = filing_evidence.get(ticker, {})
        config = indicator_config.get(ticker, {})
        indicators = []
        weighted_total = 0.0
        weight_total = 0.0

        for spec in config.get("indicators", []):
            field_name = spec["source_field"]
            value = parse_float(row.get(field_name))
            score = _normalized_score(
                value=value,
                positive_threshold=float(spec["positive_threshold"]),
                negative_threshold=float(spec["negative_threshold"]),
                inverse=bool(spec.get("inverse")),
            )
            confidence = round(
                clamp(
                    ((parse_float(row.get("data_completeness_score")) or 0.0) * 0.5)
                    + (float(prediction.get("model_confidence", 0.0)) * 0.5),
                    0.05,
                    0.99,
                ),
                6,
            )
            limitations = []
            if value is None:
                limitations.append(f"missing_source_field:{field_name}")

            evidence_refs = [f"stock_features:{field_name}", f"model_prediction:{prediction.get('benchmark', 'unknown')}"]
            if any(article.get("ticker") == ticker for article in articles):
                evidence_refs.append("news_evidence")
            if filing:
                evidence_refs.append("filing_evidence")

            indicators.append(
                {
                    "name": spec["name"],
                    "score": score,
                    "weight": float(spec["weight"]),
                    "confidence": confidence,
                    "direction": "positive" if score > 0.1 else "negative" if score < -0.1 else "mixed",
                    "evidence_refs": evidence_refs,
                    "data_limitations": limitations,
                }
            )
            weighted_total += score * float(spec["weight"])
            weight_total += float(spec["weight"])

        aggregate_score = round(weighted_total / weight_total, 6) if weight_total else 0.0
        confidence_score = round(
            clamp(
                ((parse_float(row.get("data_completeness_score")) or 0.0) * 0.45)
                + (float(prediction.get("model_confidence", 0.0)) * 0.45)
                + (0.1 if portfolio_weights.get(ticker) is not None else 0.0),
                0.05,
                0.99,
            ),
            6,
        )

        scorecards.append(
            {
                "ticker": ticker,
                "aggregate_indicator_score": aggregate_score,
                "confidence_score": confidence_score,
                "recommendation_band": _recommendation_band(aggregate_score),
                "benchmark": prediction.get("benchmark"),
                "portfolio_weight": portfolio_weights.get(ticker),
                "pm_approval_required": mandate.get("pm_approval_required", True),
                "indicators": indicators,
                "data_limitations": sorted(
                    set(prediction.get("data_limitations", []))
                    | {
                        limitation
                        for item in indicators
                        for limitation in item.get("data_limitations", [])
                    }
                ),
            }
        )

    result = {
        "tool_name": "score_stock_indicators",
        "generated_at": utc_now_iso(),
        "scorecards": scorecards,
    }
    write_json(output_path, result)
    return result


if __name__ == "__main__":
    print(json.dumps(score_stock_indicators(), indent=2))
