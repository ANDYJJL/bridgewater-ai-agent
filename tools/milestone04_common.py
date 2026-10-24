from __future__ import annotations

import csv
import json
from datetime import timezone, datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
ARTIFACTS_DIR = REPO_ROOT / "artifacts"

TARGET_TICKERS = ["NVDA", "KO"]
BENCHMARK_BY_TICKER = {"NVDA": "QQQ", "KO": "XLP"}
MARKET_SYMBOLS = ["NVDA", "KO", "SPY", "QQQ", "XLP"]
MACRO_SERIES = ["FEDFUNDS", "CPIAUCSL", "UNRATE", "GDP", "DGS10", "SP500", "VIXCLS"]
SEC_CIK_BY_TICKER = {"NVDA": "0001045810", "KO": "0000021344"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_json(path: str | Path, payload: Any) -> Path:
    target = Path(path)
    ensure_parent(target)
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target


def read_json(path: str | Path, default: Any = None) -> Any:
    file_path = Path(path)
    if not file_path.exists():
        return default
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_csv(path: str | Path, fieldnames: list[str], rows: list[dict[str, Any]]) -> Path:
    target = Path(path)
    ensure_parent(target)
    with target.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({name: row.get(name) for name in fieldnames})
    return target


def read_csv_rows(path: str | Path) -> list[dict[str, str]]:
    file_path = Path(path)
    if not file_path.exists():
        return []
    with file_path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_float(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def relative_path(path: str | Path) -> str:
    file_path = Path(path)
    try:
        return file_path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return file_path.as_posix()


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))
