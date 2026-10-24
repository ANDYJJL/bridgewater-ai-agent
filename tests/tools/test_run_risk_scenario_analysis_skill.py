from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from api import server


FORBIDDEN_TERMS = (
    'model confidence',
    'outperform probability',
    'recommendation band',
    'aggregate indicator score',
    'regression',
    'rmse',
    'recommendation gate',
    'backend recommendation',
    '| scenario |',
    'h100',
    'blackwell',
    'tsmc',
)


def _skill_module():
    path = Path(__file__).resolve().parents[2] / 'skills' / 'run-risk-scenario-analysis' / 'run.py'
    spec = importlib.util.spec_from_file_location('risk_scenario_analysis_skill_test', path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sample_packet() -> dict:
    return {
        'three_statement_models': {
            'models': {
                'NVDA': {
                    'company_name': 'NVIDIA Corporation',
                    'limitations': ['depreciation_capex_and_working_capital_are_assumption_based'],
                }
            }
        },
        'dcf_valuations': {
            'valuations': {
                'NVDA': {
                    'discount_rate': 0.118,
                    'terminal_growth_rate': 0.025,
                    'latest_market_price': 216.03,
                    'implied_share_price': None,
                    'limitations': ['discount_rate_estimated_from_short_term_volatility_proxy'],
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
        'portfolio_stress_test': {
            'main_risk_drivers': ['NVDA:ai_capex_pullback', 'export_control_tightening'],
        },
        'model_predictions': {
            'predictions': {
                'NVDA': {
                    'outperform_probability': 0.58,
                    'model_confidence': 0.2,
                }
            }
        },
    }


def _sample_proposal() -> dict:
    return {
        'proposed_stance': 'accumulate only if entry discipline holds',
        'entry_reference': 144.74,
        'proposed_shares': 100,
        'illustrative_notional': 14474,
        'margin_of_safety': 0.33,
        'time_horizon': '6-12 months',
        'senior_rationale': 'Valuation support exists, but assumptions require challenge.',
        'risk_limit_note': 'Limit size until bear case is reviewed.',
        'review_trigger': 'Discount rate or export-control shock.',
    }


def _sample_valuation_basis() -> dict:
    return {
        'dcf_fair_value_per_share': 216.03,
        'current_price': 216.03,
        'discount_rate': 0.118,
        'terminal_growth': 0.025,
        'fcf_haircut': 0.1,
        'junior_baseline_entry': 144.74,
        'senior_adjusted_entry': 144.74,
    }


def _sample_risk_factors() -> list[str]:
    return [
        'export control risk',
        'hyperscaler capex dependence',
        'supply chain risk',
        'DCF sensitivity',
        'simulated share count limitation',
    ]


def _bear_severe_settings() -> dict:
    return {
        'market_case': 'Bear Case',
        'ai_capex_shock': 'severe',
        'export_control_severity': 'high',
        'discount_rate_shock_bps': 200,
        'fcf_haircut': -0.2,
        'position_size_multiplier': 1.0,
    }


def _bull_mild_settings() -> dict:
    return {
        'market_case': 'Bull',
        'ai_capex_shock': 'mild',
        'export_control_severity': 'low',
        'discount_rate_shock_bps': 0,
        'fcf_haircut': 0,
        'position_size_multiplier': 1.0,
    }


def _all_output_text(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True).lower()


def _assert_no_forbidden_terms(payload: dict) -> None:
    text = _all_output_text(payload)
    for term in FORBIDDEN_TERMS:
        assert term not in text
    assert '**' not in text


def _assert_frontend_shape(payload: dict) -> None:
    for key in (
        'ticker',
        'company',
        'mode',
        'overall_risk_view',
        'scenario_analysis',
        'selected_scenario',
        'impact_chain',
        'scenario_summary',
        'valuation_impact',
        'portfolio_impact',
        'risk_team_judgment',
        'risk_controls',
        'questions_for_pm',
        'pm_handoff_summary',
        'human_review_required',
        'llm_used',
        'fallback_used',
        'sources_used',
    ):
        assert key in payload
    assert payload['mode'] == 'risk_scenario_analysis'
    assert payload['scenario_analysis']
    assert payload['selected_scenario']
    assert payload['scenario_summary']
    assert payload['impact_chain']
    assert payload['valuation_impact']
    assert payload['portfolio_impact']
    assert payload['risk_team_judgment']
    assert payload['risk_controls']
    assert payload['questions_for_pm']
    for scenario in payload['scenario_analysis']:
        assert scenario['scenario_name']
        assert scenario['scenario_summary']
        assert scenario['impact_chain']
        assert scenario['valuation_impact']
        assert scenario['portfolio_impact']
        assert scenario['risk_team_judgment']
        assert scenario['required_controls']


def _norm(value: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', value.lower())).strip()


def _assert_selected_fields_are_distinct(payload: dict) -> None:
    summary = payload['scenario_summary']
    valuation = payload['valuation_impact']
    judgment = payload['risk_team_judgment']
    impact_chain = payload['impact_chain']

    assert _norm(summary) != _norm(judgment)
    assert _norm(summary) != _norm(valuation)
    assert _norm(valuation) != _norm(judgment)
    for step in impact_chain:
        assert len(step) <= 230
        assert _norm(step) != _norm(summary)
        assert _norm(summary) not in _norm(step)


def test_deterministic_output_includes_bear_base_bull_and_impact_chain() -> None:
    skill = _skill_module()
    payload = skill.deterministic_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings={'market_case': 'bear'},
    )

    names = [item['scenario_name'] for item in payload['scenario_analysis']]
    assert names == ['Bear case', 'Base case', 'Bull case']
    assert all(item['impact_chain'] for item in payload['scenario_analysis'])
    assert all('DCF / entry reference impact' in ' '.join(item['impact_chain']) for item in payload['scenario_analysis'])
    assert payload['human_review_required'] is True
    assert payload['fallback_used'] is True
    _assert_frontend_shape(payload)
    _assert_selected_fields_are_distinct(payload)
    _assert_no_forbidden_terms(payload)


def test_output_includes_controls_questions_position_and_valuation_values() -> None:
    skill = _skill_module()
    payload = skill.deterministic_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings={'market_case': 'bear'},
    )
    text = json.dumps(payload)

    assert 'risk_controls' in payload
    assert 'questions_for_pm' in payload
    assert 'proposed shares 100' in text
    assert '$14,474.00' in text
    assert '$216.03' in text
    assert '$144.74' in text
    assert 'fair value estimate' in text
    assert 'illustrative entry reference' in text
    assert 'not execution' in text
    _assert_frontend_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_market_case_normalization_variants_select_bear() -> None:
    skill = _skill_module()
    for market_case in ('Bear', 'bear', 'Bear Case'):
        payload = skill.deterministic_risk_scenario_analysis(
            packet=_sample_packet(),
            ticker='NVDA',
            company='NVIDIA Corporation',
            senior_proposal=_sample_proposal(),
            valuation_basis=_sample_valuation_basis(),
            risk_factors=_sample_risk_factors(),
            scenario_settings={'market_case': market_case},
        )
        assert payload['selected_scenario']['scenario_name'] == 'Bear case'
        assert payload['scenario_summary'] == payload['selected_scenario']['scenario_summary']
        _assert_frontend_shape(payload)
        _assert_no_forbidden_terms(payload)


def test_bear_severe_high_scenario_uses_selected_controls() -> None:
    skill = _skill_module()
    payload = skill.deterministic_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings=_bear_severe_settings(),
    )
    text = _all_output_text(payload['selected_scenario'])

    assert payload['selected_scenario']['scenario_name'] == 'Bear case'
    assert 'under the base case' not in text
    assert 'bull case' not in text
    assert 'capex slowdown' in text or 'capex slows' in text
    assert 'export' in text
    assert 'discount-rate shock is 200' in text or 'discount rate' in text
    assert 'fcf haircut assumption is 20.0%' in text
    assert 'illustrative entry reference' in text
    assert 'stage' in text or 'blocked' in text or 'reduced' in text
    _assert_frontend_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_historical_pattern_is_qualitative_without_exact_performance_numbers() -> None:
    skill = _skill_module()
    payload = skill.deterministic_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings=_bear_severe_settings(),
    )
    historical_sentences = [
        sentence
        for sentence in payload['scenario_summary'].split('.')
        if 'Historical risk pattern' in sentence
    ]

    assert historical_sentences
    assert not any(re.search(r'\d+(?:\.\d+)?%', sentence) for sentence in historical_sentences)
    assert 'This resembles the risk pattern' in historical_sentences[0]
    _assert_no_forbidden_terms(payload)


def test_llm_success_keeps_structured_scenarios(monkeypatch) -> None:
    skill = _skill_module()
    llm_payload = {
        'overall_risk_view': 'LLM risk view: the proposal can fail through a second-order capex digestion cycle that compresses FCF before valuation multiples adjust.',
        'scenario_analysis': [
            {
                'scenario_name': 'Bear case',
                'scenario_summary': 'LLM bear narrative links export controls to product mix, delayed revenue conversion, and weaker FCF coverage for the proposed notional.',
                'impact_chain': [
                    'Shock: severe export-control tightening and capex slowdown.',
                    'Second-order effect: customers delay cluster deployments, which pushes revenue recognition and weakens FCF conversion.',
                    'DCF / entry reference impact: fair value estimate and illustrative entry reference become less reliable until assumptions are refreshed.',
                ],
                'valuation_impact': 'LLM valuation impact: FCF haircut and discount-rate shock pressure the fair value estimate before current price reacts.',
                'portfolio_impact': 'LLM portfolio impact: proposed shares 100 and illustrative notional $14,474.00 should be staged rather than taken at full size.',
                'risk_team_judgment': 'LLM judgment: escalate before approval and require smaller sizing.',
                'required_controls': ['LLM control: stage exposure', 'LLM control: refresh DCF assumptions'],
            },
            {
                'scenario_name': 'Base case',
                'scenario_summary': 'LLM base narrative keeps demand constructive but monitors entry reference fragility.',
                'impact_chain': ['Shock: monitored policy risk.', 'DCF / entry reference impact: assumption refresh remains required.'],
                'valuation_impact': 'LLM base valuation impact remains assumption-sensitive.',
                'portfolio_impact': 'LLM base portfolio impact allows staged proposal review only.',
                'risk_team_judgment': 'LLM base judgment: allow PM review with controls.',
                'required_controls': ['LLM control: keep review trigger'],
            },
            {
                'scenario_name': 'Bull case',
                'scenario_summary': 'LLM bull narrative notes upside support but avoids treating entry reference as a target.',
                'impact_chain': ['Shock: demand stays strong.', 'DCF / entry reference impact: fair value estimate still requires review.'],
                'valuation_impact': 'LLM bull valuation impact improves FCF support but remains review-only.',
                'portfolio_impact': 'LLM bull portfolio impact does not justify execution.',
                'risk_team_judgment': 'LLM bull judgment: preserve approval gates.',
                'required_controls': ['LLM control: no execution'],
            },
        ],
        'risk_controls': ['LLM control: stage exposure', 'LLM control: PM approval required'],
        'questions_for_pm': ['LLM question: what stress would force deferral?'],
        'pm_handoff_summary': 'LLM handoff: second-order capex digestion can hit revenue timing, FCF, fair value estimate, illustrative entry reference, and proposed notional exposure; proposal only, not execution.',
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
    payload = skill.run_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings={'market_case': 'bear'},
    )

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert len(payload['scenario_analysis']) == 3
    assert 'second-order capex digestion' in payload['overall_risk_view']
    assert 'delayed revenue conversion' in payload['scenario_summary']
    assert 'proposed shares 100' in payload['portfolio_impact']
    assert 'proposal only, not execution' in payload['pm_handoff_summary']
    assert 'LLM control: stage exposure' in payload['risk_controls']
    assert payload['selected_scenario']['scenario_name'] == 'Bear case'
    _assert_frontend_shape(payload)
    _assert_selected_fields_are_distinct(payload)
    _assert_no_forbidden_terms(payload)


def test_unstructured_llm_answer_still_populates_complete_shape(monkeypatch) -> None:
    skill = _skill_module()

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': 'The severe capex shock can create a second-order revenue timing problem before consensus cuts estimates. H100 and Blackwell orders plus TSMC commitments should be generalized because they are not supplied facts. This pressures FCF, weakens the DCF fair value estimate, and makes the illustrative entry reference less reliable. Risk Team should stage the proposed shares and escalate the notional exposure to PM before any action.',
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
    )

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert 'second-order revenue timing' in payload['scenario_summary']
    assert 'FCF' in payload['valuation_impact']
    assert 'proposed shares' in payload['portfolio_impact']
    _assert_frontend_shape(payload)
    _assert_selected_fields_are_distinct(payload)
    _assert_no_forbidden_terms(payload)


