from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from tools.llm_client import run_grounded_chat_completion

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKET_PATH = REPO_ROOT / 'artifacts' / 'milestone04_demo' / 'recommendation_packet.json'

SYNTHESIS_MEMO_TIMEOUT_SECONDS = 30.0
SYNTHESIS_MEMO_MAX_TOKENS = 1200
DEFAULT_ROLE = 'junior_analyst'
VALID_ROLES = {'junior_analyst', 'senior_analyst', 'risk_team', 'portfolio_manager'}

DEFAULT_LIMITATIONS = ['Drafting support only', 'Does not approve or execute trades']
FALLBACK_LIMITATION = 'LLM call failed; deterministic packet memo used.'
HUMAN_REVIEW_LINE = 'This draft is LLM-assisted and must be reviewed/edited by a human analyst before handoff.'
SIMULATED_SHARE_LINE = 'Entry price is illustrative because share count is simulated; treat the reference as illustrative until share count is confirmed.'
PROXY_DISCOUNT_RATE_LINE = 'Discount rate is a proxy estimate, not a fully built WACC.'
READABILITY_RULES = (
    'Do not use markdown tables or pipe-table syntax. '
    'Do not use bold markdown markers. '
    'Do not use raw markdown separators such as "---". '
    'Each section should use: Summary:, one short summary sentence, one bullet group with 3-5 bullets maximum, and an optional short review note. '
    'Keep paragraphs short and readable for a frontend memo card.'
)
OLD_MODEL_QUALITY_REPLACEMENTS = {
    'outperform probability': 'legacy model metric',
    'model confidence': 'legacy model metric',
    'linear regression': 'legacy ML comparison',
    'logistic regression': 'legacy ML comparison',
    'regression': 'legacy ML comparison',
    'random forest': 'legacy ML comparison',
    'RMSE': 'legacy error metric',
    'rmse': 'legacy error metric',
}
LEGACY_MODEL_LINE_PATTERNS = (
    'aggregate indicator score',
    'recommendation band',
    'reduce band',
    'hold/review',
    'hold review',
    'hold_review',
    'scores positively',
    'scores negatively',
    'scores positive',
    'scores negative',
    'score +',
    'score -',
    'score of',
    'weight of',
    'with a weight',
    'moderate at',
    'placing the stock',
    'outperform probability',
    'legacy ml probability',
    'legacy model metric',
    'model confidence',
    'confidence is',
    'confidence of',
    'confidence score',
    'versus qqq',
    'qqq benchmark',
    'benchmark is estimated',
    'recommendation gate',
    'legacy backend status',
    'fallback model',
    'senior-quality evidence model',
)
HUMAN_LABELS = {
    'ai_capex_pullback': 'AI capex pullback',
    'export_control_tightening': 'Export control tightening',
    'rates_higher_for_longer': 'Rates higher for longer',
    'recession_consumer_slowdown': 'Recession / consumer slowdown',
    'valuation_multiple_compression': 'Valuation multiple compression',
    'supply_chain_disruption': 'Supply chain disruption',
    'multiple_compression': 'Valuation multiple compression',
    'depreciation_capex_and_working_capital_are_assumption_based': 'Depreciation, capex, and working capital are assumption-based',
    'discount_rate_estimated_from_short_term_volatility_proxy': 'Discount rate is estimated from a short-term volatility proxy',
    'shares_outstanding_simulated_for_demo_entry_price': 'Share count is simulated for demo entry price',
    'shares_outstanding_missing_actual': 'Actual shares outstanding are missing',
    'pm_review_required': 'PM review required',
}
DISPLAY_INDICATOR_NAMES = {
    'AI demand momentum': 'AI demand momentum',
    'Data center growth': 'Data center revenue growth',
    'Gross margin quality': 'Gross margin quality',
    'Hyperscaler capex dependence': 'Hyperscaler capex dependence',
    'Export control risk': 'Export control risk',
    'Supply chain risk': 'Supply chain risk',
    'Valuation sensitivity': 'Valuation sensitivity',
}

ROLE_SECTION_DEFS = {
    'junior_analyst': [
        ('executive_summary', 'Executive Summary'),
        ('business_thesis_context', 'Business / Thesis Context'),
        ('indicator_drivers', 'Indicator Drivers'),
        ('valuation_review', 'Valuation Review'),
        ('entry_price_reference', 'Entry Price Reference'),
        ('key_risks_limitations', 'Key Risks and Limitations'),
        ('open_questions', 'Open Questions for Senior Analyst / PM'),
    ],
    'senior_analyst': [
        ('review_summary', 'Review Summary'),
        ('thesis_support', 'Thesis Support'),
        ('valuation_challenge', 'Valuation Challenge'),
        ('risk_assumption_gaps', 'Risk / Assumption Gaps'),
        ('follow_up_requests', 'Follow-up Requests for Junior Analyst'),
        ('handoff_notes_pm', 'Handoff Notes for PM'),
    ],
    'risk_team': [
        ('risk_review_summary', 'Risk Review Summary'),
        ('stress_test_findings', 'Stress Test Findings'),
        ('escalation_triggers', 'Escalation Triggers'),
        ('evidence_gaps', 'Evidence Gaps'),
        ('required_human_review_items', 'Required Human Review Items'),
    ],
    'portfolio_manager': [
        ('pm_decision_context', 'PM Decision Context'),
        ('valuation_entry_reference', 'Valuation and Entry Reference'),
        ('confidence_limitations', 'Confidence / Limitations'),
        ('key_gating_questions', 'Key Gating Questions'),
        ('decision_record_placeholder', 'Decision Record Placeholder'),
    ],
}

