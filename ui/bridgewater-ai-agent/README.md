# Bridgewater AI Agent Frontend

This is the Next.js frontend for the MGTA 495R Milestone 04
Bridgewater-style AI investment research workflow. It presents a role-based
research workspace for Junior Analyst, Senior Analyst, Risk Team, and Portfolio
Manager review.

The frontend is a classroom prototype. It supports workflow review, evidence
inspection, drafting, local handoff state, and local PM decision recording. It
does not execute trades, route orders, or expose LLM API keys in the browser.

## Backend Integration

The frontend is connected to the Python backend through Next.js proxy routes.
The backend generates a structured `recommendation_packet.json` containing
processed evidence, indicator scorecards, stress-test results, RAG evidence,
valuation artifacts, and human-review metadata.

Packet loading uses a three-tier fallback:

1. `GET /api/backend/recommendation/latest?refresh=auto` (Next.js proxy to Python backend)
2. `localStorage` key `bridgewater_latest_recommendation_packet` (populated by Step 1 live run)
3. Static fallback: `src/data/recommendation_packet.json`

**Senior Analyst — four-step workflow:**

`/senior-analyst` — Step 1: Junior Memo Review:
- Reads Junior Step 5 synthesis memo from `localStorage` key `bridgewater_synthesis_memo_${ticker}` (read-only; Junior-authored sections highlighted with soft blue/indigo background and "Junior-authored" badge).
- Shows compact backend proposal summary (action, PM review requirement, confidence, outperform probability, blocked reasons).
- Evidence Challenge Summary: top positive/risk drivers, key limitations, RAG policy names — no full indicator table.
- Senior quick note persists to `localStorage` key `bridgewater_senior_quick_note_${ticker}`. No backend writes.
- Navigation: Back to Role Selection | Continue to Model Quality.

`/senior-analyst/model-review` — Step 2: Model Quality Review:
- Backend model card (read from `model_predictions.predictions[ticker]`).
- **Classification Checks** (Logistic Regression, Random Forest): experimental alignment checks and outperform probability only; they are review inputs, not final valuation targets.
- **Experimental Valuation Check** (Linear Regression, Random Forest Regressor): reads `model_comparison.ticker_results[ticker].target_price_models`. Includes `validation_status`, `price_estimate_usable`, `beats_baseline`, baseline metrics (MAE, RMSE), and limitations. When `price_estimate_usable = false`, the predicted price is labeled "Raw experimental estimate" with a clear warning and is not presented as a usable action target.
- Future model slot placeholder (muted, no model implied).
- All experimental models are labeled "Experimental - Senior Analyst Review Only" and do not affect the packet action, PM review gate, or local proposal fields. No Neural Network model is included.
- Navigation: ← Junior Memo Review | Continue to Risk Handoff.

`/senior-analyst/risk-handoff` — Step 3: Senior Notes & Risk Handoff (simplified):
- Displays stress scenarios flagged by the backend for the selected ticker (read-only).
- Three core editable sections (amber Senior-authored styling, persisted to `bridgewater_senior_risk_handoff_${ticker}`):
  - Risk Team Summary (pre-filled from backend: action, PM review, key risk drivers, stress action, data limitations)
  - Key Assumptions to Challenge (pre-filled from `company_theses[ticker].key_assumptions`)
  - Senior Analyst Notes
- Collapsible "Optional Reviewer Questions" section (single textarea for Risk Team / PM questions).
- Source checklist: shows availability of Junior memo, backend packet, model review, stress test, and PM review requirement.
- Buttons: Save locally, Reset from backend (regenerates prefills), Mark ready for Risk Team.
- "Mark ready" is local UI only; backend routing is not implemented.

`/senior-analyst/trade-proposal` — Step 4: Senior Proposal Simulator:
- Backend guardrails card (white/light styling): packet action, PM review chip, and local-only status (read-only).
- Packet-based deterministic draft: "Generate packet-based draft" uses frontend logic from backend packet fields only (not LLM). Prefills proposed action, entry price, rationale notes, and risk control notes. Labeled "Generated from backend packet fields; editable by Senior Analyst."
- Structured local proposal fields: proposed action, order style, quantity/shares, entry reference (defaults to current price from packet), stop loss % + computed price, take profit % + computed price, estimated notional (read-only, qty x entry), rationale, key risk controls.
- Persists to `bridgewater_senior_trade_proposal_${ticker}` (localStorage only). Backward compatible with prior field names.
- Proposal summary card: read-only snapshot of all proposal fields including computed prices and notional.
- Mismatch warning (compact inline) shown only when proposed action is more aggressive than the backend packet action.
- Validation chips shown for missing quantity/entry price on aggressive actions and failed valuation-reference validation.
- Experimental price estimates that failed backend validation are not used as defaults or action targets.
- Buttons: Save locally, Reset, Mark ready for PM review.
- No trade is submitted and no external order is routed. PM review remains required. "Mark ready" is local UI only. Packet action and PM review requirement remain backend-controlled.

