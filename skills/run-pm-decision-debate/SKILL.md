---
name: run-pm-decision-debate
description: Generate a Bridgewater-style PM decision debate from Senior proposal, valuation basis, Risk Team analysis, and portfolio context without using legacy ML recommendation evidence.
---

# Run PM Decision Debate

Use this skill when `/chat` receives `mode="pm_decision_debate"`.

## Purpose

Create an Idea Meritocracy Debate Room for the Portfolio Manager. The output challenges a proposed PM decision from multiple viewpoints and forces unresolved questions into the open before any local decision is recorded.

This skill is decision-quality and governance support only. It does not approve trades, route orders, execute actions, or generate a buy/sell recommendation.

## Inputs

- `ticker`
- `company`
- `question` optional
- `pm_context`
  - `portfolio_composition`
  - `current_position_weight`
  - `max_single_name_weight`
  - `cash_weight`
  - `technology_exposure`
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
  - `junior_baseline_entry`
  - `senior_adjusted_entry`
  - `discount_rate`
  - `terminal_growth`
  - `fcf_haircut`
- `risk_team_analysis`
  - `selected_scenario`
  - `scenario_summary`
  - `impact_chain`
  - `valuation_impact`
  - `portfolio_impact`
  - `risk_team_judgment`
  - `risk_controls`
  - `questions_for_pm`
- `decision_candidate`
- `pm_answer` optional
- `debate_action`
  - `initial` or missing: generate the static five-agent debate report
  - `turn`: generate the next live debate chat response
- `pm_message` for live turns
- `chat_history` for live turns
- `active_agent`
  - one of the five debate agents, or `auto`

## Output

For `debate_action="initial"`:

- `ticker`
- `company`
- `mode: pm_decision_debate`
- `debate_summary`
- `agents`
- `strongest_objections`
- `decision_readiness_score`
- `unresolved_questions`
- `suggested_controls`
- `pm_decision_prompt`
- `final_decision_checklist`
- `human_review_required: true`
- LLM/fallback diagnostics and `sources_used`

For `debate_action="turn"`:

- `ticker`
- `company`
- `mode: pm_decision_debate`
- `debate_action: turn`
- `agent_role`
- `agent_stance`
- `answer_assessment`
  - `rating`: `strong`, `partial`, `weak`, or `off_topic`
  - `rationale`
- `resolved_points`
- `unresolved_points`
- `decision_confidence_score`
- `decision_confidence_delta`
- `response`
- `follow_up_question`
- `evidence_used`
- `pressure_level`
- `unresolved_issue`
- `suggested_next_agent`
- `decision_readiness_delta`
- `human_review_required: true`
- LLM/fallback diagnostics and `sources_used`

## Safety Rules

- Do not make the final investment decision.
- Do not approve, route, or execute trades.
- Do not call an entry reference a buy target or official target price.
- Do not say DCF predicts stock price.
- Do not use legacy ML evidence: model confidence, outperform probability, aggregate indicator score, recommendation band, regression, RMSE, backend recommendation, or recommendation gate.
- Historical analogies may be used only as qualitative risk-pattern references. Do not invent exact historical stock returns or claim the company will repeat a historical case.
- Avoid generic finance language. Use concise, sharp PM challenge questions.
- No markdown tables and no excessive bold.

## Live Turn Behavior

- Respond directly to the PM's latest message.
- First assess whether the PM answer resolved the previous challenge.
- Identify resolved and unresolved points before asking the next question.
- Challenge the PM's logic rather than simply agreeing.
- Ask one sharp follow-up question.
- Keep the response concise: 2-4 sentences plus the follow-up question.
- If `active_agent="auto"`, choose the challenger from the PM message:
  - valuation, WACC, MoS, DCF, or entry terms -> Valuation Skeptic
  - downside, stress, or risk terms -> Conservative Risk Officer
  - approval, process, or evidence terms -> Policy / Governance Challenger
  - sizing, exposure, cash, or concentration terms -> Portfolio Construction PM
  - upside, growth, opportunity cost, or inaction terms -> Aggressive Growth Analyst
- Increase pressure for vague PM answers; reduce or redirect when controls and evidence are clear.
- Strong PM answers include a clear stance, evidence, controls, measurable triggers, sizing discipline, and acknowledgement of valuation uncertainty.
- Weak PM answers are generic, upside-only, missing triggers/sizing/controls, or treat the entry reference as a price target.

## Debate Agents

Always include five agents:

- Aggressive Growth Analyst
- Conservative Risk Officer
- Valuation Skeptic
- Portfolio Construction PM
- Policy / Governance Challenger
