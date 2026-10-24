from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from tools.llm_client import run_grounded_chat_completion, sanitize_llm_error_message

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKET_PATH = REPO_ROOT / 'artifacts' / 'milestone04_demo' / 'recommendation_packet.json'

PM_DEBATE_TIMEOUT_SECONDS = 18.0
PM_DEBATE_MAX_TOKENS = 900
PM_TURN_TIMEOUT_SECONDS = 14.0
PM_TURN_MAX_TOKENS = 360

AGENT_ROLES = [
    'Aggressive Growth Analyst',
    'Conservative Risk Officer',
    'Valuation Skeptic',
    'Portfolio Construction PM',
    'Policy / Governance Challenger',
]

FORBIDDEN_TERMS = (
    'model confidence',
    'outperform probability',
    'aggregate indicator score',
    'recommendation band',
    'regression',
    'rmse',
    'backend recommendation',
    'recommendation gate',
)

DEFAULT_LIMITATIONS = [
    'PM decision debate is governance support only.',
    'Does not approve, route, or execute trades.',
    'Entry reference is illustrative, not an official target price.',
]
FALLBACK_LIMITATION = 'LLM unavailable; deterministic PM decision debate used.'


def _read_json_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, ''):
        return []
    return [value]


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
    text = re.sub(r'\b[A-Z]{1,6}:([a-z0-9_]+)\b', lambda match: _human_label(match.group(1)), text)
    text = re.sub(r'\b[a-z]+(?:_[a-z0-9]+)+\b', lambda match: match.group(0).replace('_', ' '), text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:1].upper() + text[1:] if text else ''


