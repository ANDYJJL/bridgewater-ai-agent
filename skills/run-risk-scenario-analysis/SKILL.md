---
name: run-risk-scenario-analysis
description: Generate Risk Team bear/base/bull scenario analysis from a Senior Action Proposal, valuation basis, and risk factors without using legacy ML recommendation evidence.
---

# Run Risk Scenario Analysis

Use this skill when `/chat` receives `mode="risk_scenario_analysis"`.

## Purpose

Produce a Risk Team scenario analysis and PM handoff draft from:

- Senior Action Proposal
- valuation basis from 3-statement / DCF / entry price reference
- explicit risk factors and scenario settings

The skill is scenario analysis support only. It does not approve trades, route orders, or execute action.

## Inputs

- `ticker`
- `company`
- `question` optional
- `senior_proposal`
  - `proposed_stance`
  - `entry_reference`
  - `proposed_shares`
  - `illustrative_notional`
  - `margin_of_safety`
  - `time_horizon`
  - `senior_rationale`
  - `risk_limit_note`
  - `review_trigger`
- `valuation_basis`
  - `dcf_fair_value_per_share`
  - `current_price`
  - `discount_rate`
  - `terminal_growth`
  - `fcf_haircut`
  - `junior_baseline_entry`
  - `senior_adjusted_entry`
- `risk_factors`
- `scenario_settings`
  - `market_case`: `bear`, `base`, `bull`, or `custom`; variants such as `Bear Case` are normalized
  - `ai_capex_shock`
  - `export_control_severity`
  - `discount_rate_shock_bps`
  - `fcf_haircut`
  - `position_size_multiplier`

## Output

- `ticker`
- `company`
- `overall_risk_view`
- `scenario_analysis`
- `selected_scenario`
- `scenario_summary`
- `impact_chain`
- `valuation_impact`
- `portfolio_impact`
- `risk_team_judgment`
- `risk_controls`
- `questions_for_pm`
- `pm_handoff_summary`
- `limitations`
- `human_review_required: true`
- LLM/fallback diagnostics and `sources_used`

Each output field has a distinct role:

- `scenario_summary`: selected scenario, applied shocks, and why it matters for the proposal.
- `impact_chain`: concise stepwise chain from shock to business drivers, FCF, DCF / entry reference, position risk, and Risk Team judgment.
- `valuation_impact`: valuation mechanics only: FCF haircut, discount-rate shock, fair value estimate, and entry reference validity.
- `portfolio_impact`: shares, illustrative notional, position-size stress, concentration, and sizing controls.
- `risk_team_judgment`: proceed with controls, reduce sizing, require additional review, or block escalation.

## Safety Rules

- Do not use legacy ML evidence: model confidence, outperform probability, recommendation band, aggregate indicator score, regression, RMSE, recommendation gate, or backend recommendation.
- Do not call an entry reference a buy target or official target price.
- Do not say DCF predicts stock price.
- Use “fair value estimate,” “illustrative entry reference,” “proposal only,” and “not execution.”
- Do not use markdown tables or excessive bold.
- Keep scenario labels and risk factors human-readable.
- Treat `scenario_settings` as the source of truth. If `market_case` is `bear`, do not write base-case or bull-case analysis.
- Keep field content distinct. Do not repeat the scenario summary in `valuation_impact`, `portfolio_impact`, `impact_chain`, or `risk_team_judgment`.
- Historical analogies may be used only as qualitative risk-pattern references. Do not invent exact historical stock returns or claim the company will repeat a historical case.

## Live Test

With FastAPI running locally, this command should return `mode="risk_scenario_analysis"` and `llm_used=true` when the class LLM key is available:

```bash
python -c 'import json,urllib.request; p={"ticker":"NVDA","company":"NVIDIA Corporation","question":"Run Risk Team scenario analysis for the saved Senior Action Proposal.","mode":"risk_scenario_analysis","senior_proposal":{"proposed_stance":"Accumulate candidate","entry_reference":144.28,"proposed_shares":1000,"illustrative_notional":144280,"margin_of_safety":0.33,"time_horizon":"Long-term"},"valuation_basis":{"dcf_fair_value_per_share":215.35,"current_price":215.35,"discount_rate":0.09,"terminal_growth":0.027,"fcf_haircut":0},"risk_factors":["export control risk","hyperscaler capex dependence","supply chain risk","DCF sensitivity","simulated share count limitation"],"scenario_settings":{"market_case":"bear","ai_capex_shock":"severe","export_control_severity":"high","discount_rate_shock_bps":200,"fcf_haircut":-0.2,"position_size_multiplier":1.0}}; req=urllib.request.Request("http://127.0.0.1:8000/chat",data=json.dumps(p).encode(),headers={"Content-Type":"application/json"},method="POST"); r=urllib.request.urlopen(req,timeout=45); b=r.read().decode("utf-8","replace"); print("status:",r.status); print("bytes:",len(b)); print(b[:5000])'
```
