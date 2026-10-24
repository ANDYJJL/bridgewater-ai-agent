from __future__ import annotations

import json
from pathlib import Path

from tools.prepare_filing_evidence import prepare_filing_evidence


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _empty_submissions() -> dict:
    return {
        "filings": {
            "recent": {
                "form": ["10-K"],
                "accessionNumber": ["0000000000-26-000001"],
                "filingDate": ["2026-02-01"],
                "primaryDocument": ["annual.htm"],
            }
        }
    }


def _companyfacts_with_alignment_issue() -> dict:
    return {
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": {
                    "units": {
                        "USD": [
                            {"val": 100.0, "fy": 2022, "fp": "FY", "end": "2022-12-31", "filed": "2023-02-01", "form": "10-K"},
                            {"val": 150.0, "fy": 2026, "fp": "FY", "end": "2026-01-31", "filed": "2026-03-01", "form": "10-K"},
                            {"val": 130.0, "fy": 2025, "fp": "FY", "end": "2025-01-31", "filed": "2025-03-01", "form": "10-K"},
                        ]
                    }
                },
                "GrossProfit": {
                    "units": {
                        "USD": [
                            {"val": 75.0, "fy": 2026, "fp": "FY", "end": "2026-01-31", "filed": "2026-03-01", "form": "10-K"}
                        ]
                    }
                },
                "OperatingIncomeLoss": {
                    "units": {
                        "USD": [
                            {"val": 30.0, "fy": 2025, "fp": "FY", "end": "2025-01-31", "filed": "2025-03-01", "form": "10-K"}
                        ]
                    }
                },
                "Assets": {
                    "units": {
                        "USD": [
                            {"val": 200.0, "fy": 2026, "fp": "FY", "end": "2026-01-31", "filed": "2026-03-01", "form": "10-K"}
                        ]
                    }
                },
                "Liabilities": {
                    "units": {
                        "USD": [
                            {"val": 90.0, "fy": 2025, "fp": "FY", "end": "2025-01-31", "filed": "2025-03-01", "form": "10-K"}
                        ]
                    }
                },
            }
        }
    }


def test_computed_margins_use_same_fiscal_year_and_stay_in_reasonable_range(tmp_path: Path) -> None:
    sec_root = tmp_path / "sec"
    for ticker in ["NVDA", "KO"]:
        _write_json(sec_root / ticker / "submissions.json", _empty_submissions())
        _write_json(sec_root / ticker / "companyfacts.json", _companyfacts_with_alignment_issue())

    result = prepare_filing_evidence(sec_root=str(sec_root), output_path=str(tmp_path / "filing_evidence.json"))
    nvda = result["tickers"]["NVDA"]

    gross_margin = nvda["computed_metrics"]["gross_margin"]
    operating_margin = nvda["computed_metrics"]["operating_margin"]

    assert gross_margin is None or 0 <= gross_margin <= 1.5
    assert operating_margin is None or -1 <= operating_margin <= 1.5
    assert gross_margin == 0.5
    assert operating_margin is None
    assert "operating_income:missing_for_anchor_fiscal_year_2026" in nvda["data_limitations"]
    assert "operating_margin:missing_required_fact" in nvda["data_limitations"]


def test_revenue_growth_requires_ordered_annual_periods(tmp_path: Path) -> None:
    sec_root = tmp_path / "sec"
    payload = _companyfacts_with_alignment_issue()
    payload["facts"]["us-gaap"]["RevenueFromContractWithCustomerExcludingAssessedTax"]["units"]["USD"] = [
        {"val": 100.0, "fy": 2022, "fp": "FY", "end": "2022-12-31", "filed": "2023-02-01", "form": "10-K"},
        {"val": 150.0, "fy": 2026, "fp": "FY", "end": "2026-01-31", "filed": "2026-03-01", "form": "10-K"},
    ]
    for ticker in ["NVDA", "KO"]:
        _write_json(sec_root / ticker / "submissions.json", _empty_submissions())
        _write_json(sec_root / ticker / "companyfacts.json", payload)

    result = prepare_filing_evidence(sec_root=str(sec_root), output_path=str(tmp_path / "filing_evidence.json"))
    nvda = result["tickers"]["NVDA"]

    assert nvda["computed_metrics"]["revenue_growth"] is None
    assert "revenue_growth:non_consecutive_fiscal_years" in nvda["data_limitations"]


def test_missing_comparable_balance_facts_produce_limitations_not_fake_values(tmp_path: Path) -> None:
    sec_root = tmp_path / "sec"
    payload = {
        "facts": {
            "us-gaap": {
                "Assets": {
                    "units": {
                        "USD": [
                            {"val": 300.0, "fy": 2026, "fp": "FY", "end": "2026-01-31", "filed": "2026-03-01", "form": "10-K"}
                        ]
                    }
                },
                "Liabilities": {
                    "units": {
                        "USD": [
                            {"val": 120.0, "fy": 2024, "fp": "FY", "end": "2024-01-31", "filed": "2024-03-01", "form": "10-K"}
                        ]
                    }
                },
            }
        }
    }
    for ticker in ["NVDA", "KO"]:
        _write_json(sec_root / ticker / "submissions.json", _empty_submissions())
        _write_json(sec_root / ticker / "companyfacts.json", payload)

    result = prepare_filing_evidence(sec_root=str(sec_root), output_path=str(tmp_path / "filing_evidence.json"))
    ko = result["tickers"]["KO"]

    assert ko["computed_metrics"]["debt_to_assets"] is None
    assert "debt_to_assets:liabilities_assets_fiscal_year_misalignment" in ko["data_limitations"]
