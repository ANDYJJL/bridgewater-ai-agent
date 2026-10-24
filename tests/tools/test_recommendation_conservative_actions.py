from __future__ import annotations

import csv
import json
from pathlib import Path

from tools.generate_recommendation_packet import generate_recommendation_packet


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def test_low_confidence_cannot_produce_accumulate_or_reduce(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    _write_json(tmp_path / "raw_summary.json", {"sec": {}, "fred": {}, "market": {"status": "missing_source"}, "news": {}})
    _write_json(
        tmp_path / "predictions.json",
        {
            "predictions": {
                "NVDA": {"benchmark": "QQQ", "outperform_probability": 0.62, "model_confidence": 0.2},
                "KO": {"benchmark": "XLP", "outperform_probability": 0.3, "model_confidence": 0.1},
            }
        },
    )
    _write_json(
        tmp_path / "scorecards.json",
        {
            "scorecards": [
                {"ticker": "NVDA", "aggregate_indicator_score": 0.6, "confidence_score": 0.3, "recommendation_band": "accumulate", "data_limitations": []},
                {"ticker": "KO", "aggregate_indicator_score": -0.3, "confidence_score": 0.2, "recommendation_band": "reduce", "data_limitations": ["missing_market_data"]},
            ]
        },
    )
    _write_csv(
        tmp_path / "stock_features.csv",
        ["ticker", "data_completeness_score"],
        [
            {"ticker": "NVDA", "data_completeness_score": 0.35},
            {"ticker": "KO", "data_completeness_score": 0.20},
        ],
    )
    _write_json(tmp_path / "stress.json", {"pm_review_required": True})

    packet = generate_recommendation_packet(
        raw_summary_path=str(tmp_path / "raw_summary.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        stress_test_path=str(tmp_path / "stress.json"),
        output_path=str(tmp_path / "packet.json"),
    )

    assert packet["recommendations"]["NVDA"]["action"] in {"review", "hold_review"}
    assert packet["recommendations"]["KO"]["action"] in {"review", "hold_review"}
    assert packet["recommendations"]["NVDA"]["action"] != "accumulate"
    assert packet["recommendations"]["KO"]["action"] != "reduce"


def test_missing_market_data_blocks_strong_action_and_zeroes_trade_change(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    _write_json(tmp_path / "raw_summary.json", {"sec": {}, "fred": {}, "market": {"status": "missing_source"}, "news": {}})
    _write_json(
        tmp_path / "predictions.json",
        {"predictions": {"NVDA": {"benchmark": "QQQ", "outperform_probability": 0.65, "model_confidence": 0.35}}},
    )
    _write_json(
        tmp_path / "scorecards.json",
        {"scorecards": [{"ticker": "NVDA", "aggregate_indicator_score": -0.4, "confidence_score": 0.32, "recommendation_band": "reduce", "data_limitations": ["market_missing"]}]},
    )
    _write_csv(tmp_path / "stock_features.csv", ["ticker", "data_completeness_score"], [{"ticker": "NVDA", "data_completeness_score": 0.30}])
    _write_json(tmp_path / "stress.json", {"pm_review_required": True})

    packet = generate_recommendation_packet(
        raw_summary_path=str(tmp_path / "raw_summary.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        stress_test_path=str(tmp_path / "stress.json"),
        output_path=str(tmp_path / "packet.json"),
    )

    rec = packet["recommendations"]["NVDA"]
    ticket = next(item for item in packet["draft_trade_tickets"] if item["ticker"] == "NVDA")
    assert rec["action"] == "hold_review"
    assert rec["blocked_strong_action_reason"] is not None
    assert ticket["target_weight_change"] == 0.0
    assert ticket["pm_approval_required"] is True


def test_review_cases_require_pm_approval(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    _write_json(tmp_path / "raw_summary.json", {"sec": {}, "fred": {}, "market": {"status": "missing_source"}, "news": {}})
    _write_json(
        tmp_path / "predictions.json",
        {"predictions": {"KO": {"benchmark": "XLP", "outperform_probability": 0.51, "model_confidence": 0.15}}},
    )
    _write_json(
        tmp_path / "scorecards.json",
        {"scorecards": [{"ticker": "KO", "aggregate_indicator_score": 0.0, "confidence_score": 0.18, "recommendation_band": "hold", "data_limitations": ["coverage_incomplete"]}]},
    )
    _write_csv(tmp_path / "stock_features.csv", ["ticker", "data_completeness_score"], [{"ticker": "KO", "data_completeness_score": 0.10}])
    _write_json(tmp_path / "stress.json", {"pm_review_required": True})

    packet = generate_recommendation_packet(
        raw_summary_path=str(tmp_path / "raw_summary.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        stress_test_path=str(tmp_path / "stress.json"),
        output_path=str(tmp_path / "packet.json"),
    )

    rec = packet["recommendations"]["KO"]
    ticket = next(item for item in packet["draft_trade_tickets"] if item["ticker"] == "KO")
    assert rec["action"] in {"review", "hold_review"}
    assert rec["requires_pm_review"] is True
    assert ticket["target_weight_change"] == 0.0
    assert packet["human_review"]["pm_approval_required"] is True
