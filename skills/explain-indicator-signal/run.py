from __future__ import annotations

import csv
import json
import os
import re
from pathlib import Path
from typing import Any

from tools.llm_client import run_grounded_chat_completion

REPO_ROOT = Path(__file__).resolve().parents[2]
INDICATOR_SCORECARDS_PATH = REPO_ROOT / 'data' / 'processed' / 'indicator_scorecards.json'
INDICATOR_CONFIG_PATH = REPO_ROOT / 'data' / 'indicators' / 'indicator_config.json'
STOCK_FEATURES_PATH = REPO_ROOT / 'data' / 'processed' / 'stock_features.csv'
NEWS_EVIDENCE_PATH = REPO_ROOT / 'data' / 'processed' / 'news_evidence.json'
FILING_EVIDENCE_PATH = REPO_ROOT / 'data' / 'processed' / 'filing_evidence.json'
MODEL_PREDICTIONS_PATH = REPO_ROOT / 'data' / 'processed' / 'model_predictions.json'
PORTFOLIO_STRESS_TEST_PATH = REPO_ROOT / 'data' / 'processed' / 'portfolio_stress_test.json'
DEFAULT_LIMITATIONS = ['Drafting support only', 'Does not approve or execute trades']
FALLBACK_LIMITATION = 'LLM call failed; deterministic packet summary used.'
INDICATOR_EXPLANATION_MAX_TOKENS = 220
INDICATOR_EXPLANATION_TIMEOUT_SECONDS = 20.0

FEATURE_REF_LABELS = {
    'revenue_growth': 'revenue growth feature',
    'gross_margin': 'gross margin feature',
    '20d_return': '20-day return feature',
    '60d_volatility': '60-day volatility feature',
    'export_control_keyword_count': 'export control keyword count feature',
    'supply_chain_keyword_count': 'supply chain keyword count feature',
    'capex_keyword_count': 'capex keyword count feature',
}

LIMITATION_LABELS = {
    'insufficient_historical_training_rows_for_supervised_model': 'the backend did not have enough historical rows for a supervised model',
    'sklearn_not_available_in_project_environment': 'the project environment did not have sklearn available for the richer model path',
    'transparent_fallback_used_due_to_insufficient_training_rows': 'the backend used a Transparent fallback model because training data was insufficient',
    'missing_market_history': 'market-history coverage is incomplete',
    'missing_market_data_source': 'market data sourcing is incomplete',
    'coverage_incomplete': 'coverage is incomplete for this ticker',
    'experimental_price_forecast_low_validation_quality': 'experimental target-price validation quality is weak',
    'does_not_beat_baseline': 'the experimental forecast does not beat a simple baseline',
}

ACTION_LABELS = {
    'hold_review': 'Hold for review',
    'review': 'Review required',
    'hold': 'Hold',
    'reduce': 'Reduce',
    'accumulate': 'Accumulate',
    'avoid': 'Avoid',
}

INDICATOR_PROFILES = {
    'ai demand momentum': {
        'reason': 'recent market and model context still point to AI infrastructure demand staying important for the name',
        'matters': 'For this company, that matters because AI infrastructure demand influences backlog conversion, investor expectations, and the durability of compute spending.',
        'news_key': 'AI_demand',
    },
    'data center growth': {
        'reason': 'the packet links this signal to revenue-growth evidence and the AI buildout cycle',
        'matters': 'For this company, data center growth matters because cloud and AI workload demand are a core driver of revenue scaling.',
        'news_key': 'AI_demand',
        'filing_keys': ['revenue'],
    },
    'gross margin quality': {
        'reason': 'the packet ties the signal to gross-margin evidence and model context around profitability resilience',
        'matters': 'For this company, gross margin quality matters because it speaks to pricing power, mix quality, and how resilient profitability is if demand shifts.',
        'filing_keys': ['gross_profit', 'revenue'],
    },
    'export control risk': {
        'reason': 'the packet links this to export-control-related news evidence and model context that can affect addressable market access',
        'matters': 'For this company, export control risk matters because policy restrictions can reduce access to China or other international demand pools and shrink the practical addressable market.',
        'news_key': 'export_control',
    },
    'supply chain risk': {
        'reason': 'the packet links this to supply-chain-related evidence that can affect capacity, packaging, and delivery timing',
        'matters': 'For this company, supply chain risk matters because supply availability and timing can affect shipment conversion even when end demand is intact.',
        'news_key': 'supply_chain',
    },
    'valuation sensitivity': {
        'reason': 'the packet ties this signal to volatility and model context, which is consistent with high-expectation multiple risk',
        'matters': 'For this company, valuation sensitivity matters because high-expectation names can re-rate quickly when rates move or growth expectations wobble.',
    },
    'hyperscaler capex dependence': {
        'reason': 'the packet links this signal to capex-related evidence and model context around customer-spending durability',
        'matters': 'For this company, hyperscaler capex dependence matters because customer concentration and AI spending cycles can drive abrupt changes in demand durability.',
        'news_key': 'capex',
    },
}