def test_unstructured_llm_repeated_text_is_not_copied_across_fields(monkeypatch) -> None:
    skill = _skill_module()
    repeated = (
        'Under the bear case, the causal chain begins with severe AI capex shock and high export-control severity, '
        'then flows through revenue timing, FCF pressure, DCF fair value compression, entry reference validity, '
        'proposed notional exposure, and escalation controls.'
    )

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': f'{repeated} {repeated} {repeated}',
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings=_bear_severe_settings(),
    )

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert 'severe AI capex shock' in payload['scenario_summary']
    assert 'high export-control severity' in payload['scenario_summary']
    assert 'FCF haircut assumption is 20.0%' in payload['valuation_impact']
    assert 'proposed shares 100' in payload['portfolio_impact']
    assert 'Escalate to PM' in payload['risk_team_judgment']
    _assert_selected_fields_are_distinct(payload)
    _assert_frontend_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_structured_llm_repeated_fields_are_sanitized(monkeypatch) -> None:
    skill = _skill_module()
    repeated = 'Under the bear case, the causal chain begins with severe shock through FCF, DCF fair value, entry reference, proposed notional exposure, and controls.'
    llm_payload = {
        'overall_risk_view': repeated,
        'scenario_analysis': [
            {
                'scenario_name': 'Bear case',
                'scenario_summary': repeated,
                'impact_chain': [repeated],
                'valuation_impact': repeated,
                'portfolio_impact': repeated,
                'risk_team_judgment': repeated,
                'required_controls': ['Stage exposure and refresh assumptions.'],
            }
        ],
        'pm_handoff_summary': repeated,
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
    payload = skill.run_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings=_bear_severe_settings(),
    )

    assert payload['scenario_summary'] == repeated
    assert payload['valuation_impact'] != repeated
    assert payload['portfolio_impact'] != repeated
    assert payload['risk_team_judgment'] != repeated
    _assert_selected_fields_are_distinct(payload)
    _assert_frontend_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_bear_llm_output_cannot_drift_to_base_case(monkeypatch) -> None:
    skill = _skill_module()

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': 'Under the base case, demand remains constructive and the proposal can proceed with controls. This pressures FCF, weakens the DCF fair value estimate, and makes the illustrative entry reference less reliable. Risk Team should stage the proposed shares and escalate the notional exposure to PM before any action.',
            'class_llm_used': True,
            'llm_model': 'claude-sonnet-4-6',
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings=_bear_severe_settings(),
    )
    selected_text = _all_output_text(payload['selected_scenario'])

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert payload['selected_scenario']['scenario_name'] == 'Bear case'
    assert 'under the base case' not in selected_text
    assert 'bull case' not in selected_text
    assert 'capex slowdown' in selected_text
    _assert_frontend_shape(payload)
    _assert_selected_fields_are_distinct(payload)
    _assert_no_forbidden_terms(payload)