def _clean_text(value: Any) -> str:
    text = str(value or '').replace('**', '')
    text = re.sub(r'```(?:json)?', '', text, flags=re.IGNORECASE)
    text = '\n'.join(line for line in text.splitlines() if line.strip() not in {'---', '----'})
    for term in FORBIDDEN_TERMS:
        text = re.sub(re.escape(term), 'legacy metric', text, flags=re.IGNORECASE)
    replacements = {
        'approved trade': 'reviewed proposal',
        'trade approved': 'proposal reviewed',
        'approve the trade': 'record the local decision',
        'execute the trade': 'record a local decision',
        'route the trade': 'escalate for PM review',
        'buy target': 'illustrative entry reference',
        'price target': 'fair value reference',
        'DCF predicts': 'DCF estimates',
    }
    for raw, replacement in replacements.items():
        text = re.sub(re.escape(raw), replacement, text, flags=re.IGNORECASE)
    text = re.sub(r'\|[^|\n]+\|', '', text)
    text = re.sub(r'\b[A-Z]{1,6}:([a-z0-9_]+)\b', lambda match: _human_label(match.group(1)), text)
    text = re.sub(r'\b[a-z]+(?:_[a-z0-9]+)+\b', lambda match: match.group(0).replace('_', ' '), text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return re.sub(r'\s+', ' ', text).strip()


def _clean_value(value: Any) -> Any:
    if isinstance(value, str):
        return _clean_text(value)
    if isinstance(value, list):
        return [_clean_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _clean_value(item) for key, item in value.items()}
    return value


def _normalize_agent_role(value: Any) -> str:
    text = _clean_text(value)
    for role in AGENT_ROLES:
        if text.lower() == role.lower():
            return role
    return 'auto'


def _normalize_debate_action(value: Any) -> str:
    return 'turn' if str(value or '').strip().lower() == 'turn' else 'initial'


def _compact_history(items: Any, limit: int = 6) -> list[dict[str, Any]]:
    output = []
    for item in _as_list(items)[-limit:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get('role') or '').strip().lower()
        if role not in {'pm', 'agent', 'system'}:
            role = 'system'
        output.append({
            'role': role,
            'agent_role': _clean_text(item.get('agent_role') or ''),
            'content': _clean_text(item.get('content') or '')[:500],
            'timestamp': _clean_text(item.get('timestamp') or ''),
        })
    return output


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    output = []
    for item in items:
        cleaned = _clean_text(item)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


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


def _packet_entry(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    return ((packet.get('entry_price_models') or {}).get('entry_prices') or {}).get(ticker, {}) or {}


def _packet_dcf(packet: dict[str, Any], ticker: str) -> dict[str, Any]:
    return ((packet.get('dcf_valuations') or {}).get('valuations') or {}).get(ticker, {}) or {}


def _build_context(
    *,
    packet: dict[str, Any],
    ticker: str,
    company: str | None,
    pm_context: dict[str, Any] | None,
    senior_proposal: dict[str, Any] | None,
    valuation_basis: dict[str, Any] | None,
    risk_team_analysis: dict[str, Any] | None,
    decision_candidate: str | dict[str, Any] | None,
    pm_answer: str | None,
    debate_action: str | None = None,
    pm_message: str | None = None,
    chat_history: list[dict[str, Any]] | None = None,
    active_agent: str | None = None,
) -> dict[str, Any]:
    ticker = ticker.strip().upper()
    pm = _as_dict(pm_context)
    proposal = _as_dict(senior_proposal)
    valuation = _as_dict(valuation_basis)
    risk = _as_dict(risk_team_analysis)
    entry = _packet_entry(packet, ticker)
    dcf = _packet_dcf(packet, ticker)
    fair_value = _first_available(
        valuation.get('dcf_fair_value_per_share'),
        valuation.get('fair_value_per_share'),
        entry.get('implied_fair_value_per_share'),
        dcf.get('implied_share_price'),
    )
    entry_reference = _first_available(
        proposal.get('entry_reference'),
        valuation.get('senior_adjusted_entry'),
        valuation.get('junior_baseline_entry'),
        entry.get('entry_price'),
        entry.get('entry_price_reference'),
    )
    candidate = decision_candidate
    if isinstance(candidate, dict):
        candidate = candidate.get('decision') or candidate.get('candidate') or candidate.get('action')
    return {
        'ticker': ticker,
        'company': company or ticker,
        'pm_context': {
            'portfolio_composition': pm.get('portfolio_composition') or 'not provided',
            'current_position_weight': pm.get('current_position_weight'),
            'max_single_name_weight': pm.get('max_single_name_weight'),
            'cash_weight': pm.get('cash_weight'),
            'technology_exposure': pm.get('technology_exposure'),
        },
        'senior_proposal': {
            'proposed_stance': proposal.get('proposed_stance') or 'proposal under review',
            'entry_reference': entry_reference,
            'proposed_shares': proposal.get('proposed_shares'),
            'illustrative_notional': proposal.get('illustrative_notional'),
            'margin_of_safety': _first_available(proposal.get('margin_of_safety'), entry.get('margin_of_safety')),
            'time_horizon': proposal.get('time_horizon') or 'not specified',
            'senior_rationale': proposal.get('senior_rationale') or '',
            'risk_limit_note': proposal.get('risk_limit_note') or '',
            'review_trigger': proposal.get('review_trigger') or 'PM review required before action',
        },
        'valuation_basis': {
            'dcf_fair_value_per_share': fair_value,
            'current_price': _first_available(valuation.get('current_price'), entry.get('latest_market_price'), dcf.get('latest_market_price')),
            'junior_baseline_entry': _first_available(valuation.get('junior_baseline_entry'), entry.get('entry_price')),
            'senior_adjusted_entry': _first_available(valuation.get('senior_adjusted_entry'), proposal.get('entry_reference')),
            'discount_rate': _first_available(valuation.get('discount_rate'), dcf.get('discount_rate')),
            'terminal_growth': _first_available(valuation.get('terminal_growth'), dcf.get('terminal_growth_rate')),
            'fcf_haircut': valuation.get('fcf_haircut'),
        },
        'risk_team_analysis': {
            'selected_scenario': risk.get('selected_scenario') or {},
            'scenario_summary': risk.get('scenario_summary') or '',
            'impact_chain': _as_list(risk.get('impact_chain')),
            'valuation_impact': risk.get('valuation_impact') or '',
            'portfolio_impact': risk.get('portfolio_impact') or '',
            'risk_team_judgment': risk.get('risk_team_judgment') or '',
            'risk_controls': _as_list(risk.get('risk_controls')),
            'questions_for_pm': _as_list(risk.get('questions_for_pm')),
        },
        'decision_candidate': _clean_text(candidate or 'defer'),
        'pm_answer': _clean_text(pm_answer or ''),
        'debate_action': _normalize_debate_action(debate_action),
        'pm_message': _clean_text(pm_message or pm_answer or ''),
        'chat_history': _compact_history(chat_history),
        'active_agent': _normalize_agent_role(active_agent or 'auto'),
        'entry_is_simulated': bool(entry.get('shares_outstanding_is_simulated')),
        'sources_used': [
            'pm_context',
            'senior_action_proposal',
            f'dcf_valuations.valuations.{ticker}',
            f'entry_price_models.entry_prices.{ticker}',
            'risk_team_analysis',
            'pm_answer',
            'chat_history',
        ],
    }


def _agent(
    role: str,
    stance: str,
    challenge: str,
    evidence_used: list[str],
    pm_must_answer: str,
    severity: str,
) -> dict[str, Any]:
    return {
        'role': role,
        'stance': _clean_text(stance),
        'challenge': _clean_text(challenge),
        'evidence_used': [_clean_text(item) for item in evidence_used],
        'pm_must_answer': _clean_text(pm_must_answer),
        'severity': severity,
    }


def _deterministic_agents(context: dict[str, Any]) -> list[dict[str, Any]]:
    proposal = context['senior_proposal']
    valuation = context['valuation_basis']
    risk = context['risk_team_analysis']
    pm = context['pm_context']
    fair_value = _money(valuation.get('dcf_fair_value_per_share'))
    entry = _money(proposal.get('entry_reference'))
    notional = _money(proposal.get('illustrative_notional'))
    return [
        _agent(
            'Aggressive Growth Analyst',
            'Challenge whether the PM is over-penalizing upside.',
            f'If the long-term thesis is intact, deferring could leave the portfolio underexposed to upside while the entry reference is {entry}.',
            ['Senior rationale', 'DCF fair value estimate', 'Entry reference'],
            'What evidence would justify waiting instead of staging a smaller proposal now?',
            'medium',
        ),
        _agent(
            'Conservative Risk Officer',
            'Challenge downside, stress-case survivability, and controls.',
            f'Risk Team judgment is "{risk.get("risk_team_judgment") or "not provided"}"; proposed notional {notional} should not advance without explicit loss and review triggers.',
            ['Risk Team judgment', 'Risk controls', 'Scenario impact chain'],
            'Which scenario or trigger forces the PM to reduce size, defer, or stop escalation?',
            'high',
        ),
        _agent(
            'Valuation Skeptic',
            'Challenge whether valuation support is too assumption-sensitive.',
            f'DCF fair value estimate is {fair_value}, but discount rate, terminal growth, FCF haircut, and any simulated share count can make the entry reference fragile.',
            ['DCF valuation basis', 'Entry price reference', 'Margin of safety'],
            'Which DCF assumption would break the entry reference first?',
            'high',
        ),
        _agent(
            'Portfolio Construction PM',
            'Challenge concentration and opportunity cost inside the whole book.',
            f'Current weight is {_format_pct(pm.get("current_position_weight"))}, max single-name weight is {_format_pct(pm.get("max_single_name_weight"))}, and technology exposure is {_format_pct(pm.get("technology_exposure"))}.',
            ['PM portfolio context', 'Proposed shares', 'Illustrative notional'],
            'How does this proposal change concentration, cash flexibility, and defensive exposure?',
            'medium',
        ),
        _agent(
            'Policy / Governance Challenger',
            'Challenge approval gates and missing verification.',
            'The proposal remains local decision support only; governance requires PM review, documented assumptions, and reversal triggers before any action is considered.',
            ['Review trigger', 'Risk controls', 'Human review requirement'],
            'What evidence is still unverified, and who owns the next validation step?',
            'high',
        ),
    ]


def _choose_agent(context: dict[str, Any]) -> str:
    requested = context.get('active_agent') or 'auto'
    if requested in AGENT_ROLES:
        return requested
    message = f'{context.get("pm_message") or ""} {context.get("pm_answer") or ""}'.lower()
    if any(term in message for term in ('wacc', 'dcf', 'mos', 'margin of safety', 'entry', 'fair value', 'terminal growth', 'discount rate')):
        return 'Valuation Skeptic'
    if any(term in message for term in ('downside', 'stress', 'bear', 'risk', 'shock', 'fcf haircut', 'export', 'supply')):
        return 'Conservative Risk Officer'
    if any(term in message for term in ('approval', 'process', 'evidence', 'verify', 'governance', 'sign off', 'policy')):
        return 'Policy / Governance Challenger'
    if any(term in message for term in ('weight', 'exposure', 'cash', 'position', 'sizing', 'notional', 'concentration')):
        return 'Portfolio Construction PM'
    if any(term in message for term in ('upside', 'growth', 'opportunity', 'inaction', 'demand', 'long term')):
        return 'Aggressive Growth Analyst'
    return 'Conservative Risk Officer'


def _agent_stance(agent_role: str) -> str:
    return {
        'Aggressive Growth Analyst': 'Pushes the PM to defend whether caution is creating opportunity cost.',
        'Conservative Risk Officer': 'Pushes the PM to prove downside controls are strong enough.',
        'Valuation Skeptic': 'Pushes the PM to defend DCF, margin of safety, and entry-reference assumptions.',
        'Portfolio Construction PM': 'Pushes the PM to defend sizing, concentration, and portfolio tradeoffs.',
        'Policy / Governance Challenger': 'Pushes the PM to document evidence, approval gates, and reversal triggers.',
    }.get(agent_role, 'Challenges the PM decision logic.')


def _pressure_level(pm_message: str) -> str:
    normalized = pm_message.lower().strip()
    if len(normalized) < 35 or any(term in normalized for term in ('maybe', 'not sure', 'probably', 'feels', 'i think')):
        return 'high'
    if any(term in normalized for term in ('control', 'limit', 'stage', 'evidence', 'trigger', 'verify', 'reduce', 'defer')):
        return 'medium'
    if any(term in normalized for term in ('because', 'therefore', 'confirmed', 'validated')):
        return 'medium'
    return 'high'


def _decision_delta(pressure: str) -> int:
    if pressure == 'high':
        return -5
    if pressure == 'low':
        return 2
    return 0


def _prior_decision_confidence(context: dict[str, Any]) -> int:
    for item in reversed(context.get('chat_history') or []):
        for key in ('decision_confidence_score', 'confidence_score'):
            try:
                value = item.get(key)
                if value not in (None, ''):
                    return max(0, min(100, int(float(value))))
            except Exception:
                continue
    return 50


def _rating_delta(rating: str, strength_count: int = 0) -> int:
    if rating == 'strong':
        return 10 if strength_count >= 5 else 6
    if rating == 'partial':
        return 3
    if rating == 'off_topic':
        return -10
    return -8


def _assess_pm_answer(context: dict[str, Any]) -> dict[str, Any]:
    message = (context.get('pm_message') or '').strip()
    normalized = message.lower()
    words = re.findall(r'[a-z0-9]+', normalized)
    has_stance = any(term in normalized for term in ('approve', 'defer', 'reject', 'reduce', 'request more work', 'stage', 'smaller', 'no action'))
    has_evidence = any(term in normalized for term in ('senior', 'risk team', 'bear', 'stress', 'scenario', 'dcf', 'wacc', 'fcf', 'export', 'hyperscaler', 'proposal'))
    has_controls = any(term in normalized for term in ('trigger', 'threshold', 'control', 'review', 'reduce', 'defer', 'cap', 'limit', 'stage', 'stop'))
    has_sizing = any(term in normalized for term in ('sizing', 'size', 'shares', 'notional', 'weight', 'exposure', 'cap', 'limit'))
    has_valuation_uncertainty = any(term in normalized for term in ('dcf', 'wacc', 'entry', 'fair value', 'mos', 'margin of safety', 'simulated', 'share count', 'discount', 'fcf'))
    has_upside_only = any(term in normalized for term in ('ai momentum', 'momentum', 'upside', 'demand', 'growth')) and not any(
        [has_controls, has_sizing, has_valuation_uncertainty]
    )
    bad_entry_language = 'price target' in normalized or 'buy target' in normalized

    strength_count = sum([has_stance, has_evidence, has_controls, has_sizing, has_valuation_uncertainty])
    if len(words) < 3:
        rating = 'off_topic'
    elif bad_entry_language or has_upside_only or len(words) < 6:
        rating = 'weak'
    elif strength_count >= 4 and not bad_entry_language:
        rating = 'strong'
    elif strength_count >= 2:
        rating = 'partial'
    else:
        rating = 'weak'

    resolved: list[str] = []
    if has_stance:
        resolved.append('States a decision stance or action path')
    if has_evidence:
        resolved.append('References Senior proposal, Risk Team analysis, or valuation evidence')
    if has_controls:
        resolved.append('Mentions controls, review triggers, or reduction conditions')
    if has_sizing:
        resolved.append('Addresses sizing, exposure, or position discipline')
    if has_valuation_uncertainty:
        resolved.append('Acknowledges valuation uncertainty or entry-reference assumptions')
    if has_upside_only and not resolved:
        resolved.append('Mentions the upside demand thesis')

    unresolved: list[str] = []
    if not has_controls:
        unresolved.append('No explicit downside trigger or review rule')
    if not has_sizing:
        unresolved.append('No sizing response or exposure cap')
    if not has_evidence:
        unresolved.append('No direct link to Senior proposal or Risk Team evidence')
    if not has_valuation_uncertainty:
        unresolved.append('No acknowledgement of DCF, entry-reference, or share-count uncertainty')
    if bad_entry_language:
        unresolved.append('Treats the entry reference too much like a price target')
    if has_upside_only:
        unresolved.append('Upside thesis is not connected to a downside control')

    if rating == 'strong':
        rationale = 'The PM answer gives a stance, uses evidence, and names controls or sizing discipline.'
    elif rating == 'partial':
        rationale = 'The PM answer addresses part of the challenge but still leaves at least one control, sizing, or valuation gap.'
    elif rating == 'off_topic':
        rationale = 'The PM answer does not respond to the debate challenge in a decision-useful way.'
    else:
        rationale = 'The PM answer is too generic or incomplete; it does not specify a stress trigger, sizing response, or review rule.'

    delta = _rating_delta(rating, strength_count)
    prior = _prior_decision_confidence(context)
    return {
        'answer_assessment': {
            'rating': rating,
            'rationale': rationale,
        },
        'resolved_points': resolved or ['No decision-useful point was resolved'],
        'unresolved_points': unresolved or ['No major unresolved point identified in this turn'],
        'decision_confidence_delta': delta,
        'decision_confidence_score': max(0, min(100, prior + delta)),
    }


def _next_agent(current: str) -> str:
    sequence = AGENT_ROLES
    try:
        return sequence[(sequence.index(current) + 1) % len(sequence)]
    except ValueError:
        return 'Conservative Risk Officer'


def _deterministic_turn_payload(context: dict[str, Any]) -> dict[str, Any]:
    agent_role = _choose_agent(context)
    message = context.get('pm_message') or 'No PM message provided.'
    assessment = _assess_pm_answer(context)
    rating = assessment['answer_assessment']['rating']
    pressure = 'low' if rating == 'strong' else 'medium' if rating == 'partial' else 'high'
    proposal = context['senior_proposal']
    valuation = context['valuation_basis']
    risk = context['risk_team_analysis']
    evidence = ['PM latest message', 'Senior Action Proposal', 'Risk Team scenario analysis']
    unresolved = 'PM rationale is not yet specific enough to close the debate.'
    if agent_role == 'Valuation Skeptic':
        evidence = ['PM latest message', 'DCF valuation basis', 'Entry price reference']
        response = (
            f'Assessment: {assessment["answer_assessment"]["rationale"]} '
            f'You are leaning on valuation language, but the entry reference {_money(proposal.get("entry_reference"))} is only as strong as the DCF fair value estimate '
            f'{_money(valuation.get("dcf_fair_value_per_share"))}, discount rate {_format_pct(valuation.get("discount_rate"))}, and margin-of-safety assumptions.'
        )
        question = 'Which single DCF or margin-of-safety assumption would make you reduce size or defer?'
        unresolved = 'Valuation fragility remains unresolved.'
    elif agent_role == 'Aggressive Growth Analyst':
        response = (
            f'Assessment: {assessment["answer_assessment"]["rationale"]} '
            'Your answer needs to separate real evidence gaps from over-caution. If the thesis remains durable, waiting may create opportunity cost.'
        )
        question = 'What upside evidence would justify a smaller staged decision rather than another full deferral?'
        unresolved = 'Opportunity cost of inaction remains unresolved.'
    elif agent_role == 'Portfolio Construction PM':
        evidence = ['PM portfolio context', 'Proposed shares', 'Illustrative notional']
        response = (
            f'Assessment: {assessment["answer_assessment"]["rationale"]} '
            f'The proposal has to fit the whole book, not just the thesis. Proposed shares {proposal.get("proposed_shares") or "unavailable"} '
            f'and illustrative notional {_money(proposal.get("illustrative_notional"))} need a concentration and cash-impact defense.'
        )
        question = 'What position-size cap preserves cash flexibility and single-name concentration discipline?'
        unresolved = 'Portfolio sizing discipline remains unresolved.'
    elif agent_role == 'Policy / Governance Challenger':
        evidence = ['PM latest message', 'Risk controls', 'Review trigger']
        response = (
            f'Assessment: {assessment["answer_assessment"]["rationale"]} '
            'Your answer needs a documented evidence owner, approval gate, and reversal trigger. A local PM decision is not enough unless the missing validation step is named.'
        )
        question = 'Who owns the next validation step, and what finding would reverse your decision?'
        unresolved = 'Governance ownership remains unresolved.'
    else:
        evidence = ['PM latest message', 'Risk Team judgment', 'Scenario impact chain']
        response = (
            f'Assessment: {assessment["answer_assessment"]["rationale"]} '
            f'Risk Team judgment says "{risk.get("risk_team_judgment") or "controls are required"}", so your answer must show how downside is capped before any local decision.'
        )
        question = 'Which stress trigger forces immediate reduction, deferral, or another round of review?'
        unresolved = 'Downside control remains unresolved.'
    return {
        'debate_action': 'turn',
        'agent_role': agent_role,
        'agent_stance': _agent_stance(agent_role),
        'response': _clean_text(response),
        'follow_up_question': _clean_text(question),
        'evidence_used': evidence,
        'pressure_level': pressure,
        'unresolved_issue': unresolved,
        'suggested_next_agent': _next_agent(agent_role),
        'decision_readiness_delta': assessment['decision_confidence_delta'],
        **assessment,
    }


def _readiness_score(context: dict[str, Any], agents: list[dict[str, Any]]) -> int:
    score = 72
    if context.get('entry_is_simulated'):
        score -= 12
    if not context['pm_context'].get('current_position_weight'):
        score -= 5
    if not context['risk_team_analysis'].get('risk_controls'):
        score -= 8
    score -= 4 * sum(1 for agent in agents if agent.get('severity') == 'high')
    return max(0, min(100, score))


def _deterministic_payload(context: dict[str, Any]) -> dict[str, Any]:
    proposal = context['senior_proposal']
    valuation = context['valuation_basis']
    risk = context['risk_team_analysis']
    agents = _deterministic_agents(context)
    strongest = [
        'Valuation support is fragile if discount rate, terminal growth, or FCF haircut assumptions move against the proposal.',
        'Risk Team controls must be accepted before the PM records a local decision.',
        'Portfolio concentration and notional exposure need explicit sizing discipline.',
    ]
    if context.get('entry_is_simulated'):
        strongest.append('Entry reference depends on simulated share count and should remain illustrative until verified.')
    unresolved = _dedupe([
        *[str(item) for item in risk.get('questions_for_pm') or []],
        'What evidence would reverse the PM decision after approval, deferral, or rejection?',
        'Who owns validation of the most fragile valuation assumption?',
    ])
    controls = _dedupe([
        *[str(item) for item in risk.get('risk_controls') or []],
        'Record the PM decision locally only; no routing or execution.',
        'Require updated valuation if discount rate, terminal growth, FCF, or entry reference assumptions change.',
    ])
    checklist = [
        'Confirm decision candidate and written PM rationale.',
        'Verify DCF fair value estimate and illustrative entry reference are not treated as price targets.',
        'Address every high-severity debate objection.',
        'Document sizing, review trigger, and reversal criteria.',
        'Confirm no trade is routed or executed from this workflow.',
    ]
    return {
        'debate_summary': _clean_text(
            f'PM debate for {context["ticker"]}: decision candidate is {context["decision_candidate"]}. '
            f'Senior proposal is "{proposal["proposed_stance"]}" using DCF fair value estimate {_money(valuation.get("dcf_fair_value_per_share"))}, '
            f'illustrative entry reference {_money(proposal.get("entry_reference"))}, and Risk Team judgment "{risk.get("risk_team_judgment") or "not provided"}". '
            'The debate is designed to surface objections before a local PM decision is recorded.'
        ),
        'agents': agents,
        'strongest_objections': strongest,
        'decision_readiness_score': _readiness_score(context, agents),
        'unresolved_questions': unresolved,
        'suggested_controls': controls,
        'pm_decision_prompt': 'PM must choose approve, defer, reject, reduce size, or request more work, then answer the strongest unresolved objection in writing.',
        'final_decision_checklist': checklist,
    }


def _normalize_agents(items: Any, fallback: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_role = {agent['role']: dict(agent) for agent in fallback}
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            role = _clean_text(item.get('role') or '')
            if role not in by_role:
                continue
            merged = dict(by_role[role])
            for key in ('stance', 'challenge', 'pm_must_answer', 'severity'):
                if item.get(key) not in (None, ''):
                    merged[key] = _clean_text(item.get(key))
            if item.get('evidence_used'):
                merged['evidence_used'] = [_clean_text(value) for value in _as_list(item.get('evidence_used'))]
            by_role[role] = merged
    return [by_role[role] for role in AGENT_ROLES]


def _payload_from_llm(answer: str, context: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    payload = _extract_json_object(answer)
    if not payload:
        return fallback
    agents = _normalize_agents(payload.get('agents'), fallback['agents'])
    strongest = _dedupe([str(item) for item in _as_list(payload.get('strongest_objections'))]) or fallback['strongest_objections']
    unresolved = _dedupe([str(item) for item in _as_list(payload.get('unresolved_questions'))]) or fallback['unresolved_questions']
    controls = _dedupe([str(item) for item in _as_list(payload.get('suggested_controls'))]) or fallback['suggested_controls']
    checklist = _dedupe([str(item) for item in _as_list(payload.get('final_decision_checklist'))]) or fallback['final_decision_checklist']
    score = payload.get('decision_readiness_score', fallback['decision_readiness_score'])
    try:
        score = int(float(score))
    except Exception:
        score = fallback['decision_readiness_score']
    score = max(0, min(100, score))
    return {
        'debate_summary': _clean_text(payload.get('debate_summary') or fallback['debate_summary']),
        'agents': agents,
        'strongest_objections': strongest,
        'decision_readiness_score': score,
        'unresolved_questions': unresolved,
        'suggested_controls': controls,
        'pm_decision_prompt': _clean_text(payload.get('pm_decision_prompt') or fallback['pm_decision_prompt']),
        'final_decision_checklist': checklist,
    }


def _turn_payload_from_llm(answer: str, context: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    payload = _extract_json_object(answer)
    if not payload:
        return fallback
    agent_role = _normalize_agent_role(payload.get('agent_role') or fallback['agent_role'])
    if agent_role == 'auto':
        agent_role = fallback['agent_role']
    pressure = _clean_text(payload.get('pressure_level') or fallback['pressure_level']).lower()
    if pressure not in {'low', 'medium', 'high'}:
        pressure = fallback['pressure_level']
    try:
        delta = int(float(payload.get('decision_confidence_delta', payload.get('decision_readiness_delta', fallback['decision_confidence_delta']))))
    except Exception:
        delta = fallback['decision_confidence_delta']
    delta = max(-15, min(12, delta))
    assessment = payload.get('answer_assessment') if isinstance(payload.get('answer_assessment'), dict) else fallback['answer_assessment']
    rating = _clean_text(assessment.get('rating') or fallback['answer_assessment']['rating']).lower()
    if rating not in {'strong', 'partial', 'weak', 'off_topic'}:
        rating = fallback['answer_assessment']['rating']
    answer_assessment = {
        'rating': rating,
        'rationale': _clean_text(assessment.get('rationale') or fallback['answer_assessment']['rationale']),
    }
    resolved = _dedupe([str(item) for item in _as_list(payload.get('resolved_points'))]) or fallback['resolved_points']
    unresolved_points = _dedupe([str(item) for item in _as_list(payload.get('unresolved_points'))]) or fallback['unresolved_points']
    try:
        confidence_score = int(float(payload.get('decision_confidence_score', fallback['decision_confidence_score'])))
    except Exception:
        confidence_score = max(0, min(100, _prior_decision_confidence(context) + delta))
    confidence_score = max(0, min(100, confidence_score))
    return {
        'debate_action': 'turn',
        'agent_role': agent_role,
        'agent_stance': _clean_text(payload.get('agent_stance') or fallback['agent_stance']),
        'answer_assessment': answer_assessment,
        'resolved_points': resolved,
        'unresolved_points': unresolved_points,
        'decision_confidence_score': confidence_score,
        'decision_confidence_delta': delta,
        'response': _clean_text(payload.get('response') or fallback['response']),
        'follow_up_question': _clean_text(payload.get('follow_up_question') or fallback['follow_up_question']),
        'evidence_used': _dedupe([str(item) for item in _as_list(payload.get('evidence_used'))]) or fallback['evidence_used'],
        'pressure_level': pressure,
        'unresolved_issue': _clean_text(payload.get('unresolved_issue') or fallback['unresolved_issue']),
        'suggested_next_agent': _normalize_agent_role(payload.get('suggested_next_agent') or fallback['suggested_next_agent']),
        'decision_readiness_delta': delta,
    }


def _limitations(context: dict[str, Any], fallback: bool) -> list[str]:
    limitations = list(DEFAULT_LIMITATIONS)
    if context.get('entry_is_simulated'):
        limitations.append('Simulated share count means the entry reference remains illustrative until confirmed.')
    if fallback:
        limitations.append(FALLBACK_LIMITATION)
    return _dedupe(limitations)


def _response_from_context(
    *,
    context: dict[str, Any],
    question: str | None,
    llm_result: dict[str, Any] | None,
    debate_payload: dict[str, Any],
    fallback: bool,
) -> dict[str, Any]:
    return {
        'ticker': context['ticker'],
        'company': context['company'],
        'question': question or '',
        'mode': 'pm_decision_debate',
        **_clean_value(debate_payload),
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
        'limitations': _limitations(context, fallback=fallback),
    }


def _turn_response_from_context(
    *,
    context: dict[str, Any],
    question: str | None,
    llm_result: dict[str, Any] | None,
    turn_payload: dict[str, Any],
    fallback: bool,
) -> dict[str, Any]:
    return {
        'ticker': context['ticker'],
        'company': context['company'],
        'question': question or '',
        'mode': 'pm_decision_debate',
        **_clean_value(turn_payload),
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
        'limitations': _limitations(context, fallback=fallback),
    }


def build_pm_decision_debate_prompt(context: dict[str, Any], question: str | None = None) -> tuple[str, str]:
    compact_context = {
        'ticker': context['ticker'],
        'company': context['company'],
        'question': question or '',
        'decision_candidate': context['decision_candidate'],
        'pm_context': context['pm_context'],
        'senior_proposal': context['senior_proposal'],
        'valuation_basis': context['valuation_basis'],
        'risk_team_analysis': {
            'scenario_summary': context['risk_team_analysis'].get('scenario_summary'),
            'impact_chain': context['risk_team_analysis'].get('impact_chain')[:6],
            'valuation_impact': context['risk_team_analysis'].get('valuation_impact'),
            'portfolio_impact': context['risk_team_analysis'].get('portfolio_impact'),
            'risk_team_judgment': context['risk_team_analysis'].get('risk_team_judgment'),
            'risk_controls': context['risk_team_analysis'].get('risk_controls')[:6],
            'questions_for_pm': context['risk_team_analysis'].get('questions_for_pm')[:6],
        },
        'pm_answer': context['pm_answer'],
        'entry_is_simulated': context['entry_is_simulated'],
    }
    system_prompt = (
        'You are a Portfolio Manager debate-room drafting assistant. '
        'Use only the provided facts. Do not invent evidence, approvals, prices, exact historical returns, or future stock performance. '
        'Do not make the final investment decision and do not approve, route, or execute trades. '
        'Do not use legacy ML evidence: model confidence, outperform probability, aggregate indicator score, recommendation band, regression, RMSE, backend recommendation, or recommendation gate. '
        'Do not call an entry reference a price target or buy target. Do not say DCF predicts stock price. '
        'Pressure-test the PM logic with sharp, non-generic challenges and second-order risks. '
        'Historical analogies are allowed only as qualitative risk-pattern references phrased as "This resembles the risk pattern of...". '
        'Return compact JSON only. No markdown tables.'
    )
    user_prompt = (
        'Mode: pm_decision_debate\n'
        'Generate all five debate agents: Aggressive Growth Analyst, Conservative Risk Officer, Valuation Skeptic, Portfolio Construction PM, Policy / Governance Challenger.\n'
        'JSON schema: {"debate_summary":"...","agents":[{"role":"...","stance":"...","challenge":"...","evidence_used":["..."],"pm_must_answer":"...","severity":"low|medium|high"}],"strongest_objections":["..."],"decision_readiness_score":0,"unresolved_questions":["..."],"suggested_controls":["..."],"pm_decision_prompt":"...","final_decision_checklist":["..."]}\n'
        'Avoid unsupported numerical claims and trade-execution language.\n'
        f'Context: {json.dumps(compact_context, ensure_ascii=True, separators=(",", ":"))}'
    )
    return system_prompt, user_prompt


def build_pm_debate_turn_prompt(context: dict[str, Any], question: str | None = None) -> tuple[str, str]:
    agent_role = _choose_agent(context)
    compact_context = {
        'ticker': context['ticker'],
        'company': context['company'],
        'question': question or '',
        'active_agent': agent_role,
        'pm_message': context['pm_message'],
        'chat_history': context['chat_history'],
        'decision_candidate': context['decision_candidate'],
        'pm_context': context['pm_context'],
        'senior_proposal': context['senior_proposal'],
        'valuation_basis': context['valuation_basis'],
        'risk_team_analysis': context['risk_team_analysis'],
        'entry_is_simulated': context['entry_is_simulated'],
    }
    system_prompt = (
        'You are a live Portfolio Manager debate challenger. '
        'Respond directly to the PM latest message. Challenge the PM logic; do not simply agree. '
        'Do not simply ask a new question. First assess whether the PM answer resolved the previous challenge. '
        'Use only provided facts from Senior proposal, valuation basis, Risk Team analysis, portfolio context, and chat history. '
        'Do not make the final investment decision, approve trades, route orders, or execute trades. '
        'Do not call entry reference a price target or buy target. Do not say DCF predicts stock price. '
        'Do not use legacy ML evidence: model confidence, outperform probability, recommendation band, aggregate indicator score, regression, RMSE, or backend recommendation. '
        'Keep response concise: 2-4 sentences plus one sharp follow-up question. Return JSON only.'
    )
    user_prompt = (
        'Mode: pm_decision_debate live turn\n'
        f'Agent role to use: {agent_role}\n'
        'JSON schema: {"agent_role":"...","agent_stance":"...","answer_assessment":{"rating":"strong|partial|weak|off_topic","rationale":"..."},"resolved_points":["..."],"unresolved_points":["..."],"decision_confidence_score":50,"decision_confidence_delta":0,"response":"2-4 sentences","follow_up_question":"one sharp question","evidence_used":["..."],"pressure_level":"low|medium|high","unresolved_issue":"...","suggested_next_agent":"...","decision_readiness_delta":0}\n'
        'Evaluation rubric: strong answers include a clear stance, evidence, explicit controls, measurable triggers, sizing discipline, and valuation uncertainty. Weak answers are generic, upside-only, missing triggers/sizing/controls, or treat entry reference as a price target.\n'
        'If the PM answer is vague, increase pressure. If the PM provides clear controls and evidence, reduce pressure or move to another unresolved issue.\n'
        f'Context: {json.dumps(compact_context, ensure_ascii=True, separators=(",", ":"))}'
    )
    return system_prompt, user_prompt


def deterministic_pm_decision_debate(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    question: str | None = None,
    pm_context: dict[str, Any] | None = None,
    senior_proposal: dict[str, Any] | None = None,
    valuation_basis: dict[str, Any] | None = None,
    risk_team_analysis: dict[str, Any] | None = None,
    decision_candidate: str | dict[str, Any] | None = None,
    pm_answer: str | None = None,
    debate_action: str | None = None,
    pm_message: str | None = None,
    chat_history: list[dict[str, Any]] | None = None,
    active_agent: str | None = None,
    llm_result: dict[str, Any] | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    packet = packet if packet is not None else _read_json_payload(packet_path)
    context = _build_context(
        packet=packet,
        ticker=ticker,
        company=company,
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
    if context['debate_action'] == 'turn':
        return _turn_response_from_context(
            context=context,
            question=question,
            llm_result=llm_result,
            turn_payload=_deterministic_turn_payload(context),
            fallback=True,
        )
    return _response_from_context(
        context=context,
        question=question,
        llm_result=llm_result,
        debate_payload=_deterministic_payload(context),
        fallback=True,
    )


def run_pm_decision_debate(
    *,
    packet: dict[str, Any] | None = None,
    ticker: str,
    company: str | None = None,
    question: str | None = None,
    pm_context: dict[str, Any] | None = None,
    senior_proposal: dict[str, Any] | None = None,
    valuation_basis: dict[str, Any] | None = None,
    risk_team_analysis: dict[str, Any] | None = None,
    decision_candidate: str | dict[str, Any] | None = None,
    pm_answer: str | None = None,
    debate_action: str | None = None,
    pm_message: str | None = None,
    chat_history: list[dict[str, Any]] | None = None,
    active_agent: str | None = None,
    packet_path: Path = PACKET_PATH,
) -> dict[str, Any]:
    packet = packet if packet is not None else _read_json_payload(packet_path)
    context = _build_context(
        packet=packet,
        ticker=ticker,
        company=company,
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
    if context['debate_action'] == 'turn':
        fallback_payload = _deterministic_turn_payload(context)
        system_prompt, user_prompt = build_pm_debate_turn_prompt(context, question=question)
        llm_result = run_grounded_chat_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            timeout_seconds=PM_TURN_TIMEOUT_SECONDS,
            max_tokens=PM_TURN_MAX_TOKENS,
        )
        if not llm_result.get('llm_used'):
            return _turn_response_from_context(
                context=context,
                question=question,
                llm_result=llm_result,
                turn_payload=fallback_payload,
                fallback=True,
            )
        turn_payload = _turn_payload_from_llm(llm_result.get('answer') or '', context, fallback_payload)
        return _turn_response_from_context(
            context=context,
            question=question,
            llm_result=llm_result,
            turn_payload=turn_payload,
            fallback=False,
        )
    fallback_payload = _deterministic_payload(context)
    system_prompt, user_prompt = build_pm_decision_debate_prompt(context, question=question)
    llm_result = run_grounded_chat_completion(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=PM_DEBATE_TIMEOUT_SECONDS,
        max_tokens=PM_DEBATE_MAX_TOKENS,
    )
    if not llm_result.get('llm_used'):
        return _response_from_context(
            context=context,
            question=question,
            llm_result=llm_result,
            debate_payload=fallback_payload,
            fallback=True,
        )
    debate_payload = _payload_from_llm(llm_result.get('answer') or '', context, fallback_payload)
    return _response_from_context(
        context=context,
        question=question,
        llm_result=llm_result,
        debate_payload=debate_payload,
        fallback=False,
    )
