from __future__ import annotations

import csv
import json
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

from rag.retrieval import retrieve
from tools.milestone04_common import MARKET_SYMBOLS, RAW_DIR, TARGET_TICKERS, parse_float, read_csv_rows, utc_now_iso, write_json


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _read_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return payload if isinstance(payload, list) else []


def _read_stock_features(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return {row["ticker"]: row for row in rows if row.get("ticker")}


def _resolve_raw_path(raw_dir: Path, output_path: Any) -> Path:
    if not output_path:
        return raw_dir
    path = Path(str(output_path))
    if path.is_absolute():
        return path
    parts = path.parts
    if len(parts) >= 2 and parts[0] == "data" and parts[1] == "raw":
        return raw_dir.joinpath(*parts[2:])
    return raw_dir / path


def _csv_row_count(path: Path) -> int:
    try:
        return len(read_csv_rows(path))
    except Exception:
        return 0


def _json_list_count(path: Path) -> int:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    return len(payload) if isinstance(payload, list) else 0


def normalize_raw_data_sources_for_packet(raw_summary: dict[str, Any], raw_dir: Path = RAW_DIR) -> dict[str, Any]:
    """Normalize cached raw data into UI-facing collected status while preserving source status."""
    normalized = dict(raw_summary) if isinstance(raw_summary, dict) else {}

    fred = dict(normalized.get("fred") or {})
    fred_path = _resolve_raw_path(raw_dir, fred.get("output_path") or "fred/macro_observations.csv")
    fred_rows = _csv_row_count(fred_path)
    if fred.get("status") in {"cached_file_used", "failed", "missing_api_key"} and fred_rows:
        source_status = fred.get("status")
        fred["source_status"] = source_status
        fred["collection_status"] = "cached_file_used"
        fred["status"] = "success"
        fred["message"] = (
            "Cached FRED macro file used"
            if source_status == "cached_file_used"
            else "FRED refresh failed; cached macro observations file used"
        )
        fred["rows_written"] = fred.get("rows_written") or fred_rows
        fred["availability_status"] = "available"
        normalized["fred"] = fred

    market = dict(normalized.get("market") or {})
    requested_symbols = market.get("symbols_requested") or MARKET_SYMBOLS
    collected_candidates = market.get("symbols_collected") or requested_symbols
    collected_symbols: list[str] = []
    rows_written = 0
    for symbol in collected_candidates:
        price_path = raw_dir / "market" / f"{symbol}_prices.csv"
        row_count = _csv_row_count(price_path)
        if row_count:
            collected_symbols.append(str(symbol))
            rows_written += row_count
    if market.get("status") == "cached_files_used" and collected_symbols:
        market["collection_status"] = "cached_files_used"
        market["status"] = "success"
        market["message"] = "Cached market price files used"
        market["symbols_requested"] = requested_symbols
        market["symbols_collected"] = collected_symbols
        market["rows_written"] = market.get("rows_written") or rows_written
        market["availability_status"] = "available"
        normalized["market"] = market

    news = dict(normalized.get("news") or {})
    tickers = dict(news.get("tickers") or {})
    normalized_tickers: dict[str, Any] = {}
    for ticker in TARGET_TICKERS:
        payload = dict(tickers.get(ticker) or {})
        article_count = payload.get("articles_written")
        if article_count in (None, 0):
            article_count = _json_list_count(raw_dir / "news" / f"{ticker}_news_raw.json")
        if payload.get("status") in {"failed", "missing_source", None} and article_count:
            payload["source_status"] = payload.get("status")
            payload["collection_status"] = "cached_file_used"
            payload["status"] = "success"
            payload["articles_written"] = article_count
            payload["availability_status"] = "available"
            payload["message"] = "RSS refresh failed; cached raw news file used"
        normalized_tickers[ticker] = payload
    if normalized_tickers:
        news["tickers"] = normalized_tickers
        normalized["news"] = news

    return normalized


def raw_data_missing_warnings(raw_summary: dict[str, Any]) -> list[str]:
    missing_data_warnings = []
    for section_name in ["sec", "fred", "market"]:
        section = raw_summary.get(section_name, {})
        if not section:
            missing_data_warnings.append(f"missing_raw_section:{section_name}")
            continue
        status = section.get("status")
        if status and status not in {"success", "cached_file_used", "cached_files_used"}:
            missing_data_warnings.append(f"{section_name}:{status}")
        for ticker, payload in section.get("tickers", {}).items():
            if payload.get("status") not in (None, "success", "limited_by_source", "cached_file_used"):
                missing_data_warnings.append(f"{section_name}:{ticker}:{payload.get('status')}")
    news = raw_summary.get("news", {})
    if not news:
        missing_data_warnings.append("missing_raw_section:news")
    for ticker, payload in news.get("tickers", {}).items():
        article_count = payload.get("articles_written") or 0
        if payload.get("status") not in (None, "success", "limited_by_source", "cached_file_used") and not article_count:
            missing_data_warnings.append(f"news:{ticker}:{payload.get('status')}")
    return sorted(set(missing_data_warnings))


def _parse_sortable_datetime(value: Any) -> tuple[int, str]:
    if not value:
        return (0, "")
    text = str(value)
    try:
        return (1, parsedate_to_datetime(text).isoformat())
    except Exception:
        return (1, text)


def _build_news_evidence(payload: dict[str, Any], per_ticker_limit: int = 10) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {ticker: [] for ticker in TARGET_TICKERS}
    for article in payload.get("articles", []):
        if not isinstance(article, dict):
            continue
        ticker = article.get("ticker")
        if ticker not in grouped:
            continue
        grouped[ticker].append(
            {
                "raw_id": article.get("raw_id"),
                "ticker": ticker,
                "source_name": article.get("source_name"),
                "source_domain": article.get("source_domain"),
                "url": article.get("url"),
                "published_at": article.get("published_at"),
                "fetch_status": article.get("fetch_status"),
                "clean_text": article.get("clean_text"),
                "evidence_chunks": article.get("evidence_chunks", []),
                "keyword_hits": article.get("keyword_hits", {}),
                "duplicate_url": article.get("duplicate_url"),
                "duplicate_title": article.get("duplicate_title"),
            }
        )
    for ticker, articles in grouped.items():
        grouped[ticker] = sorted(
            articles,
            key=lambda item: _parse_sortable_datetime(item.get("published_at")),
            reverse=True,
        )[:per_ticker_limit]
    return grouped


def _build_filing_evidence(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    tickers = payload.get("tickers", {})
    grouped: dict[str, dict[str, Any]] = {}
    for ticker in TARGET_TICKERS:
        item = tickers.get(ticker, {}) if isinstance(tickers, dict) else {}
        grouped[ticker] = {
            "cik": item.get("cik"),
            "latest_10k": item.get("latest_10k"),
            "latest_10q": item.get("latest_10q"),
            "facts": item.get("facts", {}),
            "limitations": item.get("data_limitations", []),
        }
    return grouped


def _build_company_theses(payload: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        ticker = item.get("ticker")
        if ticker in TARGET_TICKERS:
            grouped[ticker] = item
    for ticker in TARGET_TICKERS:
        grouped.setdefault(ticker, {})
    return grouped


VALUATION_REPLACEMENT_SOURCES = [
    "three_statement_models.models.{ticker}",
    "dcf_valuations.valuations.{ticker}",
    "entry_price_models.entry_prices.{ticker}",
    "indicator_scorecards.scorecards.{ticker}",
]


def _base_reason(scorecard: dict[str, Any]) -> str:
    band = scorecard.get("recommendation_band", "review")
    aggregate = scorecard.get("aggregate_indicator_score")
    return f"Legacy recommendation status was derived from band {band} with aggregate indicator score {aggregate}."


def _legacy_model_predictions_section(payload: dict[str, Any]) -> dict[str, Any]:
    section = dict(payload) if isinstance(payload, dict) else {}
    section["legacy_ml_output"] = True
    section["deprecated_for_senior_model_quality"] = True
    section["not_senior_evidence"] = True
    section["retained_for_legacy_compatibility"] = True
    section["presentation_guidance"] = {
        "do_not_use_as_senior_model_quality_section": True,
        "do_not_present_as_current_senior_evidence": True,
        "use_instead": VALUATION_REPLACEMENT_SOURCES,
        "reason": "Senior Analyst workflow now reviews synthesis memo, 3-statement model, DCF valuation, entry price reference, and evidence challenge.",
    }
    return section


def _legacy_model_comparison_section(payload: dict[str, Any]) -> dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    return {
        "tool_name": payload.get("tool_name", "model_comparison"),
        "status": "deprecated",
        "legacy_ml_output": True,
        "deprecated_for_senior_model_quality": True,
        "not_senior_evidence": True,
        "retained_for_legacy_compatibility": True,
        "replacement_sources": VALUATION_REPLACEMENT_SOURCES,
        "original_status": payload.get("status"),
        "models_present": sorted((payload.get("models") or {}).keys()),
        "target_price_models_present": sorted((payload.get("target_price_models") or {}).keys()),
        "limitations": [
            "legacy_regression_and_random_forest_model_quality_removed_from_senior_workflow",
            "use_three_statement_dcf_entry_price_and_evidence_challenge_for_senior_review",
        ],
        "presentation_guidance": {
            "do_not_render_model_quality_page": True,
            "do_not_show_regression_rmse_or_outperform_probability_as_senior_evidence": True,
        },
    }


def _conservative_action(
    scorecard: dict[str, Any],
    prediction: dict[str, Any],
    missing_data_warnings: list[str],
    stress_test: dict[str, Any],
    stock_feature_row: dict[str, str],
) -> tuple[str, str | None, str]:
    base_action = str(scorecard.get("recommendation_band", "review"))
    evidence_confidence = float(scorecard.get("confidence_score", 0.0) or 0.0)
    data_completeness = parse_float(stock_feature_row.get("data_completeness_score")) or 0.0
    aggregate_score = float(scorecard.get("aggregate_indicator_score", 0.0) or 0.0)

    blockers: list[str] = []
    if evidence_confidence < 0.40:
        blockers.append(f"low_evidence_confidence:{evidence_confidence:.2f}")
    if data_completeness < 0.40:
        blockers.append(f"low_data_completeness:{data_completeness:.2f}")
    if "market:missing_source" in missing_data_warnings:
        blockers.append("missing_market_data_source")

    if stress_test.get("pm_review_required"):
        blockers.append("pm_review_required_by_stress_test")

    if blockers:
        if base_action in {"reduce", "avoid"} or aggregate_score < 0:
            return "hold_review", "; ".join(blockers), _base_reason(scorecard)
        return "review", "; ".join(blockers), _base_reason(scorecard)

    if stress_test.get("pm_review_required") and base_action == "accumulate":
        return "review", "pm_review_required_by_stress_test", _base_reason(scorecard)

    return base_action, None, _base_reason(scorecard)


def generate_recommendation_packet(
    raw_summary_path: str = "data/raw/collection_summary.json",
    mandate_path: str = "data/mandates/demo_pm_mandate.json",
    portfolio_path: str = "data/portfolio/demo_portfolio.json",
    model_predictions_path: str = "data/processed/model_predictions.json",
    indicator_scorecards_path: str = "data/processed/indicator_scorecards.json",
    stock_features_path: str = "data/processed/stock_features.csv",
    stress_test_path: str = "data/processed/portfolio_stress_test.json",
    news_evidence_path: str = "data/processed/news_evidence.json",
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    company_theses_path: str = "data/thesis/company_theses.json",
    model_comparison_path: str = "data/processed/model_comparison.json",
    three_statement_models_path: str = "data/processed/three_statement_models.json",
    dcf_valuations_path: str = "data/processed/dcf_valuations.json",
    entry_price_models_path: str = "data/processed/entry_price_models.json",
    output_path: str = "artifacts/milestone04_demo/recommendation_packet.json",
) -> dict[str, Any]:
    raw_summary = normalize_raw_data_sources_for_packet(_read_json(Path(raw_summary_path)))
    mandate = _read_json(Path(mandate_path))
    portfolio = _read_json(Path(portfolio_path))
    model_predictions = _read_json(Path(model_predictions_path))
    indicator_scorecards = _read_json(Path(indicator_scorecards_path))
    stock_features = _read_stock_features(Path(stock_features_path))
    stress_test = _read_json(Path(stress_test_path))
    news_evidence = _build_news_evidence(_read_json(Path(news_evidence_path)))
    filing_evidence = _build_filing_evidence(_read_json(Path(filing_evidence_path)))
    company_theses = _build_company_theses(_read_json_list(Path(company_theses_path)))
    model_comparison = _read_json(Path(model_comparison_path))
    three_statement_models = _read_json(Path(three_statement_models_path))
    dcf_valuations = _read_json(Path(dcf_valuations_path))
    entry_price_models = _read_json(Path(entry_price_models_path))

    missing_data_warnings = raw_data_missing_warnings(raw_summary)

    rag_queries = {
        "recommendation_rules": "investment recommendation confidence weighting committee approval",
        "risk_rules": "portfolio stress test escalation risk review approval",
    }
    rag_evidence = {
        key: retrieve(query=value, top_k=3, knowledge_base_dir="rag/knowledge_base") for key, value in rag_queries.items()
    }

    scorecard_map = {item.get("ticker"): item for item in indicator_scorecards.get("scorecards", [])}
    prediction_map = model_predictions.get("predictions", {})
    recommendations = {}
    draft_trade_tickets = []
    committee_views = []
    for ticker in TARGET_TICKERS:
        scorecard = scorecard_map.get(ticker, {})
        prediction = prediction_map.get(ticker, {})
        stock_row = stock_features.get(ticker, {})
        action, blocked_reason, reason = _conservative_action(
            scorecard=scorecard,
            prediction=prediction,
            missing_data_warnings=missing_data_warnings,
            stress_test=stress_test,
            stock_feature_row=stock_row,
        )
        confidence = float(scorecard.get("confidence_score", 0.0))
        data_limitation_reason = "; ".join(scorecard.get("data_limitations", [])[:5]) if scorecard.get("data_limitations") else None

        recommendations[ticker] = {
            "action": action,
            "confidence_score": round(confidence, 6),
            "reason": reason,
            "blocked_strong_action_reason": blocked_reason,
            "data_limitation_reason": data_limitation_reason,
            "benchmark": prediction.get("benchmark"),
            "outperform_probability": prediction.get("outperform_probability"),
            "aggregate_indicator_score": scorecard.get("aggregate_indicator_score"),
            "requires_pm_review": True,
            "legacy_recommendation_gate": True,
            "not_senior_model_quality_evidence": True,
            "presentation_scope": "legacy_status_only",
            "senior_evidence_replacement_sources": [source.format(ticker=ticker) for source in VALUATION_REPLACEMENT_SOURCES],
        }
        draft_trade_tickets.append(
            {
                "ticker": ticker,
                "status": "draft",
                "action": action,
                "target_weight_change": 0.01 if action == "accumulate" else -0.01 if action == "reduce" else 0.0,
                "pm_approval_required": True,
            }
        )
        committee_views.append(
            {
                "ticker": ticker,
                "views": [
                    {"role": "macro_analyst", "status": "placeholder"},
                    {"role": "fundamentals_analyst", "status": "placeholder"},
                    {"role": "risk_analyst", "status": "placeholder"},
                ],
            }
        )

    generated_at = utc_now_iso()
    packet = {
        "run_id": f"m04_{generated_at.replace(':', '').replace('-', '')}",
        "generated_at": generated_at,
        "raw_data_sources": raw_summary,
        "missing_data_warnings": missing_data_warnings,
        "mandate": mandate,
        "portfolio": portfolio,
        "news_evidence": news_evidence,
        "filing_evidence": filing_evidence,
        "company_theses": company_theses,
        "frontend_contract": {
            "source_of_truth": "backend_generated_recommendation_packet",
            "frontend_should_not_use_mock_data": True,
            "static_packet_generated_at": generated_at,
        },
        "model_predictions": _legacy_model_predictions_section(model_predictions),
        "model_comparison": _legacy_model_comparison_section(model_comparison),
        "three_statement_models": three_statement_models,
        "dcf_valuations": dcf_valuations,
        "entry_price_models": entry_price_models,
        "indicator_scorecards": indicator_scorecards,
        "rag_evidence": rag_evidence,
        "ai_committee_views": committee_views,
        "portfolio_stress_test": stress_test,
        "recommendations": recommendations,
        "draft_trade_tickets": draft_trade_tickets,
        "human_review": {
            "status": "pending_pm_review" if mandate.get("pm_approval_required", True) else "not_required",
            "pm_approval_required": mandate.get("pm_approval_required", True),
        },
        "legacy_backend_fields": {
            "model_predictions": "Retained for compatibility only; not Senior Analyst model-quality evidence.",
            "model_comparison": "Deprecated regression/RF model-quality artifact; not generated for updated Senior workflow.",
            "recommendations": "Legacy recommendation status/gate fields retained for compatibility; Senior review should use valuation and evidence artifacts.",
        },
        "disclaimer": "Educational workflow artifact only. Not real investment advice.",
    }
    write_json(output_path, packet)
    return packet


if __name__ == "__main__":
    print(json.dumps(generate_recommendation_packet(), indent=2))
