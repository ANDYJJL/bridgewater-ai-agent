from __future__ import annotations

import csv
import importlib.util
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.schemas import ChatRequest, RecommendationRunRequest
from scripts.collect_real_raw_data import collect_real_raw_data
from tools.build_dcf_model import build_dcf_valuations
from tools.build_entry_price_model import build_entry_price_models
from tools.build_stock_features import build_stock_features
from tools.build_three_statement_model import build_three_statement_models
from tools.generate_recommendation_packet import generate_recommendation_packet, normalize_raw_data_sources_for_packet, raw_data_missing_warnings
from tools.llm_client import run_grounded_chat_completion, sanitize_llm_error_message
from tools.predict_outperformance import predict_outperformance
from tools.prepare_filing_evidence import prepare_filing_evidence
from tools.prepare_news_evidence import prepare_news_evidence
from tools.run_portfolio_stress_test import run_portfolio_stress_test
from tools.score_stock_indicators import score_stock_indicators

REPO_ROOT = Path(__file__).resolve().parents[1]
PACKET_PATH = REPO_ROOT / 'artifacts' / 'milestone04_demo' / 'recommendation_packet.json'
INDICATOR_SCORECARDS_PATH = REPO_ROOT / 'data' / 'processed' / 'indicator_scorecards.json'
INDICATOR_CONFIG_PATH = REPO_ROOT / 'data' / 'indicators' / 'indicator_config.json'
STOCK_FEATURES_PATH = REPO_ROOT / 'data' / 'processed' / 'stock_features.csv'
NEWS_EVIDENCE_PATH = REPO_ROOT / 'data' / 'processed' / 'news_evidence.json'
FILING_EVIDENCE_PATH = REPO_ROOT / 'data' / 'processed' / 'filing_evidence.json'
MODEL_PREDICTIONS_PATH = REPO_ROOT / 'data' / 'processed' / 'model_predictions.json'
PORTFOLIO_STRESS_TEST_PATH = REPO_ROOT / 'data' / 'processed' / 'portfolio_stress_test.json'

INDICATOR_EXPLANATION_SKILL_PATH = REPO_ROOT / 'skills' / 'explain-indicator-signal' / 'run.py'
_INDICATOR_EXPLANATION_SKILL = None
SYNTHESIS_MEMO_SKILL_PATH = REPO_ROOT / 'skills' / 'draft-synthesis-memo' / 'run.py'
_SYNTHESIS_MEMO_SKILL = None
RISK_SCENARIO_ANALYSIS_SKILL_PATH = REPO_ROOT / 'skills' / 'run-risk-scenario-analysis' / 'run.py'
_RISK_SCENARIO_ANALYSIS_SKILL = None
PM_DECISION_DEBATE_SKILL_PATH = REPO_ROOT / 'skills' / 'run-pm-decision-debate' / 'run.py'
_PM_DECISION_DEBATE_SKILL = None


