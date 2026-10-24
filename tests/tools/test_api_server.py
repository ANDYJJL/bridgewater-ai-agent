from __future__ import annotations

import csv
import json
from pathlib import Path

from fastapi.testclient import TestClient

from api import server
from tools import llm_client


def _indicator_skill_module():
    return server._load_indicator_explanation_skill()


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def _write_csv(path: Path, rows: list[dict[str, object]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _sample_packet() -> dict:
    return {
        'run_id': 'm04_test',
        'generated_at': '2026-05-19T00:00:00Z',
        'news_evidence': {
            'NVDA': [
                {
                    'raw_id': 'NVDA_1',
                    'ticker': 'NVDA',
                    'source_name': 'Example News',
                    'source_domain': 'example.com',
                    'url': 'https://example.com/nvda-1',
                    'published_at': '2026-05-18T00:00:00Z',
                    'fetch_status': 'success',
                    'clean_text': 'Export control restrictions and AI infrastructure demand remain central to the Nvidia debate.',
                    'evidence_chunks': ['Export control restrictions remain central'],
                    'keyword_hits': {'export_control': 2, 'AI_demand': 1, 'supply_chain': 3, 'capex': 0},
                    'duplicate_url': False,
                    'duplicate_title': False,
                }
            ],
            'KO': [],
        },
        'filing_evidence': {
            'NVDA': {
                'cik': '0001045810',
                'latest_10k': {'form': '10-K'},
                'latest_10q': {'form': '10-Q'},
                'facts': {
                    'revenue': {'fact_name': 'RevenueFromContractWithCustomerExcludingAssessedTax', 'value': 100.0, 'fiscal_year': 2026},
                    'gross_profit': {'fact_name': 'GrossProfit', 'value': 60.0, 'fiscal_year': 2026},
                },
                'computed_metrics': {
                    'revenue_growth': 0.42,
                    'gross_margin': 0.61,
                    'operating_margin': 0.33,
                    'debt_to_assets': 0.08,
                },
                'data_limitations': [],
                'limitations': [],
            },
            'KO': {'cik': '0000021344', 'latest_10k': {}, 'latest_10q': {}, 'facts': {}, 'computed_metrics': {}, 'limitations': ['coverage_incomplete']},
        },
        'company_theses': {'NVDA': {'core_thesis': 'AI infrastructure leader'}, 'KO': {'core_thesis': 'Defensive staple'}},
        'indicator_scorecards': {
            'scorecards': [
                {
                    'ticker': 'NVDA',
                    'aggregate_indicator_score': -0.1,
                    'confidence_score': 0.22,
                    'recommendation_band': 'reduce',
                    'indicators': [
                        {
                            'name': 'Supply chain risk',
                            'score': -1.0,
                            'weight': 0.12,
                            'confidence': 0.525,
                            'direction': 'negative',
                            'evidence_refs': ['stock_features:supply_chain_keyword_count', 'model_prediction:QQQ', 'news_evidence', 'filing_evidence'],
                            'data_limitations': [],
                        },
                        {
                            'name': 'AI demand momentum',
                            'score': 1.0,
                            'weight': 0.17,
                            'confidence': 0.525,
                            'direction': 'positive',
                            'evidence_refs': ['stock_features:20d_return', 'model_prediction:QQQ', 'news_evidence', 'filing_evidence'],
                            'data_limitations': [],
                        }
                    ],
                    'data_limitations': [
                        'official_model_kept_as_transparent_fallback',
                        'transparent_fallback_used_due_to_official_model_policy',
                    ],
                }
            ]
        },
        'model_predictions': {
            'model_type': 'transparent_fallback',
            'predictions': {
                'NVDA': {
                    'benchmark': 'QQQ',
                    'outperform_probability': 0.55,
                    'model_confidence': 0.22,
                    'predicted_return_bucket': 'slightly_positive',
                    'top_features': ['20d_return', 'revenue_growth'],
                    'data_limitations': ['official_model_kept_as_transparent_fallback'],
                }
            }
        },
        'model_comparison': {
            'ticker_results': {
                'NVDA': {
                    'target_price_models': {
                        'linear_regression': {
                            'validation_status': 'weak_validation',
                            'price_estimate_usable': False,
                        }
                    }
                }
            }
        },
        'portfolio_stress_test': {
            'scenarios': [
                {
                    'scenario_id': 'supply_chain_disruption',
                    'ticker_level_impacts': {'NVDA': {'downside_range': [-0.20, -0.10], 'main_driver': 'supply_chain_disruption'}},
                }
            ],
            'main_risk_drivers': ['supply_chain_disruption', 'multiple_compression'],
            'pm_review_required': True,
        },
        'recommendations': {'NVDA': {'action': 'hold_review', 'confidence_score': 0.22, 'blocked_strong_action_reason': 'missing_market_data_source', 'data_limitation_reason': 'missing_market_history'}, 'KO': {'action': 'review', 'confidence_score': 0.1}},
        'human_review': {'status': 'pending_pm_review', 'pm_approval_required': True},
        'raw_data_sources': {},
        'missing_data_warnings': ['market:missing_source'],
        'mandate': {},
        'portfolio': {},
        'rag_evidence': {},
        'ai_committee_views': [],
        'draft_trade_tickets': [],
        'frontend_contract': {'source_of_truth': 'backend_generated_recommendation_packet', 'frontend_should_not_use_mock_data': True, 'static_packet_generated_at': '2026-05-19T00:00:00Z'},
        'disclaimer': 'Educational workflow artifact only. Not real investment advice.',
    }


def _write_indicator_supporting_files(tmp_path: Path, packet: dict) -> None:
    _write_json(tmp_path / 'indicator_scorecards.json', packet['indicator_scorecards'])
    _write_json(tmp_path / 'indicator_config.json', {
        'NVDA': {
            'benchmark': 'QQQ',
            'indicators': [
                {
                    'name': 'Supply chain risk',
                    'weight': 0.12,
                    'source_field': 'supply_chain_keyword_count',
                    'positive_threshold': 0.0,
                    'negative_threshold': 2.0,
                    'inverse': True,
                    'description': 'Tracks whether supply constraints are becoming more visible in backend evidence.',
                },
                {
                    'name': 'AI demand momentum',
                    'weight': 0.17,
                    'source_field': '20d_return',
                    'positive_threshold': 0.03,
                    'negative_threshold': -0.03,
                    'description': 'Tracks whether AI-related demand momentum still looks supportive.',
                },
            ],
        }
    })
    _write_csv(
        tmp_path / 'stock_features.csv',
        [
            {
                'ticker': 'NVDA',
                'benchmark': 'QQQ',
                'as_of_date': '2026-05-21',
                '20d_return': 0.08,
                '60d_return': 0.12,
                '20d_volatility': 0.03,
                '60d_volatility': 0.05,
                'max_drawdown_60d': -0.11,
                'relative_return_vs_benchmark_60d': 0.02,
                'revenue_growth': 0.42,
                'gross_margin': 0.61,
                'operating_margin': 0.33,
                'debt_to_assets': 0.08,
                'macro_unrate_latest': 4.3,
                'export_control_keyword_count': 2,
                'supply_chain_keyword_count': 3,
                'capex_keyword_count': 0,
                'inflation_keyword_count': 0,
                'data_completeness_score': 1.0,
            }
        ],
        [
            'ticker', 'benchmark', 'as_of_date', '20d_return', '60d_return', '20d_volatility', '60d_volatility',
            'max_drawdown_60d', 'relative_return_vs_benchmark_60d', 'revenue_growth', 'gross_margin',
            'operating_margin', 'debt_to_assets', 'macro_unrate_latest', 'export_control_keyword_count',
            'supply_chain_keyword_count', 'capex_keyword_count', 'inflation_keyword_count', 'data_completeness_score',
        ],
    )
    _write_json(tmp_path / 'news_evidence.json', {'articles': packet['news_evidence']['NVDA']})
    _write_json(tmp_path / 'filing_evidence.json', {'tickers': {'NVDA': packet['filing_evidence']['NVDA']}})
    _write_json(tmp_path / 'model_predictions.json', packet['model_predictions'])
    _write_json(tmp_path / 'portfolio_stress_test.json', packet['portfolio_stress_test'])


def _patch_indicator_sources(tmp_path: Path, monkeypatch, packet: dict) -> None:
    _write_indicator_supporting_files(tmp_path, packet)
    monkeypatch.setattr(server, 'INDICATOR_SCORECARDS_PATH', tmp_path / 'indicator_scorecards.json')
    monkeypatch.setattr(server, 'INDICATOR_CONFIG_PATH', tmp_path / 'indicator_config.json')
    monkeypatch.setattr(server, 'STOCK_FEATURES_PATH', tmp_path / 'stock_features.csv')
    monkeypatch.setattr(server, 'NEWS_EVIDENCE_PATH', tmp_path / 'news_evidence.json')
    monkeypatch.setattr(server, 'FILING_EVIDENCE_PATH', tmp_path / 'filing_evidence.json')
    monkeypatch.setattr(server, 'MODEL_PREDICTIONS_PATH', tmp_path / 'model_predictions.json')
    monkeypatch.setattr(server, 'PORTFOLIO_STRESS_TEST_PATH', tmp_path / 'portfolio_stress_test.json')


def test_health() -> None:
    client = TestClient(server.app)
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'service': 'bridgewater-ai-agent-backend'}


def test_recommendation_latest(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    client = TestClient(server.app)

    response = client.get('/recommendation/latest')

    assert response.status_code == 200
    assert response.json()['run_id'] == 'm04_test'


def test_recommendation_latest_auto_refresh_fresh_packet_does_not_regenerate(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet['generated_at'] = '2999-01-01T00:00:00Z'
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.setenv('RECOMMENDATION_PACKET_TTL_HOURS', '6')

    def fail_if_called() -> dict:
        raise AssertionError('fresh packet should not regenerate')

    monkeypatch.setattr(server, '_run_pipeline', fail_if_called)
    client = TestClient(server.app)

    response = client.get('/recommendation/latest?refresh=auto')
    payload = response.json()

    assert response.status_code == 200
    assert payload['run_id'] == 'm04_test'
    assert payload['packet_refresh_status'] == 'fresh'
    assert payload['packet_age_hours'] == 0.0


def test_recommendation_latest_auto_refresh_stale_packet_regenerates(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet['generated_at'] = '2000-01-01T00:00:00Z'
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.setenv('RECOMMENDATION_PACKET_TTL_HOURS', '6')
    calls = {'count': 0}

    def fake_run_pipeline() -> dict:
        calls['count'] += 1
        refreshed = _sample_packet()
        refreshed['run_id'] = 'm04_refreshed'
        refreshed['generated_at'] = '2999-01-01T00:00:00Z'
        return refreshed

    monkeypatch.setattr(server, '_run_pipeline', fake_run_pipeline)
    client = TestClient(server.app)

    response = client.get('/recommendation/latest?refresh=auto')
    payload = response.json()

    assert response.status_code == 200
    assert calls['count'] == 1
    assert payload['run_id'] == 'm04_refreshed'
    assert payload['packet_refresh_status'] == 'regenerated'
    assert payload['packet_age_hours'] == 0.0


def test_recommendation_latest_refresh_failure_returns_existing_packet_with_warning(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet['generated_at'] = '2000-01-01T00:00:00Z'
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.setenv('RECOMMENDATION_PACKET_TTL_HOURS', '6')

    def fail_refresh() -> dict:
        raise RuntimeError('pipeline unavailable')

    monkeypatch.setattr(server, '_run_pipeline', fail_refresh)
    client = TestClient(server.app)

    response = client.get('/recommendation/latest?refresh=auto')
    payload = response.json()

    assert response.status_code == 200
    assert payload['run_id'] == 'm04_test'
    assert payload['packet_refresh_status'] == 'stale_fallback'
    assert payload['packet_refresh_warning'] is True
    assert 'returning the existing stored packet' in payload['packet_refresh_message']
    assert payload['packet_age_hours'] > 0


def test_recommendation_latest_refresh_does_not_return_weaker_news_packet(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet['generated_at'] = '2000-01-01T00:00:00Z'
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.setenv('RECOMMENDATION_PACKET_TTL_HOURS', '6')

    def degraded_pipeline() -> dict:
        refreshed = _sample_packet()
        refreshed['run_id'] = 'm04_degraded'
        refreshed['generated_at'] = '2999-01-01T00:00:00Z'
        refreshed['news_evidence'] = {'NVDA': [], 'KO': []}
        return refreshed

    monkeypatch.setattr(server, '_run_pipeline', degraded_pipeline)
    client = TestClient(server.app)

    response = client.get('/recommendation/latest?refresh=auto')
    payload = response.json()
    stored = json.loads(packet_path.read_text(encoding='utf-8'))

    assert response.status_code == 200
    assert payload['run_id'] == 'm04_test'
    assert payload['packet_refresh_status'] == 'stale_fallback'
    assert 'news_evidence:NVDA:refreshed_empty' in payload['packet_refresh_regressions']
    assert stored['run_id'] == 'm04_test'


def test_recommendation_run_unsupported_ticker() -> None:
    client = TestClient(server.app)
    response = client.post('/recommendation/run', json={
        'ticker': 'MSFT',
        'company': 'Microsoft Corporation',
        'theme': 'Software',
        'question': 'Evaluate moat',
    })

    assert response.status_code == 400
    assert response.json() == {
        'error': 'unsupported_ticker',
        'message': 'Current backend demo supports NVDA and KO.',
    }


def test_indicator_explanation_builds_indicator_specific_context(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    _patch_indicator_sources(tmp_path, monkeypatch, packet)

    context, sources = server.build_indicator_explanation_context(
        packet=packet,
        ticker='NVDA',
        question='Explain this signal.',
        indicator_name='Supply chain risk',
    )

    assert context is not None
    assert context['indicator_name'] == 'Supply chain risk'
    assert context['indicator_config']['source_field'] == 'supply_chain_keyword_count'
    assert context['stock_feature_context']['raw_value'] == 3.0
    assert 'stock_features.NVDA.supply_chain_keyword_count' in sources
    assert 'news_evidence.NVDA' in sources
    assert context['news_evidence_context']


def test_indicator_explanation_two_indicators_produce_different_prompts(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    _patch_indicator_sources(tmp_path, monkeypatch, packet)

    context_a, sources_a = server.build_indicator_explanation_context(packet, 'NVDA', 'Explain this signal.', 'Supply chain risk')
    context_b, sources_b = server.build_indicator_explanation_context(packet, 'NVDA', 'Explain this signal.', 'AI demand momentum')
    assert context_a is not None and context_b is not None

    _, prompt_a = server.build_indicator_explanation_prompt(context_a, sources_a)
    _, prompt_b = server.build_indicator_explanation_prompt(context_b, sources_b)

    assert context_a['indicator_name'] != context_b['indicator_name']
    assert context_a['indicator_config']['source_field'] != context_b['indicator_config']['source_field']
    assert prompt_a != prompt_b
    assert 'Selected indicator: Supply chain risk' in prompt_a
    assert 'Selected indicator: AI demand momentum' in prompt_b


def test_chat_without_api_key_returns_missing_key(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.delenv('CLASS_LLM_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    client = TestClient(server.app)

    response = client.post('/chat', json={'ticker': 'NVDA', 'question': 'What are the biggest risks in the backend evidence?', 'mode': 'packet_qna'})

    assert response.status_code == 200
    payload = response.json()
    assert payload['grounded'] is True
    assert payload['mode'] == 'packet_qna'
    assert payload['llm_used'] is False
    assert payload['fallback_used'] is True
    assert payload['llm_error_type'] == 'missing_api_key'
    assert payload['class_llm_used'] is True
    assert payload['llm_error_message']
    assert payload['llm_model'] == llm_client.DEFAULT_CLASS_MODEL
    assert payload['llm_base_url_configured'] is True
    assert 'Hold for review' in payload['answer']
    assert 'sources_used' in payload and payload['sources_used']
    assert 'LLM call failed; deterministic packet summary used.' in payload['limitations']


def test_chat_diagnostics_never_include_api_key(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    secret = 'sk-test-secret-value'
    monkeypatch.setenv('CLASS_LLM_API_KEY', secret)

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': False,
            'fallback_used': True,
            'answer': '',
            'class_llm_used': True,
            'llm_error_type': 'api_error',
            'llm_error_message': f'provider rejected token {secret}',
            'llm_model': 'gpt-4o-mini',
            'llm_base_url_configured': False,
        }

    monkeypatch.setattr(server, 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={'ticker': 'NVDA', 'question': 'What are the biggest risks?', 'mode': 'packet_qna'}).json()

    serialized = json.dumps(payload)
    assert secret not in serialized
    assert 'sk-test-secret-value' not in payload['llm_error_message']
    assert 'provider rejected token' in payload['llm_error_message']


def test_indicator_explanation_missing_indicator_returns_safe_fallback(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    _patch_indicator_sources(tmp_path, monkeypatch, packet)
    monkeypatch.delenv('CLASS_LLM_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    client = TestClient(server.app)

    response = client.post('/chat', json={
        'ticker': 'NVDA',
        'question': 'Explain this signal.',
        'indicator_name': 'Competitive density',
        'mode': 'indicator_explanation',
    })

    payload = response.json()
    assert response.status_code == 200
    assert payload['mode'] == 'indicator_explanation'
    assert 'could not find an indicator named Competitive density' in payload['answer']


def test_indicator_explanation_mocked_llm_success(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    _patch_indicator_sources(tmp_path, monkeypatch, packet)
    captured: dict[str, str] = {}

    def fake_llm(*, system_prompt, user_prompt, **kwargs):
        captured['system_prompt'] = system_prompt
        captured['user_prompt'] = user_prompt
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': 'Focused indicator explanation.',
            'class_llm_used': True,
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_model': 'gpt-4o-mini',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(_indicator_skill_module(), 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={
        'ticker': 'NVDA',
        'question': 'Explain this signal.',
        'indicator_name': 'Supply chain risk',
        'mode': 'indicator_explanation',
    }).json()

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert payload['mode'] == 'indicator_explanation'
    assert payload['answer'] == 'Focused indicator explanation.'
    assert 'Selected indicator: Supply chain risk' in captured['user_prompt']
    assert 'supply_chain_keyword_count' in captured['user_prompt']


def test_indicator_explanation_llm_failure_returns_indicator_specific_fallback(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    _patch_indicator_sources(tmp_path, monkeypatch, packet)

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': False,
            'fallback_used': True,
            'answer': '',
            'class_llm_used': True,
            'llm_error_type': 'api_error',
            'llm_error_message': 'provider error',
            'llm_model': 'gpt-4o-mini',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(_indicator_skill_module(), 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={
        'ticker': 'NVDA',
        'question': 'Explain this signal.',
        'indicator_name': 'Supply chain risk',
        'mode': 'indicator_explanation',
    }).json()

    assert payload['llm_used'] is False
    assert payload['fallback_used'] is True
    assert payload['mode'] == 'indicator_explanation'
    assert 'Supply chain risk is currently classified as negative for NVDA.' in payload['answer']
    assert 'weight of 0.12' in payload['answer']
    assert 'confidence of 0.525' in payload['answer']
    assert 'supply_chain_keyword_count' in payload['answer']
    assert 'stock_features.NVDA.supply_chain_keyword_count' in payload['sources_used']
    assert 'LLM call failed; deterministic packet summary used.' in payload['limitations']


def test_chat_junior_memo_mode_returns_grounded_draft(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.delenv('CLASS_LLM_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    client = TestClient(server.app)

    response = client.post('/chat', json={'ticker': 'NVDA', 'question': 'Draft a memo.', 'mode': 'junior_memo'})
    payload = response.json()

    assert response.status_code == 200
    assert payload['mode'] == 'junior_memo'
    assert payload['grounded'] is True
    assert payload['fallback_used'] is True
    assert payload['llm_error_type'] == 'missing_api_key'
    assert 'PM approval is required' in payload['answer']
    assert 'company_theses.NVDA' in payload['sources_used']


def test_chat_senior_risk_handoff_has_no_routing_claim(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.delenv('CLASS_LLM_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    client = TestClient(server.app)

    response = client.post('/chat', json={'ticker': 'NVDA', 'question': 'Draft a risk handoff.', 'mode': 'senior_risk_handoff'})
    payload = response.json()

    assert response.status_code == 200
    assert payload['mode'] == 'senior_risk_handoff'
    assert 'does not claim any routing has happened' in payload['answer']
    assert 'portfolio_stress_test' in payload['sources_used']


def test_chat_trade_proposal_rationale_does_not_claim_execution(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.delenv('CLASS_LLM_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    client = TestClient(server.app)

    response = client.post('/chat', json={'ticker': 'NVDA', 'question': 'Draft proposal rationale.', 'mode': 'trade_proposal_rationale'})
    payload = response.json()

    assert response.status_code == 200
    assert payload['mode'] == 'trade_proposal_rationale'
    assert 'proposal rationale only' in payload['answer']
    assert 'does not approve or execute' in payload['answer']
    assert 'model_predictions' not in payload['sources_used']
    assert 'model_comparison' not in payload['sources_used']
    assert payload['grounded'] is True


def test_chat_with_mocked_class_llm_success(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': 'Grounded class LLM draft for NVDA based only on packet context.',
            'class_llm_used': True,
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_model': 'gpt-4o-mini',
            'llm_base_url_configured': False,
        }

    monkeypatch.setattr(server, 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={'ticker': 'NVDA', 'question': 'Draft a memo.', 'mode': 'junior_memo'}).json()

    assert payload['llm_used'] is True
    assert payload['fallback_used'] is False
    assert payload['class_llm_used'] is True
    assert payload['mode'] == 'junior_memo'
    assert payload['answer'] == 'Grounded class LLM draft for NVDA based only on packet context.'
    assert payload['sources_used']


def test_chat_with_class_llm_api_error_falls_back(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': False,
            'fallback_used': True,
            'answer': '',
            'class_llm_used': True,
            'llm_error_type': 'api_error',
            'llm_error_message': 'Class LLM provider returned a server error.',
            'llm_model': 'gpt-4o-mini',
            'llm_base_url_configured': False,
        }

    monkeypatch.setattr(server, 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={'ticker': 'NVDA', 'question': 'What are the biggest risks?', 'mode': 'packet_qna'}).json()

    assert payload['llm_used'] is False
    assert payload['fallback_used'] is True
    assert payload['class_llm_used'] is True
    assert payload['llm_error_type'] == 'api_error'
    assert 'LLM call failed; deterministic packet summary used.' in payload['limitations']
    assert 'Hold for review' in payload['answer']


def test_invalid_anthropic_key_does_not_block_class_llm_path(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, _sample_packet())
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.setenv('CLASS_LLM_API_KEY', 'class-key-placeholder')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'not-a-real-anthropic-key')

    def fake_llm(*args, **kwargs):
        return {
            'llm_used': True,
            'fallback_used': False,
            'answer': 'Class path won before Anthropic was considered.',
            'class_llm_used': True,
            'llm_error_type': None,
            'llm_error_message': None,
            'llm_model': 'gpt-4o-mini',
            'llm_base_url_configured': True,
        }

    monkeypatch.setattr(server, 'run_grounded_chat_completion', fake_llm)
    client = TestClient(server.app)
    payload = client.post('/chat', json={'ticker': 'NVDA', 'question': 'Draft a memo.', 'mode': 'junior_memo'}).json()

    assert payload['llm_used'] is True
    assert payload['class_llm_used'] is True
    assert payload['answer'] == 'Class path won before Anthropic was considered.'


def test_recommendation_fields_unchanged_in_chat_response(tmp_path: Path, monkeypatch) -> None:
    packet_path = tmp_path / 'recommendation_packet.json'
    packet = _sample_packet()
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    monkeypatch.delenv('CLASS_LLM_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    client = TestClient(server.app)

    payload = client.post('/chat', json={'ticker': 'NVDA', 'question': 'What are the biggest risks?', 'mode': 'packet_qna'}).json()
    assert payload['ticker'] == 'NVDA'
    assert packet['recommendations']['NVDA']['action'] == 'hold_review'
    assert packet['human_review']['pm_approval_required'] is True


def test_no_api_key_is_hardcoded() -> None:
    llm_client_text = Path(__file__).resolve().parents[2].joinpath('tools', 'llm_client.py').read_text(encoding='utf-8')
    assert 'CLASS_LLM_API_KEY' in llm_client_text
    assert 'LLM_MODEL' in llm_client_text
    assert 'LLM_BASE_URL' in llm_client_text
    assert 'sk-test-secret-value' not in llm_client_text
    assert 'neural_network' not in llm_client_text


def test_indicator_explanation_missing_indicator_name_returns_safe_fallback(tmp_path: Path, monkeypatch) -> None:
    packet = _sample_packet()
    packet_path = tmp_path / 'recommendation_packet.json'
    _write_json(packet_path, packet)
    monkeypatch.setattr(server, 'PACKET_PATH', packet_path)
    _patch_indicator_sources(tmp_path, monkeypatch, packet)
    client = TestClient(server.app)

    response = client.post('/chat', json={
        'ticker': 'NVDA',
        'question': 'Explain this signal.',
        'mode': 'indicator_explanation',
    })

    payload = response.json()
    assert response.status_code == 200
    assert payload['mode'] == 'indicator_explanation'
    assert payload['fallback_used'] is True
    assert 'could not find an indicator named the requested indicator' in payload['answer']
