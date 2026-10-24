from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from api import server

SIMULATED_SHARE_WARNING = 'Entry price is illustrative because share count is simulated; treat the reference as illustrative until share count is confirmed.'


def _skill_module():
    path = Path(__file__).resolve().parents[2] / 'skills' / 'draft-synthesis-memo' / 'run.py'
    spec = importlib.util.spec_from_file_location('draft_synthesis_memo_skill_test', path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def _sample_packet() -> dict:
    return {
        'recommendations': {
            'NVDA': {
                'action': 'hold_review',
                'confidence_score': 0.1512,
                'requires_pm_review': True,
                'blocked_strong_action_reason': 'low_model_confidence:0.15; pm_review_required_by_stress_test',
            }
        },
        'company_theses': {
            'NVDA': {'core_thesis': 'NVIDIA remains positioned for AI infrastructure demand, but the thesis depends on hyperscaler capex and supply availability.'}
        },
        'indicator_scorecards': {
            'scorecards': [
                {
                    'ticker': 'NVDA',
                    'aggregate_indicator_score': -0.1,
                    'confidence_score': 0.618,
                    'recommendation_band': 'reduce',
                    'indicators': [
                        {'name': 'AI demand momentum', 'direction': 'positive', 'score': 1.0, 'weight': 0.17, 'confidence': 0.7, 'evidence_refs': ['news_evidence']},
                        {'name': 'Data center growth', 'direction': 'positive', 'score': 1.0, 'weight': 0.14, 'confidence': 0.7, 'evidence_refs': ['filing_evidence']},
                        {'name': 'Gross margin quality', 'direction': 'positive', 'score': 1.0, 'weight': 0.15, 'confidence': 0.7, 'evidence_refs': ['filing_evidence']},
                        {'name': 'Hyperscaler capex dependence', 'direction': 'negative', 'score': -1.0, 'weight': 0.16, 'confidence': 0.55, 'evidence_refs': ['news_evidence']},
                        {'name': 'Export control risk', 'direction': 'negative', 'score': -1.0, 'weight': 0.13, 'confidence': 0.54, 'evidence_refs': ['news_evidence']},
                        {'name': 'Supply chain risk', 'direction': 'negative', 'score': -1.0, 'weight': 0.12, 'confidence': 0.52, 'evidence_refs': ['news_evidence']},
                        {'name': 'Valuation sensitivity', 'direction': 'negative', 'score': -1.0, 'weight': 0.14, 'confidence': 0.6, 'evidence_refs': ['stock_features:60d_volatility']},
                    ],
                    'data_limitations': ['transparent_fallback_used_due_to_official_model_policy'],
                }
            ]
        },
        'three_statement_models': {
            'models': {
                'NVDA': {
                    'ticker': 'NVDA',
                    'company_name': 'Nvidia Corporation',
                    'base_year': 2022,
                    'display_values': {'revenue': '$26.9B', 'gross_profit': '$17.5B', 'operating_income': '$10.0B'},
                    'historical_inputs': {'revenue': 26914000000.0},
                    'assumptions': {'projection_years': 5, 'revenue_growth_start': 0.18, 'tax_rate': 0.21},
                    'key_metrics': {'base_revenue_growth': 0.18},
                    'limitations': ['depreciation_capex_and_working_capital_are_assumption_based'],
                }
            }
        },
        'dcf_valuations': {
            'valuations': {
                'NVDA': {
                    'valuation_date': '2026-05-21',
                    'base_free_cash_flow': 8628154159.17,
                    'discount_rate': 0.118,
                    'terminal_growth_rate': 0.025,
                    'enterprise_value': 206579939593.71,
                    'equity_value': 199110939593.71,
                    'implied_share_price': None,
                    'latest_market_price': 219.509995,
                    'upside_downside_pct': None,
                    'limitations': [
                        'discount_rate_estimated_from_short_term_volatility_proxy',
                        'shares_outstanding_unavailable_implied_share_price_not_calculated',
                    ],
                }
            }
        },
        'entry_price_models': {
            'entry_prices': {
                'NVDA': {
                    'latest_market_price': 219.509995,
                    'dcf_equity_value': 199110939593.71,
                    'shares_outstanding': 907070038.4,
                    'shares_outstanding_source': 'simulated',
                    'shares_outstanding_is_simulated': True,
                    'simulated_shares_outstanding_reason': 'actual shares outstanding unavailable; simulated for demo entry price using dcf_equity_value / latest_market_price',
                    'implied_fair_value_per_share': 219.509995,
                    'margin_of_safety': 0.38,
                    'entry_price': 136.096197,
                    'entry_status': 'watchlist_below_fair_value',
                    'limitations': ['shares_outstanding_simulated_for_demo_entry_price'],
                    'presentation_guidance': 'For analyst review only. Not a trade approval. Entry price is illustrative because share count is simulated.',
                    'risk_adjustments': [{'reason': 'large_stress_test_downside', 'adjustment': 0.07}],
                }
            }
        },
        'portfolio_stress_test': {
            'pm_review_required': True,
            'main_risk_drivers': ['NVDA:ai_capex_pullback', 'export_control_tightening', 'rates_higher_for_longer', 'recession_consumer_slowdown', 'valuation_multiple_compression'],
            'ticker_level_impact_ranges': {'NVDA': [-0.25, -0.1]},
            'risk_action': 'pm_review_required',
            'scenarios': [
                {'scenario_id': 'NVDA:ai_capex_pullback', 'ticker_level_impacts': {'NVDA': {'downside_range': [-0.25, -0.1], 'main_driver': 'export_control_tightening'}}}
            ],
        },
        'model_predictions': {
            'predictions': {
                'NVDA': {
                    'benchmark': 'QQQ',
                    'outperform_probability': 0.584,
                    'model_confidence': 0.1512,
                    'data_limitations': ['transparent_fallback_used_due_to_official_model_policy'],
                }
            }
        },
        'news_evidence': {
            'NVDA': [
                {
                    'ticker': 'NVDA',
                    'source_name': 'Example News',
                    'published_at': '2026-05-21',
                    'keyword_hits': {'supply_chain': 2, 'capex': 1},
                    'evidence_chunks': ['Supply chain capacity and hyperscaler capex are central to the latest debate.'],
                }
            ]
        },
        'filing_evidence': {
            'NVDA': {
                'facts': {
                    'revenue': {'value': 26914000000.0, 'fiscal_year': 2022},
                    'gross_profit': {'value': 17475000000.0, 'fiscal_year': 2022},
                },
                'computed_metrics': {'gross_margin': 0.649, 'revenue_growth': 0.18},
                'limitations': [],
            }
        },
        'rag_evidence': {'policy_hits': [{'source': 'trade_approval_policy'}]},
        'human_review': {'pm_approval_required': True, 'status': 'pending_pm_review'},
        'missing_data_warnings': ['shares_outstanding_missing_actual'],
    }


def _assert_sections_traceable(payload: dict) -> None:
    assert payload['human_review_required'] is True
    assert payload['source_map']
    assert payload['memo_sections']
    for section in payload['memo_sections']:
        assert section['editable'] is True
        assert section['sources']
        assert payload['source_map'][section['id']]


def _assert_demo_readable(payload: dict) -> None:
    memo = payload['memo_markdown']
    lower = memo.lower()
    assert '| Indicator |' not in memo
    assert '| Direction |' not in memo
    assert '\n---' not in memo
    assert memo.count('**') <= 2
    assert '3-statement' in memo
    assert 'DCF' in memo
    assert 'entry price' in lower
    for legacy_term in (
        'aggregate indicator score',
        'recommendation band',
        'reduce band',
        'hold/review status',
        'scores positively',
        'scores negatively',
        'weight of',
        'score +1.0',
        'score -1.0',
        'outperform probability',
        'model confidence',
        'regression',
        'rmse',
        'qqq benchmark',
        'versus qqq',
        'legacy ml probability',
        'recommendation gate',
    ):
        assert legacy_term not in lower
    assert 'NVDA:' not in memo
    assert 'depreciation_capex_and_working_capital_are_assumption_based' not in memo
    assert 'discount_rate_estimated_from_short_term_volatility_proxy' not in memo
    snake_case_matches = [
        match.group(0)
        for match in re.finditer(r'\b[a-z]+(?:_[a-z0-9]+)+\b', memo)
        if not match.group(0).startswith(('entry_price_models', 'entry_prices'))
    ]
    assert snake_case_matches == []
    assert payload['human_review_required'] is True


def test_junior_analyst_memo_includes_valuation_review_and_entry_reference() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', company='Nvidia Corporation', role='junior_analyst')

    assert [section['id'] for section in payload['memo_sections']] == [
        'executive_summary',
        'business_thesis_context',
        'indicator_drivers',
        'valuation_review',
        'entry_price_reference',
        'key_risks_limitations',
        'open_questions',
    ]
    assert 'Valuation Review' in payload['memo_markdown']
    assert 'Entry Price Reference' in payload['memo_markdown']
    assert 'DCF fair value per share: $219.51.' in payload['memo_markdown']
    assert 'Margin of safety: 38.0%.' in payload['memo_markdown']
    assert 'Entry price reference: $136.10.' in payload['memo_markdown']
    assert 'Source path: entry_price_models.entry_prices.NVDA.' in payload['memo_markdown']
    assert SIMULATED_SHARE_WARNING in payload['memo_markdown']
    entry_bullets = [line for line in payload['memo_markdown'].splitlines() if 'share count is simulated' in line]
    assert all(line.count('share count is simulated') == 1 for line in entry_bullets)
    assert any(source['path'] == 'entry_price_models.entry_prices.NVDA' for source in payload['source_map']['entry_price_reference'])
    _assert_demo_readable(payload)
    _assert_sections_traceable(payload)


def test_entry_reference_supports_field_variants_and_whole_number_margin() -> None:
    skill = _skill_module()
    packet = _sample_packet()
    entry = packet['entry_price_models']['entry_prices']['NVDA']
    entry.pop('implied_fair_value_per_share')
    entry.pop('entry_price')
    entry['fair_value_per_share'] = 216.25
    entry['entry_price_reference'] = 144.89
    entry['margin_of_safety'] = 33
    payload = skill.deterministic_synthesis_memo(packet=packet, ticker='NVDA', role='junior_analyst')

    assert 'DCF fair value per share: $216.25.' in payload['memo_markdown']
    assert 'Margin of safety: 33.0%.' in payload['memo_markdown']
    assert 'Entry price reference: $144.89.' in payload['memo_markdown']
    assert SIMULATED_SHARE_WARNING in payload['memo_markdown']
    _assert_demo_readable(payload)


def test_senior_analyst_memo_has_assumption_challenge_and_followups() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='senior_analyst')

    assert 'Valuation Challenge' in payload['memo_markdown']
    assert 'Follow-up Requests for Junior Analyst' in payload['memo_markdown']
    assert 'challenge' in payload['memo_markdown'].lower() or 'verify' in payload['memo_markdown'].lower()
    _assert_demo_readable(payload)
    _assert_sections_traceable(payload)