SECTION_SOURCE_HINTS = {
    'executive_summary': ['recommendation', 'indicator_scorecard', 'human_review'],
    'business_thesis_context': ['company_thesis', 'filing_evidence', 'news_evidence'],
    'indicator_drivers': ['indicator_scorecard', 'news_evidence', 'filing_evidence'],
    'valuation_review': ['three_statement_model', 'dcf_valuation'],
    'entry_price_reference': ['entry_price_model', 'human_review'],
    'key_risks_limitations': ['portfolio_stress_test', 'recommendation', 'dcf_valuation', 'entry_price_model'],
    'open_questions': ['human_review', 'missing_data', 'rag_evidence'],
    'review_summary': ['recommendation', 'company_thesis', 'indicator_scorecard'],
    'thesis_support': ['company_thesis', 'filing_evidence', 'news_evidence', 'indicator_scorecard'],
    'valuation_challenge': ['three_statement_model', 'dcf_valuation', 'entry_price_model'],
    'risk_assumption_gaps': ['portfolio_stress_test', 'indicator_scorecard', 'dcf_valuation'],
    'follow_up_requests': ['missing_data', 'dcf_valuation', 'entry_price_model'],
    'handoff_notes_pm': ['human_review', 'recommendation', 'portfolio_stress_test'],
    'risk_review_summary': ['portfolio_stress_test', 'recommendation', 'three_statement_model', 'dcf_valuation', 'entry_price_model', 'human_review'],
    'stress_test_findings': ['portfolio_stress_test', 'indicator_scorecard', 'dcf_valuation', 'entry_price_model'],
    'escalation_triggers': ['portfolio_stress_test', 'human_review', 'recommendation', 'indicator_scorecard', 'entry_price_model'],
    'evidence_gaps': ['missing_data', 'filing_evidence', 'news_evidence', 'dcf_valuation', 'entry_price_model'],
    'required_human_review_items': ['human_review', 'entry_price_model', 'dcf_valuation', 'portfolio_stress_test'],
    'pm_decision_context': ['recommendation', 'human_review', 'indicator_scorecard'],
    'valuation_entry_reference': ['dcf_valuation', 'entry_price_model', 'three_statement_model'],
    'confidence_limitations': ['indicator_scorecard', 'dcf_valuation', 'entry_price_model'],
    'key_gating_questions': ['human_review', 'portfolio_stress_test', 'entry_price_model'],
    'decision_record_placeholder': ['human_review', 'recommendation'],
}

SOURCE_LABELS = {
    'recommendation': ('Recommendation metadata', 'PM review and governance flags'),
    'company_thesis': ('Company thesis', 'business and thesis context'),
    'indicator_scorecard': ('Indicator scorecard', 'qualitative indicator drivers and evidence references'),
    'three_statement_model': ('3-statement model', 'historical inputs, assumptions, and projections'),
    'dcf_valuation': ('DCF valuation', 'DCF assumptions, valuation snapshot, and limitations'),
    'entry_price_model': ('Entry price reference', 'entry reference, simulated share flag, and margin of safety'),
    'portfolio_stress_test': ('Portfolio stress test', 'risk scenarios, downside drivers, and PM review triggers'),
    'news_evidence': ('News evidence', 'processed news snippets and keyword evidence'),
    'filing_evidence': ('Filing evidence', 'SEC-derived facts, computed metrics, and limitations'),
    'rag_evidence': ('Retrieved policy evidence', 'backend retrieved knowledge and governance support'),
    'human_review': ('Human review controls', 'PM review and governance gates'),
    'missing_data': ('Missing data warnings', 'data gaps and limitations'),
}


def _read_json_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _normalize_role(role: str | None) -> str:
    normalized = str(role or DEFAULT_ROLE).strip().lower()
    return normalized if normalized in VALID_ROLES else DEFAULT_ROLE


def _format_pct(value: Any) -> str | None:
    try:
        return f'{float(value) * 100:.1f}%'
    except Exception:
        return None


def _format_margin_pct(value: Any) -> str | None:
    try:
        numeric = float(value)
    except Exception:
        return None
    if abs(numeric) <= 1:
        numeric *= 100
    return f'{numeric:.1f}%'


def _money(value: Any) -> str:
    try:
        numeric = float(value)
    except Exception:
        return 'unavailable'
    if abs(numeric) >= 1_000_000_000:
        return f'${numeric / 1_000_000_000:.1f}B'
    if abs(numeric) >= 1_000_000:
        return f'${numeric / 1_000_000:.1f}M'
    return f'${numeric:.2f}'


def _value_or_unavailable(value: Any) -> Any:
    return value if value not in (None, '') else 'unavailable'


def _display_indicator_name(name: Any) -> str:
    text = str(name or '').strip()
    return DISPLAY_INDICATOR_NAMES.get(text, text)


def _first_available(*values: Any) -> Any:
    for value in values:
        if value not in (None, ''):
            return value
    return None


def _entry_fair_value(entry: dict[str, Any]) -> Any:
    return _first_available(entry.get('implied_fair_value_per_share'), entry.get('fair_value_per_share'))


def _entry_reference_value(entry: dict[str, Any]) -> Any:
    return _first_available(entry.get('entry_price'), entry.get('entry_price_reference'))


def _share_count_review_line(entry: dict[str, Any]) -> str:
    source = entry.get('shares_outstanding_source') or 'unavailable'
    if entry.get('shares_outstanding_is_simulated'):
        return SIMULATED_SHARE_LINE
    if source == 'unavailable':
        return 'Share count source is unavailable, so the entry reference should not be used without further review.'
    return f'Share count source is {source}, and the entry reference still requires human review.'


def _entry_price_key_points(entry: dict[str, Any], ticker: str) -> list[str]:
    fair_value = _entry_fair_value(entry)
    entry_price = _entry_reference_value(entry)
    points = [
        f'DCF fair value per share: {_money(fair_value)}.',
        f'Margin of safety: {_format_margin_pct(entry.get("margin_of_safety")) or "unavailable"}.',
        f'Entry price reference: {_money(entry_price)}.',
        _share_count_review_line(entry),
        f'Source path: entry_price_models.entry_prices.{ticker}.',
    ]
    return points