Grounded drafting via `/chat` backend proxy:
- The frontend calls `POST /api/backend/chat` (Next.js proxy — browser never contacts `localhost:8000` directly and no API key is exposed).
- Supported modes: `junior_memo`, `senior_risk_handoff`, `trade_proposal_rationale`, `packet_qna`, `indicator_explanation`.
- Response includes `answer`, `llm_used`, `fallback_used`, `sources_used`, `limitations`.
- UI shows badge: **"Grounded LLM draft"** when `llm_used=true`; **"Deterministic packet draft"** when `fallback_used=true`.
- Draft is shown in a preview panel — the user must press **"Apply to [field]"** to insert it; no auto-overwrite of user-written text.
- Junior Step 5: "Draft from backend packet" button applies to Executive Summary only.
- Senior Risk Handoff (Step 3): "Draft risk handoff from packet" applies to Risk Handoff Summary only.
- Senior Proposal (Step 4): "Draft rationale from packet" applies to Rationale only.
- All drafted text is user-editable before saving. Nothing is approved, routed, sent, or executed.
- Packet action and PM review requirement remain backend-controlled regardless of drafting output.
- Helper: `src/lib/backendChat.js` → `chatWithBackend({ ticker, question, mode })`.
- Shared panel: `src/components/workflow/DraftPreviewPanel.jsx`.

**Key workflow rules enforced in frontend:**
- Backend packet action is always read-only in Junior Analyst Step 4 and Step 5.
- PM approval badge and guardrail notes are driven by `human_review.pm_approval_required`.
- Trade execution is not supported from any Junior Analyst workflow page.
- Junior Analyst Step 5 (Synthesis Memo) saves analyst edits to `localStorage` only; no backend writes are performed.

---

## Workflow Screens

| Area | Routes | Purpose |
|---|---|---|
| Start and assignment | `/`, `/junior-analyst/step-1` | Select role/ticker and start a research assignment. |
| Junior AI work | `/junior-analyst/step-2` through `/junior-analyst/step-5` | Review sources, evidence, valuation artifacts, and synthesis memo draft. |
| Evidence views | Junior Step 2, Junior Step 3, Junior Step 5, `/backend-toolkit` | Show source references, RAG evidence, packet fields, and traceability. |
| Senior review | `/senior-analyst`, `/senior-analyst/trade-proposal`, `/senior-analyst/risk-handoff` | Review memo/valuation, draft a local Senior proposal, and package risk handoff. |
| Risk Team review | `/risk-team`, `/risk-team/simulation`, `/risk-team/handoff` | Review scenario analysis and local risk controls. |
| PM review | `/portfolio-manager` | Run decision debate and record a local PM decision. |

## Local State

Several handoffs persist to `localStorage` so the demo can move between role
pages without a production workflow database. Examples include Junior memo
drafts, Senior notes, Risk Team handoff state, and PM local decision records.

Local state is for demonstration only. Backend routing, authentication,
approval audit logs, external order routing, and order management are not
implemented.

## Getting Started

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000`.

### Build for Production

```bash
npm run build
npm start
```

## Tech Stack

- **Framework**: Next.js 14 (React)
- **Styling**: Tailwind CSS
- **Configuration**: jsconfig.json for @ path aliases

## Backend URL

The proxy defaults to the FastAPI backend at `http://localhost:8000`. If
needed, set:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Do not put LLM provider keys in frontend environment variables.

## Guardrails

- Backend packet action fields are displayed as read-only context.
- Draft text remains editable and must be applied by the user.
- PM approval and human review warnings are displayed from packet fields.
- "Mark ready" and PM decisions are local UI states only.
- Trade execution is not supported anywhere in the frontend.
- External order routing is not supported anywhere in the frontend.
