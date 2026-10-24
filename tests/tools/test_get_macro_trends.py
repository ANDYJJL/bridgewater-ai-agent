import json
from pathlib import Path

from tools.get_macro_trends import get_macro_trends


def test_get_macro_trends_returns_expected_shape():
    result = get_macro_trends()

    assert isinstance(result, dict)
    assert result["tool_name"] == "get_macro_trends"
    assert "series" in result
    assert "coverage" in result
    assert len(result["series"]) >= 1
    assert json.loads(json.dumps(result)) == result


def test_get_macro_trends_filters_requested_series():
    result = get_macro_trends(series_ids=["FEDFUNDS"], lookback_periods=3)

    assert len(result["series"]) == 1
    assert result["series"][0]["series_id"] == "FEDFUNDS"
    assert result["series"][0]["direction"] in {"up", "down", "flat", "insufficient_data"}


def test_get_macro_trends_handles_missing_file(tmp_path: Path):
    missing_path = tmp_path / "missing.csv"
    result = get_macro_trends(path=str(missing_path))

    assert result["coverage"]["status"] == "missing_file"
    assert result["series"] == []


def test_get_macro_trends_reports_missing_requested_series():
    result = get_macro_trends(series_ids=["NOTREAL"])

    assert result["coverage"]["status"] == "no_matching_series"
    assert "NOTREAL" in result["coverage"]["missing_requested_series"]
