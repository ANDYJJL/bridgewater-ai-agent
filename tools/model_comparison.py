from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

try:
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.linear_model import LogisticRegression, Ridge
    from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error, r2_score, roc_auc_score
except Exception:  # pragma: no cover
    RandomForestClassifier = None
    RandomForestRegressor = None
    LogisticRegression = None
    Ridge = None
    accuracy_score = None
    mean_absolute_error = None
    mean_squared_error = None
    r2_score = None
    roc_auc_score = None

from tools.milestone04_common import BENCHMARK_BY_TICKER, TARGET_TICKERS, clamp, parse_float, utc_now_iso, write_json
from tools.predict_outperformance import FEATURE_NAMES, _common_series, _feature_row, _future_label, _latest_market_features


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open('r', encoding='utf-8', newline='') as handle:
        return list(csv.DictReader(handle))


def _read_snapshot_features(path: Path) -> dict[str, dict[str, str]]:
    rows = _read_csv_rows(path)
    return {row['ticker']: row for row in rows if row.get('ticker')}


def _build_dataset(market_dir: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ticker in TARGET_TICKERS:
        benchmark = BENCHMARK_BY_TICKER[ticker]
        series = _common_series(market_dir / f'{ticker}_prices.csv', market_dir / f'{benchmark}_prices.csv')
        stock_values = [item[1] for item in series]
        benchmark_values = [item[2] for item in series]
        for index in range(60, len(series) - 60):
            feature_values = _feature_row(stock_values, benchmark_values, index)
            label = _future_label(stock_values, benchmark_values, index)
            if feature_values is None or label is None:
                continue
            forward_return = (stock_values[index + 60] - stock_values[index]) / abs(stock_values[index]) if stock_values[index] else None
            if forward_return is None:
                continue
            rows.append({
                'ticker': ticker,
                'date': series[index][0],
                'features': feature_values,
                'label': label,
                'forward_return': float(forward_return),
            })
    rows.sort(key=lambda item: (item['date'], item['ticker']))
    return rows


def _bucket(probability: float | None) -> str | None:
    if probability is None:
        return None
    if probability < 0.4:
        return 'negative'
    if probability < 0.55:
        return 'neutral'
    if probability < 0.7:
        return 'slightly_positive'
    return 'positive'


def _class_balance(labels: list[int]) -> dict[str, Any]:
    if not labels:
        return {'positive_rate': None, 'negative_rate': None}
    positive_rate = sum(labels) / len(labels)
    return {'positive_rate': round(positive_rate, 6), 'negative_rate': round(1 - positive_rate, 6)}


def _classification_confidence(training_count: int, test_count: int, accuracy: float | None, roc_auc: float | None, positive_rate: float | None, data_completeness: float | None) -> float:
    data_factor = min(training_count / 400.0, 1.0)
    test_factor = min(test_count / 120.0, 1.0)
    metric_inputs = [value for value in [accuracy, roc_auc] if value is not None]
    metric_average = sum(metric_inputs) / len(metric_inputs) if metric_inputs else 0.5
    metric_factor = clamp((metric_average - 0.5) / 0.25, 0.0, 1.0)
    balance_factor = 0.0 if positive_rate is None else max(0.0, 1.0 - abs(positive_rate - 0.5) * 2.0)
    completeness_factor = data_completeness if data_completeness is not None else 0.5
    raw = 0.05 + (0.12 * data_factor) + (0.08 * test_factor) + (0.25 * metric_factor) + (0.10 * balance_factor) + (0.10 * completeness_factor)
    return round(clamp(raw, 0.05, 0.65), 6)


def _regression_confidence(training_count: int, test_count: int, r2: float | None, mae: float | None, rmse: float | None, data_completeness: float | None) -> float:
    data_factor = min(training_count / 400.0, 1.0)
    test_factor = min(test_count / 120.0, 1.0)
    r2_factor = 0.0 if r2 is None else clamp((r2 + 0.1) / 0.6, 0.0, 1.0)
    error_penalty = 0.0
    if mae is not None:
        error_penalty += min(abs(mae) / 0.25, 1.0)
    if rmse is not None:
        error_penalty += min(abs(rmse) / 0.35, 1.0)
    error_factor = 1.0 - min(error_penalty / 2.0, 1.0)
    completeness_factor = data_completeness if data_completeness is not None else 0.5
    raw = 0.05 + (0.10 * data_factor) + (0.08 * test_factor) + (0.20 * r2_factor) + (0.12 * error_factor) + (0.10 * completeness_factor)
    return round(clamp(raw, 0.05, 0.55), 6)


def _classification_metrics(y_true: list[int], probabilities: list[float]) -> dict[str, Any]:
    if accuracy_score is None:
        return {'accuracy': None, 'roc_auc': None, 'test_row_count': len(y_true), 'class_balance': _class_balance(y_true)}
    predictions = [1 if value >= 0.5 else 0 for value in probabilities]
    accuracy = float(accuracy_score(y_true, predictions)) if y_true else None
    roc_auc = None
    if roc_auc_score is not None and y_true and len(set(y_true)) == 2:
        roc_auc = float(roc_auc_score(y_true, probabilities))
    return {
        'accuracy': None if accuracy is None else round(accuracy, 6),
        'roc_auc': None if roc_auc is None else round(roc_auc, 6),
        'test_row_count': len(y_true),
        'class_balance': _class_balance(y_true),
    }


def _regression_metrics(y_true: list[float], predictions: list[float]) -> dict[str, Any]:
    if mean_absolute_error is None or mean_squared_error is None or r2_score is None:
        return {'mae': None, 'rmse': None, 'r2': None}
    mae = float(mean_absolute_error(y_true, predictions)) if y_true else None
    rmse = float(math.sqrt(mean_squared_error(y_true, predictions))) if y_true else None
    r2 = float(r2_score(y_true, predictions)) if y_true else None
    return {
        'mae': None if mae is None else round(mae, 6),
        'rmse': None if rmse is None else round(rmse, 6),
        'r2': None if r2 is None else round(r2, 6),
    }


def _empty_classifier(status: str, limitations: list[str]) -> dict[str, Any]:
    return {
        'status': status,
        'outperform_probability': None,
        'model_confidence': None,
        'training_row_count': 0,
        'test_row_count': 0,
        'features_used': FEATURE_NAMES,
        'validation_metrics': {'accuracy': None, 'roc_auc': None, 'test_row_count': 0, 'class_balance': {'positive_rate': None, 'negative_rate': None}},
        'limitations': limitations,
    }


def _empty_regressor(status: str, limitations: list[str]) -> dict[str, Any]:
    return {
        'status': status,
        'validation_status': 'failed' if status != 'success' else 'weak_validation',
        'price_estimate_usable': False,
        'predicted_60d_return': None,
        'current_price': None,
        'predicted_60d_price': None,
        'model_confidence': None,
        'training_row_count': 0,
        'test_row_count': 0,
        'features_used': FEATURE_NAMES,
        'validation_metrics': {'mae': None, 'rmse': None, 'r2': None},
        'baseline_metrics': {'baseline_type': None, 'mae': None, 'rmse': None},
        'beats_baseline': False,
        'limitations': limitations,
    }


def _winsorize_bounds(values: list[float], lower_q: float = 0.05, upper_q: float = 0.95) -> tuple[float, float] | None:
    if not values:
        return None
    ordered = sorted(values)
    lower_index = min(max(int((len(ordered) - 1) * lower_q), 0), len(ordered) - 1)
    upper_index = min(max(int((len(ordered) - 1) * upper_q), 0), len(ordered) - 1)
    return ordered[lower_index], ordered[upper_index]


def _apply_winsorization(values: list[float], bounds: tuple[float, float] | None) -> list[float]:
    if bounds is None:
        return list(values)
    lower, upper = bounds
    return [min(max(value, lower), upper) for value in values]


def _baseline_metrics(y_train: list[float], y_test: list[float]) -> dict[str, Any]:
    if not y_test:
        return {'baseline_type': 'historical_mean_forward_return', 'mae': None, 'rmse': None}
    baseline_value = sum(y_train) / len(y_train) if y_train else 0.0
    predictions = [baseline_value for _ in y_test]
    if mean_absolute_error is None or mean_squared_error is None:
        return {'baseline_type': 'historical_mean_forward_return', 'mae': None, 'rmse': None}
    mae = float(mean_absolute_error(y_test, predictions))
    rmse = float(math.sqrt(mean_squared_error(y_test, predictions)))
    return {
        'baseline_type': 'historical_mean_forward_return',
        'mae': round(mae, 6),
        'rmse': round(rmse, 6),
    }


def _regression_validation_status(metrics: dict[str, Any], baseline: dict[str, Any], test_row_count: int, model_confidence: float) -> tuple[str, bool, list[str], bool]:
    limitations: list[str] = []
    beats_baseline = False
    mae = metrics.get('mae')
    rmse = metrics.get('rmse')
    r2 = metrics.get('r2')
    baseline_mae = baseline.get('mae')
    baseline_rmse = baseline.get('rmse')
    if mae is not None and rmse is not None and baseline_mae is not None and baseline_rmse is not None:
        beats_baseline = mae < baseline_mae and rmse <= baseline_rmse
    if not beats_baseline:
        limitations.append('does_not_beat_baseline')
    weak = False
    if r2 is None or r2 < 0:
        weak = True
        limitations.append('experimental_price_forecast_low_validation_quality')
    if test_row_count < 30:
        weak = True
        limitations.append('small_regression_test_window')
    if model_confidence < 0.5:
        weak = True
    validation_status = 'weak_validation' if weak else 'passed'
    price_estimate_usable = not weak and beats_baseline
    return validation_status, price_estimate_usable, sorted(set(limitations)), beats_baseline


def _latest_current_price(market_dir: Path, ticker: str) -> float | None:
    benchmark = BENCHMARK_BY_TICKER[ticker]
    series = _common_series(market_dir / f'{ticker}_prices.csv', market_dir / f'{benchmark}_prices.csv')
    if not series:
        return None
    return float(series[-1][1])


def _train_classifier(model: Any, x_train: list[list[float]], y_train: list[int], x_test: list[list[float]], y_test: list[int], latest_inputs: dict[str, list[float] | None], snapshot_features: dict[str, dict[str, str]]) -> tuple[dict[str, Any], dict[str, Any]]:
    limitations = ['historical_training_uses_market_derived_features_only']
    model.fit(x_train, y_train)
    test_probabilities = [float(value[1]) for value in model.predict_proba(x_test)]
    metrics = _classification_metrics(y_test, test_probabilities)
    top_level = {
        'status': 'success',
        'outperform_probability': None,
        'model_confidence': None,
        'training_row_count': len(x_train),
        'test_row_count': len(x_test),
        'features_used': FEATURE_NAMES,
        'validation_metrics': metrics,
        'limitations': list(limitations),
    }
    per_ticker: dict[str, Any] = {}
    positive_rate = metrics['class_balance']['positive_rate']
    for ticker in TARGET_TICKERS:
        latest = latest_inputs.get(ticker)
        ticker_limits = list(limitations)
        if latest is None:
            per_ticker[ticker] = {
                'status': 'insufficient_training_data',
                'outperform_probability': None,
                'model_confidence': None,
                'training_row_count': len(x_train),
                'test_row_count': len(x_test),
                'features_used': FEATURE_NAMES,
                'validation_metrics': metrics,
                'limitations': ticker_limits + ['missing_latest_market_features'],
            }
            continue
        probability = float(model.predict_proba([latest])[0][1])
        completeness = parse_float((snapshot_features.get(ticker) or {}).get('data_completeness_score'))
        confidence = _classification_confidence(len(x_train), len(x_test), metrics['accuracy'], metrics['roc_auc'], positive_rate, completeness)
        per_ticker[ticker] = {
            'status': 'success',
            'outperform_probability': round(probability, 6),
            'model_confidence': confidence,
            'predicted_return_bucket': _bucket(probability),
            'training_row_count': len(x_train),
            'test_row_count': len(x_test),
            'features_used': FEATURE_NAMES,
            'validation_metrics': metrics,
            'limitations': ticker_limits,
        }
    return top_level, per_ticker


def _train_regressor(model: Any, x_train: list[list[float]], y_train: list[float], x_test: list[list[float]], y_test: list[float], latest_inputs: dict[str, list[float] | None], snapshot_features: dict[str, dict[str, str]], market_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    limitations = ['market_derived_features_only', 'not_used_for_official_recommendation', 'target_returns_winsorized_for_stability']
    bounds = _winsorize_bounds(y_train)
    y_train_winsorized = _apply_winsorization(y_train, bounds)
    y_test_winsorized = _apply_winsorization(y_test, bounds)
    model.fit(x_train, y_train_winsorized)
    test_predictions = [float(value) for value in model.predict(x_test)]
    metrics = _regression_metrics(y_test, test_predictions)
    baseline = _baseline_metrics(y_train_winsorized, y_test_winsorized)
    top_level = {
        'status': 'success',
        'validation_status': 'weak_validation',
        'price_estimate_usable': False,
        'predicted_60d_return': None,
        'current_price': None,
        'predicted_60d_price': None,
        'model_confidence': None,
        'training_row_count': len(x_train),
        'test_row_count': len(x_test),
        'features_used': FEATURE_NAMES,
        'validation_metrics': metrics,
        'baseline_metrics': baseline,
        'beats_baseline': False,
        'limitations': list(limitations),
    }
    per_ticker: dict[str, Any] = {}
    for ticker in TARGET_TICKERS:
        latest = latest_inputs.get(ticker)
        current_price = _latest_current_price(market_dir, ticker)
        ticker_limits = list(limitations)
        if latest is None:
            per_ticker[ticker] = {
                'status': 'insufficient_training_data',
                'validation_status': 'failed',
                'price_estimate_usable': False,
                'predicted_60d_return': None,
                'current_price': current_price,
                'predicted_60d_price': None,
                'model_confidence': None,
                'training_row_count': len(x_train),
                'test_row_count': len(x_test),
                'features_used': FEATURE_NAMES,
                'validation_metrics': metrics,
                'baseline_metrics': baseline,
                'beats_baseline': False,
                'limitations': ticker_limits + ['missing_latest_market_features'],
            }
            continue
        if current_price is None:
            per_ticker[ticker] = {
                'status': 'unavailable_current_price',
                'validation_status': 'failed',
                'price_estimate_usable': False,
                'predicted_60d_return': None,
                'current_price': None,
                'predicted_60d_price': None,
                'model_confidence': None,
                'training_row_count': len(x_train),
                'test_row_count': len(x_test),
                'features_used': FEATURE_NAMES,
                'validation_metrics': metrics,
                'baseline_metrics': baseline,
                'beats_baseline': False,
                'limitations': ticker_limits + ['unavailable_current_price'],
            }
            continue
        predicted_return = float(model.predict([latest])[0])
        predicted_price = current_price * (1.0 + predicted_return)
        completeness = parse_float((snapshot_features.get(ticker) or {}).get('data_completeness_score'))
        confidence = _regression_confidence(len(x_train), len(x_test), metrics['r2'], metrics['mae'], metrics['rmse'], completeness)
        validation_status, price_estimate_usable, validation_limits, beats_baseline = _regression_validation_status(metrics, baseline, len(x_test), confidence)
        per_ticker[ticker] = {
            'status': 'success',
            'validation_status': validation_status,
            'price_estimate_usable': price_estimate_usable,
            'predicted_60d_return': round(predicted_return, 6),
            'current_price': round(current_price, 6),
            'predicted_60d_price': round(predicted_price, 6),
            'model_confidence': confidence,
            'training_row_count': len(x_train),
            'test_row_count': len(x_test),
            'features_used': FEATURE_NAMES,
            'validation_metrics': metrics,
            'baseline_metrics': baseline,
            'beats_baseline': beats_baseline,
            'limitations': sorted(set(ticker_limits + validation_limits)),
        }
    successful_entries = [value for value in per_ticker.values() if value.get('status') == 'success']
    if successful_entries:
        top_level['model_confidence'] = round(sum(float(item['model_confidence']) for item in successful_entries) / len(successful_entries), 6)
        top_level['beats_baseline'] = any(bool(item.get('beats_baseline')) for item in successful_entries)
        if all(item.get('validation_status') == 'passed' for item in successful_entries):
            top_level['validation_status'] = 'passed'
        top_level['price_estimate_usable'] = top_level['validation_status'] == 'passed' and top_level['beats_baseline'] and float(top_level['model_confidence']) >= 0.5
        top_level['limitations'] = sorted(set(top_level['limitations'] + [lim for item in successful_entries for lim in item.get('limitations', [])]))
    else:
        top_level['model_confidence'] = 0.05
    return top_level, per_ticker


def compare_models_for_review(
    market_dir: str = 'data/raw/market',
    stock_features_path: str = 'data/processed/stock_features.csv',
    official_model_path: str = 'data/processed/model_predictions.json',
    output_path: str = 'data/processed/model_comparison.json',
) -> dict[str, Any]:
    market_root = Path(market_dir)
    snapshot_features = _read_snapshot_features(Path(stock_features_path))
    official_model = json.loads(Path(official_model_path).read_text(encoding='utf-8')) if Path(official_model_path).exists() else {}
    official_model_type = official_model.get('model_type', 'unknown')

    unavailable = any(item is None for item in [RandomForestClassifier, RandomForestRegressor, Ridge, LogisticRegression, accuracy_score, mean_absolute_error, mean_squared_error, r2_score])
    dataset = _build_dataset(market_root)
    latest_inputs: dict[str, list[float] | None] = {}
    latest_limitations: dict[str, list[str]] = {}
    for ticker in TARGET_TICKERS:
        features, limits = _latest_market_features(market_root, ticker)
        latest_inputs[ticker] = features
        latest_limitations[ticker] = limits

    result: dict[str, Any] = {
        'tool_name': 'model_comparison',
        'generated_at': utc_now_iso(),
        'target': 'outperform benchmark over next 60 trading days',
        'status': 'unavailable',
        'official_model_type': official_model_type,
        'models': {},
        'target_price_models': {},
        'ticker_results': {ticker: {} for ticker in TARGET_TICKERS},
        'limitations': [],
    }

    if unavailable:
        limitations = ['sklearn_not_available_for_experimental_model_comparison']
        result['status'] = 'unavailable'
        result['limitations'] = limitations
        result['models'] = {
            'logistic_regression': _empty_classifier('unavailable', limitations),
            'random_forest': _empty_classifier('unavailable', limitations),
        }
        result['target_price_models'] = {
            'linear_regression': _empty_regressor('unavailable', limitations),
            'random_forest_regressor': _empty_regressor('unavailable', limitations),
        }
        for ticker in TARGET_TICKERS:
            result['ticker_results'][ticker] = {
                'logistic_regression': _empty_classifier('unavailable', limitations + latest_limitations[ticker]),
                'random_forest': _empty_classifier('unavailable', limitations + latest_limitations[ticker]),
                'target_price_models': {
                    'linear_regression': _empty_regressor('unavailable', limitations + latest_limitations[ticker]),
                    'random_forest_regressor': _empty_regressor('unavailable', limitations + latest_limitations[ticker]),
                },
            }
        write_json(output_path, result)
        return result

    labels = [item['label'] for item in dataset]
    forward_returns = [item['forward_return'] for item in dataset]
    if len(dataset) < 80 or len(set(labels)) < 2 or len(forward_returns) < 80:
        limitations = ['insufficient_training_data_for_experimental_models']
        if len(set(labels)) < 2:
            limitations.append('target_lacks_class_diversity')
        result['status'] = 'insufficient_training_data'
        result['limitations'] = limitations
        result['models'] = {
            'logistic_regression': _empty_classifier('insufficient_training_data', limitations),
            'random_forest': _empty_classifier('insufficient_training_data', limitations),
        }
        result['target_price_models'] = {
            'linear_regression': _empty_regressor('insufficient_training_data', limitations),
            'random_forest_regressor': _empty_regressor('insufficient_training_data', limitations),
        }
        for ticker in TARGET_TICKERS:
            result['ticker_results'][ticker] = {
                'logistic_regression': _empty_classifier('insufficient_training_data', limitations + latest_limitations[ticker]),
                'random_forest': _empty_classifier('insufficient_training_data', limitations + latest_limitations[ticker]),
                'target_price_models': {
                    'linear_regression': _empty_regressor('insufficient_training_data', limitations + latest_limitations[ticker]),
                    'random_forest_regressor': _empty_regressor('insufficient_training_data', limitations + latest_limitations[ticker]),
                },
            }
        write_json(output_path, result)
        return result

    split_index = max(int(len(dataset) * 0.8), 1)
    train_rows = dataset[:split_index]
    test_rows = dataset[split_index:]
    x_train = [item['features'] for item in train_rows]
    y_train_cls = [item['label'] for item in train_rows]
    y_train_reg = [item['forward_return'] for item in train_rows]
    x_test = [item['features'] for item in test_rows]
    y_test_cls = [item['label'] for item in test_rows]
    y_test_reg = [item['forward_return'] for item in test_rows]

    if len(x_train) < 40 or len(x_test) < 10 or len(set(y_train_cls)) < 2 or len(set(y_test_cls)) < 2:
        limitations = ['insufficient_training_data_for_time_aware_split']
        result['status'] = 'insufficient_training_data'
        result['limitations'] = limitations
        result['models'] = {
            'logistic_regression': _empty_classifier('insufficient_training_data', limitations),
            'random_forest': _empty_classifier('insufficient_training_data', limitations),
        }
        result['target_price_models'] = {
            'linear_regression': _empty_regressor('insufficient_training_data', limitations),
            'random_forest_regressor': _empty_regressor('insufficient_training_data', limitations),
        }
        for ticker in TARGET_TICKERS:
            result['ticker_results'][ticker] = {
                'logistic_regression': _empty_classifier('insufficient_training_data', limitations + latest_limitations[ticker]),
                'random_forest': _empty_classifier('insufficient_training_data', limitations + latest_limitations[ticker]),
                'target_price_models': {
                    'linear_regression': _empty_regressor('insufficient_training_data', limitations + latest_limitations[ticker]),
                    'random_forest_regressor': _empty_regressor('insufficient_training_data', limitations + latest_limitations[ticker]),
                },
            }
        write_json(output_path, result)
        return result

    lr_model = LogisticRegression(max_iter=1000, random_state=42)
    rf_model = RandomForestClassifier(n_estimators=200, random_state=42, min_samples_leaf=3)
    ridge_model = Ridge(alpha=1.0)
    rf_reg_model = RandomForestRegressor(n_estimators=150, random_state=42, min_samples_leaf=5)

    lr_summary, lr_ticker = _train_classifier(lr_model, x_train, y_train_cls, x_test, y_test_cls, latest_inputs, snapshot_features)
    rf_summary, rf_ticker = _train_classifier(rf_model, x_train, y_train_cls, x_test, y_test_cls, latest_inputs, snapshot_features)
    ridge_summary, ridge_ticker = _train_regressor(ridge_model, x_train, y_train_reg, x_test, y_test_reg, latest_inputs, snapshot_features, market_root)
    rf_reg_summary, rf_reg_ticker = _train_regressor(rf_reg_model, x_train, y_train_reg, x_test, y_test_reg, latest_inputs, snapshot_features, market_root)

    result['status'] = 'success'
    result['models'] = {'logistic_regression': lr_summary, 'random_forest': rf_summary}
    result['target_price_models'] = {'linear_regression': ridge_summary | {'model_family': 'ridge_regularized_linear_model'}, 'random_forest_regressor': rf_reg_summary}
    for ticker in TARGET_TICKERS:
        result['ticker_results'][ticker] = {
            'logistic_regression': lr_ticker[ticker],
            'random_forest': rf_ticker[ticker],
            'target_price_models': {
                'linear_regression': ridge_ticker[ticker] | {'model_family': 'ridge_regularized_linear_model'},
                'random_forest_regressor': rf_reg_ticker[ticker],
            },
        }
    result['limitations'] = ['experimental_models_do_not_override_official_recommendation_logic']
    write_json(output_path, result)
    return result


if __name__ == '__main__':
    print(json.dumps(compare_models_for_review(), indent=2))
