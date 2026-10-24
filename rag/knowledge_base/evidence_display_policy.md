# Evidence Display Policy

This is a **simulated internal policy document for the MGTA 495 class project**. It is not an official Bridgewater document. It defines how the AI investment workflow should present evidence to users.

## Purpose

Evidence should be visible, attributable, and separate from judgment. Users should be able to see:

- what came from raw public data
- what was computed by deterministic tools
- what was retrieved from internal policy documents
- what was inferred by the AI coworker

## Display Rules

### Raw data display

Do not rewrite raw data into a recommendation at the collection stage. Raw files should remain close to the public source.

### Processed evidence display

Processed evidence may include:

- cleaned article text
- filing fact extraction
- feature values
- keyword hits
- model outputs

But processed evidence should still avoid pretending to be final judgment.

### Recommendation display

Every recommendation should show:

- action
- confidence score
- blocked strong action reason when relevant
- data limitation reason
- evidence references
- PM review status

## AI Coworker Guidance

The coworker should cite evidence instead of hiding it. In low-confidence cases, the display should emphasize uncertainty, missing sources, and policy constraints.

## Search Keywords

evidence display, evidence refs, raw data governance, processed evidence, confidence score, blocked strong action reason, data limitation reason, PM review status
