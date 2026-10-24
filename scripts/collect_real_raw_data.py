from __future__ import annotations

import csv
import json
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from tools.milestone04_common import (
    MACRO_SERIES,
    MARKET_SYMBOLS,
    RAW_DIR,
    SEC_CIK_BY_TICKER,
    TARGET_TICKERS,
    ensure_parent,
    read_csv_rows,
    relative_path,
    utc_now_iso,
    write_csv,
    write_json,
)


SEC_HEADERS = {
    "User-Agent": os.getenv(
        "SEC_USER_AGENT",
        "mgta495-milestone03/0.1 student-project research@example.com",
    ),
    "Accept-Encoding": "gzip, deflate",
    "Host": "data.sec.gov",
}

RSS_FEEDS = {
    "NVDA": "https://news.google.com/rss/search?q=NVDA+stock+when:30d&hl=en-US&gl=US&ceid=US:en",
    "KO": "https://news.google.com/rss/search?q=Coca-Cola+KO+stock+when:30d&hl=en-US&gl=US&ceid=US:en",
}


def _safe_get_json(url: str, headers: dict[str, str] | None = None) -> tuple[dict[str, Any] | list[Any] | None, str | None]:
    try:
        response = requests.get(url, headers=headers, timeout=8)
        response.raise_for_status()
        return response.json(), None
    except Exception as exc:
        return None, str(exc)


def _safe_get_text(url: str) -> tuple[str | None, str | None]:
    try:
        response = requests.get(url, timeout=8)
        response.raise_for_status()
        return response.text, None
    except Exception as exc:
        return None, str(exc)


def _cached_csv_row_count(path: Path) -> int:
    try:
        return len(read_csv_rows(path))
    except Exception:
        return 0


