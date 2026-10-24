# AI Process Design

This file documents the final Milestone 04 process redesign for the
Bridgewater-style AI investment research workflow.

## Process Being Redesigned

The process is an equity research handoff from initial research assignment to
Portfolio Manager decision review. The current manual version requires analysts
to gather data, read sources, build valuation notes, draft memos, and coordinate
review through multiple handoffs.

The AI-supported version keeps the same human roles but centralizes evidence
and drafting around a structured backend packet. The system supports analysis;
it does not replace investment judgment.

## Current Manual Process

1. Junior Analyst receives a research question and identifies relevant sources.
2. Analyst manually collects SEC, news, macro, market, and portfolio context.
3. Analyst drafts notes, valuation assumptions, and an initial memo.
4. Senior Analyst reviews the memo, challenges assumptions, and prepares a
   proposal or handoff.
5. Risk Team stress tests the proposal and adds controls.
6. Portfolio Manager reviews the handoff, challenges unresolved points, and
   records a decision outside the system.

Common pain points are scattered evidence, repeated copy/paste, inconsistent
handoffs, weak visibility into source support, and late discovery of data gaps.

## AI-Supported Process

1. The user starts a case in the UI by selecting a supported company and
   research question.
2. The backend collects or loads raw data and creates processed evidence,
   valuation artifacts, risk artifacts, and the final source packet.
3. The UI shows source collection, indicator evidence, RAG evidence, valuation
   outputs, and limitations for human inspection.
4. The Junior Analyst uses `draft-synthesis-memo` to create editable,
   source-mapped memo sections.
5. The Senior Analyst reviews valuation assumptions, experimental model checks,
   entry references, and proposal rationale.
6. The Risk Team uses `run-risk-scenario-analysis` to evaluate bear/base/bull
   cases and add controls.
7. The Portfolio Manager uses `run-pm-decision-debate` to pressure-test the
   decision with five challenger perspectives.
8. The PM records a local decision. No trade execution, external order routing,
   or external order management is implemented.

## Role Handoffs

| Handoff | Packet or UI artifact | Human control |
|---|---|---|
| Assignment to Junior Analyst | Ticker, company, theme, question, latest packet. | Analyst confirms scope and supported ticker. |
| Junior to Senior Analyst | Editable synthesis memo, evidence traceability, limitations. | Junior marks ready only after reviewing sources. |
| Senior to Risk Team | Senior action proposal, valuation basis, risk controls, review triggers. | Senior owns stance, sizing assumptions, and handoff text. |
| Risk Team to PM | Scenario analysis, valuation impact, portfolio impact, controls, questions. | Risk Team owns selected scenario and risk judgment. |
| PM decision review | Debate summary, objections, unresolved questions, final checklist. | PM records local approve/defer/reject decision. |

## AI Components

- Deterministic tools build the packet and keep source outputs reproducible.
- RAG retrieval adds internal-style process policies and review checklists.
- Active skills produce drafts, explanations, scenario analysis, and PM debate.
- The UI displays evidence and requires human review before handoff.

## Guardrail Design

- No trade execution or external order routing.
- Backend proposal fields remain read-only in the UI.
- LLM output is drafting support and cannot override packet guardrails.
- Missing evidence and model limitations are disclosed.
- Strong actions are blocked when evidence quality is too low.
- PM approval remains required before any local decision can be treated as
  complete.

## Final Output

The final deliverable is a coherent research-support workflow: a backend source
packet, role-based UI, evidence views, memo/proposal/risk/debate support,
documentation, and tests that demonstrate conservative behavior under realistic
failure modes.
