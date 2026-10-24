# Predicted Failure Cases

These are realistic ways the AI-supported investment research workflow could
fail. The goal is not to eliminate all risk, but to make weak evidence and
review needs visible before a human records a local decision.

| Failure case | Why it might happen | Business consequence | How the user would notice | How your process handles it |
|---|---|---|---|---|
| Missing market or filing data | Source API unavailable, stale cached file, or no comparable filing fact. | Recommendation could look more certain than the evidence supports. | Packet limitations, missing-data warnings, unavailable fields, or conservative action labels. | Tests cover missing files/facts and strong-action blocking; UI surfaces limitations and requires review. |
| Conflicting evidence between news, filings, and valuation model | News may be positive while filings or DCF assumptions are weaker. | Analyst could over-weight the most recent or most vivid evidence. | Evidence panels show positive drivers, risk drivers, valuation assumptions, and source paths separately. | Human review gates require Junior/Senior challenge before Risk Team or PM review. |
| Wrong or weak RAG document retrieved | Keyword retrieval may match a policy term without the best context. | AI explanation could cite a policy that is only loosely relevant. | RAG result title, excerpt, path, and score are visible; unrelated queries can return empty results. | `tests/rag` verifies relevant retrieval, top-k behavior, required fields, and graceful no-match behavior. |
| LLM provider missing or failing | No local API key, timeout, rate limit, or provider error. | Drafting could fail during demo or review. | `/chat` returns `fallback_used=true`, diagnostics, and deterministic packet text. | Tests cover missing keys, API errors, sanitized diagnostics, and skill fallback behavior. |
| Unsupported ticker or invalid assignment | User enters a ticker outside the demo scope. | Workflow could generate irrelevant or empty outputs. | Backend returns `unsupported_ticker`; frontend validation asks for supported companies. | API tests cover unsupported ticker behavior. |
| Valuation reference mistaken for an action target | Entry price and DCF output may look like a precise action proposal. | User could overstate the system as a trading tool. | UI and memo language label values as fair value estimates, illustrative references, or review-only assumptions. | Skill tests enforce review-only wording, no final-target overclaiming, and disclosure of simulated share counts. |
| User skips human review | A polished memo or PM debate output may invite over-trust. | Poor decision quality or unchallenged assumptions. | Mark-ready, proposal, Risk Team, and PM decision controls are separate local actions. | Human review is required in skill outputs and UI handoffs; no backend trade execution exists. |
| Scenario analysis drifts from selected case | LLM may discuss a base case even when the user selected bear. | Risk Team may miss the actual downside question. | Selected scenario, applied shocks, impact chain, and controls are shown in structured fields. | Risk scenario tests enforce bear/base/bull selection discipline and sanitize repeated fields. |
| Local UI state becomes stale | LocalStorage memo/proposal may be older than the backend packet. | Reviewer may compare old notes to refreshed evidence. | UI labels saved state and provides reset/regenerate controls. | Reviewers can reset from backend packet; final decision remains local-only until manually reviewed. |

At least two of these are covered directly by automated tests: missing evidence
and LLM fallback behavior. Additional tests cover RAG no-match behavior,
unsupported tickers, no hardcoded API keys, conservative action gates, scenario
selection discipline, and PM debate safeguards.