def test_risk_team_memo_focuses_on_stress_and_risk_not_valuation_first() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='risk_team')
    text = payload['memo_markdown']
    lower = text.lower()

    section_ids = [section['id'] for section in payload['memo_sections']]
    assert section_ids[0] == 'risk_review_summary'
    assert 'Stress Test Findings' in text
    assert 'AI capex pullback' in text
    assert 'export_control_tightening' not in text
    assert 'Senior proposed stance' in text
    assert '3-statement' in text
    assert 'DCF' in text
    assert 'entry price reference' in lower
    assert 'Risk-adjusted margin of safety' in text
    assert 'Export controls' in text
    assert 'Supply chain' in text
    assert 'Hyperscaler capex dependence' in text
    assert 'DCF sensitivity' in text
    assert 'simulated share count' in lower
    assert 'Questions for Risk Team' in text
    assert payload['human_review_required'] is True
    assert 'Valuation Review' not in text
    assert '| Indicator |' not in text
    assert text.count('**') <= 2
    for legacy_term in ('outperform probability', 'model confidence', 'regression', 'rmse', 'recommendation gate'):
        assert legacy_term not in lower
    assert 'confidence' not in lower
    _assert_demo_readable(payload)


def test_portfolio_manager_memo_has_decision_context_without_trade_approval() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='portfolio_manager')
    text = payload['memo_markdown'].lower()

    assert 'pm decision context' in text
    assert 'decision record placeholder' in text
    forbidden = ['trade has been approved', 'trade routed', 'executed trade', 'order submitted']
    assert all(term not in text for term in forbidden)
    _assert_demo_readable(payload)