def _load_indicator_explanation_skill():
    global _INDICATOR_EXPLANATION_SKILL
    if _INDICATOR_EXPLANATION_SKILL is not None:
        return _INDICATOR_EXPLANATION_SKILL
    spec = importlib.util.spec_from_file_location('backend_indicator_explanation_skill', INDICATOR_EXPLANATION_SKILL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load indicator explanation skill from {INDICATOR_EXPLANATION_SKILL_PATH}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _INDICATOR_EXPLANATION_SKILL = module
    return module


def _load_synthesis_memo_skill():
    global _SYNTHESIS_MEMO_SKILL
    if _SYNTHESIS_MEMO_SKILL is not None:
        return _SYNTHESIS_MEMO_SKILL
    spec = importlib.util.spec_from_file_location('backend_synthesis_memo_skill', SYNTHESIS_MEMO_SKILL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load synthesis memo skill from {SYNTHESIS_MEMO_SKILL_PATH}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _SYNTHESIS_MEMO_SKILL = module
    return module


def _load_risk_scenario_analysis_skill():
    global _RISK_SCENARIO_ANALYSIS_SKILL
    if _RISK_SCENARIO_ANALYSIS_SKILL is not None:
        return _RISK_SCENARIO_ANALYSIS_SKILL
    spec = importlib.util.spec_from_file_location('backend_risk_scenario_analysis_skill', RISK_SCENARIO_ANALYSIS_SKILL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load risk scenario analysis skill from {RISK_SCENARIO_ANALYSIS_SKILL_PATH}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _RISK_SCENARIO_ANALYSIS_SKILL = module
    return module


def _load_pm_decision_debate_skill():
    global _PM_DECISION_DEBATE_SKILL
    if _PM_DECISION_DEBATE_SKILL is not None:
        return _PM_DECISION_DEBATE_SKILL
    spec = importlib.util.spec_from_file_location('backend_pm_decision_debate_skill', PM_DECISION_DEBATE_SKILL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load PM decision debate skill from {PM_DECISION_DEBATE_SKILL_PATH}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _PM_DECISION_DEBATE_SKILL = module
    return module

SUPPORTED_TICKERS = {'NVDA', 'KO'}
SERVICE_NAME = 'bridgewater-ai-agent-backend'
DEFAULT_PACKET_TTL_HOURS = 6.0

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

DEFAULT_LIMITATIONS = ['Drafting support only', 'Does not approve or execute trades']
FALLBACK_LIMITATION = 'LLM call failed; deterministic packet summary used.'

app = FastAPI(title=SERVICE_NAME)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def _read_json_file(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(payload, dict):
        raise ValueError('Recommendation packet is not a JSON object.')
    return payload


def _recommendation_packet_ttl_hours() -> float:
    raw_value = os.environ.get('RECOMMENDATION_PACKET_TTL_HOURS', str(DEFAULT_PACKET_TTL_HOURS))
    try:
        ttl_hours = float(raw_value)
    except (TypeError, ValueError):
        return DEFAULT_PACKET_TTL_HOURS
    if ttl_hours < 0:
        return DEFAULT_PACKET_TTL_HOURS
    return ttl_hours


def _normalize_refresh_mode(refresh: str | None) -> str:
    value = str(refresh or '').strip().lower()
    if value == 'auto':
        return 'auto'
    if value in {'1', 'true', 'yes', 'force'}:
        return 'force'
    return 'none'


def _parse_packet_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith('Z'):
        text = f'{text[:-1]}+00:00'
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _packet_age_hours(packet: dict[str, Any] | None, packet_path: Path | None = None) -> float | None:
    generated_at = _parse_packet_datetime((packet or {}).get('generated_at'))
    if generated_at is None:
        try:
            generated_at = datetime.fromtimestamp((packet_path or PACKET_PATH).stat().st_mtime, tz=timezone.utc)
        except OSError:
            return None
    age_hours = (datetime.now(timezone.utc) - generated_at).total_seconds() / 3600
    return max(0.0, age_hours)


def _packet_is_stale(age_hours: float | None, ttl_hours: float) -> bool:
    return age_hours is None or age_hours > ttl_hours


def _with_raw_data_summary(packet: dict[str, Any]) -> dict[str, Any]:
    collection_summary_path = REPO_ROOT / 'data' / 'raw' / 'collection_summary.json'
    if not collection_summary_path.exists():
        return packet
    try:
        raw_data_sources = normalize_raw_data_sources_for_packet(_read_json_file(collection_summary_path))
    except Exception:
        raw_data_sources = None
    if not raw_data_sources:
        return packet
    output = dict(packet)
    output['raw_data_sources'] = raw_data_sources
    output['missing_data_warnings'] = raw_data_missing_warnings(raw_data_sources)
    return output


def _with_packet_refresh_metadata(
    packet: dict[str, Any],
    *,
    status: str,
    message: str,
    age_hours: float | None,
) -> dict[str, Any]:
    output = dict(packet)
    output['packet_refresh_status'] = status
    output['packet_refresh_message'] = message
    output['packet_age_hours'] = round(age_hours, 4) if age_hours is not None else None
    if status in {'stale_fallback', 'error'}:
        output['packet_refresh_warning'] = True
    return output


def _news_counts(packet: dict[str, Any] | None) -> dict[str, int]:
    news = (packet or {}).get('news_evidence') or {}
    return {ticker: len(news.get(ticker) or []) for ticker in SUPPORTED_TICKERS}


def _packet_refresh_regressions(existing_packet: dict[str, Any] | None, refreshed_packet: dict[str, Any]) -> list[str]:
    if existing_packet is None:
        return []
    regressions: list[str] = []
    existing_news_counts = _news_counts(existing_packet)
    refreshed_news_counts = _news_counts(refreshed_packet)
    for ticker in SUPPORTED_TICKERS:
        if existing_news_counts.get(ticker, 0) > 0 and refreshed_news_counts.get(ticker, 0) == 0:
            regressions.append(f'news_evidence:{ticker}:refreshed_empty')

    existing_fred = ((existing_packet.get('raw_data_sources') or {}).get('fred') or {})
    refreshed_fred = ((refreshed_packet.get('raw_data_sources') or {}).get('fred') or {})
    if existing_fred.get('status') == 'success' and refreshed_fred.get('status') != 'success':
        regressions.append('fred:refreshed_unavailable')
    return regressions


def _restore_stored_packet(packet: dict[str, Any]) -> None:
    PACKET_PATH.parent.mkdir(parents=True, exist_ok=True)
    PACKET_PATH.write_text(json.dumps(packet, indent=2), encoding='utf-8')


def _load_latest_packet() -> dict[str, Any] | None:
    if not PACKET_PATH.exists():
        return None
    try:
        packet = _read_json_file(PACKET_PATH)
    except Exception:
        return None
    return _with_raw_data_summary(packet)


def _refresh_latest_packet_response(packet: dict[str, Any] | None, refresh_mode: str) -> JSONResponse:
    ttl_hours = _recommendation_packet_ttl_hours()
    age_hours = _packet_age_hours(packet)
    should_refresh = refresh_mode == 'force' or (refresh_mode == 'auto' and (packet is None or _packet_is_stale(age_hours, ttl_hours)))

    if should_refresh:
        try:
            refreshed_packet = _with_raw_data_summary(_run_pipeline())
        except Exception:
            if packet is None:
                return JSONResponse(
                    status_code=500,
                    content={
                        'error': 'packet_refresh_failed',
                        'message': 'Recommendation packet refresh failed and no stored packet is available.',
                        'packet_refresh_status': 'error',
                        'packet_refresh_message': 'Refresh failed; no stored packet is available.',
                        'packet_age_hours': None,
                        'packet_refresh_warning': True,
                    },
                )
            return JSONResponse(
                content=_with_packet_refresh_metadata(
                    packet,
                    status='stale_fallback',
                    message='Refresh failed; returning the existing stored packet.',
                    age_hours=age_hours,
                )
            )
        regressions = _packet_refresh_regressions(packet, refreshed_packet)
        if regressions:
            fallback_packet = packet or refreshed_packet
            if packet is not None:
                try:
                    _restore_stored_packet(packet)
                except Exception:
                    pass
            return JSONResponse(
                content=_with_packet_refresh_metadata(
                    fallback_packet,
                    status='stale_fallback',
                    message='Refresh produced weaker evidence; returning the existing stored packet.',
                    age_hours=age_hours,
                ) | {'packet_refresh_regressions': regressions}
            )
        refreshed_age_hours = _packet_age_hours(refreshed_packet)
        return JSONResponse(
            content=_with_packet_refresh_metadata(
                refreshed_packet,
                status='regenerated',
                message='Recommendation packet regenerated.',
                age_hours=refreshed_age_hours,
            )
        )

    if packet is None:
        return JSONResponse(
            status_code=404,
            content={'error': 'packet_not_found', 'message': f'Missing file: {PACKET_PATH}'},
        )

    if _packet_is_stale(age_hours, ttl_hours):
        return JSONResponse(
            content=_with_packet_refresh_metadata(
                packet,
                status='stale_fallback',
                message='Stored packet may be stale; refresh was not requested.',
                age_hours=age_hours,
            )
        )

    return JSONResponse(
        content=_with_packet_refresh_metadata(
            packet,
            status='fresh',
            message='Stored packet is fresh; no refresh needed.',
            age_hours=age_hours,
        )
    )


def _unsupported_ticker_response() -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={'error': 'unsupported_ticker', 'message': 'Current backend demo supports NVDA and KO.'},
    )


def _run_pipeline() -> dict[str, Any]:
    collect_real_raw_data()
    prepare_news_evidence()
    prepare_filing_evidence()
    build_stock_features()
    predict_outperformance()
    score_stock_indicators()
    run_portfolio_stress_test()
    build_three_statement_models()
    build_dcf_valuations()
    build_entry_price_models(enable_simulated_shares_fallback=True)
    return generate_recommendation_packet()


def _summarize_news(news_items: list[dict[str, Any]]) -> str:
    if not news_items:
        return 'No processed news evidence is available in the current packet.'
    keyword_totals: dict[str, int] = {}
    for item in news_items:
        for key, value in (item.get('keyword_hits') or {}).items():
            keyword_totals[key] = keyword_totals.get(key, 0) + int(value or 0)
    active = [f'{key}={value}' for key, value in sorted(keyword_totals.items()) if value > 0]
    if not active:
        return f'{len(news_items)} backend news articles are available, but current keyword hits are all zero.'
    return f'{len(news_items)} backend news articles are available; active keyword hits include ' + ', '.join(active[:5]) + '.'


def _normalize(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()


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


def _readable_action(action: Any) -> str:
    if action is None:
        return 'No action label available'
    return ACTION_LABELS.get(str(action), str(action).replace('_', ' ').title())


def _format_pct(value: Any) -> str | None:
    try:
        return f'{float(value) * 100:.1f}%'
    except Exception:
        return None


def _find_scorecard(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    for item in (packet.get('indicator_scorecards', {}) or {}).get('scorecards', []):
        if item.get('ticker') == ticker:
            return item
    return {}


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


def _find_indicator_by_name(indicators: list[dict[str, Any]], indicator_name: str | None, question: str) -> dict[str, Any] | None:
    if indicator_name:
        normalized_name = _normalize(indicator_name)
        for indicator in indicators:
            if _normalize(str(indicator.get('name', ''))) == normalized_name:
                return indicator
    return _match_indicator(question, {'indicators': indicators})


def _load_indicator_scorecard(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    artifact = _read_json_payload(INDICATOR_SCORECARDS_PATH)
    for item in (artifact.get('scorecards') or []):
        if item.get('ticker') == ticker:
            return item
    return _find_scorecard(packet, ticker)


def _load_indicator_config(ticker: str, indicator_name: str) -> dict[str, Any]:
    config_payload = _read_json_payload(INDICATOR_CONFIG_PATH)
    for indicator in ((config_payload.get(ticker) or {}).get('indicators') or []):
        if _normalize(str(indicator.get('name', ''))) == _normalize(indicator_name):
            return indicator
    return {}


def _load_stock_feature_row(ticker: str) -> dict[str, Any]:
    for row in _read_csv_rows(STOCK_FEATURES_PATH):
        if str(row.get('ticker', '')).upper() == ticker.upper():
            return row
    return {}


def _load_news_articles(packet: dict[str, Any], ticker: str) -> list[dict[str, Any]]:
    artifact = _read_json_payload(NEWS_EVIDENCE_PATH)
    articles = [item for item in (artifact.get('articles') or []) if item.get('ticker') == ticker]
    if articles:
        return articles
    packet_news = (packet.get('news_evidence') or {}).get(ticker) or []
    return packet_news if isinstance(packet_news, list) else []


def _load_filing_payload(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    artifact = _read_json_payload(FILING_EVIDENCE_PATH)
    filing = ((artifact.get('tickers') or {}).get(ticker) or {})
    if filing:
        return filing
    return ((packet.get('filing_evidence') or {}).get(ticker) or {})


def _load_model_prediction(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    artifact = _read_json_payload(MODEL_PREDICTIONS_PATH)
    prediction = ((artifact.get('predictions') or {}).get(ticker) or {})
    if prediction:
        return prediction
    return ((packet.get('model_predictions') or {}).get('predictions') or {}).get(ticker, {})


def _load_stress_payload(packet: dict[str, Any]) -> dict[str, Any]:
    artifact = _read_json_payload(PORTFOLIO_STRESS_TEST_PATH)
    if artifact:
        return artifact
    return packet.get('portfolio_stress_test') or {}


def _indicator_profile(name: str) -> dict[str, Any]:
    return INDICATOR_PROFILES.get(_normalize(name), {})


def _relevant_feature_values(feature_row: dict[str, Any], source_field: str | None) -> dict[str, Any]:
    keys = [
        source_field,
        '20d_return',
        '60d_return',
        '20d_volatility',
        '60d_volatility',
        'relative_return_vs_benchmark_60d',
        'revenue_growth',
        'gross_margin',
        'operating_margin',
        'debt_to_assets',
        'macro_unrate_latest',
        'export_control_keyword_count',
        'supply_chain_keyword_count',
        'capex_keyword_count',
        'inflation_keyword_count',
        'data_completeness_score',
    ]
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
    for item in matched[:3]:
        output.append({
            'source_name': item.get('source_name'),
            'published_at': item.get('published_at'),
            'keyword_hits': item.get('keyword_hits') or {},
            'evidence_chunks': (item.get('evidence_chunks') or [])[:2],
            'clean_text': (item.get('clean_text') or '')[:240],
            'url': item.get('url'),
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
    return {
        'computed_metrics': relevant_metrics,
        'fact_summary': fact_summary,
        'data_limitations': filing.get('data_limitations') or filing.get('limitations') or [],
        'latest_10k': filing.get('latest_10k') or {},
        'latest_10q': filing.get('latest_10q') or {},
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
        scenario_id = str(scenario.get('scenario_id') or '')
        impact = ((scenario.get('ticker_level_impacts') or {}).get(ticker) or {})
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
            if impact:
                scenario_matches.append({
                    'scenario_id': scenario.get('scenario_id'),
                    'downside_range': impact.get('downside_range'),
                    'main_driver': impact.get('main_driver'),
                })
    return {
        'matched_scenarios': scenario_matches[:3],
        'main_risk_drivers': (stress_payload.get('main_risk_drivers') or [])[:5],
    }


def _resolve_indicator_name(scorecard: dict[str, Any], indicator_name: str | None, question: str) -> tuple[str | None, dict[str, Any] | None]:
    indicator = _find_indicator_by_name(scorecard.get('indicators', []), indicator_name, question)
    if indicator is None:
        return None, None
    return str(indicator.get('name') or indicator_name or '').strip() or None, indicator


def build_indicator_explanation_context(packet: dict[str, Any], ticker: str, question: str, indicator_name: str | None) -> tuple[dict[str, Any] | None, list[str]]:
    skill = _load_indicator_explanation_skill()
    return skill.build_indicator_explanation_context(
        packet=packet,
        ticker=ticker,
        question=question,
        indicator_name=indicator_name,
        indicator_scorecards_path=INDICATOR_SCORECARDS_PATH,
        indicator_config_path=INDICATOR_CONFIG_PATH,
        stock_features_path=STOCK_FEATURES_PATH,
        news_evidence_path=NEWS_EVIDENCE_PATH,
        filing_evidence_path=FILING_EVIDENCE_PATH,
        model_predictions_path=MODEL_PREDICTIONS_PATH,
        portfolio_stress_test_path=PORTFOLIO_STRESS_TEST_PATH,
    )


def build_indicator_explanation_prompt(context: dict[str, Any], sources: list[str]) -> tuple[str, str]:
    return _load_indicator_explanation_skill().build_indicator_explanation_prompt(context, sources)


def _indicator_specific_limitations(context: dict[str, Any]) -> list[str]:
    return _load_indicator_explanation_skill()._indicator_specific_limitations(context)


def deterministic_indicator_explanation(packet: dict[str, Any], ticker: str, question: str, indicator_name: str | None) -> dict[str, Any]:
    skill = _load_indicator_explanation_skill()
    return skill.deterministic_indicator_explanation(
        packet=packet,
        ticker=ticker,
        question=question,
        indicator_name=indicator_name,
        indicator_scorecards_path=INDICATOR_SCORECARDS_PATH,
        indicator_config_path=INDICATOR_CONFIG_PATH,
        stock_features_path=STOCK_FEATURES_PATH,
        news_evidence_path=NEWS_EVIDENCE_PATH,
        filing_evidence_path=FILING_EVIDENCE_PATH,
        model_predictions_path=MODEL_PREDICTIONS_PATH,
        portfolio_stress_test_path=PORTFOLIO_STRESS_TEST_PATH,
    )


def _deterministic_packet_qna(packet: dict[str, Any], ticker: str) -> tuple[str, list[str], list[dict[str, str]]]:
    recommendation = (packet.get('recommendations') or {}).get(ticker, {})
    filing = ((packet.get('filing_evidence') or {}).get(ticker) or {})
    news_items = ((packet.get('news_evidence') or {}).get(ticker) or [])
    stress = packet.get('portfolio_stress_test') or {}
    parts = []
    action = recommendation.get('action')
    confidence = recommendation.get('confidence_score')
    if action is not None:
        parts.append(f'For {ticker}, the current legacy backend status is {_readable_action(action)} with evidence confidence {confidence}.')
    reason = recommendation.get('blocked_strong_action_reason') or recommendation.get('data_limitation_reason')
    if reason:
        parts.append(f'Stronger action is currently blocked by: {_readable_limitation(reason)}.')
    parts.append(_summarize_news(news_items))
    filing_limitations = filing.get('limitations') or []
    if filing_limitations:
        parts.append('Filing evidence limitations include ' + ', '.join(_readable_limitation(item) for item in filing_limitations[:3]) + '.')
    elif filing.get('facts'):
        parts.append('Filing evidence is present in the packet, including annual fact fields and latest 10-K/10-Q metadata.')
    main_risks = stress.get('main_risk_drivers') or []
    if main_risks:
        parts.append('Portfolio stress testing highlights these main risk drivers: ' + ', '.join(main_risks[:4]) + '.')
    if (packet.get('human_review') or {}).get('pm_approval_required'):
        parts.append('Human PM review is still required before any action.')
    return (
        ' '.join(parts),
        [
            f'recommendations.{ticker}',
            f'news_evidence.{ticker}',
            f'filing_evidence.{ticker}',
            'indicator_scorecards.scorecards',
            'portfolio_stress_test',
            'human_review',
        ],
        _dedupe_citations([
            {'section': f'recommendations.{ticker}', 'path': f'recommendations.{ticker}'},
            {'section': f'news_evidence.{ticker}', 'path': f'news_evidence.{ticker}'},
            {'section': f'filing_evidence.{ticker}', 'path': f'filing_evidence.{ticker}'},
            {'section': 'indicator_scorecards', 'path': 'indicator_scorecards.scorecards'},
            {'section': 'portfolio_stress_test', 'path': 'portfolio_stress_test'},
            {'section': 'human_review', 'path': 'human_review'},
        ]),
    )


def _deterministic_junior_memo(packet: dict[str, Any], ticker: str) -> tuple[str, list[str], list[dict[str, str]]]:
    recommendation = (packet.get('recommendations') or {}).get(ticker, {})
    thesis = (packet.get('company_theses') or {}).get(ticker, {})
    scorecard = _find_scorecard(packet, ticker)
    dcf = ((packet.get('dcf_valuations') or {}).get('valuations') or {}).get(ticker, {})
    entry = ((packet.get('entry_price_models') or {}).get('entry_prices') or {}).get(ticker, {})
    rag = packet.get('rag_evidence') or {}
    pm_required = bool((packet.get('human_review') or {}).get('pm_approval_required'))
    parts = []
    core = thesis.get('core_thesis')
    if core:
        parts.append(f'Junior memo draft for {ticker}: the standing thesis is {core}')
    action = _readable_action(recommendation.get('action'))
    conf = recommendation.get('confidence_score')
    parts.append(f'The current legacy backend status is {action} with evidence confidence {conf}.')
    if scorecard:
        parts.append(f'Indicator scorecard shows aggregate indicator score {scorecard.get("aggregate_indicator_score")} and confidence {scorecard.get("confidence_score")}.')
    if dcf:
        parts.append(f'DCF valuation context includes equity value {dcf.get("equity_value")} and discount rate {_format_pct(dcf.get("discount_rate"))}.')
    if entry:
        parts.append(f'Entry price reference is {entry.get("entry_price")} with status {entry.get("entry_status")}.')
        if entry.get('shares_outstanding_is_simulated'):
            parts.append('Entry price is illustrative because share count is simulated.')
    missing = packet.get('missing_data_warnings') or []
    if missing:
        parts.append('Current raw data gaps include ' + ', '.join(missing[:3]) + '.')
    if rag:
        parts.append('Internal RAG guidance is present in the packet and should be used as process support, not as a substitute for evidence.')
    if pm_required:
        parts.append('PM approval is required before any investment action.')
    return (
        ' '.join(parts),
        [
            f'recommendations.{ticker}',
            f'company_theses.{ticker}',
            f'indicator_scorecards.scorecards.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            'rag_evidence',
            'human_review',
        ],
        _dedupe_citations([
            {'section': f'recommendations.{ticker}', 'path': f'recommendations.{ticker}'},
            {'section': f'company_theses.{ticker}', 'path': f'company_theses.{ticker}'},
            {'section': 'indicator_scorecards', 'path': 'indicator_scorecards.scorecards'},
            {'section': f'dcf_valuations.valuations.{ticker}', 'path': f'dcf_valuations.valuations.{ticker}'},
            {'section': f'entry_price_models.entry_prices.{ticker}', 'path': f'entry_price_models.entry_prices.{ticker}'},
            {'section': 'rag_evidence', 'path': 'rag_evidence'},
            {'section': 'human_review', 'path': 'human_review'},
        ]),
    )


def _deterministic_senior_risk_handoff(packet: dict[str, Any], ticker: str) -> tuple[str, list[str], list[dict[str, str]]]:
    stress = packet.get('portfolio_stress_test') or {}
    recommendation = (packet.get('recommendations') or {}).get(ticker, {})
    scorecard = _find_scorecard(packet, ticker)
    dcf = ((packet.get('dcf_valuations') or {}).get('valuations') or {}).get(ticker, {})
    entry = ((packet.get('entry_price_models') or {}).get('entry_prices') or {}).get(ticker, {})
    human_review = packet.get('human_review') or {}
    parts = [f'Senior risk handoff draft for {ticker}: this is a review summary only and does not claim any routing has happened.']
    drivers = stress.get('main_risk_drivers') or []
    if drivers:
        parts.append('Portfolio stress test highlights ' + ', '.join(drivers[:4]) + ' as the main risk drivers.')
    blocked = recommendation.get('blocked_strong_action_reason') or recommendation.get('data_limitation_reason')
    if blocked:
        parts.append(f'Stronger action is blocked by {_readable_limitation(blocked)}.')
    if dcf:
        parts.append('Risk review should challenge DCF assumptions and proxy/default valuation limitations before any PM decision.')
    if entry:
        parts.append(f'Entry price reference status is {entry.get("entry_status")}; it is analyst reference only, not trade approval.')
        if entry.get('shares_outstanding_is_simulated'):
            parts.append('Entry price is illustrative because share count is simulated.')
    if scorecard:
        negatives = [item.get('name') for item in scorecard.get('indicators', []) if _humanize_indicator_direction(item.get('direction'), item.get('score')) == 'negative']
        if negatives:
            parts.append('Negative indicator drivers include ' + ', '.join(str(item) for item in negatives[:4]) + '.')
    if human_review.get('pm_approval_required'):
        parts.append('Human review remains pending and PM approval is still required.')
    return (
        ' '.join(parts),
        [
            'portfolio_stress_test',
            f'indicator_scorecards.scorecards.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            f'recommendations.{ticker}',
            'human_review',
        ],
        _dedupe_citations([
            {'section': 'portfolio_stress_test', 'path': 'portfolio_stress_test'},
            {'section': 'indicator_scorecards', 'path': 'indicator_scorecards.scorecards'},
            {'section': f'dcf_valuations.valuations.{ticker}', 'path': f'dcf_valuations.valuations.{ticker}'},
            {'section': f'entry_price_models.entry_prices.{ticker}', 'path': f'entry_price_models.entry_prices.{ticker}'},
            {'section': f'recommendations.{ticker}', 'path': f'recommendations.{ticker}'},
            {'section': 'human_review', 'path': 'human_review'},
        ]),
    )


def _deterministic_trade_proposal(packet: dict[str, Any], ticker: str) -> tuple[str, list[str], list[dict[str, str]]]:
    recommendation = (packet.get('recommendations') or {}).get(ticker, {})
    dcf = ((packet.get('dcf_valuations') or {}).get('valuations') or {}).get(ticker, {})
    entry = ((packet.get('entry_price_models') or {}).get('entry_prices') or {}).get(ticker, {})
    action = _readable_action(recommendation.get('action'))
    parts = [f'Trade proposal rationale draft for {ticker}: this is proposal rationale only and does not approve or execute any trade.']
    parts.append(f'The legacy backend status remains {action} with evidence confidence {recommendation.get("confidence_score")}.')
    if dcf:
        parts.append(f'DCF equity value is {dcf.get("equity_value")} and discount rate is {_format_pct(dcf.get("discount_rate"))}; valuation is assumption-based.')
    if entry:
        parts.append(f'Entry price reference is {entry.get("entry_price")} with status {entry.get("entry_status")}; this is not a final buy recommendation.')
        if entry.get('shares_outstanding_is_simulated'):
            parts.append('Entry price is illustrative because share count is simulated.')
    if (packet.get('human_review') or {}).get('pm_approval_required'):
        parts.append('PM review remains required before any proposed action could move forward.')
    return (
        ' '.join(parts),
        [
            f'recommendations.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            'human_review',
        ],
        _dedupe_citations([
            {'section': f'recommendations.{ticker}', 'path': f'recommendations.{ticker}'},
            {'section': f'dcf_valuations.valuations.{ticker}', 'path': f'dcf_valuations.valuations.{ticker}'},
            {'section': f'entry_price_models.entry_prices.{ticker}', 'path': f'entry_price_models.entry_prices.{ticker}'},
            {'section': 'human_review', 'path': 'human_review'},
        ]),
    )


def _deterministic_chat_answer(packet: dict[str, Any], ticker: str, question: str, mode: str, indicator_name: str | None = None) -> dict[str, Any]:
    if mode == 'indicator_explanation':
        return deterministic_indicator_explanation(packet=packet, ticker=ticker, question=question, indicator_name=indicator_name)
    elif mode == 'junior_memo':
        answer, sources, citations = _deterministic_junior_memo(packet, ticker)
        return {
            'answer': answer,
            'grounded': True,
            'mode': mode,
            'llm_used': False,
            'fallback_used': True,
            'sources_used': sources,
            'limitations': list(DEFAULT_LIMITATIONS),
            'citations': citations,
        }
    elif mode == 'senior_risk_handoff':
        answer, sources, citations = _deterministic_senior_risk_handoff(packet, ticker)
        return {
            'answer': answer,
            'grounded': True,
            'mode': mode,
            'llm_used': False,
            'fallback_used': True,
            'sources_used': sources,
            'limitations': list(DEFAULT_LIMITATIONS),
            'citations': citations,
        }
    elif mode == 'trade_proposal_rationale':
        answer, sources, citations = _deterministic_trade_proposal(packet, ticker)
        return {
            'answer': answer,
            'grounded': True,
            'mode': mode,
            'llm_used': False,
            'fallback_used': True,
            'sources_used': sources,
            'limitations': list(DEFAULT_LIMITATIONS),
            'citations': citations,
        }
    answer, sources, citations = _deterministic_packet_qna(packet, ticker)
    return {
        'answer': answer,
        'grounded': True,
        'mode': mode,
        'llm_used': False,
        'fallback_used': True,
        'sources_used': sources,
        'limitations': list(DEFAULT_LIMITATIONS),
        'citations': citations,
    }


def _build_mode_context(packet: dict[str, Any], ticker: str, mode: str, question: str) -> tuple[dict[str, Any], list[str]]:
    recommendation = (packet.get('recommendations') or {}).get(ticker, {})
    scorecard = _find_scorecard(packet, ticker)
    thesis = (packet.get('company_theses') or {}).get(ticker, {})
    news_evidence = ((packet.get('news_evidence') or {}).get(ticker) or [])[:5]
    filing_evidence = ((packet.get('filing_evidence') or {}).get(ticker) or {})
    three_statement = ((packet.get('three_statement_models') or {}).get('models') or {}).get(ticker, {})
    dcf = ((packet.get('dcf_valuations') or {}).get('valuations') or {}).get(ticker, {})
    entry = ((packet.get('entry_price_models') or {}).get('entry_prices') or {}).get(ticker, {})
    context = {
        'ticker': ticker,
        'question': question,
        'recommendation': recommendation,
        'indicator_scorecard': scorecard,
        'company_thesis': thesis,
        'three_statement_model': three_statement,
        'dcf_valuation': dcf,
        'entry_price_model': entry,
        'news_evidence': news_evidence,
        'filing_evidence': filing_evidence,
        'portfolio_stress_test': packet.get('portfolio_stress_test') or {},
        'human_review': packet.get('human_review') or {},
        'raw_data_sources': packet.get('raw_data_sources') or {},
        'missing_data_warnings': packet.get('missing_data_warnings') or [],
        'rag_evidence': packet.get('rag_evidence') or {},
    }
    if mode == 'junior_memo':
        sources = [
            f'recommendations.{ticker}',
            f'company_theses.{ticker}',
            f'indicator_scorecards.scorecards.{ticker}',
            f'three_statement_models.models.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            'raw_data_sources',
            'rag_evidence',
            'human_review',
        ]
    elif mode == 'senior_risk_handoff':
        sources = [
            'portfolio_stress_test',
            f'indicator_scorecards.scorecards.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            f'recommendations.{ticker}',
            'human_review',
        ]
    elif mode == 'trade_proposal_rationale':
        sources = [
            f'recommendations.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            'human_review',
        ]
    elif mode == 'indicator_explanation':
        sources = [
            f'recommendations.{ticker}',
            f'indicator_scorecards.scorecards.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            f'news_evidence.{ticker}',
            f'filing_evidence.{ticker}',
            'human_review',
        ]
    else:
        sources = [
            f'recommendations.{ticker}',
            f'indicator_scorecards.scorecards.{ticker}',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            'portfolio_stress_test',
            'human_review',
        ]
    return context, _dedupe_sources(sources)


def _mode_instructions(mode: str) -> str:
    if mode == 'junior_memo':
        return 'Draft a concise Junior synthesis memo using thesis, indicators, 3-statement model, DCF valuation, entry reference, and limitations. Mention that PM approval is required if the packet says so.'
    if mode == 'senior_risk_handoff':
        return 'Draft a concise Senior handoff summary for the Risk Team using stress, valuation, entry reference, and evidence gaps. Do not claim routing happened.'
    if mode == 'trade_proposal_rationale':
        return 'Draft rationale text for a Senior trade proposal using DCF valuation and entry reference. State clearly that this is proposal rationale only and not execution.'
    if mode == 'indicator_explanation':
        return 'Explain the relevant indicator in a natural analyst voice, using only packet evidence and limitations.'
    return 'Answer the user question about the recommendation packet in concise analyst-style prose.'


def _llm_chat_answer(
    packet: dict[str, Any],
    ticker: str,
    question: str,
    mode: str,
    indicator_name: str | None = None,
    company: str | None = None,
    role: str | None = None,
    senior_proposal: dict[str, Any] | None = None,
    valuation_basis: dict[str, Any] | None = None,
    risk_factors: list[Any] | dict[str, Any] | None = None,
    scenario_settings: dict[str, Any] | None = None,
    pm_context: dict[str, Any] | None = None,
    risk_team_analysis: dict[str, Any] | None = None,
    decision_candidate: str | dict[str, Any] | None = None,
    pm_answer: str | None = None,
    debate_action: str | None = None,
    pm_message: str | None = None,
    chat_history: list[dict[str, Any]] | None = None,
    active_agent: str | None = None,
) -> dict[str, Any] | None:
    if mode == 'indicator_explanation':
        skill = _load_indicator_explanation_skill()
        return skill.run_indicator_explanation(
            packet=packet,
            ticker=ticker,
            indicator_name=indicator_name,
            question=question,
            indicator_scorecards_path=INDICATOR_SCORECARDS_PATH,
            indicator_config_path=INDICATOR_CONFIG_PATH,
            stock_features_path=STOCK_FEATURES_PATH,
            news_evidence_path=NEWS_EVIDENCE_PATH,
            filing_evidence_path=FILING_EVIDENCE_PATH,
            model_predictions_path=MODEL_PREDICTIONS_PATH,
            portfolio_stress_test_path=PORTFOLIO_STRESS_TEST_PATH,
        )
    if mode == 'synthesis_memo':
        skill = _load_synthesis_memo_skill()
        return skill.run_synthesis_memo(
            packet=packet,
            ticker=ticker,
            company=company,
            question=question,
            role=role,
        )
    if mode == 'risk_scenario_analysis':
        skill = _load_risk_scenario_analysis_skill()
        return skill.run_risk_scenario_analysis(
            packet=packet,
            ticker=ticker,
            company=company,
            question=question,
            senior_proposal=senior_proposal,
            valuation_basis=valuation_basis,
            risk_factors=risk_factors,
            scenario_settings=scenario_settings,
        )
    if mode == 'pm_decision_debate':
        skill = _load_pm_decision_debate_skill()
        return skill.run_pm_decision_debate(
            packet=packet,
            ticker=ticker,
            company=company,
            question=question,
            pm_context=pm_context,
            senior_proposal=senior_proposal,
            valuation_basis=valuation_basis,
            risk_team_analysis=risk_team_analysis,
            decision_candidate=decision_candidate,
            pm_answer=pm_answer,
            debate_action=debate_action,
            pm_message=pm_message,
            chat_history=chat_history,
            active_agent=active_agent,
        )

    context, sources = _build_mode_context(packet, ticker, mode, question)
    system_prompt = (
        'You are a grounded investment research drafting assistant. '
        'Use only the provided backend packet context. '
        'Do not invent missing evidence. '
        'Do not invent target prices. '
        'Do not change the official recommendation. '
        'Do not approve or execute trades. '
        'If evidence is missing or weak, say so. '
        'Mention limitations when evidence confidence, valuation assumptions, validation, or data quality is weak. '
        'Write concise analyst-style text suitable for memo, risk handoff, trade rationale, or explanation drafting.'
    )
    user_prompt = (
        f'Mode: {mode}\n'
        f'Ticker: {ticker}\n'
        f'User question: {question}\n'
        f'Mode instructions: {_mode_instructions(mode)}\n'
        f'Required packet sources to rely on: {json.dumps(sources)}\n'
        f'Packet context: {json.dumps(context)}'
    )
    llm_result = run_grounded_chat_completion(system_prompt=system_prompt, user_prompt=user_prompt)
    if not llm_result.get('llm_used'):
        return llm_result
    return {
        'answer': llm_result['answer'],
        'grounded': True,
        'mode': mode,
        'llm_used': True,
        'fallback_used': False,
        'sources_used': sources,
        'limitations': list(DEFAULT_LIMITATIONS),
        'citations': _dedupe_citations([{'section': source, 'path': source} for source in sources]),
        'class_llm_used': llm_result.get('class_llm_used'),
        'llm_error_type': llm_result.get('llm_error_type'),
        'llm_error_message': llm_result.get('llm_error_message'),
        'llm_model': llm_result.get('llm_model'),
        'llm_base_url_configured': llm_result.get('llm_base_url_configured'),
    }


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok', 'service': SERVICE_NAME}


@app.get('/recommendation/latest')
def recommendation_latest(refresh: str | None = None) -> JSONResponse:
    packet = _load_latest_packet()
    refresh_mode = _normalize_refresh_mode(refresh)
    return _refresh_latest_packet_response(packet, refresh_mode)


@app.post('/recommendation/run')
def recommendation_run(request: RecommendationRunRequest) -> JSONResponse:
    ticker = request.ticker.strip().upper()
    if ticker not in SUPPORTED_TICKERS:
        return _unsupported_ticker_response()
    packet = _run_pipeline()
    response = dict(packet)
    response['live_run'] = True
    response['request'] = request.model_dump() | {'ticker': ticker}
    return JSONResponse(content=response)


@app.post('/chat')
def chat(request: ChatRequest) -> JSONResponse:
    ticker = request.ticker.strip().upper()
    if ticker not in SUPPORTED_TICKERS:
        return _unsupported_ticker_response()
    packet = _load_latest_packet()
    if packet is None:
        return JSONResponse(
            status_code=404,
            content={'error': 'packet_not_found', 'message': f'Missing file: {PACKET_PATH}'},
        )
    llm_result = _llm_chat_answer(
        packet=packet,
        ticker=ticker,
        question=request.question,
        mode=request.mode,
        indicator_name=request.indicator_name,
        company=request.company,
        role=request.role,
        senior_proposal=request.senior_proposal,
        valuation_basis=request.valuation_basis,
        risk_factors=request.risk_factors,
        scenario_settings=request.scenario_settings,
        pm_context=request.pm_context,
        risk_team_analysis=request.risk_team_analysis,
        decision_candidate=request.decision_candidate,
        pm_answer=request.pm_answer,
        debate_action=request.debate_action,
        pm_message=request.pm_message,
        chat_history=request.chat_history,
        active_agent=request.active_agent,
    )
    if request.mode in {'indicator_explanation', 'synthesis_memo', 'risk_scenario_analysis', 'pm_decision_debate'} and llm_result is not None:
        response = {'ticker': ticker, 'question': request.question} | llm_result
        return JSONResponse(content=response)
    if llm_result is not None and llm_result.get('llm_used'):
        response = {'ticker': ticker, 'question': request.question} | llm_result
        return JSONResponse(content=response)
    fallback = _deterministic_chat_answer(packet=packet, ticker=ticker, question=request.question, mode=request.mode, indicator_name=request.indicator_name)
    if llm_result is not None:
        fallback['class_llm_used'] = llm_result.get('class_llm_used')
        fallback['llm_error_type'] = llm_result.get('llm_error_type')
        fallback['llm_error_message'] = sanitize_llm_error_message(llm_result.get('llm_error_message'))
        fallback['llm_model'] = llm_result.get('llm_model')
        fallback['llm_base_url_configured'] = llm_result.get('llm_base_url_configured')
        fallback['limitations'] = list(fallback.get('limitations', [])) + [FALLBACK_LIMITATION]
    response = {'ticker': ticker, 'question': request.question} | fallback
    return JSONResponse(content=response)
