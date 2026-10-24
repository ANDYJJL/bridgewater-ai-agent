# Explain Indicator Signal

## Purpose

Explain one backend scorecard indicator using evidence-grounded LLM reasoning.

## Inputs

- `ticker`
- `indicator_name`
- `question` (optional)

## Data Sources Used

- `data/processed/indicator_scorecards.json`
- `data/indicators/indicator_config.json`
- `data/processed/stock_features.csv`
- `data/processed/news_evidence.json`
- `data/processed/filing_evidence.json`
- `data/processed/model_predictions.json`
- `data/processed/portfolio_stress_test.json`

## Output Fields

The skill returns the same response contract used by `/chat`:

- `ticker`
- `question`
- `answer`
- `grounded`
- `mode`
- `llm_used`
- `fallback_used`
- `class_llm_used`
- `sources_used`
- `limitations`
- `citations`
- `llm_error_type`
- `llm_error_message`
- `llm_model`
- `llm_base_url_configured`

## Safety Rules

- no trade approval
- no execution
- use only backend evidence
- mention weak evidence when the signal is keyword-based or mostly configuration-driven
- note when weights and thresholds are manually configured
