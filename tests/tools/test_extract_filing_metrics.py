import json
from pathlib import Path

from tools.extract_filing_metrics import extract_filing_metrics


def test_extract_filing_metrics_returns_expected_shape():
    result = extract_filing_metrics()

    assert isinstance(result, dict)
    assert result["tool_name"] == "extract_filing_metrics"
    assert result["ticker"] == "NVDA"
    assert "extracted_facts" in result
    assert "risk_flags" in result
    assert json.loads(json.dumps(result)) == result


def test_extract_filing_metrics_triggers_expected_flags():
    result = extract_filing_metrics()

    assert result["extracted_facts"]["mentions_data_center"] is True
    assert result["extracted_facts"]["mentions_advanced_packaging"] is True
    assert result["risk_flags"]["customer_concentration_flag"]["triggered"] is True
    assert result["risk_flags"]["supply_chain_flag"]["triggered"] is True
    assert result["risk_flags"]["export_control_flag"]["triggered"] is True
    assert result["coverage"]["explicit_revenue_number_found"] is False
    assert result["coverage"]["explicit_margin_number_found"] is False


def test_extract_filing_metrics_handles_ticker_mismatch():
    result = extract_filing_metrics(ticker="AAPL")

    assert result["coverage"]["status"] == "ticker_mismatch"
    assert result["extracted_facts"] == {}


def test_extract_filing_metrics_handles_missing_file(tmp_path: Path):
    missing_path = tmp_path / "missing.json"
    result = extract_filing_metrics(filing_path=str(missing_path))

    assert result["coverage"]["status"] == "missing_file"