def test_bull_selected_output_does_not_contain_bear_case() -> None:
    skill = _skill_module()
    payload = skill.deterministic_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
        scenario_settings=_bull_mild_settings(),
    )
    selected_text = _all_output_text(payload['selected_scenario'])

    assert payload['selected_scenario']['scenario_name'] == 'Bull case'
    assert 'bear case' not in selected_text
    assert 'under the bear case' not in selected_text
    assert 'demand remains strong' in selected_text
    _assert_frontend_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_llm_failure_returns_deterministic_fallback(monkeypatch) -> None:
    skill = _skill_module()

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
    payload = skill.run_risk_scenario_analysis(
        packet=_sample_packet(),
        ticker='NVDA',
        company='NVIDIA Corporation',
        senior_proposal=_sample_proposal(),
        valuation_basis=_sample_valuation_basis(),
        risk_factors=_sample_risk_factors(),
    )

    assert payload['llm_used'] is False
    assert payload['fallback_used'] is True
    assert payload['class_llm_used'] is True
    assert 'LLM unavailable; deterministic risk scenario analysis used.' in payload['limitations']
    _assert_frontend_shape(payload)
    _assert_no_forbidden_terms(payload)


def test_chat_mode_risk_scenario_analysis_routes(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    packet_path.parent.mkdir(parents=True, exist_ok=True)
    packet_path.write_text(json.dumps(_sample_packet()), encoding='utf-8')
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    skill = server._load_risk_scenario_analysis_skill()

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
        'mode': 'risk_scenario_analysis',
        'ticker': 'NVDA',
        'company': 'NVIDIA Corporation',
        'question': 'Run Risk Team scenarios.',
        'senior_proposal': _sample_proposal(),
        'valuation_basis': _sample_valuation_basis(),
        'risk_factors': _sample_risk_factors(),
        'scenario_settings': _bear_severe_settings(),
    }).json()

    assert payload['mode'] == 'risk_scenario_analysis'
    assert payload['human_review_required'] is True
    assert [item['scenario_name'] for item in payload['scenario_analysis']] == ['Bear case', 'Base case', 'Bull case']
    assert payload['selected_scenario']['scenario_name'] == 'Bear case'
    assert 'under the base case' not in _all_output_text(payload['selected_scenario'])
    assert payload['sources_used']
    _assert_frontend_shape(payload)
    _assert_no_forbidden_terms(payload)
