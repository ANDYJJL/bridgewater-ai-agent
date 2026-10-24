from __future__ import annotations

import csv
import json
from datetime import timezone, datetime
from pathlib import Path
from typing import Any

from tools.milestone04_common import (
    BENCHMARK_BY_TICKER,
    TARGET_TICKERS,
    parse_float,
    relative_path,
    utc_now_iso,
    write_csv,
)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _read_price_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    cleaned = []
    for row in rows:
        date = row.get("date")
        adj_close = parse_float(row.get("adjusted_close") or row.get("close"))
        if not date or adj_close is None:
            continue
        cleaned.append(
            {
                "date": date,
                "open": parse_float(row.get("open")),
                "high": parse_float(row.get("high")),
                "low": parse_float(row.get("low")),
                "close": parse_float(row.get("close")),
                "adjusted_close": adj_close,
                "volume": parse_float(row.get("volume")),
            }
        )
    cleaned.sort(key=lambda item: item["date"])
    return cleaned


def _pct_return(prices: list[float], lookback: int) -> float | None:
    if len(prices) <= lookback:
        return None
    prior = prices[-(lookback + 1)]
    latest = prices[-1]
    if prior in (None, 0) or latest is None:
        return None
    return round((latest - prior) / abs(prior), 6)


def _volatility(prices: list[float], lookback: int) -> float | None:
    if len(prices) <= lookback:
        return None
    returns = []
    subset = prices[-(lookback + 1) :]
    for left, right in zip(subset, subset[1:]):
        if left in (None, 0) or right is None:
            continue
        returns.append((right - left) / abs(left))
    if len(returns) < 2:
        return None
    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / (len(returns) - 1)
    return round(variance ** 0.5, 6)


def _max_drawdown(prices: list[float], lookback: int) -> float | None:
    if len(prices) <= lookback:
        return None
    subset = prices[-lookback:]
    peak = subset[0]
    max_dd = 0.0
    for price in subset:
        if price > peak:
            peak = price
        if peak not in (None, 0):
            max_dd = min(max_dd, (price - peak) / peak)
    return round(max_dd, 6)


def _latest_macro_values(path: Path) -> dict[str, float | None]:
    latest_by_series: dict[str, tuple[str, float]] = {}
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            series_id = str(row.get("series_id") or "").upper()
            value = parse_float(row.get("value"))
            date = str(row.get("date") or "")
            if not series_id or value is None or value != value:
                continue
            previous = latest_by_series.get(series_id)
            if previous is None or date > previous[0]:
                latest_by_series[series_id] = (date, value)
    return {series_id: value for series_id, (_, value) in latest_by_series.items()}


def _news_features(news_evidence: dict[str, Any], ticker: str) -> dict[str, Any]:
    articles = [item for item in news_evidence.get("articles", []) if item.get("ticker") == ticker]
    totals = {
        "news_count": len(articles),
        "export_control_keyword_count": 0,
        "supply_chain_keyword_count": 0,
        "margin_keyword_count": 0,
        "capex_keyword_count": 0,
        "inflation_keyword_count": 0,
    }
    for article in articles:
        hits = article.get("keyword_hits", {})
        totals["export_control_keyword_count"] += int(hits.get("export_control", 0))
        totals["supply_chain_keyword_count"] += int(hits.get("supply_chain", 0))
        totals["margin_keyword_count"] += int(hits.get("margin", 0))
        totals["capex_keyword_count"] += int(hits.get("capex", 0))
        totals["inflation_keyword_count"] += int(hits.get("inflation", 0))
    return totals


def build_stock_features(
    market_dir: str = "data/raw/market",
    fred_path: str = "data/raw/fred/macro_observations.csv",
    news_evidence_path: str = "data/processed/news_evidence.json",
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    output_path: str = "data/processed/stock_features.csv",
) -> dict[str, Any]:
    market_root = Path(market_dir)
    macro = _latest_macro_values(Path(fred_path))
    news_evidence = _read_json(Path(news_evidence_path))
    filing_evidence = _read_json(Path(filing_evidence_path)).get("tickers", {})

    rows: list[dict[str, Any]] = []
    for ticker in TARGET_TICKERS:
        benchmark = BENCHMARK_BY_TICKER[ticker]
        stock_rows = _read_price_rows(market_root / f"{ticker}_prices.csv")
        benchmark_rows = _read_price_rows(market_root / f"{benchmark}_prices.csv")
        prices = [row["adjusted_close"] for row in stock_rows]
        benchmark_prices = [row["adjusted_close"] for row in benchmark_rows]

        stock_return_60d = _pct_return(prices, 60)
        benchmark_return_60d = _pct_return(benchmark_prices, 60)
        relative_return = None
        if stock_return_60d is not None and benchmark_return_60d is not None:
            relative_return = round(stock_return_60d - benchmark_return_60d, 6)

        filing = filing_evidence.get(ticker, {})
        metrics = filing.get("computed_metrics", {})
        news_features = _news_features(news_evidence, ticker)
        as_of_date = stock_rows[-1]["date"] if stock_rows else datetime.now(timezone.utc).strftime("%Y-%m-%d")

        row = {
            "ticker": ticker,
            "benchmark": benchmark,
            "as_of_date": as_of_date,
            "20d_return": _pct_return(prices, 20),
            "60d_return": stock_return_60d,
            "20d_volatility": _volatility(prices, 20),
            "60d_volatility": _volatility(prices, 60),
            "max_drawdown_60d": _max_drawdown(prices, 60),
            "relative_return_vs_benchmark_60d": relative_return,
            "revenue_growth": metrics.get("revenue_growth"),
            "gross_margin": metrics.get("gross_margin"),
            "operating_margin": metrics.get("operating_margin"),
            "debt_to_assets": metrics.get("debt_to_assets"),
            "macro_fedfunds_latest": macro.get("FEDFUNDS"),
            "macro_cpi_latest": macro.get("CPIAUCSL"),
            "macro_unrate_latest": macro.get("UNRATE"),
            **news_features,
        }

        completeness_fields = [
            "20d_return",
            "60d_return",
            "20d_volatility",
            "60d_volatility",
            "max_drawdown_60d",
            "relative_return_vs_benchmark_60d",
            "revenue_growth",
            "gross_margin",
            "operating_margin",
            "debt_to_assets",
            "macro_fedfunds_latest",
            "macro_cpi_latest",
            "macro_unrate_latest",
        ]
        available = sum(1 for key in completeness_fields if row.get(key) not in (None, ""))
        row["data_completeness_score"] = round(available / len(completeness_fields), 6)
        rows.append(row)

    fieldnames = [
        "ticker",
        "benchmark",
        "as_of_date",
        "20d_return",
        "60d_return",
        "20d_volatility",
        "60d_volatility",
        "max_drawdown_60d",
        "relative_return_vs_benchmark_60d",
        "revenue_growth",
        "gross_margin",
        "operating_margin",
        "debt_to_assets",
        "macro_fedfunds_latest",
        "macro_cpi_latest",
        "macro_unrate_latest",
        "news_count",
        "export_control_keyword_count",
        "supply_chain_keyword_count",
        "margin_keyword_count",
        "capex_keyword_count",
        "inflation_keyword_count",
        "data_completeness_score",
    ]
    write_csv(output_path, fieldnames, rows)
    return {
        "tool_name": "build_stock_features",
        "generated_at": utc_now_iso(),
        "output_path": output_path,
        "output_path_relative": relative_path(output_path),
        "rows_written": len(rows),
        "columns": fieldnames,
    }


if __name__ == "__main__":
    print(json.dumps(build_stock_features(), indent=2))
