from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from tools.milestone04_common import BENCHMARK_BY_TICKER, TARGET_TICKERS, clamp, parse_float, utc_now_iso, write_json


FEATURE_NAMES = [
    "20d_return",
    "60d_return",
    "20d_volatility",
    "60d_volatility",
    "max_drawdown_60d",
    "relative_return_vs_benchmark_60d",
]


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _read_price_map(path: Path) -> dict[str, float]:
    mapping: dict[str, float] = {}
    for row in _read_csv_rows(path):
        date = row.get("date")
        value = parse_float(row.get("adjusted_close") or row.get("close"))
        if date and value is not None:
            mapping[date] = value
    return mapping


def _common_series(stock_path: Path, benchmark_path: Path) -> list[tuple[str, float, float]]:
    stock = _read_price_map(stock_path)
    benchmark = _read_price_map(benchmark_path)
    common_dates = sorted(set(stock) & set(benchmark))
    return [(date, stock[date], benchmark[date]) for date in common_dates]


def _pct_return(values: list[float], lookback: int, end_index: int) -> float | None:
    start_index = end_index - lookback
    if start_index < 0 or end_index >= len(values):
        return None
    start = values[start_index]
    end = values[end_index]
    if start == 0:
        return None
    return (end - start) / abs(start)


def _volatility(values: list[float], lookback: int, end_index: int) -> float | None:
    start_index = end_index - lookback
    if start_index < 0 or end_index >= len(values):
        return None
    sample = values[start_index : end_index + 1]
    returns = []
    for left, right in zip(sample, sample[1:]):
        if left == 0:
            continue
        returns.append((right - left) / abs(left))
    if len(returns) < 2:
        return None
    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / (len(returns) - 1)
    return variance ** 0.5


def _max_drawdown(values: list[float], lookback: int, end_index: int) -> float | None:
    start_index = end_index - lookback + 1
    if start_index < 0 or end_index >= len(values):
        return None
    sample = values[start_index : end_index + 1]
    peak = sample[0]
    max_dd = 0.0
    for price in sample:
        if price > peak:
            peak = price
        if peak != 0:
            max_dd = min(max_dd, (price - peak) / peak)
    return max_dd


def _feature_row(stock_values: list[float], benchmark_values: list[float], end_index: int) -> list[float] | None:
    feature_values = {
        "20d_return": _pct_return(stock_values, 20, end_index),
        "60d_return": _pct_return(stock_values, 60, end_index),
        "20d_volatility": _volatility(stock_values, 20, end_index),
        "60d_volatility": _volatility(stock_values, 60, end_index),
        "max_drawdown_60d": _max_drawdown(stock_values, 60, end_index),
    }
    benchmark_60d = _pct_return(benchmark_values, 60, end_index)
    feature_values["relative_return_vs_benchmark_60d"] = None
    if feature_values["60d_return"] is not None and benchmark_60d is not None:
        feature_values["relative_return_vs_benchmark_60d"] = feature_values["60d_return"] - benchmark_60d

    if any(feature_values[name] is None for name in FEATURE_NAMES):
        return None
    return [float(feature_values[name]) for name in FEATURE_NAMES]


def _future_label(stock_values: list[float], benchmark_values: list[float], index: int, horizon: int = 60) -> int | None:
    if index + horizon >= len(stock_values) or index + horizon >= len(benchmark_values):
        return None
    if stock_values[index] == 0 or benchmark_values[index] == 0:
        return None
    stock_return = (stock_values[index + horizon] - stock_values[index]) / abs(stock_values[index])
    benchmark_return = (benchmark_values[index + horizon] - benchmark_values[index]) / abs(benchmark_values[index])
    return int(stock_return > benchmark_return)


def _training_rows(market_dir: Path) -> tuple[list[list[float]], list[int]]:
    features: list[list[float]] = []
    labels: list[int] = []
    for ticker in TARGET_TICKERS:
        benchmark = BENCHMARK_BY_TICKER[ticker]
        series = _common_series(market_dir / f"{ticker}_prices.csv", market_dir / f"{benchmark}_prices.csv")
        stock_values = [item[1] for item in series]
        benchmark_values = [item[2] for item in series]
        for index in range(60, len(series) - 60):
            feature_values = _feature_row(stock_values, benchmark_values, index)
            label = _future_label(stock_values, benchmark_values, index)
            if feature_values is None or label is None:
                continue
            features.append(feature_values)
            labels.append(label)
    return features, labels


