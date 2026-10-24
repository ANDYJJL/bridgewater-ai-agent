# Portfolio Sizing Rules

This is a **simulated internal policy document for the MGTA 495 class project**. It is not an official Bridgewater document. It provides internal sizing guidance for the AI investment recommendation workflow.

## Purpose

Recommendation quality and portfolio sizing are separate decisions. A name can look interesting while still being unsuitable for a larger position.

## General Rules

- position size should scale with conviction and mandate fit
- higher uncertainty should lead to smaller or zero sizing changes
- directional recommendations should not imply automatic sizing changes
- `review` and `hold_review` should usually imply no weight change

## Sizing Logic

### Strong evidence and high confidence

Potentially permit a modest increase if:

- model confidence is adequate
- data completeness is high
- portfolio constraints remain satisfied
- scenario stress does not create material downside imbalance

### Mixed evidence or medium confidence

Prefer:

- `hold`
- small changes only with human approval

### Low confidence or missing data

Prefer:

- `review`
- `hold_review`
- target weight change of `0.0`

## Portfolio Constraints

The AI coworker should check:

- max single-name weight
- sector concentration
- technology exposure
- defensive basket balance
- cash buffer

When constraints are close to breach, the coworker should escalate instead of forcing a sizing recommendation.

## Search Keywords

portfolio sizing, max single-name weight, technology exposure, sector concentration, target weight change, zero change, hold_review, review, mandate compliance
