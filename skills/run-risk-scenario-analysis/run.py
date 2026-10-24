from __future__ import annotations

import json
import os
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from tools.llm_client import run_grounded_chat_completion, sanitize_llm_error_message

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKET_PATH = REPO_ROOT / 'artifacts' / 'milestone04_demo' / 'recommendation_packet.json'

RISK_SCENARIO_TIMEOUT_SECONDS = 12.0
RISK_SCENARIO_MAX_TOKENS = 350

DEFAULT_LIMITATIONS = [
    'Risk scenario analysis is proposal review only.',
    'Does not approve, route, or execute trades.',
    'Entry reference is illustrative, not an official target price.',
]
FALLBACK_LIMITATION = 'LLM unavailable; deterministic risk scenario analysis used.'
FORBIDDEN_TERMS = (
    'model confidence',
    'outperform probability',
    'recommendation band',
    'aggregate indicator score',
    'regression',
    'rmse',
    'recommendation gate',
    'backend recommendation',
)
UNSUPPORTED_SPECIFIC_REPLACEMENTS = {
    'H100': 'advanced accelerator',
    'Blackwell': 'next-generation accelerator',
    'TSMC': 'key supplier',
    'China': 'restricted markets',
    'Asian markets': 'restricted markets',
}
HUMAN_LABELS = {
    'ai_capex_pullback': 'AI capex pullback',
    'export_control_tightening': 'Export control tightening',
    'rates_higher_for_longer': 'Rates higher for longer',
    'recession_consumer_slowdown': 'Recession / consumer slowdown',
    'valuation_multiple_compression': 'Valuation multiple compression',
    'supply_chain_disruption': 'Supply chain disruption',
    'hyperscaler_capex_dependence': 'Hyperscaler capex dependence',
    'dcf_sensitivity': 'DCF sensitivity',
    'simulated_share_count_limitation': 'Simulated share count limitation',
}
MARKET_CASE_LABELS = {
    'bear': 'Bear case',
    'base': 'Base case',
    'bull': 'Bull case',
    'custom': 'Custom case',
}


def _read_json_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _money(value: Any) -> str:
    try:
        numeric = float(value)
    except Exception:
        return 'unavailable'
    if abs(numeric) >= 1_000_000_000:
        return f'${numeric / 1_000_000_000:.1f}B'
    if abs(numeric) >= 1_000_000:
        return f'${numeric / 1_000_000:.1f}M'
    return f'${numeric:,.2f}'


def _format_pct(value: Any) -> str:
    try:
        numeric = float(value)
    except Exception:
        return 'unavailable'
    if abs(numeric) <= 1:
        numeric *= 100
    return f'{numeric:.1f}%'


def _haircut_value(value: Any, default: float) -> float:
    try:
        return abs(float(value))
    except Exception:
        return default


def _first_available(*values: Any) -> Any:
    for value in values:
        if value not in (None, ''):
            return value
    return None


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
    return text[:1].upper() + text[1:] if text else ''


def _normalize_market_case(value: Any) -> str:
    text = str(value or 'base').strip().lower().replace('_', ' ')
    text = re.sub(r'\s+', ' ', text)
    if text.startswith('bear'):
        return 'bear'
    if text.startswith('bull'):
        return 'bull'
    if text.startswith('custom'):
        return 'custom'
    return 'base'


def _scenario_name_for_case(market_case: Any) -> str:
    return MARKET_CASE_LABELS.get(_normalize_market_case(market_case), 'Base case')


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, ''):
        return []
    return [value]


