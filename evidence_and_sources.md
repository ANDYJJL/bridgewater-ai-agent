# Evidence and Source Use

The AI coworker is expected to show the evidence behind its drafts, proposals,
and local decision support. The current prototype uses deterministic data artifacts,
RAG policy documents, source maps, citations, and UI evidence panels so a
human reviewer can inspect support before acting on any output.

## 1. What data does the AI use?

Structured data comes from `data/`, `artifacts/`, and the generated
recommendation packet.

- `data/raw/sec/`: SEC source metadata for `NVDA` and `KO`.
- `data/raw/news/`: raw public news payloads and source metadata.
- `data/raw/fred/`: FRED macro observations and source metadata.
- `data/raw/market/`: price histories for demo securities and benchmarks.
- `data/processed/news_evidence.json`: article chunks and keyword hits.
- `data/processed/filing_evidence.json`: filing metrics, excerpts, and
  limitations.
- `data/processed/stock_features.csv`: market, macro, fundamental, and
  keyword-derived feature rows.
- `data/processed/indicator_scorecards.json`: positive, negative, and mixed
  indicator signals used by the UI and explanation skill.
- `data/processed/model_predictions.json`: experimental model metadata and
  conservative fallback behavior.
- `data/processed/three_statement_models.json`, `dcf_valuations.json`, and
  `entry_price_models.json`: valuation artifacts and entry reference
  assumptions. In `dcf_valuations.json`, `valuation_date` is the valuation
  snapshot date from the latest raw market-price row used by the model, not a
  live pricing timestamp.
- `data/processed/portfolio_stress_test.json`: scenario and portfolio stress
  outputs.
- `artifacts/milestone04_demo/recommendation_packet.json`: the frontend-ready
  packet served by `GET /recommendation/latest`.

## 2. What documents does the AI use?

The RAG corpus in `rag/knowledge_base/` simulates internal investment process
knowledge. It is separate from the raw and processed operating data.

The documents cover:

- investment process principles
- evidence display policy
- recommendation rating policy
- filing analysis checklist
- macro research framework
- conviction scoring framework
- risk escalation rules
- scenario stress testing policy
- portfolio sizing rules
- human approval and no-execution policy
- thesis monitoring guidelines
- AI investment committee protocol

These documents guide how evidence should be shown, when review should be
escalated, and how final decisions should be governed.

## 3. What tools or Python functions does the AI use?

- `scripts/collect_real_raw_data.py`: collects or refreshes raw demo source
  data.
- `tools/prepare_news_evidence.py`: turns raw news into evidence chunks and
  keyword-hit summaries.
- `tools/prepare_filing_evidence.py`: extracts filing evidence and records
  limitations instead of fabricating missing facts.
- `tools/build_stock_features.py`: creates feature rows from market,
  fundamental, macro, and evidence inputs.
- `tools/predict_outperformance.py`: produces experimental prediction
  metadata and fallback model outputs.
- `tools/score_stock_indicators.py`: scores configured indicators for each
  ticker.
- `tools/build_three_statement_model.py`: builds simplified financial model
  artifacts.
- `tools/build_dcf_model.py`: creates DCF valuation estimates with explicit
  assumptions.
- `tools/build_entry_price_model.py`: derives entry references and flags
  simulated share-count limitations.
- `tools/run_portfolio_stress_test.py`: produces portfolio scenario stress
  outputs.
- `tools/generate_recommendation_packet.py`: assembles the packet consumed by
  the backend and UI.
- `rag/retrieval.py`: retrieves internal policy excerpts by deterministic
  keyword overlap.
- `mcp_servers/bridgewater_server.py`: wraps selected pipeline helpers through
  FastMCP for local validation and experimentation.

## 4. How does the user see the evidence?

The UI displays evidence in several places:

- Junior Step 2 shows assignment context, source collection, indicator evidence
  references, news evidence, and portfolio context.
- Junior Step 3 is the clearest evidence review screen, with indicator
  drivers, risk/review drivers, evidence-used disclosures, and RAG evidence.
- Junior Step 5 shows evidence traceability beside the synthesis memo draft.
- Senior pages show model review, valuation review, assumption challenges, and
  evidence challenge summaries.
- Risk Team and PM pages show scenario outputs, portfolio impact, unresolved
  questions, and local decision context.
- `POST /chat` responses include `sources_used`, `citations`, `limitations`,
  and, for memo drafting, source maps tied to editable sections.

Evidence is shown as rendered cards, labels, source paths, memo source maps,
and backend packet fields rather than hidden prompt context.

## 5. What happens if the evidence is missing, weak, or conflicting?

The workflow is designed to fail conservatively.

- Missing source files or unavailable metrics are recorded as limitations.
- Missing market data blocks strong action labels and keeps position-change fields
  conservative.
- Simulated share counts and proxy valuation assumptions are disclosed in memo
  and entry-reference text.
- If an LLM call fails or no API key is available, `/chat` returns a
  deterministic packet-based fallback with `fallback_used=true` and an error
  type that does not expose secrets.
- If RAG retrieval has no relevant match, it returns an empty result list
  rather than forcing a source.
- Human review gates remain required for Junior handoff, Senior proposal, Risk
  Team judgment, and Portfolio Manager decision review.
- The UI lets reviewers reset local drafts from the backend packet or rerun the
  packet workflow when a mismatch is discovered.
