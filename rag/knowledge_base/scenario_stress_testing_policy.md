# Scenario Stress Testing Policy

## Purpose
Use scenario analysis to test the resilience of the thesis under different environments. The goal is not to predict one future. The goal is to understand which assumptions matter most, which failure paths are plausible, and where the thesis becomes fragile.

## Scenario Types

### Base case
The operating path implied by the current thesis with no major adverse surprise. This is not an optimistic case. It is the working default.

### Downside case
A plausible adverse path in which one or more assumptions weaken but the business model remains recognizable.

### Stress case
A harsher path in which multiple assumptions are pressured at once or one critical assumption is disrupted severely enough to challenge the thesis structure.

## Scenario Construction Rules

1. Scenarios must be tied to explicit assumptions from the thesis.
2. Shocks should be expressed as variable changes, not vague narratives.
3. Separate macro shocks from company-specific shocks.
4. Use a small number of scenarios with clear causal logic instead of many low-quality permutations.
5. Preserve internal consistency. Do not pair contradictory assumptions unless the point is to test a specific conflict.

## Variable Categories

### Macro variables
- growth
- inflation
- policy rates
- credit conditions
- policy or trade restrictions

### Company variables
- customer demand timing
- pricing power
- gross margin direction
- concentration risk
- supply availability
- inventory or commitment risk

## How to Use the Output
The scenario tool should convert assumptions into a structured stress packet. The LLM should then answer:
- which assumptions fail first?
- which pressures are temporary versus structural?
- what combination of shocks would meaningfully alter the thesis?

Scenario outputs should help decision-making, not replace judgment.

## Decision Rules

### A scenario is useful when
- it tests a known vulnerability in the thesis
- it maps to variables that can be observed later
- it distinguishes timing risk from fundamental impairment

### A scenario is weak when
- it is only a dramatic story without measurable variables
- it duplicates another scenario without a distinct causal path
- it embeds the conclusion inside the assumptions

## Handling Mixed Results
Mixed results are common. For example:
- revenue may remain constructive while margin quality weakens
- demand may stay healthy while valuation sensitivity worsens
- policy may tighten while enterprise adoption broadens

When results are mixed:
1. state which channel is pressured
2. state whether the pressure is cyclical, policy-driven, or structural
3. identify which monitoring metrics would confirm or refute the scenario

## Output Standard
Every scenario review should produce:
- the assumptions used
- the variable shocks applied
- the main thesis assumptions affected
- the most important monitoring indicators
- whether the scenario changes confidence, timing, or thesis structure

## Escalation Guidance
Escalate when:
- a stress case shows failure of more than one core assumption
- the scenario reveals hidden dependence on one customer, one geography, or one policy regime
- scenario outcomes are highly sensitive to an input the team cannot currently observe well
- the scenario would require a human decision on whether to resize risk, not merely rewrite wording

Good stress testing sharpens the research process by making conditionality explicit.