def test_simulated_share_count_is_explicitly_mentioned() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')

    assert SIMULATED_SHARE_WARNING in payload['memo_markdown']
    assert 'Analyst should verify simulated share count before relying on entry price.' in payload['human_review_notes']
    assert 'Entry price uses simulated shares outstanding for demo purposes.' in payload['limitations']


def test_source_map_exists_and_each_memo_section_has_sources() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')

    _assert_sections_traceable(payload)
    assert 'valuation_review' in payload['source_map']
    assert any(source['path'] == 'dcf_valuations.valuations.NVDA' for source in payload['source_map']['valuation_review'])


def test_memo_markdown_uses_bullets_not_tables_or_old_ml_terms() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')

    _assert_demo_readable(payload)
    assert 'Positive drivers:\n-' in payload['memo_markdown']
    assert 'Risks to challenge:\n-' in payload['memo_markdown']
    assert 'Key points:\n-' in payload['memo_markdown']
    assert 'risk-adjusted margin of safety' in payload['memo_markdown']


def test_indicator_drivers_are_qualitative_lists() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')
    section = next(item for item in payload['memo_sections'] if item['id'] == 'indicator_drivers')
    body = section['body']
    lower = body.lower()

    assert 'Positive drivers:\n- AI demand momentum\n- Data center revenue growth\n- Gross margin quality' in body
    assert 'Risks to challenge:\n- Hyperscaler capex dependence\n- Export control risk' in body
    assert 'Review note:' in body
    for forbidden in ('score', 'weight', 'confidence', '+1.0', '-1.0', 'reduce band', 'recommendation band'):
        assert forbidden not in lower