def _read_cached_news_items(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return payload if isinstance(payload, list) else []


def _collect_sec_raw() -> dict[str, Any]:
    results: dict[str, Any] = {"source": "sec_edgar", "tickers": {}}
    for ticker in TARGET_TICKERS:
        cik = SEC_CIK_BY_TICKER[ticker]
        base_dir = RAW_DIR / "sec" / ticker
        submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        companyfacts_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

        ticker_result = {
            "ticker": ticker,
            "cik": cik,
            "submissions_url": submissions_url,
            "companyfacts_url": companyfacts_url,
            "submissions_status": "missing",
            "companyfacts_status": "missing",
            "errors": [],
        }

        submissions_payload, submissions_error = _safe_get_json(submissions_url, headers=SEC_HEADERS)
        if submissions_payload is not None:
            write_json(base_dir / "submissions.json", submissions_payload)
            ticker_result["submissions_status"] = "success"
        else:
            ticker_result["submissions_status"] = "failed"
            ticker_result["errors"].append({"endpoint": "submissions", "error": submissions_error})

        companyfacts_payload, companyfacts_error = _safe_get_json(companyfacts_url, headers=SEC_HEADERS)
        if companyfacts_payload is not None:
            write_json(base_dir / "companyfacts.json", companyfacts_payload)
            ticker_result["companyfacts_status"] = "success"
        else:
            ticker_result["companyfacts_status"] = "failed"
            ticker_result["errors"].append({"endpoint": "companyfacts", "error": companyfacts_error})

        write_json(
            base_dir / "source_metadata.json",
            {
                "ticker": ticker,
                "cik": cik,
                "collected_at": utc_now_iso(),
                "headers_used": {"User-Agent": SEC_HEADERS["User-Agent"]},
                "submissions_url": submissions_url,
                "companyfacts_url": companyfacts_url,
                "submissions_status": ticker_result["submissions_status"],
                "companyfacts_status": ticker_result["companyfacts_status"],
                "errors": ticker_result["errors"],
            },
        )
        results["tickers"][ticker] = ticker_result

    return results


def _collect_fred_raw() -> dict[str, Any]:
    api_key = os.getenv("FRED_API_KEY")
    output_path = RAW_DIR / "fred" / "macro_observations.csv"
    metadata_path = RAW_DIR / "fred" / "source_metadata.json"

    if not api_key:
        cached = output_path.exists()
        payload = {
            "source": "fred",
            "collected_at": utc_now_iso(),
            "status": "cached_file_used" if cached else "missing_api_key",
            "series_requested": MACRO_SERIES,
            "output_path": relative_path(output_path),
            "message": None if cached else "FRED_API_KEY not found. No new macro data fetched.",
        }
        write_json(metadata_path, payload)
        return payload

    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for series_id in MACRO_SERIES:
        url = (
            "https://api.stlouisfed.org/fred/series/observations"
            f"?series_id={series_id}&api_key={api_key}&file_type=json"
        )
        payload, error = _safe_get_json(url)
        if payload is None:
            errors.append({"series_id": series_id, "error": error or "unknown_error"})
            continue

        for observation in payload.get("observations", []):
            rows.append(
                {
                    "series_id": series_id,
                    "date": observation.get("date"),
                    "value": observation.get("value"),
                    "realtime_start": observation.get("realtime_start"),
                    "realtime_end": observation.get("realtime_end"),
                }
            )

    if rows:
        write_csv(
            output_path,
            ["series_id", "date", "value", "realtime_start", "realtime_end"],
            rows,
        )

    cached_rows = _cached_csv_row_count(output_path)
    payload = {
        "source": "fred",
        "collected_at": utc_now_iso(),
        "status": "success" if rows else "cached_file_used" if cached_rows else "failed",
        "series_requested": MACRO_SERIES,
        "rows_written": len(rows) if rows else cached_rows,
        "output_path": relative_path(output_path),
        "errors": errors,
    }
    if not rows and cached_rows:
        payload["message"] = "FRED refresh failed; cached macro observations file used."
        payload["refresh_status"] = "failed_with_cached_file"
    write_json(metadata_path, payload)
    return payload


def _write_market_price_rows(symbol: str, rows: list[dict[str, Any]]) -> tuple[bool, str | None, int]:
    if not rows:
        return False, "No market rows returned.", 0

    write_csv(
        RAW_DIR / "market" / f"{symbol}_prices.csv",
        ["date", "open", "high", "low", "close", "adjusted_close", "volume"],
        rows,
    )
    return True, None, len(rows)


def _write_market_csv_from_alpha_vantage(symbol: str, payload: dict[str, Any]) -> tuple[bool, str | None, int]:
    series = payload.get("Time Series (Daily)")
    if not isinstance(series, dict):
        return False, "Missing Time Series (Daily) payload.", 0

    rows = []
    for date, values in sorted(series.items()):
        rows.append(
            {
                "date": date,
                "open": values.get("1. open"),
                "high": values.get("2. high"),
                "low": values.get("3. low"),
                "close": values.get("4. close"),
                "adjusted_close": values.get("5. adjusted close"),
                "volume": values.get("6. volume"),
            }
        )

    return _write_market_price_rows(symbol, rows)


def _clear_market_missing_status() -> None:
    try:
        (RAW_DIR / "market" / "missing_data_status.json").unlink(missing_ok=True)
    except Exception:
        pass


def _collect_market_raw_from_yfinance() -> dict[str, Any]:
    try:
        import yfinance as yf
    except Exception as exc:
        return {
            "source": "yfinance",
            "status": "missing_source",
            "message": f"yfinance import failed: {exc}",
            "symbols_requested": MARKET_SYMBOLS,
            "symbols": {},
            "symbols_collected": [],
            "rows_written": 0,
            "output_path": relative_path(RAW_DIR / "market"),
            "errors": [{"source": "yfinance", "error": str(exc)}],
        }

    metadata: dict[str, Any] = {
        "source": "yfinance",
        "collected_at": utc_now_iso(),
        "symbols": {},
        "status": "pending",
        "symbols_requested": MARKET_SYMBOLS,
        "symbols_collected": [],
        "rows_written": 0,
        "output_path": relative_path(RAW_DIR / "market"),
        "errors": [],
    }

    for symbol in MARKET_SYMBOLS:
        try:
            frame = yf.download(symbol, period="2y", interval="1d", auto_adjust=False, progress=False, threads=False)
        except Exception as exc:
            metadata["symbols"][symbol] = {"status": "failed", "error": str(exc)}
            metadata["errors"].append({"symbol": symbol, "error": str(exc)})
            continue

        if frame is None or getattr(frame, "empty", True):
            error = "No rows returned from yfinance."
            metadata["symbols"][symbol] = {"status": "failed", "error": error}
            metadata["errors"].append({"symbol": symbol, "error": error})
            continue

        if hasattr(frame.columns, "nlevels") and frame.columns.nlevels > 1:
            frame.columns = frame.columns.get_level_values(0)

        rows = []
        for idx, row in frame.iterrows():
            adj_close = row.get("Adj Close")
            if adj_close is None:
                adj_close = row.get("Close")
            rows.append(
                {
                    "date": getattr(idx, "date", lambda: idx)().isoformat() if hasattr(idx, "date") else str(idx),
                    "open": None if row.get("Open") is None else float(row.get("Open")),
                    "high": None if row.get("High") is None else float(row.get("High")),
                    "low": None if row.get("Low") is None else float(row.get("Low")),
                    "close": None if row.get("Close") is None else float(row.get("Close")),
                    "adjusted_close": None if adj_close is None else float(adj_close),
                    "volume": None if row.get("Volume") is None else int(float(row.get("Volume"))),
                }
            )

        success, write_error, row_count = _write_market_price_rows(symbol, rows)
        metadata["symbols"][symbol] = {
            "status": "success" if success else "failed",
            "error": write_error,
            "rows_written": row_count,
            "output_path": relative_path(RAW_DIR / "market" / f"{symbol}_prices.csv"),
        }
        if success:
            metadata["symbols_collected"].append(symbol)
            metadata["rows_written"] += row_count
        elif write_error:
            metadata["errors"].append({"symbol": symbol, "error": write_error})

    metadata["status"] = "success" if metadata["symbols_collected"] else "missing_source"
    return metadata


def _collect_market_raw() -> dict[str, Any]:
    api_key = os.getenv("ALPHAVANTAGE_API_KEY")
    metadata: dict[str, Any] = {
        "source": "market_data",
        "collected_at": utc_now_iso(),
        "symbols": {},
        "status": "pending",
    }

    if api_key:
        metadata["symbols_collected"] = []
        metadata["rows_written"] = 0
        metadata["output_path"] = relative_path(RAW_DIR / "market")
        metadata["errors"] = []
        for symbol in MARKET_SYMBOLS:
            url = (
                "https://www.alphavantage.co/query"
                f"?function=TIME_SERIES_DAILY_ADJUSTED&symbol={symbol}&outputsize=full&apikey={api_key}"
            )
            payload, error = _safe_get_json(url)
            if payload is None:
                metadata["symbols"][symbol] = {"status": "failed", "error": error}
                metadata["errors"].append({"symbol": symbol, "error": error})
                continue
            success, write_error, row_count = _write_market_csv_from_alpha_vantage(symbol, payload)
            metadata["symbols"][symbol] = {
                "status": "success" if success else "failed",
                "error": write_error,
                "rows_written": row_count,
                "output_path": relative_path(RAW_DIR / "market" / f"{symbol}_prices.csv"),
            }
            if success:
                metadata["symbols_collected"].append(symbol)
                metadata["rows_written"] += row_count
            elif write_error:
                metadata["errors"].append({"symbol": symbol, "error": write_error})
        metadata["status"] = "success" if metadata["symbols_collected"] else "failed"
        write_json(RAW_DIR / "market" / "source_metadata.json", metadata)
        if metadata["status"] == "success":
            _clear_market_missing_status()
        return metadata

    yfinance_payload = _collect_market_raw_from_yfinance()
    if yfinance_payload.get("status") == "success":
        write_json(RAW_DIR / "market" / "source_metadata.json", yfinance_payload)
        _clear_market_missing_status()
        return yfinance_payload

    if read_csv_rows(RAW_DIR / "market" / "NVDA_prices.csv"):
        metadata["status"] = "cached_files_used"
        metadata["symbols_collected"] = [symbol for symbol in MARKET_SYMBOLS if read_csv_rows(RAW_DIR / "market" / f"{symbol}_prices.csv")]
        metadata["output_path"] = relative_path(RAW_DIR / "market")
        write_json(RAW_DIR / "market" / "source_metadata.json", metadata)
        _clear_market_missing_status()
        return metadata

    missing_payload = {
        "source": "market_data",
        "collected_at": utc_now_iso(),
        "status": "missing_source",
        "message": "ALPHAVANTAGE_API_KEY not found and yfinance did not return usable market data.",
        "symbols_requested": MARKET_SYMBOLS,
        "symbols_collected": yfinance_payload.get("symbols_collected", []),
        "rows_written": yfinance_payload.get("rows_written", 0),
        "output_path": relative_path(RAW_DIR / "market"),
        "errors": yfinance_payload.get("errors", []),
    }
    write_json(RAW_DIR / "market" / "missing_data_status.json", missing_payload)
    return missing_payload


def _parse_rss_items(xml_text: str, ticker: str, source_system: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []

    items: list[dict[str, Any]] = []
    collected_at = utc_now_iso()
    for item in channel.findall("item"):
        title = item.findtext("title")
        link = item.findtext("link")
        description = item.findtext("description")
        pub_date = item.findtext("pubDate")
        source_name = item.findtext("source") or "rss_feed"
        items.append(
            {
                "raw_id": f"{ticker}_{len(items)+1}",
                "ticker": ticker,
                "source_system": source_system,
                "source_name": source_name,
                "source_domain": urlparse(link).netloc if link else "",
                "url": link,
                "published_at": pub_date,
                "collected_at": collected_at,
                "raw_title": title,
                "raw_description": description,
                "raw_content": None,
                "raw_html_file": None,
                "api_payload": {
                    "title": title,
                    "link": link,
                    "description": description,
                    "pubDate": pub_date,
                    "source": source_name,
                },
                "fetch_status": "success",
            }
        )
    return items

def _collect_news_raw() -> dict[str, Any]:
    metadata: dict[str, Any] = {"source": "rss_news", "collected_at": utc_now_iso(), "tickers": {}}
    for ticker, url in RSS_FEEDS.items():
        raw_path = RAW_DIR / "news" / f"{ticker}_news_raw.json"
        cached_items = _read_cached_news_items(raw_path)
        xml_text, error = _safe_get_text(url)
        if xml_text is None:
            if cached_items:
                metadata["tickers"][ticker] = {
                    "status": "cached_file_used",
                    "refresh_status": "failed_with_cached_file",
                    "error": error,
                    "source_url": url,
                    "articles_written": len(cached_items),
                    "message": "RSS refresh failed; cached raw news file used.",
                }
            else:
                write_json(raw_path, [])
                metadata["tickers"][ticker] = {"status": "failed", "error": error, "source_url": url, "articles_written": 0}
            continue

        try:
            items = _parse_rss_items(xml_text, ticker=ticker, source_system="google_news_rss")
        except Exception as exc:
            items = []
            if cached_items:
                metadata["tickers"][ticker] = {
                    "status": "cached_file_used",
                    "refresh_status": "failed_with_cached_file",
                    "error": str(exc),
                    "source_url": url,
                    "articles_written": len(cached_items),
                    "message": "RSS parse failed; cached raw news file used.",
                }
                continue
            metadata["tickers"][ticker] = {"status": "failed", "error": str(exc), "source_url": url, "articles_written": 0}
        else:
            metadata["tickers"][ticker] = {
                "status": "success" if items else "limited_by_source",
                "articles_written": len(items),
                "source_url": url,
            }

        write_json(raw_path, items)

    write_json(RAW_DIR / "news" / "source_metadata.json", metadata)
    return metadata


def collect_real_raw_data() -> dict[str, Any]:
    summary = {
        "run_at": utc_now_iso(),
        "sec": _collect_sec_raw(),
        "fred": _collect_fred_raw(),
        "market": _collect_market_raw(),
        "news": _collect_news_raw(),
    }
    write_json(RAW_DIR / "collection_summary.json", summary)
    return summary


def main() -> int:
    summary = collect_real_raw_data()
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