def _latest_market_features(market_dir: Path, ticker: str) -> tuple[list[float] | None, list[str]]:
    benchmark = BENCHMARK_BY_TICKER[ticker]
    series = _common_series(market_dir / f"{ticker}_prices.csv", market_dir / f"{benchmark}_prices.csv")
    if len(series) < 61:
        return None, ["insufficient_market_history_for_latest_features"]
    feature_values = _feature_row([item[1] for item in series], [item[2] for item in series], len(series) - 1)
    if feature_values is None:
        return None, ["unable_to_compute_latest_market_features"]
    return feature_values, []


def _read_snapshot_features(path: Path) -> dict[str, dict[str, Any]]:
    rows = _read_csv_rows(path)
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        ticker = row.get("ticker")
        if not ticker:
            continue
        result[ticker] = row
    return result


def _bucket(probability: float) -> str:
    if probability < 0.4:
        return "negative"
    if probability < 0.55:
        return "neutral"
    if probability < 0.7:
        return "slightly_positive"
    return "positive"


def _transparent_fallback(snapshot: dict[str, str]) -> tuple[float, float, list[str], list[str]]:
    score = 0.0
    top_features: list[str] = []
    limitations: list[str] = [
        "transparent_fallback_used_due_to_official_model_policy",
        "official_model_kept_as_transparent_fallback",
    ]

    relative = parse_float(snapshot.get("relative_return_vs_benchmark_60d"))
    revenue_growth = parse_float(snapshot.get("revenue_growth"))
    gross_margin = parse_float(snapshot.get("gross_margin"))
    debt_to_assets = parse_float(snapshot.get("debt_to_assets"))
    export_hits = parse_float(snapshot.get("export_control_keyword_count")) or 0.0
    inflation_hits = parse_float(snapshot.get("inflation_keyword_count")) or 0.0

    if relative is not None:
        score += 0.8 if relative > 0 else -0.4
        top_features.append("relative_return_vs_benchmark_60d")
    else:
        limitations.append("missing_relative_return_vs_benchmark_60d")

    if revenue_growth is not None:
        score += 0.7 if revenue_growth > 0 else -0.5
        top_features.append("revenue_growth")
    else:
        limitations.append("missing_revenue_growth")

    if gross_margin is not None:
        score += 0.4 if gross_margin > 0.25 else -0.2
        top_features.append("gross_margin")
    else:
        limitations.append("missing_gross_margin")

    if debt_to_assets is not None and debt_to_assets > 0.6:
        score -= 0.4
        top_features.append("debt_to_assets")

    if export_hits > 0:
        score -= 0.5
        top_features.append("export_control_keyword_count")

    if inflation_hits > 0:
        score -= 0.25
        top_features.append("inflation_keyword_count")

    probability = clamp(0.5 + (score * 0.12), 0.05, 0.95)
    confidence = clamp(abs(probability - 0.5) * 1.8, 0.05, 0.95)
    return round(probability, 6), round(confidence, 6), top_features[:3], sorted(set(limitations))


def predict_outperformance(
    market_dir: str = "data/raw/market",
    stock_features_path: str = "data/processed/stock_features.csv",
    output_path: str = "data/processed/model_predictions.json",
) -> dict[str, Any]:
    market_root = Path(market_dir)
    stock_features = _read_snapshot_features(Path(stock_features_path))
    train_x, _train_y = _training_rows(market_root)

    model_type = "transparent_fallback"
    predictions: dict[str, Any] = {}
    for ticker in TARGET_TICKERS:
        benchmark = BENCHMARK_BY_TICKER[ticker]
        _latest_features, feature_limitations = _latest_market_features(market_root, ticker)
        snapshot = stock_features.get(ticker, {})
        per_ticker_limitations = list(feature_limitations)
        probability, confidence, top_features, fallback_limitations = _transparent_fallback(snapshot)
        per_ticker_limitations.extend(fallback_limitations)

        predictions[ticker] = {
            "benchmark": benchmark,
            "outperform_probability": round(probability, 6),
            "model_confidence": round(confidence, 6),
            "predicted_return_bucket": _bucket(probability),
            "top_features": top_features,
            "data_limitations": sorted(set(per_ticker_limitations)),
        }

    result = {
        "model_run_id": f"model_{utc_now_iso().replace(':', '').replace('-', '')}",
        "model_type": model_type,
        "target": "outperform benchmark over next 60 trading days",
        "training_row_count": len(train_x),
        "predictions": predictions,
    }
    write_json(output_path, result)
    return result


if __name__ == "__main__":
    print(json.dumps(predict_outperformance(), indent=2))
