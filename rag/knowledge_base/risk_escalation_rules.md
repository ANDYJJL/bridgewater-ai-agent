# Risk Escalation Rules

## Purpose
Escalate when the available evidence suggests that automated synthesis alone is not enough. Escalation is not failure. It is a control designed to prevent quiet drift from a monitored thesis into an unexamined risk position.

## Escalation Categories

### Monitor
Evidence is notable but does not yet justify immediate human intervention. Continue structured observation.

### Review soon
Evidence suggests a meaningful change in one or more assumptions and should be reviewed by a human analyst in the next cycle.

### Immediate review
Evidence may alter the thesis structure, confidence level, or risk posture quickly enough that human review should not wait.

## Standard Triggers

Escalate to at least **review soon** when:
- two or more evidence items weaken the same key assumption
- a filing excerpt and external news point to the same operational vulnerability
- customer concentration rises while demand visibility becomes less clear
- macro and policy variables move in a direction that raises the cost of preserving the thesis

Escalate to **immediate review** when:
- a core assumption appears invalid rather than merely delayed
- market access, legal status, or product eligibility changes materially
- the business becomes highly dependent on a narrower group of customers or regions than the thesis assumed
- multiple independent signals suggest structural margin impairment or demand digestion

## Decision Rules

1. Escalate based on assumption impact, not headline drama.
2. Escalate faster when evidence is hard to reverse.
3. Escalate faster when the same risk appears across macro, filing, and news sources.
4. Do not escalate solely because evidence is negative; escalate because the thesis may need human re-underwriting.

## Conflicting Evidence Rule
If evidence is mixed, do not default to “no escalation.” Instead ask:
- is the supportive evidence addressing the same assumption as the adverse evidence?
- is the supportive evidence current while the adverse evidence is structural?
- could both be true at once, with one affecting demand and the other affecting margin or policy exposure?

Escalate when conflicting evidence raises model uncertainty enough that mechanical aggregation would be misleading.

## Evidence Priority
When weighing escalation, prioritize:
1. direct company disclosures
2. observable policy changes
3. repeated external evidence from independent sources
4. macro variables with short transmission paths
5. broad narrative commentary

This ranking does not imply that lower-ranked evidence is irrelevant. It means lower-ranked evidence rarely decides an escalation on its own.

## Required Escalation Output
When the model escalates, it should specify:
- which assumption is at risk
- what evidence triggered the escalation
- whether the issue is timing, economics, access, or structure
- what a human analyst should review next

## Examples of Human Review Questions
- Does the thesis still hold if demand broadens more slowly than expected?
- Is current customer concentration acceptable given new capex volatility?
- Are policy restrictions now large enough to require a different regional revenue assumption?
- Is margin pressure transitional or a sign that the economics were overstated?

## Final Principle
The agent should be conservative about certainty but not passive about risk. When the evidence suggests that preserving the thesis requires new judgment rather than routine monitoring, escalate.
