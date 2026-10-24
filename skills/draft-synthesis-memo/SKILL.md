---
name: draft-synthesis-memo
description: Draft a role-aware, source-grounded investment synthesis memo from recommendation_packet.json while keeping human analyst review and editing in the loop.
---

# Draft Synthesis Memo

Use this skill when `/chat` receives `mode="synthesis_memo"`.

## Purpose

Create an editable memo draft from the backend source packet for one ticker and one workflow role. The skill is drafting support only:

- It does not make final investment decisions.
- It does not approve or execute trades.
- It must not invent facts outside the packet.
- A human analyst must review and edit every section before handoff.

## Inputs

- `ticker`
- `company` optional
- `question` optional research prompt
- `role`: `junior_analyst`, `senior_analyst`, `risk_team`, or `portfolio_manager`

## Data Sources

Read compact facts from `recommendation_packet.json`:

- `recommendations.{ticker}`
- `company_theses.{ticker}`
- `indicator_scorecards.scorecards[{ticker}]`
- `three_statement_models.models.{ticker}`
- `dcf_valuations.valuations.{ticker}`
- `entry_price_models.entry_prices.{ticker}`
- `portfolio_stress_test`
- `news_evidence.{ticker}`
- `filing_evidence.{ticker}`
- `rag_evidence` when present

## Output

Return a structured response with:

- `memo_markdown`
- `memo_sections`, with `editable: true` on every section
- `source_map`
- `human_review_required: true`
- `human_review_notes`
- LLM/fallback diagnostics and citations compatible with `/chat`

## Readability Format

- Use simple section headings only.
- Do not use markdown tables or pipe table syntax.
- Avoid excessive markdown styling; do not bold every label.
- Prefer this shape inside each section:
  - `Summary:`
  - one short summary sentence
  - one short bullet group with 3-5 bullets maximum
  - optional short review note
- Keep valuation evidence central: 3-statement model, DCF valuation, entry price reference, margin of safety, and simulated share count limitations.
- For `role="junior_analyst"`, the `Entry Price Reference` section must explicitly include DCF fair value per share, margin of safety, entry price reference, share count source/simulation status, and the source path `entry_price_models.entry_prices.{ticker}`.
- For `role="junior_analyst"`, use qualitative indicator language only. Do not mention aggregate indicator score, recommendation band, reduce/hold status, numeric indicator scores, weights, or confidence.
- For `role="risk_team"`, write a Risk Handoff-style memo. Emphasize Senior proposed stance, valuation basis, key risks, questions for Risk Team, and human review.

## Safety Rules

- Say missing, simulated, unavailable, proxy, or assumption-based values explicitly.
- If share count is simulated, state: `Entry price is illustrative because share count is simulated.`
- If DCF uses a proxy discount rate, state: `Discount rate is a proxy estimate, not a fully built WACC.`
- Refer to DCF output as a fair value estimate or illustrative entry reference, not a stock-price prediction, official target price, or trade instruction.
- If PM review is required, state final action requires PM review.
- Legacy ML model-quality fields are compatibility metadata only and should not be used as Senior evidence.
- Do not expose raw snake_case limitation ids or ticker-prefixed stress ids in memo text.
- Do not include unsupported final trade approval, routing, or execution language.
