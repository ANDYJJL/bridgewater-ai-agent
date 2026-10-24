# Recommendation Rating Policy

This is a **simulated internal policy document for the MGTA 495 class project**. It is not an official Bridgewater document. It defines how the class project should translate evidence into recommendation ratings.

## Purpose

The AI coworker should use recommendation ratings consistently across securities and across runs. Ratings are not market predictions in isolation; they are decision labels that combine evidence quality, risk, and confidence.

## Allowed Recommendation Actions

- `accumulate`
- `hold`
- `reduce`
- `avoid`
- `review`
- `hold_review`

## Rating Definitions

### Accumulate

Use only when:

- model confidence is meaningfully positive
- key data sources are present
- indicator scoring is supportive
- scenario stress does not show immediate recommendation fragility
- there is no unresolved governance blocker

### Hold

Use when:

- evidence is modestly supportive or mixed
- the position is not clearly under threat
- no immediate action is required

### Reduce

Use only when:

- evidence is negative in a way that is consistent across indicators
- confidence is adequate
- downside risk is meaningful
- the recommendation is not driven by missing or degraded inputs

### Avoid

Use when:

- the security should not be added or increased
- the mandate or risk posture is inconsistent with the security
- the downside profile is unacceptable under current rules

### Review

Use when:

- confidence is too low for a directional action
- key data sources are missing
- model output is weak or unstable
- PM or analyst review is required before any recommendation is credible

### Hold Review

Use when:

- current evidence is somewhat negative or fragile
- but confidence is not high enough to justify a directional reduction
- and the right next step is monitoring plus PM review rather than a position change

## AI Coworker Guidance

The AI coworker should never use `accumulate` or `reduce` when data quality or confidence is weak. In low-confidence cases, `review` or `hold_review` is the preferred policy outcome.

## Search Keywords

recommendation rating, accumulate, hold, reduce, avoid, review, hold_review, confidence threshold, missing data, PM review, directional action
