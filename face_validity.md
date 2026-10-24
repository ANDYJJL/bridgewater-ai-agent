# Face Validity Check

Face validity asks whether the AI-supported workflow looks reasonable to
someone familiar with investment research, even though it does not prove the
outputs are correct.

## 1. Direction

The direction of the process change is plausible. AI support reduces time in
source organization, first-draft writing, evidence summarization, and structured
scenario/debate preparation, while human review remains in the high-judgment
steps: valuation assumptions, Senior proposal, Risk Team controls, and PM
decision review.

## 2. Magnitude

The estimated reduction from roughly 9.75-17.5 hours to 4.25-8.4 hours per
case is a moderate-to-large improvement, not a full automation claim. The size
is plausible for a class prototype because the biggest savings come from
centralizing evidence and drafting the first memo, not from eliminating analyst
or PM review.

## 3. Evidence Alignment

The outputs are designed to align with evidence shown to the user: source paths,
citations, limitations, RAG excerpts, valuation assumptions, and packet fields
are visible in the API responses and UI. The main residual risk is that a user
may trust a polished LLM draft more than the source quality deserves, so the
workflow keeps source inspection and review controls explicit.

## 4. Practical Constraints

The process respects practical constraints for a research-support prototype.
It does not execute trades, stores UI handoffs locally, requires PM review,
labels experimental model checks as review-only, and falls back conservatively
when evidence or LLM support is weak.

## 5. What Would Need More Work

Before this could be used beyond a classroom demo, the team would need stronger
data provenance, authentication, audit logging, real workflow routing, broader
coverage than `NVDA` and `KO`, validation against historical analyst decisions,
and formal compliance review.