def _clean_text(text: str) -> str:
    cleaned = text.replace('**', '')
    cleaned = re.sub(r'```(?:json)?', '', cleaned, flags=re.IGNORECASE)
    cleaned = '\n'.join(line for line in cleaned.splitlines() if line.strip() not in {'---', '----'})
    for raw, replacement in UNSUPPORTED_SPECIFIC_REPLACEMENTS.items():
        cleaned = re.sub(re.escape(raw), replacement, cleaned, flags=re.IGNORECASE)
    for term in FORBIDDEN_TERMS:
        cleaned = re.sub(re.escape(term), 'legacy metric', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\b[A-Z]{1,6}:([a-z0-9_]+)\b', lambda match: _human_label(match.group(1)), cleaned)
    cleaned = re.sub(r'\b[a-z]+(?:_[a-z0-9]+)+\b', lambda match: match.group(0).replace('_', ' '), cleaned)
    return re.sub(r'\n{3,}', '\n\n', cleaned).strip()


def _clean_value(value: Any) -> Any:
    if isinstance(value, str):
        return _clean_text(value)
    if isinstance(value, list):
        return [_clean_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _clean_value(item) for key, item in value.items()}
    return value


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    output = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            output.append(item)
    return output


def _packet_entry(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    return ((packet.get('entry_price_models') or {}).get('entry_prices') or {}).get(ticker, {}) or {}


def _packet_dcf(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    return ((packet.get('dcf_valuations') or {}).get('valuations') or {}).get(ticker, {}) or {}


def _packet_stress_drivers(packet: dict[str, Any]) -> list[str]:
    stress = packet.get('portfolio_stress_test') or {}
    return [_human_label(item) for item in (stress.get('main_risk_drivers') or [])]


def _build_inputs(
    *,
    packet: dict[str, Any],
    ticker: str,
    company: str | None,
    senior_proposal: dict[str, Any] | None,
    valuation_basis: dict[str, Any] | None,
    risk_factors: list[Any] | dict[str, Any] | None,
    scenario_settings: dict[str, Any] | None,
) -> dict[str, Any]:
    ticker = ticker.strip().upper()
    entry = _packet_entry(packet, ticker)
    dcf = _packet_dcf(packet, ticker)
    proposal = _as_dict(senior_proposal)
    valuation = _as_dict(valuation_basis)
    settings = _as_dict(scenario_settings)
    settings = dict(settings)
    settings['market_case'] = _normalize_market_case(settings.get('market_case'))

    factors = []
    if isinstance(risk_factors, dict):
        factors = [_human_label(key) for key, enabled in risk_factors.items() if enabled]
    else:
        factors = [_human_label(item) for item in _as_list(risk_factors)]
    factors = _dedupe(factors + _packet_stress_drivers(packet))
    if not factors:
        factors = [
            'Export control risk',
            'Hyperscaler capex dependence',
            'Supply chain risk',
            'DCF sensitivity',
            'Simulated share count limitation',
        ]

    fair_value = _first_available(
        valuation.get('dcf_fair_value_per_share'),
        valuation.get('fair_value_per_share'),
        entry.get('implied_fair_value_per_share'),
        entry.get('fair_value_per_share'),
        dcf.get('implied_share_price'),
    )
    current_price = _first_available(valuation.get('current_price'), entry.get('latest_market_price'), dcf.get('latest_market_price'))
    margin = _first_available(valuation.get('margin_of_safety'), proposal.get('margin_of_safety'), entry.get('margin_of_safety'))
    entry_reference = _first_available(
        proposal.get('entry_reference'),
        valuation.get('senior_adjusted_entry'),
        valuation.get('junior_baseline_entry'),
        entry.get('entry_price'),
        entry.get('entry_price_reference'),
    )

    return {
        'ticker': ticker,
        'company': company or ticker,
        'senior_proposal': {
            'proposed_stance': proposal.get('proposed_stance') or 'proposal under review',
            'entry_reference': entry_reference,
            'proposed_shares': proposal.get('proposed_shares'),
            'illustrative_notional': proposal.get('illustrative_notional'),
            'margin_of_safety': margin,
            'time_horizon': proposal.get('time_horizon') or 'not specified',
            'senior_rationale': proposal.get('senior_rationale') or '',
            'risk_limit_note': proposal.get('risk_limit_note') or '',
            'review_trigger': proposal.get('review_trigger') or 'PM review required before action',
        },
        'valuation_basis': {
            'dcf_fair_value_per_share': fair_value,
            'current_price': current_price,
            'discount_rate': _first_available(valuation.get('discount_rate'), dcf.get('discount_rate')),
            'terminal_growth': _first_available(valuation.get('terminal_growth'), dcf.get('terminal_growth_rate')),
            'fcf_haircut': valuation.get('fcf_haircut'),
            'junior_baseline_entry': _first_available(valuation.get('junior_baseline_entry'), entry.get('entry_price')),
            'senior_adjusted_entry': _first_available(valuation.get('senior_adjusted_entry'), proposal.get('entry_reference')),
        },
        'risk_factors': factors,
        'scenario_settings': settings,
        'entry_is_simulated': bool(entry.get('shares_outstanding_is_simulated')),
    }


def _scenario_settings(inputs: dict[str, Any], scenario_name: str) -> dict[str, Any]:
    settings = inputs['scenario_settings']
    if scenario_name == 'Bear case':
        return {
            'ai_capex_shock': settings.get('ai_capex_shock', 'severe' if settings.get('market_case') == 'bear' else 'slowdown'),
            'export_control_severity': settings.get('export_control_severity', 'high' if settings.get('market_case') == 'bear' else 'tightening'),
            'discount_rate_shock_bps': settings.get('discount_rate_shock_bps', 150),
            'fcf_haircut': _haircut_value(settings.get('fcf_haircut'), 0.2),
            'position_size_multiplier': settings.get('position_size_multiplier', 0.5),
        }
    if scenario_name == 'Bull case':
        return {
            'ai_capex_shock': settings.get('ai_capex_shock', 'none'),
            'export_control_severity': settings.get('export_control_severity', 'contained'),
            'discount_rate_shock_bps': settings.get('discount_rate_shock_bps', 0),
            'fcf_haircut': _haircut_value(settings.get('fcf_haircut'), 0.0),
            'position_size_multiplier': settings.get('position_size_multiplier', 1.0),
        }
    if scenario_name == 'Custom case':
        return {
            'ai_capex_shock': settings.get('ai_capex_shock', 'custom stress'),
            'export_control_severity': settings.get('export_control_severity', 'custom stress'),
            'discount_rate_shock_bps': settings.get('discount_rate_shock_bps', 100),
            'fcf_haircut': _haircut_value(settings.get('fcf_haircut'), 0.1),
            'position_size_multiplier': settings.get('position_size_multiplier', 1.0),
        }
    return {
        'ai_capex_shock': settings.get('ai_capex_shock', 'constructive demand'),
        'export_control_severity': settings.get('export_control_severity', 'monitored'),
        'discount_rate_shock_bps': settings.get('discount_rate_shock_bps', 50),
        'fcf_haircut': _haircut_value(settings.get('fcf_haircut'), 0.1),
        'position_size_multiplier': settings.get('position_size_multiplier', 0.75),
    }


def _historical_pattern_for(scenario_name: str) -> str:
    if scenario_name == 'Bear case':
        return (
            'Historical risk pattern: This resembles the risk pattern of platform leader multiple compression '
            'when investors begin treating a scarcity-growth infrastructure leader as a cyclical capex beneficiary.'
        )
    if scenario_name == 'Bull case':
        return (
            'Historical risk pattern: This resembles demand-durability phases after semiconductor cycle stress, '
            'used only as a risk-pattern reference and not as a forecast.'
        )
    return (
        'Historical risk pattern: This resembles high-expectation growth stocks during rising-rate periods, '
        'used only as a qualitative risk-pattern reference.'
    )


def _portfolio_impact(inputs: dict[str, Any], multiplier: Any) -> str:
    proposal = inputs['senior_proposal']
    shares = proposal.get('proposed_shares')
    notional = proposal.get('illustrative_notional')
    pieces = []
    if shares not in (None, ''):
        pieces.append(f'proposed shares {shares}')
    if notional not in (None, ''):
        pieces.append(f'illustrative notional {_money(notional)}')
    pieces.append(f'position size multiplier {multiplier}')
    return 'Proposal impact uses ' + ', '.join(pieces) + '; proposal only, not execution.'


def _required_controls_for(scenario_name: str) -> list[str]:
    if scenario_name == 'Bear case':
        return [
            'Reduce or stage proposed exposure until bear-case assumptions are reviewed.',
            'Escalate export-control and AI capex assumptions to PM before action.',
            'Refresh DCF fair value estimate and illustrative entry reference before any approval.',
        ]
    if scenario_name == 'Bull case':
        return [
            'Do not increase beyond approved proposal size without PM review.',
            'Keep entry discipline even if upside narrative improves.',
            'Confirm supply chain and margin evidence before escalation.',
        ]
    if scenario_name == 'Custom case':
        return [
            'Treat custom controls as PM-review inputs only.',
            'Refresh valuation assumptions using the selected custom shocks.',
            'Document why custom stress settings are appropriate before escalation.',
        ]
    return [
        'Proceed only as PM-reviewed proposal, not execution.',
        'Use staged sizing and predefined review triggers.',
        'Refresh valuation assumptions if discount rate, terminal growth, or FCF assumptions move.',
    ]


def _build_scenarios(inputs: dict[str, Any]) -> list[dict[str, Any]]:
    valuation = inputs['valuation_basis']
    proposal = inputs['senior_proposal']
    fair_value = _money(valuation.get('dcf_fair_value_per_share'))
    entry_reference = _money(proposal.get('entry_reference'))
    scenarios = []
    definitions = [
        (
            'Bear case',
            'AI capex slowdown, tighter export restrictions, a higher discount rate, and weaker FCF conversion reduce the reliability of the illustrative entry reference.',
            'Proposed accumulation becomes higher risk and should be reduced, staged, or blocked pending PM review.',
            'Escalate to PM with smaller sizing, refreshed valuation assumptions, and explicit stop/review triggers.',
        ),
        (
            'Base case',
            'Demand remains constructive, but DCF fair value and entry discipline remain assumption-sensitive.',
            'Proposal can proceed only with controls and no execution until PM approval.',
            'Allow PM review with staged sizing, entry discipline, and evidence refresh.',
        ),
        (
            'Bull case',
            'AI demand remains strong, margin quality holds, and policy risk is contained.',
            'Proposal has upside support, but fair value and entry reference remain review inputs.',
            'Support review for measured exposure while preserving approval gates.',
        ),
    ]
    if inputs['scenario_settings'].get('market_case') == 'custom':
        definitions.append((
            'Custom case',
            'Custom controls override the standard bear/base/bull assumptions and require a selected-control review.',
            'Proposal sizing should follow the custom position-size stress and remain proposal-only.',
            'Escalate to PM with the custom shock assumptions clearly documented.',
        ))
    for name, summary, position_read, judgment in definitions:
        settings = _scenario_settings(inputs, name)
        haircut = settings['fcf_haircut']
        historical_pattern = _historical_pattern_for(name)
        valuation_impact = (
            f'DCF fair value estimate starts from {fair_value}; illustrative entry reference is {entry_reference}; '
            f'FCF haircut assumption is {_format_pct(haircut)} and discount-rate shock is {settings["discount_rate_shock_bps"]} bps.'
        )
        scenarios.append({
            'scenario_name': name,
            'scenario_summary': f'{summary} {historical_pattern}',
            'impact_chain': [
                f'Shock: {settings["ai_capex_shock"]}; export controls {settings["export_control_severity"]}.',
                'Business driver impact: demand durability, customer concentration, addressable market, and shipment timing are re-tested.',
                'Financial model impact: revenue growth, margins, and free cash flow assumptions are haircut or validated.',
                'DCF / entry reference impact: fair value estimate and illustrative entry reference are re-checked against the new assumptions.',
                f'Proposed position impact: {position_read}',
                f'Risk control or escalation decision: {judgment}',
            ],
            'valuation_impact': valuation_impact,
            'portfolio_impact': _portfolio_impact(inputs, settings['position_size_multiplier']),
            'risk_team_judgment': judgment,
            'required_controls': _required_controls_for(name),
        })
    return scenarios


def _selected_scenario_name(settings: dict[str, Any]) -> str:
    return _scenario_name_for_case(settings.get('market_case'))


def _select_scenario(scenarios: list[dict[str, Any]], settings: dict[str, Any]) -> dict[str, Any]:
    selected_name = _selected_scenario_name(settings)
    for scenario in scenarios:
        if scenario.get('scenario_name') == selected_name:
            return scenario
    return scenarios[0] if scenarios else {
        'scenario_name': selected_name,
        'scenario_summary': 'Scenario content unavailable.',
        'impact_chain': [],
        'valuation_impact': '',
        'portfolio_impact': '',
        'risk_team_judgment': '',
        'required_controls': [],
    }


def build_risk_scenario_context(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    senior_proposal: dict[str, Any] | None = None,
    valuation_basis: dict[str, Any] | None = None,
    risk_factors: list[Any] | dict[str, Any] | None = None,
    scenario_settings: dict[str, Any] | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    packet = packet if packet is not None else _read_json_payload(packet_path)
    inputs = _build_inputs(
        packet=packet,
        ticker=ticker,
        company=company,
        senior_proposal=senior_proposal,
        valuation_basis=valuation_basis,
        risk_factors=risk_factors,
        scenario_settings=scenario_settings,
    )
    scenarios = _build_scenarios(inputs)
    proposal = inputs['senior_proposal']
    valuation = inputs['valuation_basis']
    controls = [
        'No trade routing or execution from this analysis.',
        'Require PM approval before any action.',
        'Stage exposure and cap size until bear-case assumptions are reviewed.',
        'Refresh DCF fair value estimate and illustrative entry reference if discount rate, terminal growth, or FCF assumptions change.',
    ]
    if inputs['entry_is_simulated']:
        controls.append('Confirm actual share count before relying on the entry reference.')
    questions = [
        f'Is proposed stance "{proposal["proposed_stance"]}" acceptable under the bear case?',
        f'Are proposed shares {proposal.get("proposed_shares") or "unavailable"} and illustrative notional {_money(proposal.get("illustrative_notional"))} within risk limits?',
        f'How should PM treat DCF fair value estimate {_money(valuation.get("dcf_fair_value_per_share"))} versus illustrative entry reference {_money(proposal.get("entry_reference"))}?',
        'Which risk factor would force deferral or a smaller proposal?',
    ]
    return {
        **inputs,
        'overall_risk_view': 'Risk Team view: scenario analysis supports PM review only; proposal remains assumption-sensitive and not executable from this workflow.',
        'scenario_analysis': scenarios,
        'selected_scenario_name': _selected_scenario_name(inputs['scenario_settings']),
        'risk_controls': controls,
        'questions_for_pm': questions,
        'sources_used': [
            'senior_action_proposal',
            f'three_statement_models.models.{inputs["ticker"]}',
            f'dcf_valuations.valuations.{inputs["ticker"]}',
            f'entry_price_models.entry_prices.{inputs["ticker"]}',
            'portfolio_stress_test',
            'risk_factors',
        ],
    }


def _deterministic_handoff(context: dict[str, Any]) -> str:
    proposal = context['senior_proposal']
    valuation = context['valuation_basis']
    factors = ', '.join(context['risk_factors'][:5])
    return _clean_text(
        f'Risk Team PM handoff for {context["ticker"]}: senior proposed stance is {proposal["proposed_stance"]}. '
        f'The review uses DCF fair value estimate {_money(valuation.get("dcf_fair_value_per_share"))}, '
        f'illustrative entry reference {_money(proposal.get("entry_reference"))}, proposed shares {proposal.get("proposed_shares") or "unavailable"}, '
        f'and illustrative notional {_money(proposal.get("illustrative_notional"))}. '
        f'Primary risks are {factors}. This is proposal review only, not execution.'
    )


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    try:
        payload = json.loads(cleaned)
        return payload if isinstance(payload, dict) else {}
    except Exception:
        pass
    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start >= 0 and end > start:
        try:
            payload = json.loads(cleaned[start:end + 1])
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}
    return {}


def _merge_scenarios(base: list[dict[str, Any]], llm_items: Any) -> list[dict[str, Any]]:
    if not isinstance(llm_items, list):
        return base
    by_name = {str(item.get('scenario_name')): dict(item) for item in base}
    for item in llm_items:
        if not isinstance(item, dict):
            continue
        name = str(item.get('scenario_name') or '').strip()
        if name not in by_name:
            continue
        merged = dict(by_name[name])
        for key in ('scenario_summary', 'impact_chain', 'valuation_impact', 'portfolio_impact', 'risk_team_judgment', 'required_controls'):
            value = item.get(key)
            if value not in (None, '', []):
                merged[key] = _clean_value(value)
        by_name[name] = merged
    return [by_name.get(str(item.get('scenario_name')), item) for item in base]


def _sentences(text: str) -> list[str]:
    cleaned = _clean_text(text)
    parts = re.split(r'(?<=[.!?])\s+', cleaned)
    return [part.strip() for part in parts if part.strip()]


def _sentence_matching(sentences: list[str], needles: tuple[str, ...], fallback: str) -> str:
    for sentence in sentences:
        lowered = sentence.lower()
        if any(needle in lowered for needle in needles):
            return sentence
    return fallback


def _sentence_matching_distinct(
    sentences: list[str],
    needles: tuple[str, ...],
    fallback: str,
    existing: list[str],
) -> str:
    for sentence in sentences:
        lowered = sentence.lower()
        if any(needle in lowered for needle in needles) and not any(_too_similar(sentence, item) for item in existing):
            return sentence
    return fallback


def _normalize_for_similarity(value: Any) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower())).strip()


def _too_similar(left: Any, right: Any) -> bool:
    left_norm = _normalize_for_similarity(left)
    right_norm = _normalize_for_similarity(right)
    if not left_norm or not right_norm:
        return False
    if left_norm == right_norm:
        return True
    shorter, longer = sorted((left_norm, right_norm), key=len)
    if len(shorter) > 80 and shorter in longer:
        return True
    return SequenceMatcher(None, left_norm, right_norm).ratio() >= 0.86


def _shorten_sentence(value: Any, max_chars: int = 220) -> str:
    text = _clean_text(str(value or ''))
    if not text:
        return ''
    first = _sentences(text)
    text = first[0] if first else text
    if len(text) > max_chars:
        text = text[:max_chars - 3].rstrip() + '...'
    return text


def _distinct_or_fallback(value: Any, fallback: str, existing: list[str], selected_name: str) -> str:
    cleaned = _case_safe_text(value, selected_name, fallback)
    if any(_too_similar(cleaned, item) for item in existing):
        return _clean_text(fallback)
    return cleaned


def _dedupe_impact_chain(items: Any, selected_name: str, fallback: list[Any], compare_against: list[str]) -> list[str]:
    source = items if isinstance(items, list) else []
    output: list[str] = []
    for item in source:
        text = _shorten_sentence(item, max_chars=210)
        if not text or _has_wrong_case_language(text, selected_name):
            continue
        if any(_too_similar(text, existing) for existing in output + compare_against):
            continue
        output.append(text)
    if len(output) < 4:
        output = [_shorten_sentence(item, max_chars=210) for item in fallback if _shorten_sentence(item, max_chars=210)]
    return output


def _sanitize_selected_fields(selected: dict[str, Any], base_selected: dict[str, Any], selected_name: str) -> dict[str, Any]:
    summary = _case_safe_text(selected.get('scenario_summary'), selected_name, base_selected.get('scenario_summary') or '')
    valuation = _distinct_or_fallback(
        selected.get('valuation_impact'),
        base_selected.get('valuation_impact') or '',
        [summary],
        selected_name,
    )
    portfolio = _distinct_or_fallback(
        selected.get('portfolio_impact'),
        base_selected.get('portfolio_impact') or '',
        [summary, valuation],
        selected_name,
    )
    judgment = _distinct_or_fallback(
        selected.get('risk_team_judgment'),
        base_selected.get('risk_team_judgment') or '',
        [summary, valuation, portfolio],
        selected_name,
    )
    impact_chain = _dedupe_impact_chain(
        selected.get('impact_chain'),
        selected_name,
        base_selected.get('impact_chain') or [],
        [summary, valuation, portfolio, judgment],
    )
    return {
        **selected,
        'scenario_name': selected_name,
        'scenario_summary': summary,
        'impact_chain': impact_chain,
        'valuation_impact': valuation,
        'portfolio_impact': portfolio,
        'risk_team_judgment': judgment,
    }


def _has_wrong_case_language(text: Any, selected_name: str) -> bool:
    lowered = str(text or '').lower()
    if selected_name == 'Bear case':
        return 'under the base case' in lowered or 'under a base case' in lowered or 'bull case' in lowered
    if selected_name == 'Bull case':
        return 'under the bear case' in lowered or 'under a bear case' in lowered or 'bear case' in lowered
    if selected_name == 'Base case':
        return 'under the bear case' in lowered or 'under a bear case' in lowered or 'bull case' in lowered
    if selected_name == 'Custom case':
        return 'under the base case' in lowered or 'under the bear case' in lowered or 'under the bull case' in lowered
    return False


def _case_safe_text(value: Any, selected_name: str, fallback: str) -> str:
    cleaned = _clean_text(str(value or ''))
    if not cleaned or _has_wrong_case_language(cleaned, selected_name):
        return _clean_text(fallback)
    return cleaned


def _case_safe_list(items: Any, selected_name: str, fallback: list[Any]) -> list[Any]:
    if not isinstance(items, list):
        return _clean_value(fallback)
    cleaned = []
    for item in items:
        text = _clean_text(str(item))
        if text and not _has_wrong_case_language(text, selected_name):
            cleaned.append(text)
    return cleaned or _clean_value(fallback)


def _payload_from_unstructured_answer(answer: str, context: dict[str, Any]) -> dict[str, Any]:
    selected = _select_scenario(context['scenario_analysis'], context['scenario_settings'])
    selected_name = selected.get('scenario_name') or _selected_scenario_name(context['scenario_settings'])
    sentences = _sentences(answer)
    summary = ' '.join(sentences[:2]) if sentences else _clean_text(answer)
    if len(summary) > 650:
        summary = summary[:647].rstrip() + '...'
    summary = _case_safe_text(summary, selected_name, selected.get('scenario_summary') or '')
    valuation_impact = _sentence_matching(
        sentences,
        ('dcf', 'fair value', 'fcf', 'valuation', 'entry reference'),
        selected.get('valuation_impact') or '',
    )
    valuation_impact = _distinct_or_fallback(valuation_impact, selected.get('valuation_impact') or '', [summary], selected_name)
    portfolio_impact = _sentence_matching_distinct(
        sentences,
        ('notional', 'shares', 'position', 'exposure', 'portfolio'),
        selected.get('portfolio_impact') or '',
        [summary, valuation_impact],
    )
    portfolio_impact = _distinct_or_fallback(portfolio_impact, selected.get('portfolio_impact') or '', [summary, valuation_impact], selected_name)
    judgment = _sentence_matching_distinct(
        sentences,
        ('escalat', 'control', 'pm', 'defer', 'stage', 'risk team'),
        selected.get('risk_team_judgment') or '',
        [summary, valuation_impact, portfolio_impact],
    )
    judgment = _distinct_or_fallback(judgment, selected.get('risk_team_judgment') or '', [summary, valuation_impact, portfolio_impact], selected_name)
    impact_chain = list(selected.get('impact_chain') or [])[:3]
    second_order = _sentence_matching_distinct(
        sentences,
        ('second-order', 'before', 'delay', 'air pocket', 'compression', 'causal', 'chain'),
        '',
        [summary, valuation_impact, portfolio_impact, judgment],
    )
    second_order = _shorten_sentence(second_order, max_chars=170)
    if second_order:
        impact_chain.append(f'Second-order effect: {second_order}')
    impact_chain = _dedupe_impact_chain(
        impact_chain,
        selected_name,
        selected.get('impact_chain') or [],
        [summary, valuation_impact, portfolio_impact, judgment],
    )
    return {
        'overall_risk_view': summary or context['overall_risk_view'],
        'selected_scenario': {
            'scenario_name': selected_name,
            'scenario_summary': summary or selected.get('scenario_summary'),
            'impact_chain': impact_chain,
            'valuation_impact': valuation_impact,
            'portfolio_impact': portfolio_impact,
            'risk_team_judgment': judgment,
            'required_controls': selected.get('required_controls') or [],
        },
        'risk_controls': context['risk_controls'],
        'questions_for_pm': context['questions_for_pm'],
        'pm_handoff_summary': _clean_text(answer) or _deterministic_handoff(context),
    }


def _response_from_context(
    *,
    context: dict[str, Any],
    question: str | None,
    llm_result: dict[str, Any] | None,
    fallback: bool,
    llm_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = llm_payload or {}
    scenario_analysis = _merge_scenarios(context['scenario_analysis'], payload.get('scenario_analysis'))
    selected_payload = payload.get('selected_scenario')
    if isinstance(selected_payload, dict):
        selected_payload = dict(selected_payload)
        selected_payload['scenario_name'] = _selected_scenario_name(context['scenario_settings'])
        scenario_analysis = _merge_scenarios(scenario_analysis, [selected_payload])
    risk_controls = _clean_value(payload.get('risk_controls')) if payload.get('risk_controls') else context['risk_controls']
    questions_for_pm = _clean_value(payload.get('questions_for_pm')) if payload.get('questions_for_pm') else context['questions_for_pm']
    selected_name = _selected_scenario_name(context['scenario_settings'])
    overall_risk_view = _case_safe_text(payload.get('overall_risk_view'), selected_name, context['overall_risk_view'])
    pm_handoff_summary = _case_safe_text(payload.get('pm_handoff_summary'), selected_name, _deterministic_handoff(context))
    selected = _select_scenario(scenario_analysis, context['scenario_settings'])
    base_selected = _select_scenario(context['scenario_analysis'], context['scenario_settings'])
    selected = _sanitize_selected_fields(selected, base_selected, selected_name)
    scenario_analysis = [
        selected if item.get('scenario_name') == selected_name else item
        for item in scenario_analysis
    ]
    return {
        'ticker': context['ticker'],
        'company': context['company'],
        'question': question or '',
        'mode': 'risk_scenario_analysis',
        'overall_risk_view': overall_risk_view,
        'scenario_analysis': scenario_analysis,
        'selected_scenario': selected,
        'scenario_summary': selected.get('scenario_summary') or '',
        'impact_chain': selected.get('impact_chain') or [],
        'valuation_impact': selected.get('valuation_impact') or '',
        'portfolio_impact': selected.get('portfolio_impact') or '',
        'risk_team_judgment': selected.get('risk_team_judgment') or '',
        'risk_controls': risk_controls,
        'questions_for_pm': questions_for_pm,
        'pm_handoff_summary': pm_handoff_summary,
        'answer': pm_handoff_summary,
        'limitations': _limitations(context, fallback=fallback),
        'human_review_required': True,
        'grounded': True,
        'llm_used': bool(llm_result and llm_result.get('llm_used') and not fallback),
        'fallback_used': fallback,
        'class_llm_used': bool(llm_result and llm_result.get('class_llm_used')),
        'llm_model': (llm_result or {}).get('llm_model') or os.getenv('LLM_MODEL', 'claude-sonnet-4-6'),
        'llm_error_type': (llm_result or {}).get('llm_error_type'),
        'llm_error_message': sanitize_llm_error_message((llm_result or {}).get('llm_error_message')),
        'llm_base_url_configured': (llm_result or {}).get('llm_base_url_configured'),
        'sources_used': context['sources_used'],
    }


def _limitations(context: dict[str, Any], *, fallback: bool = False) -> list[str]:
    limitations = list(DEFAULT_LIMITATIONS)
    if context.get('entry_is_simulated'):
        limitations.append('Share count is simulated; entry reference remains illustrative until confirmed.')
    if fallback:
        limitations.append(FALLBACK_LIMITATION)
    return _dedupe(limitations)


def deterministic_risk_scenario_analysis(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    question: str | None = None,
    senior_proposal: dict[str, Any] | None = None,
    valuation_basis: dict[str, Any] | None = None,
    risk_factors: list[Any] | dict[str, Any] | None = None,
    scenario_settings: dict[str, Any] | None = None,
    llm_result: dict[str, Any] | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    context = build_risk_scenario_context(
        packet=packet,
        ticker=ticker,
        company=company,
        senior_proposal=senior_proposal,
        valuation_basis=valuation_basis,
        risk_factors=risk_factors,
        scenario_settings=scenario_settings,
        packet_path=packet_path,
    )
    return _response_from_context(context=context, question=question, llm_result=llm_result, fallback=True)


def build_risk_scenario_prompt(context: dict[str, Any], question: str | None = None) -> tuple[str, str]:
    proposal = context['senior_proposal']
    valuation = context['valuation_basis']
    selected = _select_scenario(context['scenario_analysis'], context['scenario_settings'])
    settings = _scenario_settings(context, selected.get('scenario_name') or context['selected_scenario_name'])
    market_case = _normalize_market_case(context['scenario_settings'].get('market_case'))
    facts = {
        'ticker': context['ticker'],
        'company': context['company'],
        'selected_scenario_name': selected.get('scenario_name'),
        'selected_scenario_scaffold': selected,
        'proposed_stance': proposal.get('proposed_stance'),
        'entry_reference': proposal.get('entry_reference'),
        'proposed_shares': proposal.get('proposed_shares'),
        'illustrative_notional': proposal.get('illustrative_notional'),
        'margin_of_safety': proposal.get('margin_of_safety'),
        'time_horizon': proposal.get('time_horizon'),
        'dcf_fair_value_per_share': valuation.get('dcf_fair_value_per_share'),
        'current_price': valuation.get('current_price'),
        'discount_rate': valuation.get('discount_rate'),
        'terminal_growth': valuation.get('terminal_growth'),
        'fcf_haircut': valuation.get('fcf_haircut'),
        'risk_factors': context['risk_factors'],
        'market_case': market_case,
        'selected_stress_settings': settings,
    }
    system_prompt = (
        'You are a Risk Team scenario-analysis drafting assistant. '
        'Use only the provided structured facts. Do not invent evidence, approvals, prices, or execution. '
        'Do not use legacy ML evidence: model confidence, outperform probability, recommendation band, aggregate indicator score, regression, RMSE, recommendation gate, or backend recommendation. '
        'Do not call an entry reference a buy target or official target price. Do not say DCF predicts stock price. '
        'Use fair value estimate, illustrative entry reference, proposal only, and not execution. '
        'Do not mention product names, supplier names, customer names, or geographies unless they appear in the provided facts; use generic terms instead. '
        'Do not merely restate the scenario. Explain the causal chain from market shock to revenue, FCF, DCF fair value, entry reference validity, proposed notional exposure, and escalation controls. '
        'Add evidence-based but non-obvious second-order effects and avoid generic finance language. '
        'Return distinct content for each analytical purpose. Do not repeat the scenario summary in valuation impact, portfolio impact, or risk judgment. '
        'Historical analogies are allowed only as qualitative risk-pattern references. Do not invent exact historical stock returns and do not claim the company will repeat a historical case. '
        'No markdown tables, no bold markdown. Keep the answer compact.'
    )
    user_prompt = (
        'Mode: risk_scenario_analysis\n'
        f'Research question: {question or "not provided"}\n'
        'Selected scenario controls:\n'
        f'- Market case: {market_case}\n'
        f'- AI capex shock: {settings["ai_capex_shock"]}\n'
        f'- Export control severity: {settings["export_control_severity"]}\n'
        f'- Discount rate shock: {settings["discount_rate_shock_bps"]} bps\n'
        f'- FCF haircut: {settings["fcf_haircut"]}\n'
        f'- Position size stress: {settings["position_size_multiplier"]}x\n\n'
        'Instruction: Write the risk analysis only for the selected scenario controls. '
        'Do not default to base case unless market_case is base. '
        'Keep each analytical idea distinct: summary explains the scenario, valuation text explains FCF/DCF/entry mechanics, portfolio text explains shares/notional/sizing, and judgment explains controls. '
        'Do not repeat the scenario summary in valuation impact or risk judgment. '
        'Include a brief historical risk pattern sentence using qualitative analogy only.\n'
        'Write one compact Risk Team paragraph, 120-180 words. '
        'Explain the selected scenario causal chain from shock to revenue/FCF, DCF fair value estimate, illustrative entry reference validity, proposed notional exposure, and escalation controls. '
        'Include at least one second-order effect. Do not return JSON.\n'
        f'{json.dumps(facts, ensure_ascii=True, separators=(",", ":"))}'
    )
    return system_prompt, user_prompt


def run_risk_scenario_analysis(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    question: str | None = None,
    senior_proposal: dict[str, Any] | None = None,
    valuation_basis: dict[str, Any] | None = None,
    risk_factors: list[Any] | dict[str, Any] | None = None,
    scenario_settings: dict[str, Any] | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    context = build_risk_scenario_context(
        packet=packet,
        ticker=ticker,
        company=company,
        senior_proposal=senior_proposal,
        valuation_basis=valuation_basis,
        risk_factors=risk_factors,
        scenario_settings=scenario_settings,
        packet_path=packet_path,
    )
    system_prompt, user_prompt = build_risk_scenario_prompt(context, question=question)
    llm_result = run_grounded_chat_completion(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=RISK_SCENARIO_TIMEOUT_SECONDS,
        max_tokens=RISK_SCENARIO_MAX_TOKENS,
    )
    if not llm_result.get('llm_used'):
        return deterministic_risk_scenario_analysis(
            packet=packet,
            ticker=ticker,
            company=company,
            question=question,
            senior_proposal=senior_proposal,
            valuation_basis=valuation_basis,
            risk_factors=risk_factors,
            scenario_settings=scenario_settings,
            llm_result=llm_result,
            packet_path=packet_path,
        )

    llm_payload = _extract_json_object(llm_result.get('answer') or '')
    if not llm_payload:
        llm_payload = _payload_from_unstructured_answer(llm_result.get('answer') or '', context)
    return _response_from_context(
        context=context,
        question=question,
        llm_result=llm_result,
        fallback=False,
        llm_payload=llm_payload,
    )
