from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Any


REQUIRED_COLUMNS = {"series_id", "series_name", "date", "value"}


def _classify_direction(latest: float | None, prior: float | None, tolerance: float = 0.01) -> str:
    if latest is None or prior is None:
        return "insufficient_data"
    if prior == 0:
        diff = latest - prior
        if diff > 0:
            return "up"
        if diff < 0:
            return "down"
        return "flat"

    pct_change = (latest - prior) / abs(prior)
    if pct_change > tolerance:
        return "up"
    if pct_change < -tolerance:
        return "down"
    return "flat"


def _parse_date(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None


def _parse_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_series_result(group: list[dict[str, Any]], lookback_periods: int) -> dict[str, Any]:
    ordered = sorted(group, key=lambda row: row["date"])[:]
    ordered = ordered[-max(lookback_periods, 1):]

    latest_row = ordered[-1] if ordered else None
    latest_value = latest_row["value"] if latest_row else None
    prior_value = ordered[-2]["value"] if len(ordered) >= 2 else None

    absolute_change = None
    if latest_value is not None and prior_value is not None:
        absolute_change = round(latest_value - prior_value, 6)

    percent_change = None
    if latest_value is not None and prior_value not in (None, 0):
        percent_change = round(((latest_value - prior_value) / abs(prior_value)) * 100, 6)

    return {
        "series_id": latest_row["series_id"] if latest_row else None,
        "series_name": latest_row["series_name"] if latest_row else None,
        "latest_date": latest_row["date"].strftime("%Y-%m-%d") if latest_row else None,
        "latest_value": None if latest_value is None else round(latest_value, 6),
        "prior_value": None if prior_value is None else round(prior_value, 6),
        "absolute_change": absolute_change,
        "percent_change": percent_change,
        "direction": _classify_direction(latest_value, prior_value),
        "observations_used": len(ordered),
    }


def get_macro_trends(
    path: str = "data/fred_macro/fred_macro_sample.csv",
    series_ids: list[str] | None = None,
    lookback_periods: int = 4,
) -> dict[str, Any]:
    source_path = str(path)
    requested_series = [s.upper() for s in series_ids] if series_ids else None

    result: dict[str, Any] = {
        "tool_name": "get_macro_trends",
        "source_path": source_path,
        "lookback_periods": int(lookback_periods),
        "series": [],
        "coverage": {
            "status": "ok",
            "requested_series": requested_series or [],
            "available_series": [],
            "missing_requested_series": [],
            "rows_loaded": 0,
            "error": None,
        },
    }

    file_path = Path(path)
    if not file_path.exists():
        result["coverage"]["status"] = "missing_file"
        result["coverage"]["error"] = f"File not found: {source_path}"
        return result

    try:
        with file_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            fieldnames = set(reader.fieldnames or [])
            missing_columns = sorted(REQUIRED_COLUMNS - fieldnames)
            if missing_columns:
                result["coverage"]["status"] = "missing_columns"
                result["coverage"]["error"] = f"Missing required columns: {', '.join(missing_columns)}"
                return result

            rows: list[dict[str, Any]] = []
            for row in reader:
                parsed_date = _parse_date(str(row.get("date", "")))
                parsed_value = _parse_float(row.get("value", ""))
                series_id = str(row.get("series_id", "")).upper()
                series_name = str(row.get("series_name", ""))
                if not parsed_date or parsed_value is None or not series_id or not series_name:
                    continue
                rows.append(
                    {
                        "series_id": series_id,
                        "series_name": series_name,
                        "date": parsed_date,
                        "value": parsed_value,
                    }
                )
    except Exception as exc:
        result["coverage"]["status"] = "read_error"
        result["coverage"]["error"] = str(exc)
        return result

    result["coverage"]["rows_loaded"] = len(rows)
    available_series = sorted({row["series_id"] for row in rows})
    result["coverage"]["available_series"] = available_series

    if requested_series:
        requested_set = set(requested_series)
        result["coverage"]["missing_requested_series"] = sorted(requested_set - set(available_series))
        rows = [row for row in rows if row["series_id"] in requested_set]

    if not rows:
        result["coverage"]["status"] = "no_matching_series"
        return result

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["series_id"], []).append(row)

    result["series"] = sorted(
        [_build_series_result(group, lookback_periods=lookback_periods) for group in grouped.values()],
        key=lambda item: (item["series_id"] or ""),
    )
    return result
