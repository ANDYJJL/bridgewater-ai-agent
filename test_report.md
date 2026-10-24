# Test Report

Final local verification was run on June 3, 2026.

## Command Results

| Check | Command | Result |
|---|---|---|
| Python compile check | `python -m py_compile api/server.py scripts/collect_real_raw_data.py tools/generate_recommendation_packet.py skills/draft-synthesis-memo/run.py` | Pass |
| Backend tools suite via project runner | `uv run --active python -m pytest tests/tools -q` | Pass: 108 passed in 46.23s |
| RAG suite via project runner | `uv run --active python -m pytest tests/rag -q` | Pass: 5 passed in 0.03s |
| Frontend build | `npm run build` in `ui/bridgewater-ai-agent` | Blocked in this workspace: `npm` is not installed/on PATH |

The backend and RAG checks were run with the repo's documented
`uv run --active` path, which passed.

## Realistic Test Cases And Results

| # | Case | What was checked | Result | Evidence from tests |
|---:|---|---|---|---|
| 1 | Unsupported company/ticker entered at assignment start. | API rejects unsupported tickers instead of producing empty research output. | Pass | `tests/tools/test_api_server.py::test_recommendation_run_unsupported_ticker` |
| 2 | User asks for an indicator explanation when no LLM key is available. | Backend returns safe fallback diagnostics rather than failing silently. | Pass | `test_chat_without_api_key_returns_missing_key`, `test_indicator_explanation_llm_failure_returns_indicator_specific_fallback` |
| 3 | LLM provider returns an error. | Response falls back to deterministic packet text and does not expose secrets. | Pass | `test_chat_with_class_llm_api_error_falls_back`, `test_chat_diagnostics_never_include_api_key` |
| 4 | Junior Analyst asks why two different indicators were classified differently. | Indicator-specific context and prompts differ by indicator. | Pass | `test_indicator_explanation_two_indicators_produce_different_prompts`, `test_different_indicators_produce_different_context_and_prompts` |
| 5 | Junior Analyst drafts a synthesis memo from the packet. | Memo sections are editable, source-mapped, and human review is required. | Pass | `test_junior_analyst_memo_includes_valuation_review_and_entry_reference`, `test_source_map_exists_and_each_memo_section_has_sources` |
| 6 | Entry price uses simulated share count or proxy valuation assumptions. | Draft text discloses limitations instead of presenting a precise target. | Pass | `test_simulated_share_count_is_explicitly_mentioned`, `test_prompt_requires_human_review_and_proxy_disclosure` |
| 7 | Filing facts are missing or cannot be aligned across fiscal periods. | Tool records limitations instead of inventing values. | Pass | `test_prepare_filing_evidence_handles_missing_facts_without_inventing_data`, `test_missing_comparable_balance_facts_produce_limitations_not_fake_values` |
| 8 | Market data is missing or evidence confidence is low. | Strong actions are blocked and PM approval remains required for review cases. | Pass | `test_missing_market_data_blocks_strong_action_and_zeroes_trade_change`, `test_low_confidence_cannot_produce_accumulate_or_reduce`, `test_review_cases_require_pm_approval` |
| 9 | RAG query asks about export-control risk escalation. | Retrieval returns a relevant internal-style policy document with required fields. | Pass | `tests/rag/test_retrieval.py::test_export_control_risk_escalation_returns_relevant_document` |
| 10 | RAG query has no meaningful match. | Retrieval returns gracefully rather than forcing irrelevant evidence. | Pass | `tests/rag/test_retrieval.py::test_unrelated_query_returns_gracefully` |
| 11 | Risk Team selects a bear/severe scenario. | Scenario output stays aligned to the selected case and includes controls/questions. | Pass | `test_bear_severe_high_scenario_uses_selected_controls`, `test_bear_llm_output_cannot_drift_to_base_case` |
| 12 | PM debate output includes language that could imply trade execution. | Skill sanitizes execution language and keeps decision support separate from approval. | Pass | `test_llm_output_sanitizes_trade_execution_language`, `test_deterministic_fallback_includes_all_five_agents` |

## Top Failure Patterns

1. Missing or weak evidence can make a draft look more complete than it is.
   The current tests check missing market data, missing filing facts, and RAG
   no-match behavior. The workflow handles this through limitations, evidence
   warnings, conservative gates, and human review.

2. LLM dependence can create demo fragility.
   The backend handles missing keys, provider errors, and timeouts with
   deterministic fallbacks and sanitized diagnostics.

3. Investment language can accidentally sound like approval or execution.
   Skill tests enforce review-only wording, no target-price overclaiming, no
   trade execution language, and explicit PM review requirements.

## Residual Test Gap

The backend and RAG suites are green through the repo-managed Python runner.
The Next.js production build could not be verified in this workspace because
`npm` is unavailable. The build should be rerun on a machine with Node.js and
npm installed before final push or public sharing.
