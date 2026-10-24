from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from fastapi.testclient import TestClient

from api import server


FORBIDDEN_TERMS = (
    'model confidence',
    'outperform probability',
    'aggregate indicator score',
    'recommendation band',
    'regression',
    'rmse',
    'backend recommendation',
    'recommendation gate',
    '| agent |',
    'execute the trade',
    'route the trade',
    'approved trade',
    'price target',
)

AGENT_ROLES = {
    'Aggressive Growth Analyst',
    'Conservative Risk Officer',
    'Valuation Skeptic',
    'Portfolio Construction PM',
    'Policy / Governance Challenger',
}


def _skill_module():
    path = Path(__file__).resolve().parents[2] / 'skills' / 'run-pm-decision-debate' / 'run.py'
    spec = importlib.util.spec_from_file_location('pm_decision_debate_skill_test', path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sample_packet() -> dict:
    return {
        'dcf_valuations': {
            'valuations': {
                'NVDA': {
                    'discount_rate': 0.118,
                    'terminal_growth_rate': 0.025,
                    'latest_market_price': 216.03,
                    'implied_share_price': None,
                }
            }
        },
        'entry_price_models': {
            'entry_prices': {
                'NVDA': {
                    'latest_market_price': 216.03,
                    'implied_fair_value_per_share': 216.03,
                    'entry_price': 144.74,
                    'margin_of_safety': 0.33,
                    'shares_outstanding_is_simulated': True,
                }
            }
        },
    }


def _pm_context() -> dict:
    return {
        'portfolio_composition': {'Technology': 0.35, 'Defensive': 0.35, 'Cash': 0.30},
        'current_position_weight': 0.08,
        'max_single_name_weight': 0.12,
        'cash_weight': 0.30,
        'technology_exposure': 0.35,
    }


def _senior_proposal() -> dict:
    return {
        'proposed_stance': 'Accumulate candidate',
        'entry_reference': 144.74,
        'proposed_shares': 100,
        'illustrative_notional': 14474,
        'margin_of_safety': 0.33,
        'time_horizon': 'Long-term',
        'senior_rationale': 'Valuation support exists if assumptions hold.',
        'risk_limit_note': 'Stage size until Risk Team controls are accepted.',
        'review_trigger': 'Discount-rate shock or export-control escalation.',
    }


def _valuation_basis() -> dict:
    return {
        'dcf_fair_value_per_share': 216.03,
        'current_price': 216.03,
        'junior_baseline_entry': 144.74,
        'senior_adjusted_entry': 144.74,
        'discount_rate': 0.118,
        'terminal_growth': 0.025,
        'fcf_haircut': -0.2,
    }


def _risk_team_analysis() -> dict:
    return {
        'selected_scenario': {'scenario_name': 'Bear case'},
        'scenario_summary': 'Bear case applies severe AI capex shock, high export-control severity, +200 bps discount-rate shock, and weaker FCF conversion.',
        'impact_chain': [
            'Shock: severe AI capex slowdown and high export-control severity.',
            'Financial model impact: revenue growth and FCF assumptions are haircut.',
            'DCF / entry reference impact: fair value estimate and illustrative entry reference are rechecked.',
        ],
        'valuation_impact': 'FCF haircut and discount-rate shock pressure the DCF fair value estimate.',
        'portfolio_impact': 'Proposed shares 100 and illustrative notional $14,474.00 should be staged.',
        'risk_team_judgment': 'Escalate to PM with smaller sizing and refreshed valuation assumptions.',
        'risk_controls': ['Stage exposure.', 'Refresh DCF assumptions before approval.'],
        'questions_for_pm': ['Which stress would force deferral?', 'What is the maximum acceptable single-name weight?'],
    }


def _all_text(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True).lower()


def _assert_no_forbidden_terms(payload: dict) -> None:
    text = _all_text(payload)
    for term in FORBIDDEN_TERMS:
        assert term not in text
    assert '**' not in text


def _assert_debate_shape(payload: dict) -> None:
    for key in (
        'ticker',
        'company',
        'mode',
        'debate_summary',
        'agents',
        'strongest_objections',
        'decision_readiness_score',
        'unresolved_questions',
        'suggested_controls',
        'pm_decision_prompt',
        'final_decision_checklist',
        'human_review_required',
        'llm_used',
        'fallback_used',
        'sources_used',
    ):
        assert key in payload
    assert payload['mode'] == 'pm_decision_debate'
    assert payload['human_review_required'] is True
    assert set(agent['role'] for agent in payload['agents']) == AGENT_ROLES
    for agent in payload['agents']:
        assert agent['challenge']
        assert agent['pm_must_answer']
        assert agent['evidence_used']
        assert agent['severity'] in {'low', 'medium', 'high'}
    assert payload['strongest_objections']
    assert isinstance(payload['decision_readiness_score'], int)
    assert 0 <= payload['decision_readiness_score'] <= 100
    assert payload['final_decision_checklist']


def _assert_turn_shape(payload: dict) -> None:
    for key in (
        'ticker',
        'company',
        'mode',
        'debate_action',
        'agent_role',
        'agent_stance',
        'answer_assessment',
        'resolved_points',
        'unresolved_points',
        'decision_confidence_score',
        'decision_confidence_delta',
        'response',
        'follow_up_question',
        'evidence_used',
        'pressure_level',
        'unresolved_issue',
        'suggested_next_agent',
        'decision_readiness_delta',
        'human_review_required',
        'llm_used',
        'fallback_used',
        'sources_used',
    ):
        assert key in payload
    assert payload['mode'] == 'pm_decision_debate'
    assert payload['debate_action'] == 'turn'
    assert payload['agent_role'] in AGENT_ROLES
    assert payload['suggested_next_agent'] in AGENT_ROLES
    assert payload['answer_assessment']['rating'] in {'strong', 'partial', 'weak', 'off_topic'}
    assert payload['answer_assessment']['rationale']
    assert payload['resolved_points']
    assert payload['unresolved_points']
    assert isinstance(payload['decision_confidence_score'], int)
    assert 0 <= payload['decision_confidence_score'] <= 100
    assert isinstance(payload['decision_confidence_delta'], int)
    assert payload['response']
    assert payload['follow_up_question']
    assert payload['evidence_used']
    assert payload['pressure_level'] in {'low', 'medium', 'high'}
    assert isinstance(payload['decision_readiness_delta'], int)
    assert payload['human_review_required'] is True


def test_deterministic_fallback_includes_all_five_agents() -> None:
    skill = _skill_module()
    payload = skill.deterministic_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='defer',
        pm_answer='I want stronger evidence before increasing size.',
    )

    assert payload['llm_used'] is False
    assert payload['fallback_used'] is True
    assert 'LLM unavailable; deterministic PM decision debate used.' in payload['limitations']
    assert any('simulated share count' in item.lower() for item in payload['limitations'])
    _assert_debate_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_debate_turn_fallback_returns_conversational_response() -> None:
    skill = _skill_module()
    payload = skill.deterministic_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='defer',
        debate_action='turn',
        pm_message='I think the downside is controlled if we stage the position and refresh DCF assumptions.',
        chat_history=[{'role': 'pm', 'content': 'I prefer deferral until valuation is clearer.'}],
        active_agent='auto',
    )

    assert payload['fallback_used'] is True
    assert payload['agent_role'] == 'Valuation Skeptic'
    assert 'DCF' in payload['response'] or 'valuation' in payload['response']
    assert 'stage' in payload['response'].lower() or 'assumption' in payload['response'].lower()
    _assert_turn_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_debate_turn_auto_selects_valuation_skeptic_for_wacc_mos_entry() -> None:
    skill = _skill_module()
    payload = skill.deterministic_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='reduce_size',
        debate_action='turn',
        pm_message='The WACC, MoS, and entry reference look acceptable to me.',
        active_agent='auto',
    )

    assert payload['agent_role'] == 'Valuation Skeptic'
    assert 'entry reference' in _all_text(payload)
    assert 'DCF' in payload['response']
    _assert_turn_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_debate_turn_weak_pm_answer_evaluates_missing_trigger_control_and_sizing() -> None:
    skill = _skill_module()
    payload = skill.deterministic_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='defer',
        debate_action='turn',
        pm_message='the AI momentum',
        chat_history=[{
            'role': 'agent',
            'agent_role': 'Conservative Risk Officer',
            'content': 'Which stress trigger forces immediate reduction, deferral, or another round of review?',
            'decision_confidence_score': 50,
        }],
        active_agent='auto',
    )
    unresolved = ' '.join(payload['unresolved_points']).lower()

    assert payload['answer_assessment']['rating'] in {'weak', 'partial'}
    assert 'upside' in ' '.join(payload['resolved_points']).lower() or 'demand' in ' '.join(payload['resolved_points']).lower()
    assert 'trigger' in unresolved
    assert 'sizing' in unresolved or 'exposure cap' in unresolved
    assert 'control' in unresolved or 'review rule' in unresolved
    assert payload['decision_confidence_delta'] <= 0
    assert payload['decision_confidence_score'] <= 50
    _assert_turn_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_debate_turn_strong_pm_answer_increases_confidence() -> None:
    skill = _skill_module()
    payload = skill.deterministic_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='reduce_size',
        debate_action='turn',
        pm_message='I would reduce size to 50 shares, cap exposure at 9%, and defer if export restrictions worsen or WACC rises above 12%; DCF and FCF assumptions need review before any PM control is relaxed.',
        chat_history=[{'role': 'agent', 'content': 'Define the trigger and sizing control.', 'decision_confidence_score': 50}],
        active_agent='auto',
    )

    assert payload['answer_assessment']['rating'] == 'strong'
    assert any('sizing' in item.lower() or 'exposure' in item.lower() for item in payload['resolved_points'])
    assert any('valuation' in item.lower() or 'entry' in item.lower() or 'dcf' in item.lower() for item in payload['resolved_points'])
    assert payload['decision_confidence_delta'] > 0
    assert payload['decision_confidence_score'] > 50
    _assert_turn_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_debate_turn_llm_success_uses_pm_message_context(monkeypatch) -> None:
    skill = _skill_module()
    llm_payload = {
        'agent_role': 'Conservative Risk Officer',
        'agent_stance': 'Pushes on downside controls.',
        'answer_assessment': {'rating': 'weak', 'rationale': 'The PM answer accepts the case but does not name the trigger.'},
        'resolved_points': ['Acknowledges the bear case'],
        'unresolved_points': ['No measurable trigger', 'No sizing response'],
        'decision_confidence_score': 42,
        'decision_confidence_delta': -8,
        'response': 'You said the bear case is acceptable, but that skips the specific stress trigger. The Risk Team handoff requires a sizing response if FCF conversion weakens, so your answer is not yet decision-ready.',
        'follow_up_question': 'Which exact stress trigger forces you to reduce size or defer?',
        'evidence_used': ['PM latest message', 'Risk Team scenario analysis'],
        'pressure_level': 'high',
        'unresolved_issue': 'Downside trigger is not explicit.',
        'suggested_next_agent': 'Policy / Governance Challenger',
        'decision_readiness_delta': -5,
    }

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': json.dumps(llm_payload),
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='defer',
        debate_action='turn',
        pm_message='The bear case is acceptable.',
        chat_history=[{'role': 'pm', 'content': 'The bear case is acceptable.'}],
        active_agent='auto',
    )

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert payload['agent_role'] == 'Conservative Risk Officer'
    assert payload['answer_assessment']['rating'] == 'weak'
    assert payload['unresolved_points']
    assert payload['decision_confidence_score'] == 42
    assert payload['decision_confidence_delta'] == -8
    assert 'bear case is acceptable' in payload['response']
    assert payload['decision_readiness_delta'] == -8
    _assert_turn_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_llm_success_merges_agent_challenges(monkeypatch) -> None:
    skill = _skill_module()
    llm_payload = {
        'debate_summary': 'LLM debate summary: the PM must reconcile upside opportunity cost with Risk Team controls and fragile valuation support.',
        'agents': [
            {
                'role': 'Aggressive Growth Analyst',
                'stance': 'PM may be too conservative.',
                'challenge': 'Opportunity cost rises if the PM defers despite a staged entry reference and long-term demand durability.',
                'evidence_used': ['Senior proposal', 'Entry reference'],
                'pm_must_answer': 'What evidence justifies inaction instead of reduced-size staging?',
                'severity': 'medium',
            },
            {
                'role': 'Conservative Risk Officer',
                'stance': 'Risk controls dominate.',
                'challenge': 'Risk Team bear case shows FCF and sizing fragility before PM approval.',
                'evidence_used': ['Risk Team analysis'],
                'pm_must_answer': 'Which shock blocks escalation?',
                'severity': 'high',
            },
            {
                'role': 'Valuation Skeptic',
                'stance': 'DCF is fragile.',
                'challenge': 'Terminal growth and discount rate can overturn the illustrative entry reference.',
                'evidence_used': ['DCF valuation basis'],
                'pm_must_answer': 'Which valuation assumption must be independently verified?',
                'severity': 'high',
            },
            {
                'role': 'Portfolio Construction PM',
                'stance': 'Size matters more than thesis purity.',
                'challenge': 'Current exposure and notional size may crowd out defensive flexibility.',
                'evidence_used': ['PM portfolio context'],
                'pm_must_answer': 'What exposure cap preserves cash and concentration discipline?',
                'severity': 'medium',
            },
            {
                'role': 'Policy / Governance Challenger',
                'stance': 'No action without gates.',
                'challenge': 'The PM must document reversal triggers and missing evidence before a local decision.',
                'evidence_used': ['Risk controls'],
                'pm_must_answer': 'Who owns validation of the open evidence gap?',
                'severity': 'high',
            },
        ],
        'strongest_objections': ['Valuation assumptions can break the entry reference.', 'Risk controls are not yet accepted.'],
        'decision_readiness_score': 61,
        'unresolved_questions': ['What would force deferral?'],
        'suggested_controls': ['Stage exposure.', 'Refresh DCF assumptions.'],
        'pm_decision_prompt': 'Answer the highest-severity objection before recording a local decision.',
        'final_decision_checklist': ['No execution.', 'Document reversal trigger.'],
    }

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': json.dumps(llm_payload),
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='reduce_size',
    )

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert payload['decision_readiness_score'] == 61
    assert 'opportunity cost' in _all_text(payload)
    _assert_debate_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_llm_output_sanitizes_trade_execution_language(monkeypatch) -> None:
    skill = _skill_module()
    llm_payload = {
        'debate_summary': 'The approved trade should execute the trade immediately at the price target.',
        'agents': [
            {
                'role': role,
                'stance': 'Challenge stance.',
                'challenge': 'The approved trade language should be sanitized before the PM can route the trade.',
                'evidence_used': ['Provided facts'],
                'pm_must_answer': 'Will the PM execute the trade?',
                'severity': 'high',
            }
            for role in AGENT_ROLES
        ],
        'strongest_objections': ['Do not execute the trade.'],
        'decision_readiness_score': 55,
        'unresolved_questions': ['Can the PM route the trade?'],
        'suggested_controls': ['No execution.'],
        'pm_decision_prompt': 'Do not approve the trade.',
        'final_decision_checklist': ['No routing.'],
    }

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': json.dumps(llm_payload),
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_pm_decision_debate(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        pm_context=_pm_context(),
        senior_proposal=_senior_proposal(),
        valuation_basis=_valuation_basis(),
        risk_team_analysis=_risk_team_analysis(),
        decision_candidate='approve',
    )
    text = _all_text(payload)

    assert 'execute the trade' not in text
    assert 'route the trade' not in text
    assert 'approved trade' not in text
    assert 'price target' not in text
    assert 'record a local decision' in text or 'local decision' in text
    _assert_debate_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_chat_mode_pm_decision_debate_routes(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    packet_path.parent.mkdir(parents=True, exist_ok=True)
    packet_path.write_text(json.dumps(_sample_packet()), encoding='utf-8')
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    skill = server._load_pm_decision_debate_skill()

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': False,
            'fallback_used': True,
            'answer': '',
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': 'missing_api_key',
            'llm_error_message': 'No CLASS_LLM_API_KEY configured.',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={
        'mode': 'pm_decision_debate',
        'ticker': 'NVDA',
        'company': 'NVIDIA Corporation',
        'question': 'Run PM debate.',
        'pm_context': _pm_context(),
        'senior_proposal': _senior_proposal(),
        'valuation_basis': _valuation_basis(),
        'risk_team_analysis': _risk_team_analysis(),
        'decision_candidate': 'defer',
        'pm_answer': 'I need stronger evidence.',
    }).json()

    assert payload['mode'] == 'pm_decision_debate'
    assert payload['ticker'] == 'NVDA'
    assert payload['question'] == 'Run PM debate.'
    assert payload['fallback_used'] is True
    _assert_debate_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_chat_mode_pm_decision_debate_turn_routes(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    packet_path.parent.mkdir(parents=True, exist_ok=True)
    packet_path.write_text(json.dumps(_sample_packet()), encoding='utf-8')
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    skill = server._load_pm_decision_debate_skill()

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': False,
            'fallback_used': True,
            'answer': '',
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': 'missing_api_key',
            'llm_error_message': 'No CLASS_LLM_API_KEY configured.',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={
        'mode': 'pm_decision_debate',
        'debate_action': 'turn',
        'ticker': 'NVDA',
        'company': 'NVIDIA Corporation',
        'question': 'Continue PM debate.',
        'pm_context': _pm_context(),
        'senior_proposal': _senior_proposal(),
        'valuation_basis': _valuation_basis(),
        'risk_team_analysis': _risk_team_analysis(),
        'decision_candidate': 'defer',
        'pm_message': 'The WACC and entry reference are acceptable.',
        'chat_history': [{'role': 'pm', 'content': 'The WACC and entry reference are acceptable.'}],
        'active_agent': 'auto',
    }).json()

    assert payload['mode'] == 'pm_decision_debate'
    assert payload['debate_action'] == 'turn'
    assert payload['agent_role'] == 'Valuation Skeptic'
    assert payload['fallback_used'] is True
    _assert_turn_shape(payload)
    _assert_no_forbidden_terms(payload)
