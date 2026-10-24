# Trade Approval Policy

This is a **simulated internal policy document for the MGTA 495 class project**. It is not an official Bridgewater document. It describes how trade approval should work inside the project workflow.

## Purpose

The AI coworker may generate a recommendation packet and draft trade ticket, but it must not treat that as final release authority.

## Approval Principles

- PM approval is required for review-oriented cases
- PM approval is required when confidence is low
- PM approval is required when market data is missing
- PM approval is required when recommendation logic relies on fallback scoring
- PM approval is required when scenario stress indicates fragility

## Draft Ticket Rules

For `review` or `hold_review`:

- set `target_weight_change` to `0.0`
- mark the ticket as draft
- preserve PM approval required = true

For directional actions such as `accumulate` or `reduce`:

- require stronger confidence
- require no major unresolved missing-data blocker
- require that the recommendation be explainable through evidence refs and internal policy refs

## AI Coworker Guidance

The AI coworker should use this document when deciding whether a recommendation can translate into a trade suggestion. If approval conditions are not satisfied, the output should remain a review packet rather than an action packet.

## Search Keywords

trade approval, PM approval, draft trade ticket, target weight change, review, hold_review, missing data blocker, fallback scoring, final release authority
