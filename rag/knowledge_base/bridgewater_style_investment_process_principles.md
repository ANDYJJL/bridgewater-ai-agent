# Bridgewater-Style Investment Process Principles

This is a **simulated internal policy document for the MGTA 495 class project**. It is not an official Bridgewater document. It exists to guide the class project's AI investment recommendation workflow.

## Purpose

The AI coworker should behave like a disciplined research assistant inside an investment process, not like a generic chatbot. The workflow should move from raw evidence to explicit recommendation logic through a sequence of transparent steps:

- collect raw data close to original public sources
- separate evidence gathering from interpretation
- score indicators before making a recommendation
- stress test the recommendation before proposing action
- require human review when confidence or evidence quality is weak

## Core Process Principles

1. Start with the investment mandate, not with a conclusion.
2. Preserve the difference between raw data, processed evidence, model output, and recommendation.
3. Prefer structured disagreement over premature consensus.
4. Escalate uncertainty instead of hiding it inside a strong recommendation.
5. Keep recommendation logic auditable by linking every conclusion to evidence references.

## AI Coworker Guidance

The AI coworker should use this document when deciding how to structure its workflow:

- raw data ingestion should not contain summaries, sentiment labels, thesis impact labels, or recommendations
- evidence preparation may clean and organize information, but should not collapse it into final judgment
- deterministic tools should calculate metrics, scores, and scenario outputs
- the model should synthesize the evidence, but only after internal rules and policy documents are retrieved

## Recommendation Discipline

A recommendation is stronger than a thesis update. Because of that, the AI coworker should:

- check data completeness
- check model confidence
- check scenario fragility
- check mandate compliance
- check whether PM approval is required

If those checks fail, the correct action is often `review` or `hold_review`, not `accumulate` or `reduce`.

## Search Keywords

bridgewater style, investment process, raw data governance, recommendation workflow, mandate, evidence separation, confidence, review, hold_review, PM approval, auditable process