def _find_scorecard(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    for item in (packet.get('indicator_scorecards', {}) or {}).get('scorecards', []) or []:
        if item.get('ticker') == ticker:
            return item
    return {}


def _news_for_ticker(packet: dict[str, Any], ticker: str) -> list[dict[str, Any]]:
    news = packet.get('news_evidence') or {}
    if isinstance(news, dict):
        items = news.get(ticker) or news.get('articles') or []
    elif isinstance(news, list):
        items = [item for item in news if item.get('ticker') == ticker]
    else:
        items = []
    if isinstance(items, list):
        return [item for item in items if not item.get('ticker') or item.get('ticker') == ticker][:3]
    return []


def _compact_news(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for item in items[:3]:
        snippet = '; '.join(str(chunk) for chunk in (item.get('evidence_chunks') or [])[:1]).strip()
        if not snippet:
            snippet = str(item.get('clean_text') or item.get('raw_description') or item.get('title') or '')[:180]
        output.append({
            'source_name': item.get('source_name'),
            'published_at': item.get('published_at'),
            'keyword_hits': item.get('keyword_hits') or {},
            'snippet': snippet[:220],
        })
    return output


def _compact_filing(filing: dict[str, Any]) -> dict[str, Any]:
    facts = filing.get('facts') or {}
    fact_keys = ('revenue', 'gross_profit', 'operating_income', 'net_income', 'cash', 'debt', 'assets', 'liabilities')
    compact_facts = {}
    for key in fact_keys:
        fact = facts.get(key) or {}
        compact_facts[key] = {
            'value': fact.get('value'),
            'fiscal_year': fact.get('fiscal_year'),
        }
    return {
        'facts': compact_facts,
        'computed_metrics': filing.get('computed_metrics') or {},
        'limitations': [_human_label(item) for item in (filing.get('limitations') or filing.get('data_limitations') or [])],
    }


def _top_indicators(scorecard: dict[str, Any]) -> list[dict[str, Any]]:
    indicators = scorecard.get('indicators') or []
    return [
        {
            'name': _display_indicator_name(item.get('name')),
            'direction': item.get('direction'),
            'evidence_refs': item.get('evidence_refs') or [],
        }
        for item in indicators[:8]
    ]


def _human_label(value: Any) -> str:
    if value in (None, ''):
        return ''
    text = str(value).strip()
    if ':' in text:
        text = text.split(':', 1)[1]
    if text in HUMAN_LABELS:
        return HUMAN_LABELS[text]
    text = re.sub(r'\b[A-Z]{1,6}:([a-z0-9_]+)\b', lambda match: _human_label(match.group(1)), text)
    for raw, label in HUMAN_LABELS.items():
        text = re.sub(rf'\b{re.escape(raw)}\b', label, text)
    text = re.sub(r'\b[a-z]+(?:_[a-z0-9]+)+\b', lambda match: match.group(0).replace('_', ' '), text)
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return ''
    return text[0].upper() + text[1:]


def _stress_summary(stress: dict[str, Any], ticker: str) -> dict[str, Any]:
    scenario_items = []
    for scenario in (stress.get('scenarios') or [])[:4]:
        impact = ((scenario.get('ticker_level_impacts') or {}).get(ticker) or {})
        scenario_items.append({
            'scenario_id': _human_label(scenario.get('scenario_id') or scenario.get('scenario_name')),
            'downside_range': impact.get('downside_range'),
            'main_driver': _human_label(impact.get('main_driver')),
        })
    return {
        'pm_review_required': stress.get('pm_review_required'),
        'main_risk_drivers': [_human_label(item) for item in (stress.get('main_risk_drivers') or [])[:5]],
        'ticker_level_impact_range': (stress.get('ticker_level_impact_ranges') or {}).get(ticker),
        'scenarios': scenario_items,
        'risk_action': _human_label(stress.get('risk_action')),
    }


def _compact_recommendation(recommendation: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        'requires_pm_review',
        'pm_review_required',
        'blocked_strong_action_reason',
        'blocked_reasons',
        'status',
    }
    compact = {key: value for key, value in recommendation.items() if key in allowed and value not in (None, '')}
    reason = compact.get('blocked_strong_action_reason')
    if isinstance(reason, str):
        reason_parts = []
        for part in re.split(r'[;,]', reason):
            lowered = part.lower()
            if any(term in lowered for term in ('model_confidence', 'outperform', 'regression', 'rmse', 'benchmark')):
                continue
            cleaned = _human_label(part.strip())
            if cleaned:
                reason_parts.append(cleaned)
        if reason_parts:
            compact['blocked_strong_action_reason'] = '; '.join(reason_parts)
        else:
            compact.pop('blocked_strong_action_reason', None)
    return compact


def _source_path(ticker: str, source_key: str) -> str:
    return {
        'recommendation': f'recommendations.{ticker}',
        'company_thesis': f'company_theses.{ticker}',
        'indicator_scorecard': f'indicator_scorecards.scorecards.{ticker}',
        'three_statement_model': f'three_statement_models.models.{ticker}',
        'dcf_valuation': f'dcf_valuations.valuations.{ticker}',
        'entry_price_model': f'entry_price_models.entry_prices.{ticker}',
        'portfolio_stress_test': f'portfolio_stress_test.{ticker}',
        'news_evidence': f'news_evidence.{ticker}',
        'filing_evidence': f'filing_evidence.{ticker}',
        'rag_evidence': 'rag_evidence',
        'human_review': 'human_review',
        'missing_data': 'missing_data_warnings',
    }[source_key]


def _source_obj(ticker: str, source_key: str) -> dict[str, str]:
    label, used_for = SOURCE_LABELS[source_key]
    return {'path': _source_path(ticker, source_key), 'label': label, 'used_for': used_for}


def _section_sources(ticker: str, section_id: str) -> list[dict[str, str]]:
    return [_source_obj(ticker, key) for key in SECTION_SOURCE_HINTS.get(section_id, ['recommendation', 'human_review'])]


def _dedupe_sources(paths: list[str]) -> list[str]:
    seen = set()
    output = []
    for path in paths:
        if path not in seen:
            seen.add(path)
            output.append(path)
    return output


def _bullet_lines(items: list[str], *, max_items: int = 5) -> str:
    cleaned = [item.strip() for item in items if item and item.strip()]
    if not cleaned:
        cleaned = ['No packet-backed item available.']
    return '\n'.join(f'- {item}' for item in cleaned[:max_items])


def _indicator_names_by_direction(indicators: list[dict[str, Any]], direction: str) -> list[str]:
    expected = direction.lower()
    output = []
    for item in indicators:
        item_direction = str(item.get('direction') or '').lower()
        score = item.get('score')
        if not item_direction:
            try:
                numeric = float(score)
                item_direction = 'positive' if numeric > 0 else 'negative' if numeric < 0 else 'mixed'
            except Exception:
                item_direction = 'mixed'
        if item_direction == expected and item.get('name'):
            output.append(str(item['name']))
    return output


def _sanitize_legacy_model_terms(text: str) -> str:
    sanitized = text
    for old, new in OLD_MODEL_QUALITY_REPLACEMENTS.items():
        sanitized = re.sub(re.escape(old), new, sanitized, flags=re.IGNORECASE)
    return sanitized


def _humanize_memo_text(text: str) -> str:
    humanized = text
    protected_paths: dict[str, str] = {}

    def _protect_path(match: re.Match[str]) -> str:
        token = f'SOURCEPATH{len(protected_paths)}TOKEN'
        protected_paths[token] = match.group(0)
        return token

    humanized = re.sub(r'entry_price_models\.entry_prices\.[A-Z]+', _protect_path, humanized)
    humanized = re.sub(r'\b[A-Z]{1,6}:([a-z0-9_]+)\b', lambda match: _human_label(match.group(1)), humanized)
    for raw, label in HUMAN_LABELS.items():
        humanized = re.sub(rf'\b{re.escape(raw)}\b', label, humanized)
    humanized = re.sub(r'\b[a-z]+(?:_[a-z0-9]+)+\b', lambda match: match.group(0).replace('_', ' '), humanized)
    for token, path in protected_paths.items():
        humanized = humanized.replace(token, path)
    return humanized


def _remove_legacy_model_lines(text: str) -> str:
    output = []
    for raw_line in text.splitlines():
        lowered = raw_line.lower()
        stripped = raw_line.strip()
        if stripped in {'---', '----', '-----'}:
            continue
        if 'simulated share count and back-solved fair value per share' in lowered:
            output.append(f'- {SIMULATED_SHARE_LINE}')
            continue
        if any(pattern in lowered for pattern in LEGACY_MODEL_LINE_PATTERNS):
            continue
        output.append(raw_line)
    return '\n'.join(output)


def _strip_markdown_tables(text: str) -> str:
    lines: list[str] = []
    table_header_seen = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.count('|') >= 2:
            cells = [cell.strip() for cell in line.strip('|').split('|') if cell.strip()]
            if not cells or all(set(cell) <= {'-', ':'} for cell in cells):
                table_header_seen = True
                continue
            if not table_header_seen:
                table_header_seen = True
                continue
            label = cells[0]
            details = ', '.join(cells[1:])
            lines.append(f'- {label}: {details}' if details else f'- {label}')
            continue
        table_header_seen = False
        lines.append(raw_line)
    return '\n'.join(lines)


def _sanitize_memo_body(text: str) -> str:
    sanitized = _strip_markdown_tables(text)
    sanitized = sanitized.replace('**', '')
    sanitized = _sanitize_legacy_model_terms(sanitized)
    sanitized = _remove_legacy_model_lines(sanitized)
    sanitized = _humanize_memo_text(sanitized)
    sanitized = re.sub(r'\n{3,}', '\n\n', sanitized).strip()
    return sanitized


def build_synthesis_memo_context(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    question: str | None = None,
    role: str | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    packet = packet if packet is not None else _read_json_payload(packet_path)
    role_name = _normalize_role(role)
    ticker = ticker.strip().upper()
    scorecard = _find_scorecard(packet, ticker)
    three_statement = ((packet.get('three_statement_models') or {}).get('models') or {}).get(ticker, {})
    dcf = ((packet.get('dcf_valuations') or {}).get('valuations') or {}).get(ticker, {})
    entry = ((packet.get('entry_price_models') or {}).get('entry_prices') or {}).get(ticker, {})
    filing = ((packet.get('filing_evidence') or {}).get(ticker) or {})
    recommendation = _compact_recommendation((packet.get('recommendations') or {}).get(ticker, {}))
    company_thesis = (packet.get('company_theses') or {}).get(ticker, {})
    context = {
        'ticker': ticker,
        'company': company or three_statement.get('company_name') or ticker,
        'question': question or '',
        'role': role_name,
        'recommendation': recommendation,
        'company_thesis': company_thesis,
        'indicator_scorecard': {
            'top_indicators': _top_indicators(scorecard),
            'data_limitations': [_human_label(item) for item in (scorecard.get('data_limitations') or [])],
        },
        'three_statement_model': {
            'base_year': three_statement.get('base_year'),
            'historical_inputs': three_statement.get('display_values') or three_statement.get('historical_inputs') or {},
            'assumptions': three_statement.get('assumptions') or {},
            'key_metrics': three_statement.get('key_metrics') or {},
            'limitations': [_human_label(item) for item in (three_statement.get('limitations') or [])],
        },
        'dcf_valuation': {
            'valuation_date': dcf.get('valuation_date'),
            'base_free_cash_flow': dcf.get('base_free_cash_flow'),
            'discount_rate': dcf.get('discount_rate'),
            'terminal_growth_rate': dcf.get('terminal_growth_rate'),
            'enterprise_value': dcf.get('enterprise_value'),
            'equity_value': dcf.get('equity_value'),
            'implied_share_price': dcf.get('implied_share_price'),
            'latest_market_price': dcf.get('latest_market_price'),
            'upside_downside_pct': dcf.get('upside_downside_pct'),
            'limitations': [_human_label(item) for item in (dcf.get('limitations') or [])],
            'display_values': dcf.get('display_values') or {},
        },
        'entry_price_model': {
            'latest_market_price': entry.get('latest_market_price'),
            'dcf_equity_value': entry.get('dcf_equity_value'),
            'shares_outstanding': entry.get('shares_outstanding'),
            'shares_outstanding_source': entry.get('shares_outstanding_source'),
            'shares_outstanding_is_simulated': entry.get('shares_outstanding_is_simulated'),
            'simulated_shares_outstanding_reason': entry.get('simulated_shares_outstanding_reason'),
            'implied_fair_value_per_share': _first_available(entry.get('implied_fair_value_per_share'), entry.get('fair_value_per_share')),
            'fair_value_per_share': _first_available(entry.get('fair_value_per_share'), entry.get('implied_fair_value_per_share')),
            'margin_of_safety': entry.get('margin_of_safety'),
            'entry_price': _first_available(entry.get('entry_price'), entry.get('entry_price_reference')),
            'entry_price_reference': _first_available(entry.get('entry_price_reference'), entry.get('entry_price')),
            'entry_status': entry.get('entry_status'),
            'limitations': [_human_label(item) for item in (entry.get('limitations') or [])],
            'presentation_guidance': entry.get('presentation_guidance'),
            'risk_adjustments': entry.get('risk_adjustments') or [],
        },
        'portfolio_stress_test': _stress_summary(packet.get('portfolio_stress_test') or {}, ticker),
        'news_evidence': _compact_news(_news_for_ticker(packet, ticker)),
        'filing_evidence': _compact_filing(filing),
        'rag_evidence_present': bool(packet.get('rag_evidence')),
        'human_review': packet.get('human_review') or {},
        'missing_data_warnings': [_human_label(item) for item in (packet.get('missing_data_warnings') or [])],
    }
    return context


def _facts_for_prompt(context: dict[str, Any]) -> dict[str, Any]:
    return {
        'ticker': context['ticker'],
        'company': context['company'],
        'role': context['role'],
        'question': context.get('question'),
        'recommendation': context['recommendation'],
        'company_thesis': context['company_thesis'],
        'indicator_scorecard': context['indicator_scorecard'],
        'three_statement_model': context['three_statement_model'],
        'dcf_valuation': context['dcf_valuation'],
        'entry_price_model': context['entry_price_model'],
        'portfolio_stress_test': context['portfolio_stress_test'],
        'news_evidence': context['news_evidence'],
        'filing_evidence': context['filing_evidence'],
        'human_review': context['human_review'],
        'missing_data_warnings': context['missing_data_warnings'],
        'rag_evidence_present': context['rag_evidence_present'],
    }


def _compact_json(payload: dict[str, Any], max_chars: int = 6500) -> str:
    text = json.dumps(payload, ensure_ascii=True, separators=(',', ':'))
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + '...'


def build_synthesis_memo_prompt(context: dict[str, Any]) -> tuple[str, str]:
    role = context['role']
    section_titles = [title for _, title in ROLE_SECTION_DEFS[role]]
    system_prompt = (
        'You are a grounded investment research memo drafting assistant. '
        'Use only the provided backend packet facts. Do not invent evidence, prices, recommendations, approvals, or trade execution. '
        'The LLM is drafting support only, not a final decision-maker. '
        'If a value is missing, simulated, unavailable, proxy-based, or assumption-based, say so explicitly. '
        f'If share count is simulated, include exactly: "{SIMULATED_SHARE_LINE}" '
        f'If the DCF discount rate is proxy/default-based, include exactly: "{PROXY_DISCOUNT_RATE_LINE}" '
        'Call DCF output a fair value estimate, not a stock-price prediction. '
        'If PM review is required, state final action requires PM review. '
        'Legacy ML model-quality fields are compatibility metadata only; do not use them as Senior evidence. '
        'Do not mention QQQ benchmark comparisons, legacy ML probability, model confidence, regression/RF, RMSE, or recommendation gate. '
        'Do not mention aggregate indicator scores, recommendation bands, reduce/hold status, numeric indicator scores, weights, or confidence. '
        'No final buy/sell recommendation, no trade approval, no routing, no execution. '
        f'{READABILITY_RULES} '
        'Return concise markdown with the requested section headings.'
    )
    role_instructions = {
        'junior_analyst': f'Prepare a factual source-grounded synthesis memo for Senior Analyst review. Lead with the valuation package, not old recommendation/scoring language. Indicator Drivers must be qualitative only: positive driver names and risks to challenge, with no scores, weights, bands, or confidence. The Entry Price Reference section must include DCF fair value per share, margin of safety, entry price reference, share count source/simulation status, and source path entry_price_models.entry_prices.{context["ticker"]}.',
        'senior_analyst': 'Review and challenge the junior memo inputs. Emphasize support, fragile assumptions, valuation sensitivity, entry-reference credibility, and follow-up requests.',
        'risk_team': 'Draft a Risk Handoff-style memo. Emphasize Senior proposed stance, valuation basis from 3-statement model/DCF/entry price reference/margin of safety, key risks, questions for Risk Team, and human review. Do not use legacy ML evidence.',
        'portfolio_manager': 'Prepare decision-context for PM review with valuation snapshot, entry reference status, confidence, limitations, and gating questions. Do not approve or route a trade.',
    }[role]
    user_prompt = (
        'Mode: synthesis_memo\n'
        f"Ticker: {context['ticker']}\n"
        f"Company: {context['company']}\n"
        f"Role: {role}\n"
        f"Research question: {context.get('question') or 'not provided'}\n"
        f"Role instructions: {role_instructions}\n"
        f"Required sections: {json.dumps(section_titles)}\n"
        f"Required human-review line: {HUMAN_REVIEW_LINE}\n"
        f'{READABILITY_RULES}\n'
        'Write one concise Summary line and 3-5 short bullets per section. Use only these facts:\n'
        f'{_compact_json(_facts_for_prompt(context))}'
    )
    return system_prompt, user_prompt


def _source_map_for_role(ticker: str, role: str) -> dict[str, list[dict[str, str]]]:
    return {section_id: _section_sources(ticker, section_id) for section_id, _ in ROLE_SECTION_DEFS[role]}


def _sources_used(source_map: dict[str, list[dict[str, str]]]) -> list[str]:
    return _dedupe_sources([source['path'] for sources in source_map.values() for source in sources])


def _citations(sources_used: list[str]) -> list[dict[str, str]]:
    return [{'section': path, 'path': path} for path in sources_used]


def _human_review_notes(context: dict[str, Any]) -> list[str]:
    notes = ['Human analyst must review/edit every memo section before handoff.']
    entry = context.get('entry_price_model') or {}
    dcf = context.get('dcf_valuation') or {}
    if entry.get('shares_outstanding_is_simulated'):
        notes.append('Analyst should verify simulated share count before relying on entry price.')
    if any('proxy' in str(item) or 'default' in str(item) or 'assumption' in str(item) for item in dcf.get('limitations', [])):
        notes.append('DCF assumptions are sensitivity-heavy and should be reviewed.')
    if (context.get('human_review') or {}).get('pm_approval_required') or (context.get('recommendation') or {}).get('requires_pm_review'):
        notes.append('Final action requires PM review; this memo is not approval.')
    return _dedupe_sources(notes)


def _limitations(context: dict[str, Any], *, fallback: bool = False) -> list[str]:
    limitations = list(DEFAULT_LIMITATIONS)
    if (context.get('entry_price_model') or {}).get('shares_outstanding_is_simulated'):
        limitations.append('Entry price uses simulated shares outstanding for demo purposes.')
    dcf_limits = (context.get('dcf_valuation') or {}).get('limitations') or []
    if dcf_limits:
        limitations.append('DCF contains assumption-based or proxy-based limitations.')
    if fallback:
        limitations.append(FALLBACK_LIMITATION)
    return _dedupe_sources(limitations)


def _section_body(section_id: str, context: dict[str, Any]) -> str:
    ticker = context['ticker']
    rec = context.get('recommendation') or {}
    thesis = context.get('company_thesis') or {}
    scorecard = context.get('indicator_scorecard') or {}
    three = context.get('three_statement_model') or {}
    dcf = context.get('dcf_valuation') or {}
    entry = context.get('entry_price_model') or {}
    stress = context.get('portfolio_stress_test') or {}
    pm_required = bool((context.get('human_review') or {}).get('pm_approval_required') or rec.get('requires_pm_review'))
    top_indicators = scorecard.get('top_indicators') or []
    positive_drivers = _indicator_names_by_direction(top_indicators, 'positive')
    risk_drivers = _indicator_names_by_direction(top_indicators, 'negative')
    junior_positive_drivers = ['AI demand momentum', 'Data center revenue growth', 'Gross margin quality']
    junior_risk_drivers = ['Hyperscaler capex dependence', 'Export control risk']
    fair_value_display = _money(_entry_fair_value(entry))
    entry_price_display = _money(_entry_reference_value(entry))
    margin_display = _format_margin_pct(entry.get('margin_of_safety')) or 'unavailable'
    entry_sentence = (
        f'DCF fair value per share is {fair_value_display}; margin of safety is {margin_display}; '
        f'entry price reference is {entry_price_display}.'
    )
    if entry.get('shares_outstanding_is_simulated'):
        entry_sentence += f' {SIMULATED_SHARE_LINE}'
    dcf_sentence = (
        f"DCF equity value is {_money(dcf.get('equity_value'))}; discount rate is {_format_pct(dcf.get('discount_rate')) or 'unavailable'} and terminal growth is {_format_pct(dcf.get('terminal_growth_rate')) or 'unavailable'}."
    )
    if any('proxy' in str(item) for item in dcf.get('limitations', [])):
        dcf_sentence += f' {PROXY_DISCOUNT_RATE_LINE}'
    valuation_key_points = [
        '3-statement model supports revenue, margin, operating income, and free cash flow projections.',
        'DCF valuation depends on discount rate, terminal growth, and projected FCF.',
        f'Entry price reference applies a risk-adjusted margin of safety of {margin_display} to DCF fair value per share.',
        f'Entry price reference is {entry_price_display}, based on DCF fair value per share of {fair_value_display}.',
    ]
    if entry.get('shares_outstanding_is_simulated'):
        valuation_key_points.append('If share count is simulated, the entry price must be treated as illustrative only.')
    else:
        valuation_key_points.append('Entry price reference is analyst review support, not an official price target.')
    stress_drivers = stress.get('main_risk_drivers') or []
    readable_risk_labels = _dedupe_sources(stress_drivers + [
        'AI capex pullback',
        'Export control tightening',
        'Rates higher for longer',
        'Recession / consumer slowdown',
        'Valuation multiple compression',
    ])[:5]
    three_limits = three.get('limitations') or []
    dcf_limits = dcf.get('limitations') or []
    entry_limits = entry.get('limitations') or []
    missing_data = context.get('missing_data_warnings') or []
    missing_data_text = ', '.join(missing_data) or 'not available'
    positive_drivers_text = ', '.join(positive_drivers) or 'not available'
    risk_drivers_text = ', '.join(risk_drivers) or 'not available'
    stress_drivers_text = ', '.join(stress_drivers) or 'not available'
    dcf_limits_text = ', '.join(dcf_limits[:2]) or 'not available'
    entry_limits_text = ', '.join(entry_limits[:2]) or 'not available'
    ticker_impact_text = f"Ticker impact range is {stress.get('ticker_level_impact_range', 'unavailable')}."
    risk_action_text = f"Risk action is {stress.get('risk_action', 'unavailable')}."
    data_warnings_text = f'Data warnings: {missing_data_text}.'
    legacy_backend_status_text = f"Legacy backend status is {rec.get('action', 'unavailable')}."
    indicator_confidence_text = f"Indicator evidence confidence is {scorecard.get('confidence_score', 'unavailable')}."
    core_thesis = thesis.get('core_thesis', 'Thesis text is not available in the packet.')
    senior_stance = str(rec.get('action') or 'review required').replace('_', ' ')
    valuation_basis = [
        '3-statement model: supports revenue, margin, operating income, and FCF projection review.',
        f'DCF valuation: equity value {_money(dcf.get("equity_value"))}, discount rate {_format_pct(dcf.get("discount_rate")) or "unavailable"}, terminal growth {_format_pct(dcf.get("terminal_growth_rate")) or "unavailable"}.',
        f'Entry price reference: {entry_price_display}, DCF fair value per share {fair_value_display}, margin of safety {margin_display}, status {entry.get("entry_status") or "unavailable"}.',
    ]
    if entry.get('shares_outstanding_is_simulated'):
        valuation_basis.append(SIMULATED_SHARE_LINE)
    risk_checklist = [
        'Export controls: validate policy exposure and revenue sensitivity.',
        'Supply chain: test capacity, shipment timing, and supplier concentration risk.',
        'Hyperscaler capex dependence: challenge customer-spending durability.',
        'DCF sensitivity: review discount rate, terminal growth, and projected FCF assumptions.',
    ]
    if entry.get('shares_outstanding_is_simulated'):
        risk_checklist.append('Simulated share count limitation: verify actual shares before relying on entry reference.')
    risk_team_questions = [
        'What evidence validates export-control exposure and mitigation?',
        'Are supply chain and hyperscaler capex risks reflected in the 3-statement and DCF assumptions?',
        'How sensitive is entry price reference to discount rate, terminal growth, and margin of safety?',
        'Can Risk Team accept simulated share count for demo review, or should it block escalation?',
    ]

    bodies = {
        'executive_summary': (
            f"Summary:\n{ticker}'s valuation package shows strong AI infrastructure demand and margin quality, but the case requires senior review because the DCF and entry reference are assumption-sensitive.\n\n"
            "Key points:\n"
            f"{_bullet_lines(['The 3-statement model supports revenue, margin, operating income, and free cash flow projections.', 'The DCF valuation estimates fair value using projected FCF, discount rate, and terminal value assumptions.', 'The Entry Price Reference applies a risk-adjusted margin of safety to DCF fair value per share.', 'Key risks include export controls, hyperscaler capex dependence, supply chain risk, and DCF sensitivity.', 'No trade action is routed; human review is required before escalation.'], max_items=5)}"
        ),
        'business_thesis_context': (
            "Summary:\nThe business thesis is packet-grounded and should be checked against valuation assumptions.\n\n"
            "Key points:\n"
            f"{_bullet_lines([core_thesis, 'Filing and news evidence support the context but do not replace analyst review.', 'Senior review should test whether thesis assumptions flow through the 3-statement model and DCF.'])}"
        ),
        'indicator_drivers': (
            "Summary:\nIndicator evidence is mixed: AI demand, data center growth, and margin quality are supportive, while hyperscaler concentration and export controls require review.\n\n"
            "Positive drivers:\n"
            f"{_bullet_lines(junior_positive_drivers or ['AI demand momentum', 'Data center revenue growth', 'Gross margin quality'], max_items=3)}\n\n"
            "Risks to challenge:\n"
            f"{_bullet_lines(junior_risk_drivers or ['Hyperscaler capex dependence', 'Export control risk'], max_items=2)}\n\n"
            "Review note:\nThese signals should be reviewed against the 3-statement model and DCF assumptions before escalation."
        ),
        'valuation_review': (
            "Summary:\nThe valuation package uses projected free cash flow from the 3-statement model and a DCF framework to estimate fair value.\n\n"
            "Key points:\n"
            f"{_bullet_lines(valuation_key_points, max_items=5)}"
        ),
        'entry_price_reference': (
            "Summary:\nThe valuation package provides an illustrative entry reference based on DCF fair value and a risk-adjusted margin of safety.\n\n"
            "Key points:\n"
            f"{_bullet_lines(_entry_price_key_points(entry, ticker), max_items=5)}\n\n"
            "Review note:\nSenior should confirm share count and DCF assumptions before using the reference in portfolio review."
        ),
        'key_risks_limitations': (
            "Summary:\nKey risks come from stress scenarios, valuation assumptions, and data quality limits.\n\n"
            "Key points:\n"
            f"{_bullet_lines(_dedupe_sources(readable_risk_labels + (three_limits[:1] or ['Depreciation, capex, and working capital are assumption-based']) + (dcf_limits[:2] or ['Discount rate is estimated from a short-term volatility proxy']) + (entry_limits[:1] or ['Share count should be confirmed before relying on entry reference'])), max_items=9)}"
        ),
        'open_questions': (
            "Summary:\nOpen questions should focus on assumptions, data gaps, and governance.\n\n"
            "Questions:\n"
            f"{_bullet_lines(['Are revenue, margin, and FCF projections defensible in the 3-statement model?', 'Are DCF discount rate and terminal growth assumptions reasonable?', 'Is simulated or unavailable share-count data resolved?', data_warnings_text], max_items=4)}"
        ),
        'review_summary': (
            "Summary:\nSenior review should focus on thesis evidence, valuation, entry reference, and risk gaps.\n\n"
            "Key points:\n"
            f"{_bullet_lines([HUMAN_REVIEW_LINE, 'Treat the legacy backend status as workflow context only.', 'Challenge whether 3-statement assumptions support the DCF.', entry_sentence], max_items=4)}"
        ),
        'thesis_support': (
            "Summary:\nThesis support should be checked against filing, news, and indicator evidence.\n\n"
            "Evidence to review:\n"
            f"{_bullet_lines([core_thesis, 'Positive drivers: ' + positive_drivers_text + '.', 'Risks to challenge: ' + risk_drivers_text + '.', 'Confirm thesis assumptions are reflected in valuation outputs.'], max_items=4)}"
        ),
        'valuation_challenge': (
            "Summary:\nValuation challenge should test whether fair value and entry reference are credible.\n\n"
            "Challenge points:\n"
            f"{_bullet_lines([dcf_sentence, '3-statement assumptions should be checked for revenue, margins, operating income, and FCF.', entry_sentence, 'Do not treat the entry reference as an official price target.'], max_items=4)}"
        ),
        'risk_assumption_gaps': (
            "Summary:\nRisk gaps are concentrated in valuation sensitivity, stress drivers, and entry-reference assumptions.\n\n"
            "Gaps to challenge:\n"
            f"{_bullet_lines([f'Stress drivers include {stress_drivers_text}.', 'DCF uses proxy/default assumptions where data is incomplete.', 'Entry reference depends on share-count quality and margin of safety.', 'Configured indicator weights should be separated from observed evidence.'], max_items=4)}"
        ),
        'follow_up_requests': (
            "Summary:\nFollow-up requests should make the memo decision-ready without approving action.\n\n"
            "Requests:\n"
            f"{_bullet_lines(['Verify simulated or unavailable fields.', 'Justify DCF discount rate, terminal growth, and FCF assumptions.', 'Explain how indicator risks affect valuation sensitivity.', 'Confirm PM review requirements before handoff.'], max_items=4)}"
        ),
        'handoff_notes_pm': (
            "Summary:\nPM handoff should state what is ready for review and what still needs validation.\n\n"
            "Notes:\n"
            f"{_bullet_lines([f'Final action requires PM review: {pm_required}.', 'No routing or execution has occurred.', 'Use 3-statement, DCF, and entry reference as review inputs only.'], max_items=3)}"
        ),
        'risk_review_summary': (
            "Summary:\nRisk handoff should review the Senior proposed stance, valuation basis, and risk checklist before PM escalation.\n\n"
            "Key points:\n"
            f"{_bullet_lines([f'Senior proposed stance: {senior_stance}; this is not approval or execution.', f'Valuation basis uses 3-statement model, DCF valuation, and entry price reference.', f'Risk-adjusted margin of safety is {margin_display}.', 'Human review is required before handoff or PM action.'], max_items=4)}"
        ),
        'stress_test_findings': (
            "Summary:\nRisk Team should connect stress findings to valuation sensitivity and entry-reference reliability.\n\n"
            "Findings:\n"
            f"{_bullet_lines([ticker_impact_text, risk_action_text, f'Main stress drivers include {stress_drivers_text}.'] + valuation_basis[:2], max_items=5)}"
        ),
        'escalation_triggers': (
            "Summary:\nEscalation should focus on concrete risk drivers and valuation fragility.\n\n"
            "Key risks:\n"
            f"{_bullet_lines(risk_checklist, max_items=5)}"
        ),
        'evidence_gaps': (
            "Summary:\nRisk Team questions should target unresolved evidence and valuation assumptions.\n\n"
            "Questions for Risk Team:\n"
            f"{_bullet_lines(risk_team_questions + [data_warnings_text], max_items=5)}"
        ),
        'required_human_review_items': (
            "Summary:\nHuman review is mandatory before Risk Team handoff is treated as complete.\n\n"
            "Review items:\n"
            f"{_bullet_lines([HUMAN_REVIEW_LINE, 'Review 3-statement assumptions, DCF sensitivity, and entry price reference.', 'Verify simulated share count limitation if present.', f'DCF limitations: {dcf_limits_text}.', f'Entry limitations: {entry_limits_text}.'], max_items=5)}"
        ),
        'pm_decision_context': (
            "Summary:\nPM context should support decision preparation without approving action.\n\n"
            "Key points:\n"
            f"{_bullet_lines([legacy_backend_status_text, 'Decision review should center on DCF, entry reference, and risk-adjusted margin of safety.', 'Final action requires PM review.' if pm_required else 'No automatic trade approval is implied.'], max_items=3)}"
        ),
        'valuation_entry_reference': (
            "Summary:\nValuation and entry reference are review inputs, not trading instructions.\n\n"
            "Key points:\n"
            f"{_bullet_lines(valuation_key_points + [entry_sentence], max_items=5)}"
        ),
        'confidence_limitations': (
            "Summary:\nConfidence should be assessed through evidence quality and valuation limitations.\n\n"
            "Limitations:\n"
            f"{_bullet_lines([indicator_confidence_text, f'DCF limitations include {dcf_limits_text}.', f'Entry-reference limitations include {entry_limits_text}.'], max_items=3)}"
        ),
        'key_gating_questions': (
            "Summary:\nGating questions should be answered before PM action.\n\n"
            "Questions:\n"
            f"{_bullet_lines(['Are 3-statement assumptions defensible?', 'Are DCF discount rate and terminal growth reasonable?', 'Are simulated or unavailable fields verified?', 'Does stress testing require escalation?'], max_items=4)}"
        ),
        'decision_record_placeholder': (
            "Summary:\nDecision record is a placeholder for human PM action.\n\n"
            "Record fields:\n"
            f"{_bullet_lines(['PM may approve, reject, or defer outside this draft workflow.', 'This draft does not approve or execute trades.', 'Record rationale after human review is complete.'], max_items=3)}"
        ),
    }
    return bodies.get(section_id, 'Section content unavailable from packet context.')


def _build_sections(context: dict[str, Any]) -> list[dict[str, Any]]:
    role = context['role']
    return [
        {
            'id': section_id,
            'title': title,
            'body': _sanitize_memo_body(_section_body(section_id, context)),
            'sources': _section_sources(context['ticker'], section_id),
            'editable': True,
        }
        for section_id, title in ROLE_SECTION_DEFS[role]
    ]


def _markdown_from_sections(sections: list[dict[str, Any]]) -> str:
    return '\n\n'.join(f"## {section['title']}\n{_sanitize_memo_body(str(section['body']))}" for section in sections)


def _structured_response(
    *,
    context: dict[str, Any],
    sections: list[dict[str, Any]],
    llm_result: dict[str, Any] | None = None,
    fallback: bool,
) -> dict[str, Any]:
    memo_markdown = _markdown_from_sections(sections)
    source_map = {section['id']: section['sources'] for section in sections}
    sources_used = _sources_used(source_map)
    result = {
        'ticker': context['ticker'],
        'company': context['company'],
        'role': context['role'],
        'memo_markdown': memo_markdown,
        'memo_sections': sections,
        'source_map': source_map,
        'human_review_required': True,
        'human_review_notes': _human_review_notes(context),
        'grounded': True,
        'mode': 'synthesis_memo',
        'answer': memo_markdown,
        'llm_used': bool(llm_result and llm_result.get('llm_used')),
        'fallback_used': fallback,
        'class_llm_used': bool(llm_result.get('class_llm_used')) if llm_result else False,
        'llm_model': (llm_result or {}).get('llm_model') or os.getenv('LLM_MODEL', 'claude-sonnet-4-6'),
        'llm_error_type': (llm_result or {}).get('llm_error_type'),
        'llm_error_message': (llm_result or {}).get('llm_error_message'),
        'llm_base_url_configured': (llm_result or {}).get('llm_base_url_configured'),
        'sources_used': sources_used,
        'citations': _citations(sources_used),
        'limitations': _limitations(context, fallback=fallback),
    }
    return result


def deterministic_synthesis_memo(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    question: str | None = None,
    role: str | None = None,
    llm_result: dict[str, Any] | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    context = build_synthesis_memo_context(
        packet=packet,
        ticker=ticker,
        company=company,
        question=question,
        role=role,
        packet_path=packet_path,
    )
    return _structured_response(
        context=context,
        sections=_build_sections(context),
        llm_result=llm_result,
        fallback=True,
    )


def _split_llm_markdown_by_sections(markdown: str, context: dict[str, Any]) -> list[dict[str, Any]]:
    deterministic_junior_sections = {
        'executive_summary',
        'indicator_drivers',
        'entry_price_reference',
        'key_risks_limitations',
    }
    sections = []
    for section_id, title in ROLE_SECTION_DEFS[context['role']]:
        pattern = rf'(?:^|\n)#+\s*{re.escape(title)}\s*\n(?P<body>.*?)(?=\n#+\s|\Z)'
        match = re.search(pattern, markdown, flags=re.IGNORECASE | re.DOTALL)
        body = match.group('body').strip() if match else _section_body(section_id, context)
        if context['role'] == 'junior_analyst' and section_id in deterministic_junior_sections:
            body = _section_body(section_id, context)
        sections.append({
            'id': section_id,
            'title': title,
            'body': _sanitize_memo_body(body),
            'sources': _section_sources(context['ticker'], section_id),
            'editable': True,
        })
    return sections


def run_synthesis_memo(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    question: str | None = None,
    role: str | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    context = build_synthesis_memo_context(
        packet=packet,
        ticker=ticker,
        company=company,
        question=question,
        role=role,
        packet_path=packet_path,
    )
    system_prompt, user_prompt = build_synthesis_memo_prompt(context)
    llm_result = run_grounded_chat_completion(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=SYNTHESIS_MEMO_TIMEOUT_SECONDS,
        max_tokens=SYNTHESIS_MEMO_MAX_TOKENS,
    )
    if llm_result.get('llm_used'):
        sections = _split_llm_markdown_by_sections(llm_result['answer'], context)
        return _structured_response(context=context, sections=sections, llm_result=llm_result, fallback=False)
    return deterministic_synthesis_memo(
        packet=packet,
        ticker=ticker,
        company=company,
        question=question,
        role=role,
        llm_result=llm_result,
        packet_path=packet_path,
    )
