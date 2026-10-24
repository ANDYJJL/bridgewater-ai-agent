# Time, Cost, and Quality Reasoning

These estimates are assumptions for the class prototype. They are not
Bridgewater company data and should be read as order-of-magnitude reasoning for
an equity research workflow using the current demo system.

---

## Per-Step Time Estimate

| Process step | Current time per case | AI-supported time per case | Why might time change? | Confidence in estimate |
|---|---:|---:|---|---|
| Assignment scoping and case setup | 15-30 min | 10-15 min | The UI constrains the demo to supported tickers and carries the assignment through the workflow. | Medium |
| Source collection across filings, news, macro, and market data | 90-150 min | 20-40 min | Deterministic tools generate a shared packet instead of manual copy/paste across sources. | Medium |
| Evidence extraction and source review | 120-180 min | 30-60 min | Filing evidence, news evidence, RAG references, and source paths are pre-organized for inspection. | Medium |
| Indicator, model, valuation, and entry-reference analysis | 120-240 min | 60-120 min | Tools produce first-pass features, scorecards, DCF outputs, and entry references, but humans still challenge assumptions. | Low-Medium |
| Junior synthesis memo drafting | 90-150 min | 30-60 min | The memo skill creates editable sections and source maps from the packet. | Medium |
| Senior Analyst proposal and risk handoff | 60-120 min | 45-90 min | Drafting and packet summaries help, but Senior judgment and controls remain manual. | Medium |
| Risk Team scenario analysis | 60-120 min | 35-75 min | Scenario templates and packet values speed up bear/base/bull review. | Medium |
| PM debate and decision record | 30-60 min | 25-45 min | The debate skill surfaces objections, but final decision quality depends on PM review. | Medium |

---

## Summary table

| Metric | Current process estimate | AI-supported process estimate | Expected change |
|---|---:|---:|---|
| Total time per case | 9.75-17.5 hours | 4.25-8.4 hours | Roughly 35-55% less total elapsed analyst time under the assumptions above. |
| Human review time | 3.5-6.5 hours | 3.0-5.0 hours | Review time falls only modestly because the system intentionally preserves human gates. |
| Number of handoffs | 3-4 informal handoffs | 3 structured local handoffs | Handoffs remain, but context is more standardized. |
| Rework risk | Medium-high | Medium | Source maps, limitations, and review screens should reduce avoidable rework. |
| Stakeholder wait time | 1-3 workdays for a polished packet | Same day to 1.5 workdays for a demo-quality packet | Faster first draft; final timing still depends on reviewer availability. |

---

## Cost assumptions

Assumption: blended student-project analyst labor is valued at `$60/hour`.
This is not a real firm cost; it is a simple blended rate for comparing the
two process designs.

```text
Estimated labor cost per case = estimated minutes per case / 60 * estimated hourly cost
```

- Current process: 9.75-17.5 hours * $60/hour = $585-$1,050 per case
- AI-supported process: 4.25-8.4 hours * $60/hour = $255-$504 per case
- Estimated labor savings: $330-$546 per case, assuming the same review
  standard and no major rerun.

---

## Quality measures

- Evidence traceability: The packet, source maps, citations, and evidence
  panels make it easier for reviewers to see what the AI used.
- Consistency of handoffs: Junior, Senior, Risk, and PM pages use a shared
  packet and local handoff structure, reducing context loss.
- Better escalation of weak evidence: Missing market data, missing filing
  facts, simulated share count, proxy valuation assumptions, and LLM fallback
  states are surfaced as limitations.
- Decision quality: The PM debate skill forces objections and unresolved
  questions into the final review rather than only presenting a polished
  recommendation.

## Face Validity Summary

The estimated time savings come mostly from faster source organization and
first-draft creation, not from removing investment judgment. That is directionally
plausible for this workflow. See `face_validity.md` for the full check.