def _read_json_payload(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def _read_csv_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        with path.open('r', encoding='utf-8', newline='') as handle:
            return list(csv.DictReader(handle))
    except Exception:
        return []


def _normalize(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', str(text).lower()).strip()


def _safe_float(value: Any) -> float | None:
    if value in (None, ''):
        return None
    try:
        return float(value)
    except Exception:
        return None


def _safe_json_value(value: Any) -> Any:
    numeric = _safe_float(value)
    if numeric is not None:
        return numeric
    return value


def _humanize_indicator_direction(direction: Any, score: Any) -> str:
    if direction:
        return str(direction)
    try:
        numeric = float(score)
    except Exception:
        return 'mixed'
    if numeric > 0:
        return 'positive'
    if numeric < 0:
        return 'negative'
    return 'mixed'


def _readable_ref(ref: str) -> str:
    if ref == 'news_evidence':
        return 'backend news evidence'
    if ref == 'filing_evidence':
        return 'SEC filing evidence'
    if ref.startswith('stock_features:'):
        key = ref.split(':', 1)[1]
        return FEATURE_REF_LABELS.get(key, f'{key.replace("_", " ")} feature')
    if ref.startswith('model_prediction:'):
        benchmark = ref.split(':', 1)[1]
        return f'model prediction versus {benchmark}'
    return ref.replace('_', ' ')


def _readable_limitation(value: str) -> str:
    return LIMITATION_LABELS.get(value, value.replace('_', ' '))


def _format_pct(value: Any) -> str | None:
    try:
        return f'{float(value) * 100:.1f}%'
    except Exception:
        return None


def _dedupe_citations(items: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    deduped: list[dict[str, str]] = []
    for item in items:
        path = item.get('path', '')
        if path in seen:
            continue
        seen.add(path)
        deduped.append(item)
    return deduped


def _dedupe_sources(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            output.append(item)
    return output


def _indicator_specific_missing_response(ticker: str, indicator_name: str | None, *, error_type: str | None, error_message: str | None) -> dict[str, Any]:
    requested = indicator_name or 'the requested indicator'
    source = f'indicator_scorecards.{ticker}'
    return {
        'answer': f'The backend could not find an indicator named {requested} for {ticker} in the current indicator scorecard. I can only explain indicators that exist in the current packet for that ticker.',
        'grounded': True,
        'mode': 'indicator_explanation',
        'llm_used': False,
        'fallback_used': True,
        'sources_used': [source],
        'limitations': list(DEFAULT_LIMITATIONS),
        'citations': [{'section': source, 'path': source}],
        'llm_error_type': error_type,
        'llm_error_message': error_message,
        'class_llm_used': False,
        'llm_model': os.getenv('LLM_MODEL', 'claude-sonnet-4-6'),
        'llm_base_url_configured': bool(os.getenv('LLM_BASE_URL')),
    }


def _question_targets_indicator(question: str) -> bool:
    normalized = _normalize(question)
    trigger_phrases = ['indicator', 'classified', 'explain why', 'why is', 'why was', 'explain']
    return any(phrase in normalized for phrase in trigger_phrases)


def _match_indicator(question: str, scorecard: dict[str, Any]) -> dict[str, Any] | None:
    normalized_question = _normalize(question)
    matches: list[tuple[int, dict[str, Any]]] = []
    for indicator in scorecard.get('indicators', []):
        name = str(indicator.get('name', ''))
        normalized_name = _normalize(name)
        if not normalized_name:
            continue
        score = 0
        if normalized_name in normalized_question:
            score += 100
        name_tokens = [token for token in normalized_name.split() if token]
        overlap = sum(1 for token in name_tokens if token in normalized_question)
        score += overlap
        if score >= 100 or overlap >= 2:
            matches.append((score, indicator))
    if not matches:
        return None
    matches.sort(key=lambda item: item[0], reverse=True)
    return matches[0][1]


def _find_indicator_by_name(indicators: list[dict[str, Any]], indicator_name: str | None, question: str) -> dict[str, Any] | None:
    if indicator_name:
        normalized_name = _normalize(indicator_name)
        for indicator in indicators:
            if _normalize(str(indicator.get('name', ''))) == normalized_name:
                return indicator
    return _match_indicator(question, {'indicators': indicators})


def _load_indicator_scorecard(packet: dict[str, Any], ticker: str, indicator_scorecards_path: Path) -> dict[str, Any]:
    artifact = _read_json_payload(indicator_scorecards_path)
    for item in (artifact.get('scorecards') or []):
        if item.get('ticker') == ticker:
            return item
    for item in (packet.get('indicator_scorecards', {}) or {}).get('scorecards', []):
        if item.get('ticker') == ticker:
            return item
    return {}


def _load_indicator_config(ticker: str, indicator_name: str, indicator_config_path: Path) -> dict[str, Any]:
    config_payload = _read_json_payload(indicator_config_path)
    for indicator in ((config_payload.get(ticker) or {}).get('indicators') or []):
        if _normalize(str(indicator.get('name', ''))) == _normalize(indicator_name):
            return indicator
    if isinstance(config_payload.get('indicators'), list):
        for indicator in config_payload['indicators']:
            if _normalize(str(indicator.get('name', ''))) == _normalize(indicator_name):
                return indicator
    return {}


def _load_stock_feature_row(ticker: str, stock_features_path: Path) -> dict[str, Any]:
    for row in _read_csv_rows(stock_features_path):
        if str(row.get('ticker', '')).upper() == ticker.upper():
            return row
    return {}


def _load_news_articles(packet: dict[str, Any], ticker: str, news_evidence_path: Path) -> list[dict[str, Any]]:
    artifact = _read_json_payload(news_evidence_path)
    articles = [item for item in (artifact.get('articles') or []) if item.get('ticker') == ticker]
    if articles:
        return articles
    packet_news = (packet.get('news_evidence') or {}).get(ticker) or []
    return packet_news if isinstance(packet_news, list) else []


def _load_filing_payload(packet: dict[str, Any], ticker: str, filing_evidence_path: Path) -> dict[str, Any]:
    artifact = _read_json_payload(filing_evidence_path)
    filing = ((artifact.get('tickers') or {}).get(ticker) or {})
    if filing:
        return filing
    return ((packet.get('filing_evidence') or {}).get(ticker) or {})


def _load_model_prediction(packet: dict[str, Any], ticker: str, model_predictions_path: Path) -> dict[str, Any]:
    artifact = _read_json_payload(model_predictions_path)
    prediction = ((artifact.get('predictions') or {}).get(ticker) or {})
    if prediction:
        return prediction
    return ((packet.get('model_predictions') or {}).get('predictions') or {}).get(ticker, {})


def _load_stress_payload(packet: dict[str, Any], portfolio_stress_test_path: Path) -> dict[str, Any]:
    artifact = _read_json_payload(portfolio_stress_test_path)
    if artifact:
        return artifact
    return packet.get('portfolio_stress_test') or {}


def _indicator_profile(name: str) -> dict[str, Any]:
    return INDICATOR_PROFILES.get(_normalize(name), {})


def _relevant_feature_values(feature_row: dict[str, Any], source_field: str | None) -> dict[str, Any]:
    keys = [source_field, '20d_return', '60d_volatility', 'revenue_growth', 'gross_margin', 'data_completeness_score']
    output: dict[str, Any] = {}
    for key in keys:
        if not key:
            continue
        value = feature_row.get(key)
        if value not in (None, ''):
            output[key] = _safe_json_value(value)
    return output


def _relevant_news_items(news_items: list[dict[str, Any]], indicator_name: str, source_field: str | None) -> list[dict[str, Any]]:
    profile = _indicator_profile(indicator_name)
    keyword_key = profile.get('news_key')
    matched: list[dict[str, Any]] = []
    for item in news_items:
        hits = item.get('keyword_hits') or {}
        if keyword_key and int(hits.get(keyword_key, 0) or 0) > 0:
            matched.append(item)
    if not matched and keyword_key is None and source_field and 'keyword_count' in source_field:
        matched = news_items[:2]
    if not matched:
        matched = news_items[:2]
    output: list[dict[str, Any]] = []
    for item in matched[:2]:
        output.append({
            'source_name': item.get('source_name'),
            'published_at': item.get('published_at'),
            'keyword_hits': item.get('keyword_hits') or {},
            'snippet': (
                '; '.join(str(chunk) for chunk in (item.get('evidence_chunks') or [])[:1]).strip()
                or str(item.get('clean_text') or '').strip()
            )[:160],
        })
    return output


def _relevant_filing_summary(filing: dict[str, Any], source_field: str | None) -> dict[str, Any]:
    metrics = filing.get('computed_metrics') or {}
    facts = filing.get('facts') or {}
    relevant_metric_keys = [source_field] if source_field in {'revenue_growth', 'gross_margin', 'operating_margin', 'debt_to_assets'} else []
    relevant_metrics = {key: metrics.get(key) for key in relevant_metric_keys if metrics.get(key) is not None}
    if not relevant_metrics:
        for key in ('revenue_growth', 'gross_margin', 'operating_margin', 'debt_to_assets'):
            if metrics.get(key) is not None:
                relevant_metrics[key] = metrics.get(key)
    fact_summary: dict[str, Any] = {}
    for key in ('revenue', 'gross_profit', 'operating_income', 'assets', 'liabilities', 'debt'):
        fact = facts.get(key) or {}
        if fact.get('value') is not None:
            fact_summary[key] = {
                'fact_name': fact.get('fact_name'),
                'value': fact.get('value'),
                'fiscal_year': fact.get('fiscal_year'),
                'form': fact.get('form'),
            }
    compact_facts: dict[str, Any] = {}
    for key, value in fact_summary.items():
        compact_facts[key] = value.get('value')
    compact_metrics = dict(list(relevant_metrics.items())[:4])
    return {
        'computed_metrics': compact_metrics,
        'facts': dict(list(compact_facts.items())[:4]),
        'data_limitations': (filing.get('data_limitations') or filing.get('limitations') or [])[:3],
    }


def _indicator_risk_related(indicator_name: str) -> bool:
    normalized = _normalize(indicator_name)
    return any(token in normalized for token in ['risk', 'sensitivity', 'dependence', 'exposure', 'inflation'])


def _relevant_stress_summary(stress_payload: dict[str, Any], ticker: str, indicator_name: str) -> dict[str, Any]:
    if not _indicator_risk_related(indicator_name):
        return {}
    normalized = _normalize(indicator_name)
    scenario_matches: list[dict[str, Any]] = []
    for scenario in stress_payload.get('scenarios') or []:
        scenario_id = str(scenario.get('scenario_id') or scenario.get('scenario_name') or '')
        impact = ((scenario.get('ticker_level_impacts') or {}).get(ticker) or {})
        if not impact:
            impact = ((scenario.get('ticker_level_impact_ranges') or {}).get(ticker) or {})
        if not impact:
            continue
        scenario_normalized = _normalize(scenario_id)
        if any(token in scenario_normalized for token in normalized.split()):
            scenario_matches.append({
                'scenario_id': scenario_id,
                'downside_range': impact.get('downside_range'),
                'main_driver': impact.get('main_driver'),
            })
    if not scenario_matches:
        for scenario in (stress_payload.get('scenarios') or [])[:2]:
            impact = ((scenario.get('ticker_level_impacts') or {}).get(ticker) or {})
            if not impact:
                impact = ((scenario.get('ticker_level_impact_ranges') or {}).get(ticker) or {})
            if impact:
                scenario_matches.append({
                    'scenario_id': scenario.get('scenario_id') or scenario.get('scenario_name'),
                    'downside_range': impact.get('downside_range'),
                    'main_driver': impact.get('main_driver'),
                })
    return {
        'matched_scenarios': [item.get('scenario_id') for item in scenario_matches[:2] if item.get('scenario_id')],
        'main_risk_drivers': (stress_payload.get('main_risk_drivers') or [])[:3],
    }


def _resolve_indicator_name(scorecard: dict[str, Any], indicator_name: str | None, question: str) -> tuple[str | None, dict[str, Any] | None]:
    indicator = _find_indicator_by_name(scorecard.get('indicators', []), indicator_name, question)
    if indicator is None:
        return None, None
    return str(indicator.get('name') or indicator_name or '').strip() or None, indicator


def build_indicator_explanation_context(
    packet: dict[str, Any],
    ticker: str,
    question: str,
    indicator_name: str | None,
    *,
    indicator_scorecards_path: Path = INDICATOR_SCORECARDS_PATH,
    indicator_config_path: Path = INDICATOR_CONFIG_PATH,
    stock_features_path: Path = STOCK_FEATURES_PATH,
    news_evidence_path: Path = NEWS_EVIDENCE_PATH,
    filing_evidence_path: Path = FILING_EVIDENCE_PATH,
    model_predictions_path: Path = MODEL_PREDICTIONS_PATH,
    portfolio_stress_test_path: Path = PORTFOLIO_STRESS_TEST_PATH,
) -> tuple[dict[str, Any] | None, list[str]]:
    scorecard = _load_indicator_scorecard(packet, ticker, indicator_scorecards_path)
    if not scorecard:
        return None, [f'indicator_scorecards.{ticker}']
    resolved_name, indicator = _resolve_indicator_name(scorecard, indicator_name, question)
    if indicator is None or not resolved_name:
        return None, [f'indicator_scorecards.{ticker}']

    config = _load_indicator_config(ticker, resolved_name, indicator_config_path)
    feature_row = _load_stock_feature_row(ticker, stock_features_path)
    news_items = _load_news_articles(packet, ticker, news_evidence_path)
    filing = _load_filing_payload(packet, ticker, filing_evidence_path)
    prediction = _load_model_prediction(packet, ticker, model_predictions_path)
    stress = _load_stress_payload(packet, portfolio_stress_test_path)

    source_field = str(config.get('source_field') or '') or None
    raw_value = feature_row.get(source_field) if source_field else None
    raw_value = _safe_json_value(raw_value)
    context = {
        'ticker': ticker,
        'question': question,
        'indicator_name': resolved_name,
        'selected_indicator': {
            'name': resolved_name,
            'score': indicator.get('score'),
            'direction': _humanize_indicator_direction(indicator.get('direction'), indicator.get('score')),
            'weight': indicator.get('weight'),
            'confidence': indicator.get('confidence'),
            'evidence_refs': indicator.get('evidence_refs') or [],
            'data_limitations': indicator.get('data_limitations') or [],
        },
        'scorecard_summary': {
            'aggregate_indicator_score': scorecard.get('aggregate_indicator_score'),
            'confidence_score': scorecard.get('confidence_score'),
            'recommendation_band': scorecard.get('recommendation_band'),
        },
        'indicator_config': {
            'name': resolved_name,
            'source_field': source_field,
            'weight': config.get('weight', indicator.get('weight')),
            'positive_threshold': config.get('positive_threshold'),
            'negative_threshold': config.get('negative_threshold'),
            'inverse': bool(config.get('inverse', False)),
        },
        'stock_feature_context': {
            'source_field': source_field,
            'raw_value': raw_value,
            'related_feature_values': _relevant_feature_values(feature_row, source_field),
        },
        'news_evidence_context': _relevant_news_items(news_items, resolved_name, source_field),
        'filing_evidence_context': _relevant_filing_summary(filing, source_field),
        'model_prediction_context': {
            'benchmark': prediction.get('benchmark'),
            'outperform_probability': prediction.get('outperform_probability'),
            'model_confidence': prediction.get('model_confidence'),
        },
        'portfolio_stress_context': _relevant_stress_summary(stress, ticker, resolved_name),
    }
    sources = [
        f'indicator_scorecards.{ticker}.indicators.{resolved_name}',
        f'indicator_config.{ticker}.{resolved_name}',
    ]
    if source_field:
        sources.append(f'stock_features.{ticker}.{source_field}')
    if news_items:
        sources.append(f'news_evidence.{ticker}')
    if filing:
        sources.append(f'filing_evidence.{ticker}')
    if prediction:
        sources.append(f'model_predictions.{ticker}')
    if context['portfolio_stress_context']:
        sources.append(f'portfolio_stress_test.{ticker}')
    sources.append(f'recommendations.{ticker}')
    return context, _dedupe_sources(sources)


def _compact_context(context: dict[str, Any], max_chars: int = 1400) -> str:
    selected = context.get('selected_indicator') or {}
    config = context.get('indicator_config') or {}
    stock = context.get('stock_feature_context') or {}
    compact = {
        'ticker': context.get('ticker'),
        'indicator_name': context.get('indicator_name'),
        'direction': selected.get('direction'),
        'score': selected.get('score'),
        'weight': selected.get('weight'),
        'confidence': selected.get('confidence'),
        'evidence_refs': selected.get('evidence_refs'),
        'source_field': config.get('source_field'),
        'raw_value': stock.get('raw_value'),
        'positive_threshold': config.get('positive_threshold'),
        'negative_threshold': config.get('negative_threshold'),
        'inverse': config.get('inverse'),
        'news': context.get('news_evidence_context'),
        'filing_metrics': (context.get('filing_evidence_context') or {}).get('computed_metrics'),
        'filing_facts': (context.get('filing_evidence_context') or {}).get('facts'),
        'model': context.get('model_prediction_context'),
        'stress': context.get('portfolio_stress_context'),
    }
    payload = json.dumps(compact, ensure_ascii=True, separators=(',', ':'))
    if len(payload) <= max_chars:
        return payload
    return payload[: max_chars - 3] + '...'


def build_indicator_explanation_prompt(context: dict[str, Any], sources: list[str]) -> tuple[str, str]:
    indicator_name = context.get('indicator_name') or 'selected indicator'
    system_prompt = (
        'You are a grounded investment research drafting assistant. '
        'Use only the provided backend packet context. '
        'Focus only on the selected indicator. '
        'Do not invent missing evidence. '
        'Do not invent target prices. '
        'Do not change the official recommendation. '
        'Do not approve or execute trades. '
        'If evidence is weak, keyword-based, manual, or mostly configuration-driven, say so clearly. '
        'Return under 120 words total. Use one short paragraph, 2 bullet lines, and one final analyst-use sentence.'
    )
    user_prompt = (
        'Mode: indicator_explanation\n'
        f"Ticker: {context.get('ticker')}\n"
        f"Selected indicator: {indicator_name}\n"
        f"User question: {context.get('question')}\n"
        'Explain only this selected indicator.\n'
        'Output format: short paragraph, two bullet lines, one final analyst-use sentence.\n'
        'Keep it specific, grounded, and brief.\n'
        f"Context: {_compact_context(context)}"
    )
    return system_prompt, user_prompt


def _indicator_specific_limitations(context: dict[str, Any]) -> list[str]:
    limitations = list(DEFAULT_LIMITATIONS)
    config = context.get('indicator_config') or {}
    source_field = config.get('source_field')
    if source_field and 'keyword_count' in str(source_field):
        limitations.append('Indicator evidence includes keyword-based news counts.')
    limitations.append('Indicator weights and thresholds are manually configured in the backend.')
    scorecard_limits = (context.get('scorecard_summary') or {}).get('data_limitations') or []
    if scorecard_limits:
        limitations.append('Scorecard-level backend limitations are included in the supporting context.')
    return _dedupe_sources(limitations)


def deterministic_indicator_explanation(
    packet: dict[str, Any],
    ticker: str,
    question: str,
    indicator_name: str | None,
    *,
    error_type: str | None = None,
    error_message: str | None = None,
    class_llm_used: bool = False,
    llm_model: str | None = None,
    llm_base_url_configured: bool | None = None,
    indicator_scorecards_path: Path = INDICATOR_SCORECARDS_PATH,
    indicator_config_path: Path = INDICATOR_CONFIG_PATH,
    stock_features_path: Path = STOCK_FEATURES_PATH,
    news_evidence_path: Path = NEWS_EVIDENCE_PATH,
    filing_evidence_path: Path = FILING_EVIDENCE_PATH,
    model_predictions_path: Path = MODEL_PREDICTIONS_PATH,
    portfolio_stress_test_path: Path = PORTFOLIO_STRESS_TEST_PATH,
) -> dict[str, Any]:
    context, sources = build_indicator_explanation_context(
        packet=packet,
        ticker=ticker,
        question=question,
        indicator_name=indicator_name,
        indicator_scorecards_path=indicator_scorecards_path,
        indicator_config_path=indicator_config_path,
        stock_features_path=stock_features_path,
        news_evidence_path=news_evidence_path,
        filing_evidence_path=filing_evidence_path,
        model_predictions_path=model_predictions_path,
        portfolio_stress_test_path=portfolio_stress_test_path,
    )
    if context is None:
        return _indicator_specific_missing_response(ticker, indicator_name, error_type=error_type, error_message=error_message)

    selected = context['selected_indicator']
    config = context['indicator_config']
    feature_context = context['stock_feature_context']
    model_context = context['model_prediction_context']
    filing_context = context['filing_evidence_context']
    stress_context = context['portfolio_stress_context']
    indicator_name = context['indicator_name']
    direction = selected.get('direction') or 'mixed'
    weight = selected.get('weight')
    confidence = selected.get('confidence')
    source_field = config.get('source_field') or 'unknown_source_field'
    raw_value = feature_context.get('raw_value')
    refs = selected.get('evidence_refs') or []
    lines = [
        f"{indicator_name} is currently classified as {direction} for {ticker}.",
        f"In plain language, this indicator tracks the backend signal tied to {source_field.replace('_', ' ')}.",
        f"The backend assigns this indicator a score of {selected.get('score')}, weight of {weight}, and confidence of {confidence}.",
        f"The configured source field is {source_field} with raw value {raw_value}, positive threshold {config.get('positive_threshold')}, negative threshold {config.get('negative_threshold')}, and inverse flag {config.get('inverse')}.",
    ]
    if refs:
        lines.append('Supporting evidence references include ' + ', '.join(_readable_ref(ref) for ref in refs) + '.')
    news_context = context.get('news_evidence_context') or []
    if news_context:
        first = news_context[0]
        snippet = first.get('snippet')
        if snippet:
            lines.append(f'Relevant backend news context includes {first.get("source_name")}: "{str(snippet)[:180]}".')
    filing_metrics = filing_context.get('computed_metrics') or {}
    if filing_metrics:
        lines.append('Relevant filing-derived metrics include ' + ', '.join(f'{key}={value}' for key, value in filing_metrics.items()) + '.')
    if model_context.get('benchmark'):
        lines.append(f"Model prediction context versus {model_context.get('benchmark')} is {_format_pct(model_context.get('outperform_probability'))} outperform probability with {_format_pct(model_context.get('model_confidence'))} model confidence.")
    if stress_context.get('matched_scenarios'):
        names = [str(item) for item in stress_context.get('matched_scenarios', []) if item]
        if names:
            lines.append('Relevant stress scenarios include ' + ', '.join(names) + '.')
    indicator_limits = selected.get('data_limitations') or []
    scorecard_limits = (context.get('scorecard_summary') or {}).get('data_limitations') or []
    all_limits = [_readable_limitation(item) for item in indicator_limits + scorecard_limits]
    if all_limits:
        lines.append('Limitations include ' + ', '.join(all_limits[:4]) + '.')
    lines.append('Analyst use: treat this as one weighted backend input, not as standalone proof of an investment action or trade decision.')
    limitations = _indicator_specific_limitations(context)
    if error_type:
        limitations.append(FALLBACK_LIMITATION)
    return {
        'answer': ' '.join(lines),
        'grounded': True,
        'mode': 'indicator_explanation',
        'llm_used': False,
        'fallback_used': True,
        'sources_used': sources,
        'limitations': _dedupe_sources(limitations),
        'citations': _dedupe_citations([{'section': source, 'path': source} for source in sources]),
        'llm_error_type': error_type,
        'llm_error_message': error_message,
        'class_llm_used': class_llm_used,
        'llm_model': llm_model or os.getenv('LLM_MODEL', 'claude-sonnet-4-6'),
        'llm_base_url_configured': bool(llm_base_url_configured),
    }


def run_indicator_explanation(
    packet: dict[str, Any],
    ticker: str,
    indicator_name: str | None,
    question: str,
    *,
    indicator_scorecards_path: Path = INDICATOR_SCORECARDS_PATH,
    indicator_config_path: Path = INDICATOR_CONFIG_PATH,
    stock_features_path: Path = STOCK_FEATURES_PATH,
    news_evidence_path: Path = NEWS_EVIDENCE_PATH,
    filing_evidence_path: Path = FILING_EVIDENCE_PATH,
    model_predictions_path: Path = MODEL_PREDICTIONS_PATH,
    portfolio_stress_test_path: Path = PORTFOLIO_STRESS_TEST_PATH,
) -> dict[str, Any]:
    context, sources = build_indicator_explanation_context(
        packet=packet,
        ticker=ticker,
        question=question,
        indicator_name=indicator_name,
        indicator_scorecards_path=indicator_scorecards_path,
        indicator_config_path=indicator_config_path,
        stock_features_path=stock_features_path,
        news_evidence_path=news_evidence_path,
        filing_evidence_path=filing_evidence_path,
        model_predictions_path=model_predictions_path,
        portfolio_stress_test_path=portfolio_stress_test_path,
    )
    if context is None:
        return _indicator_specific_missing_response(
            ticker,
            indicator_name,
            error_type='api_error',
            error_message='Indicator context could not be built from the current backend artifacts.',
        )
    system_prompt, user_prompt = build_indicator_explanation_prompt(context, sources)
    llm_result = run_grounded_chat_completion(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=INDICATOR_EXPLANATION_TIMEOUT_SECONDS,
        max_tokens=INDICATOR_EXPLANATION_MAX_TOKENS,
    )
    if llm_result.get('llm_used'):
        return {
            'answer': llm_result['answer'],
            'grounded': True,
            'mode': 'indicator_explanation',
            'llm_used': True,
            'fallback_used': False,
            'sources_used': sources,
            'limitations': _indicator_specific_limitations(context),
            'citations': _dedupe_citations([{'section': source, 'path': source} for source in sources]),
            'class_llm_used': llm_result.get('class_llm_used'),
            'llm_error_type': llm_result.get('llm_error_type'),
            'llm_error_message': llm_result.get('llm_error_message'),
            'llm_model': llm_result.get('llm_model'),
            'llm_base_url_configured': llm_result.get('llm_base_url_configured'),
        }
    return deterministic_indicator_explanation(
        packet=packet,
        ticker=ticker,
        question=question,
        indicator_name=indicator_name,
        error_type=llm_result.get('llm_error_type'),
        error_message=llm_result.get('llm_error_message'),
        class_llm_used=bool(llm_result.get('class_llm_used')),
        llm_model=llm_result.get('llm_model'),
        llm_base_url_configured=llm_result.get('llm_base_url_configured'),
        indicator_scorecards_path=indicator_scorecards_path,
        indicator_config_path=indicator_config_path,
        stock_features_path=stock_features_path,
        news_evidence_path=news_evidence_path,
        filing_evidence_path=filing_evidence_path,
        model_predictions_path=model_predictions_path,
        portfolio_stress_test_path=portfolio_stress_test_path,
    )
