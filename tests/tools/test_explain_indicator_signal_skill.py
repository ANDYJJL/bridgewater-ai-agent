from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_PATH = REPO_ROOT / 'skills' / 'explain-indicator-signal' / 'run.py'

_spec = importlib.util.spec_from_file_location('indicator_explanation_skill_test', SKILL_PATH)
module = importlib.util.module_from_spec(_spec)
assert _spec is not None and _spec.loader is not None
_spec.loader.exec_module(module)

ALL_INDICATORS = [
    'AI demand momentum',
    'Data center growth',
    'Gross margin quality',
    'Export control risk',
    'Supply chain risk',
    'Valuation sensitivity',
    'Hyperscaler capex dependence',
]


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
    indicators = [
        {'name': 'AI demand momentum', 'score': 1.0, 'weight': 0.17, 'confidence': 0.61, 'direction': 'positive', 'evidence_refs': ['stock_features:20d_return', 'model_prediction:QQQ', 'news_evidence', 'filing_evidence'], 'data_limitations': []},
        {'name': 'Data center growth', 'score': 0.8, 'weight': 0.14, 'confidence': 0.64, 'direction': 'positive', 'evidence_refs': ['stock_features:revenue_growth', 'model_prediction:QQQ', 'filing_evidence'], 'data_limitations': []},
        {'name': 'Gross margin quality', 'score': 0.7, 'weight': 0.14, 'confidence': 0.66, 'direction': 'positive', 'evidence_refs': ['stock_features:gross_margin', 'filing_evidence'], 'data_limitations': []},
        {'name': 'Export control risk', 'score': -0.9, 'weight': 0.15, 'confidence': 0.58, 'direction': 'negative', 'evidence_refs': ['stock_features:export_control_keyword_count', 'news_evidence'], 'data_limitations': []},
        {'name': 'Supply chain risk', 'score': -1.0, 'weight': 0.12, 'confidence': 0.53, 'direction': 'negative', 'evidence_refs': ['stock_features:supply_chain_keyword_count', 'model_prediction:QQQ', 'news_evidence', 'filing_evidence'], 'data_limitations': []},
        {'name': 'Valuation sensitivity', 'score': -0.4, 'weight': 0.12, 'confidence': 0.55, 'direction': 'negative', 'evidence_refs': ['stock_features:60d_volatility', 'model_prediction:QQQ'], 'data_limitations': []},
        {'name': 'Hyperscaler capex dependence', 'score': -0.2, 'weight': 0.16, 'confidence': 0.57, 'direction': 'negative', 'evidence_refs': ['stock_features:capex_keyword_count', 'news_evidence', 'model_prediction:QQQ'], 'data_limitations': []},
    ]
    return {
        'recommendations': {'NVDA': {'action': 'hold_review', 'confidence_score': 0.22}},
        'indicator_scorecards': {'scorecards': [{'ticker': 'NVDA', 'aggregate_indicator_score': -0.1, 'confidence_score': 0.22, 'recommendation_band': 'reduce', 'indicators': indicators, 'data_limitations': ['transparent_fallback_used_due_to_official_model_policy']}]},
        'news_evidence': {'NVDA': []},
        'filing_evidence': {'NVDA': {}},
        'model_predictions': {'predictions': {'NVDA': {'benchmark': 'QQQ', 'outperform_probability': 0.55, 'model_confidence': 0.22, 'predicted_return_bucket': 'slightly_positive', 'top_features': ['20d_return']}}},
        'portfolio_stress_test': {'scenarios': []},
    }