def test_key_risks_and_limitations_are_readable_labels() -> None:
    skill = _skill_module()
    payload = skill.deterministic_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')
    text = payload['memo_markdown']

    assert 'AI capex pullback' in text
    assert 'Export control tightening' in text
    assert 'Rates higher for longer' in text
    assert 'Recession / consumer slowdown' in text
    assert 'Valuation multiple compression' in text
    assert 'Depreciation, capex, and working capital are assumption-based' in text
    assert 'Discount rate is estimated from a short-term volatility proxy' in text
    _assert_demo_readable(payload)


def test_prompt_context_excludes_legacy_model_prediction_fields() -> None:
    skill = _skill_module()
    context = skill.build_synthesis_memo_context(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')
    system_prompt, user_prompt = skill.build_synthesis_memo_prompt(context)
    prompt_text = f'{system_prompt}\n{user_prompt}'.lower()
    context_text = json.dumps(skill._facts_for_prompt(context)).lower()

    assert 'model_predictions' not in prompt_text
    assert 'outperform_probability' not in prompt_text
    assert 'outperform probability' not in prompt_text
    assert 'model_confidence' not in context_text
    assert 'qqq' not in context_text
    assert 'confidence_score' not in json.dumps(context.get('recommendation', {})).lower()
    assert 'aggregate_indicator_score' not in context_text
    assert 'recommendation_band' not in context_text
    assert '"weight"' not in context_text
    assert '"score"' not in context_text
    assert '"confidence"' not in context_text


def test_fallback_mode_works_without_llm(monkeypatch) -> None:
    skill = _skill_module()

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': False,
            'fallback_used': True,
            'answer': '',
            'class_llm_used': True,
            'llm_error_type': 'missing_api_key',
            'llm_error_message': 'No CLASS_LLM_API_KEY is configured.',
            'llm_model': 'claude-sonnet-4-6',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')

    assert payload['llm_used'] is False
    assert payload['fallback_used'] is True
    assert payload['class_llm_used'] is True
    assert payload['llm_error_type'] == 'missing_api_key'
    assert 'LLM call failed; deterministic packet memo used.' in payload['limitations']
    _assert_sections_traceable(payload)


def test_mocked_llm_success_returns_structured_editable_sections(monkeypatch) -> None:
    skill = _skill_module()
    bodies = []
    for _, title in skill.ROLE_SECTION_DEFS['junior_analyst']:
        if title == 'Indicator Drivers':
            body = (
                'Summary:\n**LLM drafted indicator section.**\n\n'
                '| Indicator | Direction | Score | Weight |\n'
                '| --- | --- | --- | --- |\n'
                '| Gross margin quality | positive | 1.0 | 0.15 |\n\n'
                'Key points:\n- 3-statement, DCF, and entry price remain central.'
            )
        else:
            body = (
                f'Summary:\nLLM drafted {title}. Entry price is illustrative because share count is simulated.\n\n'
                'Key points:\n- 3-statement model reviewed.\n- DCF reviewed.\n- Entry price reviewed.\n- legacy ML probability versus QQQ benchmark is estimated at 58.4%.'
                '\n- Aggregate indicator score is -0.1 and the recommendation band is reduce.'
                '\n- The indicator scores positively at +1.0 with a weight of 0.17.'
                '\n- NVDA:ai_capex_pullback and depreciation_capex_and_working_capital_are_assumption_based.'
                '\n- The simulated share count and back-solved fair value per share'
                '\n---'
            )
        bodies.append(f'## {title}\n{body}')
    headings = '\n\n'.join(bodies)

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': headings,
            'class_llm_used': True,
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_model': 'claude-sonnet-4-6',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(skill, 'run_grounded_chat_completion', fake_llm)
    payload = skill.run_synthesis_memo(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert 'LLM drafted Business / Thesis Context' in payload['memo_markdown']
    assert 'NVDA\'s valuation package shows strong AI infrastructure demand' in payload['memo_sections'][0]['body']
    assert '| Indicator |' not in payload['memo_markdown']
    assert '**' not in payload['memo_markdown']
    assert 'Positive drivers:\n- AI demand momentum\n- Data center revenue growth\n- Gross margin quality' in payload['memo_markdown']
    assert 'Entry price reference: $136.10.' in payload['memo_markdown']
    assert 'legacy ML probability' not in payload['memo_markdown']
    assert 'QQQ benchmark' not in payload['memo_markdown']
    assert 'Aggregate indicator score' not in payload['memo_markdown']
    assert 'recommendation band' not in payload['memo_markdown']
    assert 'weight of' not in payload['memo_markdown']
    assert 'NVDA:' not in payload['memo_markdown']
    assert 'depreciation_capex_and_working_capital_are_assumption_based' not in payload['memo_markdown']
    assert SIMULATED_SHARE_WARNING in payload['memo_markdown']
    assert '\n---' not in payload['memo_markdown']
    _assert_sections_traceable(payload)


def test_prompt_requires_human_review_and_proxy_disclosure() -> None:
    skill = _skill_module()
    context = skill.build_synthesis_memo_context(packet=_sample_packet(), ticker='NVDA', role='junior_analyst')
    system_prompt, user_prompt = skill.build_synthesis_memo_prompt(context)

    assert 'Use only the provided backend packet facts' in system_prompt
    assert SIMULATED_SHARE_WARNING in system_prompt
    assert 'Discount rate is a proxy estimate, not a fully built WACC.' in system_prompt
    assert 'Do not use markdown tables or pipe-table syntax.' in system_prompt
    assert 'Do not use bold markdown markers.' in system_prompt
    assert 'This draft is LLM-assisted and must be reviewed/edited by a human analyst before handoff.' in user_prompt


def test_chat_mode_synthesis_memo_routes_and_existing_modes_still_work(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)

    synthesis_skill = server._load_synthesis_memo_skill()

    def fake_synthesis_llm(*args, **kwargs):
        return {
            'llm_used': False,
            'fallback_used': True,
            'answer': '',
            'class_llm_used': True,
            'llm_error_type': 'missing_api_key',
            'llm_error_message': 'No CLASS_LLM_API_KEY is configured.',
            'llm_model': 'claude-sonnet-4-6',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(synthesis_skill, 'run_grounded_chat_completion', fake_synthesis_llm)
    client = TestClient(server.app)

    synthesis = client.post('/chat', json={
        'mode': 'synthesis_memo',
        'ticker': 'NVDA',
        'company': 'Nvidia Corporation',
        'question': 'Draft memo.',
        'role': 'junior_analyst',
    }).json()
    assert synthesis['mode'] == 'synthesis_memo'
    assert synthesis['role'] == 'junior_analyst'
    assert synthesis['human_review_required'] is True
    assert synthesis['memo_sections']

    qna = client.post('/chat', json={'mode': 'packet_qna', 'ticker': 'NVDA', 'question': 'What is the recommendation?'}).json()
    assert qna['mode'] == 'packet_qna'
    assert 'sources_used' in qna

    indicator = client.post('/chat', json={
        'mode': 'indicator_explanation',
        'ticker': 'NVDA',
        'question': 'Explain this signal.',
        'indicator_name': 'Gross margin quality',
    }).json()
    assert indicator['mode'] == 'indicator_explanation'
