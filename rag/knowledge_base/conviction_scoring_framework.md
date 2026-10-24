# Conviction Scoring Framework

This is a **simulated internal policy document for the MGTA 495 class project**. It is not an official Bridgewater document. It describes how the AI investment workflow should think about confidence and conviction.

## Purpose

The workflow should distinguish:

- indicator score
- model probability
- conviction
- recommendation confidence

These are related but not identical. A high signal score with poor evidence quality should not become high conviction.

## Conviction Inputs

The AI coworker should consider:

- model confidence
- data completeness score
- breadth of evidence across macro, news, filings, and market data
- consistency across analyst viewpoints
- scenario robustness
- mandate fit

## Conviction Buckets

### Low

Use when:

- major data sources are missing
- evidence is narrow
- the model is running in fallback mode
- scenario logic suggests fragility

### Medium

Use when:

- core evidence exists
- the recommendation direction is plausible
- but there are still unresolved limitations or mixed signals

### High

Use only when:

- evidence is broad
- core datasets are present
- model confidence is meaningful
- scenario stress does not overturn the recommendation
- committee disagreement is limited

## AI Coworker Guidance

The coworker should treat low conviction as a governance signal. Low conviction often implies:

- `review`
- `hold_review`
- PM escalation
- zero target weight change in the draft trade ticket

The coworker should not confuse strong language with high conviction.

## Search Keywords

conviction scoring, confidence score, low conviction, medium conviction, high conviction, data completeness, fallback model, scenario robustness, PM escalation