def _write_supporting_files(tmp_path: Path) -> tuple[dict, dict[str, Path]]:
    packet = _sample_packet()
    paths = {
        'indicator_scorecards_path': tmp_path / 'indicator_scorecards.json',
        'indicator_config_path': tmp_path / 'indicator_config.json',
        'stock_features_path': tmp_path / 'stock_features.csv',
        'news_evidence_path': tmp_path / 'news_evidence.json',
        'filing_evidence_path': tmp_path / 'filing_evidence.json',
        'model_predictions_path': tmp_path / 'model_predictions.json',
        'portfolio_stress_test_path': tmp_path / 'portfolio_stress_test.json',
    }
    _write_json(paths['indicator_scorecards_path'], packet['indicator_scorecards'])
    _write_json(paths['indicator_config_path'], {
        'NVDA': {
            'indicators': [
                {'name': 'AI demand momentum', 'weight': 0.17, 'source_field': '20d_return', 'positive_threshold': 0.03, 'negative_threshold': -0.03, 'description': 'AI-demand signal.'},
                {'name': 'Data center growth', 'weight': 0.14, 'source_field': 'revenue_growth', 'positive_threshold': 0.1, 'negative_threshold': -0.05, 'description': 'Revenue-growth proxy for data center demand.'},
                {'name': 'Gross margin quality', 'weight': 0.14, 'source_field': 'gross_margin', 'positive_threshold': 0.55, 'negative_threshold': 0.45, 'description': 'Margin quality signal.'},
                {'name': 'Export control risk', 'weight': 0.15, 'source_field': 'export_control_keyword_count', 'positive_threshold': 0.0, 'negative_threshold': 2.0, 'inverse': True, 'description': 'Policy restriction signal.'},
                {'name': 'Supply chain risk', 'weight': 0.12, 'source_field': 'supply_chain_keyword_count', 'positive_threshold': 0.0, 'negative_threshold': 2.0, 'inverse': True, 'description': 'Supply-chain stress signal.'},
                {'name': 'Valuation sensitivity', 'weight': 0.12, 'source_field': '60d_volatility', 'positive_threshold': 0.02, 'negative_threshold': 0.05, 'inverse': True, 'description': 'Valuation-risk proxy.'},
                {'name': 'Hyperscaler capex dependence', 'weight': 0.16, 'source_field': 'capex_keyword_count', 'positive_threshold': 0.0, 'negative_threshold': 2.0, 'inverse': True, 'description': 'Customer capex dependency signal.'},
            ]
        }
    })
    _write_csv(
        paths['stock_features_path'],
        [{'ticker': 'NVDA', 'as_of_date': '2026-05-21', '20d_return': 0.08, '60d_return': 0.12, '20d_volatility': 0.03, '60d_volatility': 0.05, 'relative_return_vs_benchmark_60d': 0.02, 'revenue_growth': 0.42, 'gross_margin': 0.61, 'operating_margin': 0.33, 'debt_to_assets': 0.08, 'macro_unrate_latest': 4.3, 'export_control_keyword_count': 2, 'supply_chain_keyword_count': 3, 'capex_keyword_count': 1, 'inflation_keyword_count': 0, 'data_completeness_score': 1.0}],
        ['ticker', 'as_of_date', '20d_return', '60d_return', '20d_volatility', '60d_volatility', 'relative_return_vs_benchmark_60d', 'revenue_growth', 'gross_margin', 'operating_margin', 'debt_to_assets', 'macro_unrate_latest', 'export_control_keyword_count', 'supply_chain_keyword_count', 'capex_keyword_count', 'inflation_keyword_count', 'data_completeness_score'],
    )
    _write_json(paths['news_evidence_path'], {'articles': [
        {'ticker': 'NVDA', 'source_name': 'Example News 1', 'published_at': '2026-05-18', 'keyword_hits': {'supply_chain': 3, 'AI_demand': 1}, 'evidence_chunks': ['Supply chain constraints remain active'], 'clean_text': 'Supply chain constraints remain active for NVIDIA suppliers', 'url': 'https://example.com/1'},
        {'ticker': 'NVDA', 'source_name': 'Example News 2', 'published_at': '2026-05-17', 'keyword_hits': {'export_control': 2}, 'evidence_chunks': ['Export controls remain a live policy risk'], 'clean_text': 'Export controls remain a live policy risk for advanced chips', 'url': 'https://example.com/2'},
        {'ticker': 'NVDA', 'source_name': 'Example News 3', 'published_at': '2026-05-16', 'keyword_hits': {'capex': 2}, 'evidence_chunks': ['Hyperscaler capex pacing is under debate'], 'clean_text': 'Hyperscaler capex pacing is under debate', 'url': 'https://example.com/3'},
    ]})
    _write_json(paths['filing_evidence_path'], {'tickers': {'NVDA': {'computed_metrics': {'revenue_growth': 0.42, 'gross_margin': 0.61, 'operating_margin': 0.33}, 'facts': {'revenue': {'value': 100.0, 'fact_name': 'Revenue', 'fiscal_year': 2026, 'form': '10-K'}, 'gross_profit': {'value': 61.0, 'fact_name': 'GrossProfit', 'fiscal_year': 2026, 'form': '10-K'}}}}})
    _write_json(paths['model_predictions_path'], {'predictions': {'NVDA': {'benchmark': 'QQQ', 'outperform_probability': 0.55, 'model_confidence': 0.22, 'predicted_return_bucket': 'slightly_positive', 'top_features': ['20d_return']}}})
    _write_json(paths['portfolio_stress_test_path'], {'scenarios': [{'scenario_id': 'supply_chain_disruption', 'ticker_level_impacts': {'NVDA': {'downside_range': [-0.2, -0.1], 'main_driver': 'supply_chain_disruption'}}}, {'scenario_id': 'export_control_tightening', 'ticker_level_impacts': {'NVDA': {'downside_range': [-0.25, -0.12], 'main_driver': 'export_control_tightening'}}}], 'main_risk_drivers': ['supply_chain_disruption', 'export_control_tightening']})
    return packet, paths


