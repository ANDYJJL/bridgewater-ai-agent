from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tools.milestone04_common import clamp, utc_now_iso, write_json


SCENARIOS = [
    {"scenario_id": "ai_capex_pullback", "base_downside": -0.14, "tickers": {"NVDA": -0.22, "KO": -0.04}},
    {"scenario_id": "export_control_tightening", "base_downside": -0.12, "tickers": {"NVDA": -0.2, "KO": -0.02}},
    {"scenario_id": "rates_higher_for_longer", "base_downside": -0.1, "tickers": {"NVDA": -0.16, "KO": -0.05}},
    {"scenario_id": "recession_consumer_slowdown", "base_downside": -0.11, "tickers": {"NVDA": -0.1, "KO": -0.09}},
    {"scenario_id": "valuation_multiple_compression", "base_downside": -0.13, "tickers": {"NVDA": -0.18, "KO": -0.06}},
]


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def run_portfolio_stress_test(
    indicator_scorecards_path: str = "data/processed/indicator_scorecards.json",
    portfolio_path: str = "data/portfolio/demo_portfolio.json",
    mandate_path: str = "data/mandates/demo_pm_mandate.json",
    output_path: str = "data/processed/portfolio_stress_test.json",
) -> dict[str, Any]:
    scorecards = _read_json(Path(indicator_scorecards_path)).get("scorecards", [])
    portfolio = _read_json(Path(portfolio_path))
    mandate = _read_json(Path(mandate_path))
    scorecard_map = {item.get("ticker"): item for item in scorecards}
    portfolio_weights = {item.get("ticker"): float(item.get("weight", 0.0)) for item in portfolio.get("positions", [])}

    scenario_results = []
    worst_portfolio = 0.0
    main_risk_drivers: set[str] = set()
    for scenario in SCENARIOS:
        ticker_impacts = {}
        portfolio_impact = 0.0
        for ticker, base_impact in scenario["tickers"].items():
            scorecard = scorecard_map.get(ticker, {})
            indicator_score = float(scorecard.get("aggregate_indicator_score", 0.0))
            confidence = float(scorecard.get("confidence_score", 0.0))
            adjusted = base_impact * (1.0 + clamp(-indicator_score, -0.5, 0.5)) * (1.0 + (1.0 - confidence) * 0.4)
            downside_low = round(adjusted * 1.2, 6)
            downside_high = round(adjusted * 0.8, 6)
            ticker_impacts[ticker] = {
                "downside_range": [min(downside_low, downside_high), max(downside_low, downside_high)],
                "main_driver": scenario["scenario_id"],
            }
            portfolio_impact += portfolio_weights.get(ticker, 0.0) * adjusted
            if adjusted < -0.12:
                main_risk_drivers.add(f"{ticker}:{scenario['scenario_id']}")

        worst_portfolio = min(worst_portfolio, portfolio_impact)
        scenario_results.append(
            {
                "scenario_id": scenario["scenario_id"],
                "ticker_level_impacts": ticker_impacts,
                "portfolio_downside_range": [round(portfolio_impact * 1.2, 6), round(portfolio_impact * 0.8, 6)],
            }
        )

    tech_weight = float(portfolio.get("bucket_weights", {}).get("technology_core", 0.0))
    max_tech_weight = float(mandate.get("max_technology_weight", 1.0))
    constraint_violations = []
    if tech_weight > max_tech_weight:
        constraint_violations.append("technology_weight_exceeds_mandate")

    result = {
        "tool_name": "run_portfolio_stress_test",
        "generated_at": utc_now_iso(),
        "scenarios": scenario_results,
        "ticker_level_impact_ranges": {
            ticker: next(
                (
                    scenario["ticker_level_impacts"][ticker]["downside_range"]
                    for scenario in scenario_results
                    if ticker in scenario["ticker_level_impacts"]
                ),
                None,
            )
            for ticker in scorecard_map
        },
        "portfolio_downside_range": [round(worst_portfolio * 1.2, 6), round(worst_portfolio * 0.8, 6)],
        "main_risk_drivers": sorted(main_risk_drivers),
        "constraint_violations": constraint_violations,
        "risk_action": "review" if worst_portfolio < -0.03 or constraint_violations else "monitor",
        "pm_review_required": bool(constraint_violations or worst_portfolio < -0.03),
    }
    write_json(output_path, result)
    return result


if __name__ == "__main__":
    print(json.dumps(run_portfolio_stress_test(), indent=2))