def test_each_indicator_name_resolves_correctly(tmp_path: Path) -> None:
    packet, paths = _write_supporting_files(tmp_path)
    for indicator_name in ALL_INDICATORS:
        context, sources = module.build_indicator_explanation_context(packet, 'NVDA', 'Explain this signal.', indicator_name.lower(), **paths)
        assert context is not None
        assert context['indicator_name'] == indicator_name
        assert any(indicator_name in source for source in sources)


def test_different_indicators_produce_different_context_and_prompts(tmp_path: Path) -> None:
    packet, paths = _write_supporting_files(tmp_path)
    context_a, sources_a = module.build_indicator_explanation_context(packet, 'NVDA', 'Explain this signal.', 'Supply chain risk', **paths)
    context_b, sources_b = module.build_indicator_explanation_context(packet, 'NVDA', 'Explain this signal.', 'Gross margin quality', **paths)
    _, prompt_a = module.build_indicator_explanation_prompt(context_a, sources_a)
    _, prompt_b = module.build_indicator_explanation_prompt(context_b, sources_b)
    assert context_a['indicator_name'] != context_b['indicator_name']
    assert context_a['indicator_config']['source_field'] != context_b['indicator_config']['source_field']
    assert prompt_a != prompt_b


def test_missing_indicator_name_returns_safe_fallback(tmp_path: Path) -> None:
    packet, paths = _write_supporting_files(tmp_path)
    result = module.run_indicator_explanation(packet, 'NVDA', None, 'Explain this signal.', **paths)
    assert result['llm_used'] is False
    assert result['fallback_used'] is True
    assert 'could not find an indicator named the requested indicator' in result['answer']


def test_prompt_is_compact(tmp_path: Path) -> None:
    packet, paths = _write_supporting_files(tmp_path)
    context, sources = module.build_indicator_explanation_context(packet, 'NVDA', 'Explain this signal.', 'Export control risk', **paths)
    system_prompt, user_prompt = module.build_indicator_explanation_prompt(context, sources)
    assert 'Selected indicator: Export control risk' in user_prompt
    assert len(system_prompt) < 1200
    assert len(user_prompt) < 5000


def test_llm_success_returns_true(tmp_path: Path, monkeypatch) -> None:
    packet, paths = _write_supporting_files(tmp_path)
    captured = {}
    def fake_llm(*, system_prompt, user_prompt, max_tokens=None, **kwargs):
        captured['max_tokens'] = max_tokens
        return {'llm_used': True, 'answer': 'Focused explanation', 'class_llm_used': True, 'llm_error_type': None, 'llm_error_message': None, 'llm_model': 'claude-sonnet-4-6', 'llm_base_url_configured': True}
    monkeypatch.setattr(module, 'run_grounded_chat_completion', fake_llm)
    result = module.run_indicator_explanation(packet, 'NVDA', 'Gross margin quality', 'Explain this signal.', **paths)
    assert result['llm_used'] is True
    assert result['fallback_used'] is False
    assert result['answer'] == 'Focused explanation'
    assert captured['max_tokens'] == 220


def test_timeout_returns_indicator_specific_fallback(tmp_path: Path, monkeypatch) -> None:
    packet, paths = _write_supporting_files(tmp_path)
    def fake_llm(*args, **kwargs):
        return {'llm_used': False, 'answer': '', 'class_llm_used': True, 'llm_error_type': 'timeout', 'llm_error_message': 'timed out', 'llm_model': 'claude-sonnet-4-6', 'llm_base_url_configured': True}
    monkeypatch.setattr(module, 'run_grounded_chat_completion', fake_llm)
    result = module.run_indicator_explanation(packet, 'NVDA', 'Gross margin quality', 'Explain this signal.', **paths)
    assert result['llm_used'] is False
    assert result['fallback_used'] is True
    assert 'Gross margin quality is currently classified as positive for NVDA.' in result['answer']
    assert result['llm_error_type'] == 'timeout'
    assert result['class_llm_used'] is True
    assert result['llm_base_url_configured'] is True
