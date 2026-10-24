from __future__ import annotations

import csv
import json
from pathlib import Path

from tools.build_dcf_model import build_dcf_valuations
from tools.build_entry_price_model import build_entry_price_models
from scripts import collect_real_raw_data as collector
from tools.build_stock_features import build_stock_features
from tools.build_three_statement_model import build_three_statement_models
from tools.generate_recommendation_packet import generate_recommendation_packet, normalize_raw_data_sources_for_packet, raw_data_missing_warnings
from tools.predict_outperformance import predict_outperformance
from tools.prepare_filing_evidence import prepare_filing_evidence
from tools.prepare_news_evidence import prepare_news_evidence
from tools.run_portfolio_stress_test import run_portfolio_stress_test
from tools.score_stock_indicators import score_stock_indicators


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _price_rows(base: float, step: float, days: int = 220) -> list[dict[str, object]]:
    rows = []
    for day in range(days):
        price = base + (step * day)
        rows.append(
            {
                "date": f"2024-01-{(day % 28) + 1:02d}" if day < 28 else f"2024-{((day // 28) % 12) + 1:02d}-{(day % 28) + 1:02d}",
                "open": round(price * 0.99, 4),
                "high": round(price * 1.01, 4),
                "low": round(price * 0.98, 4),
                "close": round(price, 4),
                "adjusted_close": round(price, 4),
                "volume": 1000000 + day,
            }
        )
    return rows


def test_cached_raw_summary_marks_macro_and_market_available_with_stale_missing_status(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw"
    _write_csv(
        raw_dir / "fred" / "macro_observations.csv",
        ["series_id", "date", "value", "realtime_start", "realtime_end"],
        [{"series_id": "FEDFUNDS", "date": "2026-01-01", "value": "4.5", "realtime_start": "2026-01-01", "realtime_end": "2026-01-01"}],
    )
    for symbol in ["NVDA", "KO", "SPY", "QQQ", "XLP"]:
        _write_csv(
            raw_dir / "market" / f"{symbol}_prices.csv",
            ["date", "open", "high", "low", "close", "adjusted_close", "volume"],
            [{"date": "2026-01-01", "open": 1, "high": 2, "low": 1, "close": 2, "adjusted_close": 2, "volume": 100}],
        )
    _write_json(
        raw_dir / "market" / "missing_data_status.json",
        {
            "status": "missing_source",
            "message": "ALPHAVANTAGE_API_KEY not found and yfinance is not installed.",
        },
    )

    raw_summary = {
        "sec": {"tickers": {}},
        "fred": {
            "status": "cached_file_used",
            "output_path": "data/raw/fred/macro_observations.csv",
            "series_requested": ["FEDFUNDS"],
        },
        "market": {
            "status": "cached_files_used",
            "output_path": "data/raw/market",
            "symbols_collected": ["NVDA", "KO", "SPY", "QQQ", "XLP"],
        },
        "news": {"tickers": {}},
    }

    normalized = normalize_raw_data_sources_for_packet(raw_summary, raw_dir=raw_dir)

    assert normalized["fred"]["status"] == "success"
    assert normalized["fred"]["collection_status"] == "cached_file_used"
    assert normalized["fred"]["message"] == "Cached FRED macro file used"
    assert normalized["market"]["status"] == "success"
    assert normalized["market"]["collection_status"] == "cached_files_used"
    assert normalized["market"]["message"] == "Cached market price files used"
    assert normalized["market"]["symbols_collected"] == ["NVDA", "KO", "SPY", "QQQ", "XLP"]
    assert raw_data_missing_warnings(normalized) == []


def test_failed_refresh_uses_cached_fred_and_news_as_available(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw"
    _write_csv(
        raw_dir / "fred" / "macro_observations.csv",
        ["series_id", "date", "value", "realtime_start", "realtime_end"],
        [{"series_id": "FEDFUNDS", "date": "2026-01-01", "value": "4.5", "realtime_start": "2026-01-01", "realtime_end": "2026-01-01"}],
    )
    for ticker in ["NVDA", "KO"]:
        _write_json(
            raw_dir / "news" / f"{ticker}_news_raw.json",
            [
                {
                    "raw_id": f"{ticker}_1",
                    "ticker": ticker,
                    "raw_title": f"{ticker} cached headline",
                    "raw_description": "Cached article kept after RSS refresh failure.",
                    "raw_content": "",
                    "url": f"https://example.com/{ticker.lower()}",
                    "published_at": "2026-05-01T00:00:00Z",
                    "source_name": "Cached News",
                    "source_domain": "example.com",
                }
            ],
        )

    raw_summary = {
        "sec": {"tickers": {}},
        "fred": {
            "status": "failed",
            "rows_written": 0,
            "output_path": "data/raw/fred/macro_observations.csv",
            "series_requested": ["FEDFUNDS"],
            "errors": [{"series_id": "FEDFUNDS", "error": "network error"}],
        },
        "market": {"status": "success", "symbols_collected": []},
        "news": {
            "tickers": {
                "NVDA": {"status": "failed", "source_url": "https://example.com/nvda-rss"},
                "KO": {"status": "failed", "source_url": "https://example.com/ko-rss"},
            }
        },
    }

    normalized = normalize_raw_data_sources_for_packet(raw_summary, raw_dir=raw_dir)

    assert normalized["fred"]["status"] == "success"
    assert normalized["fred"]["collection_status"] == "cached_file_used"
    assert normalized["fred"]["rows_written"] == 1
    assert normalized["news"]["tickers"]["NVDA"]["status"] == "success"
    assert normalized["news"]["tickers"]["NVDA"]["collection_status"] == "cached_file_used"
    assert normalized["news"]["tickers"]["NVDA"]["articles_written"] == 1
    assert normalized["news"]["tickers"]["KO"]["articles_written"] == 1
    assert raw_data_missing_warnings(normalized) == []


def _sample_filing_payload() -> dict:
    return {
        "tickers": {
            "NVDA": {
                "computed_metrics": {
                    "revenue_growth": 0.12,
                    "gross_margin": 0.52,
                    "operating_margin": 0.31,
                    "debt_to_assets": 0.18,
                }
            },
            "KO": {
                "computed_metrics": {
                    "revenue_growth": 0.03,
                    "gross_margin": 0.46,
                    "operating_margin": 0.22,
                    "debt_to_assets": 0.41,
                }
            },
        }
    }


def _sample_news_payload() -> dict:
    return {
        "articles": [
            {
                "ticker": "NVDA",
                "keyword_hits": {
                    "export_control": 2,
                    "supply_chain": 1,
                    "margin": 1,
                    "capex": 3,
                    "inflation": 0,
                },
            },
            {
                "ticker": "KO",
                "keyword_hits": {
                    "export_control": 0,
                    "supply_chain": 0,
                    "margin": 1,
                    "capex": 0,
                    "inflation": 2,
                },
            },
        ]
    }


def _sample_macro_rows() -> list[dict[str, object]]:
    return [
        {"series_id": "FEDFUNDS", "date": "2026-04-01", "value": "4.25", "realtime_start": "2026-04-01", "realtime_end": "2026-04-01"},
        {"series_id": "CPIAUCSL", "date": "2026-04-01", "value": "320.0", "realtime_start": "2026-04-01", "realtime_end": "2026-04-01"},
        {"series_id": "UNRATE", "date": "2026-04-01", "value": "4.1", "realtime_start": "2026-04-01", "realtime_end": "2026-04-01"},
    ]


def _sample_valuation_filing_payload(include_revenue: bool = True) -> dict:
    facts = {
        "gross_profit": {"value": 55.0, "fiscal_year": 2026},
        "operating_income": {"value": 30.0, "fiscal_year": 2026},
        "net_income": {"value": 24.0, "fiscal_year": 2026},
        "cash": {"value": 12.0, "fiscal_year": 2026},
        "debt": {"value": 8.0, "fiscal_year": 2026},
        "assets": {"value": 120.0, "fiscal_year": 2026},
        "liabilities": {"value": 40.0, "fiscal_year": 2026},
    }
    if include_revenue:
        facts["revenue"] = {"value": 100.0, "fiscal_year": 2026}
    return {
        "tickers": {
            "NVDA": {
                "facts": facts,
                "computed_metrics": {
                    "revenue_growth": 0.12,
                    "gross_margin": 0.55,
                    "operating_margin": 0.30,
                    "debt_to_assets": 0.067,
                },
                "data_limitations": [],
            },
            "KO": {
                "facts": {},
                "computed_metrics": {},
                "data_limitations": ["example_missing_financials"],
            },
        }
    }


def test_raw_news_schema_has_no_summary_sentiment_or_recommendation_fields(monkeypatch, tmp_path: Path) -> None:
    sample_xml = """
    <rss><channel>
      <item>
        <title>NVIDIA export control headline</title>
        <link>https://example.com/nvda-1</link>
        <description>Policy and export control discussion.</description>
        <pubDate>Mon, 18 May 2026 00:00:00 GMT</pubDate>
      </item>
    </channel></rss>
    """.strip()

    monkeypatch.setattr(collector, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(collector, "_safe_get_text", lambda url: (sample_xml, None))
    result = collector._collect_news_raw()

    payload = json.loads((tmp_path / "raw" / "news" / "NVDA_news_raw.json").read_text(encoding="utf-8"))
    assert result["tickers"]["NVDA"]["status"] in {"success", "limited_by_source"}
    assert payload
    forbidden = {"summary", "sentiment", "classification", "recommendation", "risk_score", "thesis_impact"}
    assert forbidden.isdisjoint(payload[0].keys())


def test_news_refresh_failure_preserves_cached_raw_articles(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(collector, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(collector, "_safe_get_text", lambda url: (None, "network error"))
    for ticker in ["NVDA", "KO"]:
        _write_json(
            tmp_path / "raw" / "news" / f"{ticker}_news_raw.json",
            [
                {
                    "raw_id": f"{ticker}_cached_1",
                    "ticker": ticker,
                    "raw_title": f"{ticker} cached headline",
                    "raw_description": "Cached article should not be overwritten.",
                    "raw_content": "",
                    "url": f"https://example.com/{ticker.lower()}",
                    "published_at": "2026-05-01T00:00:00Z",
                    "source_name": "Cached News",
                    "source_domain": "example.com",
                }
            ],
        )

    result = collector._collect_news_raw()

    assert result["tickers"]["NVDA"]["status"] == "cached_file_used"
    assert result["tickers"]["NVDA"]["articles_written"] == 1
    payload = json.loads((tmp_path / "raw" / "news" / "NVDA_news_raw.json").read_text(encoding="utf-8"))
    assert payload[0]["raw_id"] == "NVDA_cached_1"


def test_prepare_news_evidence_returns_chunks_and_keyword_hits(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw_news"
    _write_json(
        raw_dir / "NVDA_news_raw.json",
        [
            {
                "raw_id": "n1",
                "ticker": "NVDA",
                "source_name": "rss",
                "source_domain": "example.com",
                "url": "https://example.com/a",
                "published_at": "2026-05-18",
                "raw_title": "Export control and supply chain risks",
                "raw_description": "AI demand and capex remain strong.",
                "raw_content": None,
                "fetch_status": "success",
            }
        ],
    )
    _write_json(raw_dir / "KO_news_raw.json", [])

    result = prepare_news_evidence(news_dir=str(raw_dir), output_path=str(tmp_path / "news_evidence.json"))

    assert result["articles"]
    article = result["articles"][0]
    assert article["evidence_chunks"]
    assert article["keyword_hits"]["export_control"] >= 1


def test_prepare_filing_evidence_handles_missing_facts_without_inventing_data(tmp_path: Path) -> None:
    sec_root = tmp_path / "sec"
    _write_json(sec_root / "NVDA" / "submissions.json", {"filings": {"recent": {"form": [], "accessionNumber": [], "filingDate": [], "primaryDocument": []}}})
    _write_json(sec_root / "NVDA" / "companyfacts.json", {"facts": {"us-gaap": {}}})
    _write_json(sec_root / "KO" / "submissions.json", {"filings": {"recent": {"form": [], "accessionNumber": [], "filingDate": [], "primaryDocument": []}}})
    _write_json(sec_root / "KO" / "companyfacts.json", {"facts": {"us-gaap": {}}})

    result = prepare_filing_evidence(sec_root=str(sec_root), output_path=str(tmp_path / "filing_evidence.json"))

    assert result["tickers"]["NVDA"]["facts"]["revenue"]["value"] is None
    assert result["tickers"]["NVDA"]["computed_metrics"]["gross_margin"] is None
    assert result["tickers"]["KO"]["data_availability_flags"]["companyfacts_available"] is True


def test_build_stock_features_output_has_expected_columns(tmp_path: Path) -> None:
    market_dir = tmp_path / "market"
    for symbol, base, step in [("NVDA", 100.0, 1.0), ("QQQ", 90.0, 0.4), ("KO", 50.0, 0.2), ("XLP", 45.0, 0.1)]:
        _write_csv(market_dir / f"{symbol}_prices.csv", ["date", "open", "high", "low", "close", "adjusted_close", "volume"], _price_rows(base, step, days=100))

    fred_path = tmp_path / "macro.csv"
    _write_csv(fred_path, ["series_id", "date", "value", "realtime_start", "realtime_end"], _sample_macro_rows())
    _write_json(tmp_path / "news_evidence.json", _sample_news_payload())
    _write_json(tmp_path / "filing_evidence.json", _sample_filing_payload())

    output = tmp_path / "stock_features.csv"
    result = build_stock_features(
        market_dir=str(market_dir),
        fred_path=str(fred_path),
        news_evidence_path=str(tmp_path / "news_evidence.json"),
        filing_evidence_path=str(tmp_path / "filing_evidence.json"),
        output_path=str(output),
    )

    rows = list(csv.DictReader(output.open("r", encoding="utf-8")))
    assert result["rows_written"] == 2
    assert "relative_return_vs_benchmark_60d" in rows[0]
    assert "data_completeness_score" in rows[0]


def test_predict_outperformance_is_json_serializable_and_includes_model_metadata(tmp_path: Path) -> None:
    market_dir = tmp_path / "market"
    for symbol, base, step in [("NVDA", 100.0, 0.8), ("QQQ", 90.0, 0.3), ("KO", 50.0, 0.15), ("XLP", 45.0, 0.08)]:
        _write_csv(market_dir / f"{symbol}_prices.csv", ["date", "open", "high", "low", "close", "adjusted_close", "volume"], _price_rows(base, step, days=220))

    stock_features_path = tmp_path / "stock_features.csv"
    _write_csv(
        stock_features_path,
        [
            "ticker",
            "benchmark",
            "as_of_date",
            "20d_return",
            "60d_return",
            "20d_volatility",
            "60d_volatility",
            "max_drawdown_60d",
            "relative_return_vs_benchmark_60d",
            "revenue_growth",
            "gross_margin",
            "operating_margin",
            "debt_to_assets",
            "macro_fedfunds_latest",
            "macro_cpi_latest",
            "macro_unrate_latest",
            "news_count",
            "export_control_keyword_count",
            "supply_chain_keyword_count",
            "margin_keyword_count",
            "capex_keyword_count",
            "inflation_keyword_count",
            "data_completeness_score",
        ],
        [
            {
                "ticker": "NVDA",
                "benchmark": "QQQ",
                "as_of_date": "2026-05-18",
                "20d_return": 0.05,
                "60d_return": 0.15,
                "20d_volatility": 0.02,
                "60d_volatility": 0.03,
                "max_drawdown_60d": -0.08,
                "relative_return_vs_benchmark_60d": 0.04,
                "revenue_growth": 0.12,
                "gross_margin": 0.52,
                "operating_margin": 0.31,
                "debt_to_assets": 0.18,
                "macro_fedfunds_latest": 4.25,
                "macro_cpi_latest": 320.0,
                "macro_unrate_latest": 4.1,
                "news_count": 5,
                "export_control_keyword_count": 2,
                "supply_chain_keyword_count": 1,
                "margin_keyword_count": 1,
                "capex_keyword_count": 3,
                "inflation_keyword_count": 0,
                "data_completeness_score": 0.95,
            },
            {
                "ticker": "KO",
                "benchmark": "XLP",
                "as_of_date": "2026-05-18",
                "20d_return": 0.01,
                "60d_return": 0.04,
                "20d_volatility": 0.01,
                "60d_volatility": 0.015,
                "max_drawdown_60d": -0.03,
                "relative_return_vs_benchmark_60d": 0.01,
                "revenue_growth": 0.03,
                "gross_margin": 0.46,
                "operating_margin": 0.22,
                "debt_to_assets": 0.41,
                "macro_fedfunds_latest": 4.25,
                "macro_cpi_latest": 320.0,
                "macro_unrate_latest": 4.1,
                "news_count": 4,
                "export_control_keyword_count": 0,
                "supply_chain_keyword_count": 0,
                "margin_keyword_count": 1,
                "capex_keyword_count": 0,
                "inflation_keyword_count": 2,
                "data_completeness_score": 0.92,
            },
        ],
    )

    result = predict_outperformance(
        market_dir=str(market_dir),
        stock_features_path=str(stock_features_path),
        output_path=str(tmp_path / "predictions.json"),
    )

    json.dumps(result)
    assert result["model_type"] in {"random_forest", "logistic_regression", "transparent_fallback"}
    assert "data_limitations" in result["predictions"]["NVDA"]


def test_score_stock_indicators_score_ranges_are_valid(tmp_path: Path) -> None:
    _write_csv(
        tmp_path / "stock_features.csv",
        ["ticker", "benchmark", "as_of_date", "20d_return", "60d_return", "20d_volatility", "60d_volatility", "max_drawdown_60d", "relative_return_vs_benchmark_60d", "revenue_growth", "gross_margin", "operating_margin", "debt_to_assets", "macro_fedfunds_latest", "macro_cpi_latest", "macro_unrate_latest", "news_count", "export_control_keyword_count", "supply_chain_keyword_count", "margin_keyword_count", "capex_keyword_count", "inflation_keyword_count", "data_completeness_score"],
        [
            {"ticker": "NVDA", "benchmark": "QQQ", "as_of_date": "2026-05-18", "20d_return": 0.05, "60d_return": 0.15, "20d_volatility": 0.02, "60d_volatility": 0.03, "max_drawdown_60d": -0.08, "relative_return_vs_benchmark_60d": 0.04, "revenue_growth": 0.12, "gross_margin": 0.52, "operating_margin": 0.31, "debt_to_assets": 0.18, "macro_fedfunds_latest": 4.25, "macro_cpi_latest": 320.0, "macro_unrate_latest": 4.1, "news_count": 5, "export_control_keyword_count": 2, "supply_chain_keyword_count": 1, "margin_keyword_count": 1, "capex_keyword_count": 3, "inflation_keyword_count": 0, "data_completeness_score": 0.95},
            {"ticker": "KO", "benchmark": "XLP", "as_of_date": "2026-05-18", "20d_return": 0.01, "60d_return": 0.04, "20d_volatility": 0.01, "60d_volatility": 0.015, "max_drawdown_60d": -0.03, "relative_return_vs_benchmark_60d": 0.01, "revenue_growth": 0.03, "gross_margin": 0.46, "operating_margin": 0.22, "debt_to_assets": 0.41, "macro_fedfunds_latest": 4.25, "macro_cpi_latest": 320.0, "macro_unrate_latest": 4.1, "news_count": 4, "export_control_keyword_count": 0, "supply_chain_keyword_count": 0, "margin_keyword_count": 1, "capex_keyword_count": 0, "inflation_keyword_count": 2, "data_completeness_score": 0.92},
        ],
    )
    _write_json(
        tmp_path / "predictions.json",
        {
            "predictions": {
                "NVDA": {"benchmark": "QQQ", "model_confidence": 0.7, "data_limitations": []},
                "KO": {"benchmark": "XLP", "model_confidence": 0.6, "data_limitations": []},
            }
        },
    )
    repo_root = Path(__file__).resolve().parents[2]
    result = score_stock_indicators(
        stock_features_path=str(tmp_path / "stock_features.csv"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        indicator_config_path=str(repo_root / "data" / "indicators" / "indicator_config.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        news_evidence_path=str(tmp_path / "news_evidence.json"),
        filing_evidence_path=str(tmp_path / "filing_evidence.json"),
        output_path=str(tmp_path / "scorecards.json"),
    )

    for scorecard in result["scorecards"]:
        assert -1.0 <= scorecard["aggregate_indicator_score"] <= 1.0
        assert 0.0 <= scorecard["confidence_score"] <= 1.0


def test_run_portfolio_stress_test_returns_downside_ranges(tmp_path: Path) -> None:
    _write_json(
        tmp_path / "indicator_scorecards.json",
        {
            "scorecards": [
                {"ticker": "NVDA", "aggregate_indicator_score": 0.2, "confidence_score": 0.7},
                {"ticker": "KO", "aggregate_indicator_score": 0.1, "confidence_score": 0.65},
            ]
        },
    )
    repo_root = Path(__file__).resolve().parents[2]
    result = run_portfolio_stress_test(
        indicator_scorecards_path=str(tmp_path / "indicator_scorecards.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        output_path=str(tmp_path / "stress.json"),
    )

    assert "portfolio_downside_range" in result
    assert result["ticker_level_impact_ranges"]["NVDA"] is not None


def test_build_three_statement_models_generates_required_fields(tmp_path: Path) -> None:
    _write_json(tmp_path / "filing_evidence.json", _sample_valuation_filing_payload())
    _write_csv(
        tmp_path / "stock_features.csv",
        ["ticker", "revenue_growth", "gross_margin", "operating_margin"],
        [{"ticker": "NVDA", "revenue_growth": 0.12, "gross_margin": 0.55, "operating_margin": 0.30}],
    )
    _write_json(
        tmp_path / "company_theses.json",
        [{"ticker": "NVDA", "company_name": "NVIDIA Corporation"}, {"ticker": "KO", "company_name": "Coca-Cola"}],
    )

    result = build_three_statement_models(
        filing_evidence_path=str(tmp_path / "filing_evidence.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        company_theses_path=str(tmp_path / "company_theses.json"),
        output_path=str(tmp_path / "three_statement_models.json"),
    )

    model = result["models"]["NVDA"]
    for key in {
        "ticker",
        "company_name",
        "base_year",
        "historical_inputs",
        "assumptions",
        "income_statement_projection",
        "cash_flow_projection",
        "balance_sheet_stub",
        "key_metrics",
        "data_sources",
        "limitations",
    }:
        assert key in model
    assert len(model["income_statement_projection"]) == 5
    assert len(model["cash_flow_projection"]) == 5
    assert (tmp_path / "three_statement_models.json").exists()


def test_build_dcf_valuations_generates_required_fields(tmp_path: Path) -> None:
    _write_json(tmp_path / "filing_evidence.json", _sample_valuation_filing_payload())
    _write_csv(
        tmp_path / "stock_features.csv",
        ["ticker", "revenue_growth", "operating_margin", "60d_volatility"],
        [{"ticker": "NVDA", "revenue_growth": 0.12, "operating_margin": 0.30, "60d_volatility": 0.03}],
    )
    market_dir = tmp_path / "market"
    _write_csv(market_dir / "NVDA_prices.csv", ["date", "open", "high", "low", "close", "adjusted_close", "volume"], _price_rows(100.0, 1.0, days=5))
    _write_json(tmp_path / "model_predictions.json", {"predictions": {"NVDA": {"outperform_probability": 0.61, "model_confidence": 0.7}}})

    result = build_dcf_valuations(
        filing_evidence_path=str(tmp_path / "filing_evidence.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        market_dir=str(market_dir),
        model_predictions_path=str(tmp_path / "model_predictions.json"),
        output_path=str(tmp_path / "dcf_valuations.json"),
    )

    valuation = result["valuations"]["NVDA"]
    for key in {
        "ticker",
        "valuation_date",
        "base_free_cash_flow",
        "projection_years",
        "revenue_growth_assumptions",
        "margin_assumptions",
        "free_cash_flow_projection",
        "discount_rate",
        "terminal_growth_rate",
        "terminal_value",
        "present_value_of_fcf",
        "enterprise_value",
        "net_debt",
        "equity_value",
        "shares_outstanding",
        "implied_share_price",
        "latest_market_price",
        "upside_downside_pct",
        "sensitivity_table",
        "data_sources",
        "limitations",
    }:
        assert key in valuation
    assert valuation["enterprise_value"] is not None
    assert valuation["latest_market_price"] is not None
    assert "shares_outstanding_unavailable_implied_share_price_not_calculated" in valuation["limitations"]
    assert (tmp_path / "dcf_valuations.json").exists()


def test_valuation_models_handle_missing_financials_with_limitations(tmp_path: Path) -> None:
    _write_json(tmp_path / "filing_evidence.json", _sample_valuation_filing_payload(include_revenue=False))
    _write_csv(tmp_path / "stock_features.csv", ["ticker"], [{"ticker": "NVDA"}])

    three_statement = build_three_statement_models(
        filing_evidence_path=str(tmp_path / "filing_evidence.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        company_theses_path=str(tmp_path / "missing_theses.json"),
        output_path=str(tmp_path / "three_statement_models.json"),
    )
    dcf = build_dcf_valuations(
        filing_evidence_path=str(tmp_path / "filing_evidence.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        market_dir=str(tmp_path / "missing_market"),
        model_predictions_path=str(tmp_path / "missing_predictions.json"),
        output_path=str(tmp_path / "dcf_valuations.json"),
    )

    assert "revenue_missing_projection_unavailable" in three_statement["models"]["NVDA"]["limitations"]
    assert three_statement["models"]["NVDA"]["income_statement_projection"] == []
    assert "revenue_missing_dcf_projection_unavailable" in dcf["valuations"]["NVDA"]["limitations"]
    assert dcf["valuations"]["NVDA"]["enterprise_value"] is None


def test_entry_price_model_missing_shares_is_unavailable(tmp_path: Path) -> None:
    _write_json(
        tmp_path / "dcf.json",
        {
            "valuations": {
                "NVDA": {"valuation_date": "2026-05-21", "equity_value": 1000.0, "shares_outstanding": None, "latest_market_price": 120.0, "limitations": []},
                "KO": {"valuation_date": "2026-05-21", "equity_value": 800.0, "shares_outstanding": None, "latest_market_price": 80.0, "limitations": []},
            }
        },
    )
    _write_json(tmp_path / "three_statement.json", {"models": {"NVDA": {"limitations": []}, "KO": {"limitations": []}}})
    _write_json(tmp_path / "scorecards.json", {"scorecards": [{"ticker": "NVDA", "confidence_score": 0.7, "pm_approval_required": True}, {"ticker": "KO", "confidence_score": 0.7}]})
    _write_json(tmp_path / "stress.json", {"pm_review_required": True, "ticker_level_impact_ranges": {"NVDA": [-0.08, -0.04]}})
    _write_json(tmp_path / "predictions.json", {"predictions": {"NVDA": {"model_confidence": 0.7}, "KO": {"model_confidence": 0.7}}})
    _write_json(tmp_path / "filing.json", {"tickers": {"NVDA": {"facts": {}}, "KO": {"facts": {}}}})

    result = build_entry_price_models(
        dcf_valuations_path=str(tmp_path / "dcf.json"),
        three_statement_models_path=str(tmp_path / "three_statement.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        portfolio_stress_test_path=str(tmp_path / "stress.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        filing_evidence_path=str(tmp_path / "filing.json"),
        market_dir=str(tmp_path / "market"),
        output_path=str(tmp_path / "entry_price_models.json"),
    )

    nvda = result["entry_prices"]["NVDA"]
    assert nvda["entry_status"] == "unavailable"
    assert nvda["implied_fair_value_per_share"] is None
    assert nvda["entry_price"] is None
    assert nvda["shares_outstanding_source"] == "unavailable"
    assert nvda["shares_outstanding_is_simulated"] is False
    assert nvda["simulated_shares_outstanding_reason"] is None
    assert "shares_outstanding_unavailable_entry_price_not_calculated" in nvda["limitations"]


def test_entry_price_model_simulated_shares_demo_fallback(tmp_path: Path) -> None:
    _write_json(
        tmp_path / "dcf.json",
        {
            "valuations": {
                "NVDA": {"valuation_date": "2026-05-21", "equity_value": 1000.0, "shares_outstanding": None, "latest_market_price": 120.0, "limitations": []},
                "KO": {"valuation_date": "2026-05-21", "equity_value": 800.0, "shares_outstanding": None, "latest_market_price": 80.0, "limitations": []},
            }
        },
    )
    _write_json(tmp_path / "three_statement.json", {"models": {"NVDA": {"limitations": []}, "KO": {"limitations": []}}})
    _write_json(tmp_path / "scorecards.json", {"scorecards": [{"ticker": "NVDA", "confidence_score": 0.7}, {"ticker": "KO", "confidence_score": 0.7}]})
    _write_json(tmp_path / "stress.json", {"pm_review_required": False, "ticker_level_impact_ranges": {"NVDA": [-0.02, -0.01]}})
    _write_json(tmp_path / "predictions.json", {"predictions": {"NVDA": {"model_confidence": 0.7}, "KO": {"model_confidence": 0.7}}})
    _write_json(tmp_path / "filing.json", {"tickers": {"NVDA": {"facts": {}}, "KO": {"facts": {}}}})

    result = build_entry_price_models(
        dcf_valuations_path=str(tmp_path / "dcf.json"),
        three_statement_models_path=str(tmp_path / "three_statement.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        portfolio_stress_test_path=str(tmp_path / "stress.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        filing_evidence_path=str(tmp_path / "filing.json"),
        market_dir=str(tmp_path / "market"),
        output_path=str(tmp_path / "entry_price_models.json"),
        enable_simulated_shares_fallback=True,
    )

    nvda = result["entry_prices"]["NVDA"]
    assert nvda["shares_outstanding"] == round(1000.0 / 120.0, 2)
    assert nvda["shares_outstanding_source"] == "simulated"
    assert nvda["shares_outstanding_is_simulated"] is True
    assert nvda["simulated_shares_outstanding_reason"]
    assert nvda["implied_fair_value_per_share"] == 120.0
    assert nvda["entry_price"] == round(120.0 * (1 - nvda["margin_of_safety"]), 6)
    assert nvda["entry_status"] == "watchlist_below_fair_value"
    assert "shares_outstanding_simulated_for_demo_entry_price" in nvda["limitations"]
    assert "shares_outstanding_unavailable_entry_price_not_calculated" not in nvda["limitations"]
    assert "Entry price is illustrative because share count is simulated." in nvda["presentation_guidance"]


def test_entry_price_model_calculates_with_shares_and_risk_margin(tmp_path: Path) -> None:
    _write_json(
        tmp_path / "dcf.json",
        {
            "valuations": {
                "NVDA": {
                    "valuation_date": "2026-05-21",
                    "equity_value": 1000.0,
                    "shares_outstanding": 10.0,
                    "latest_market_price": 80.0,
                    "limitations": ["tax_rate_default_assumption_used", "discount_rate_estimated_from_short_term_volatility_proxy"],
                },
                "KO": {"valuation_date": "2026-05-21", "equity_value": 800.0, "shares_outstanding": 20.0, "latest_market_price": 50.0, "limitations": []},
            }
        },
    )
    _write_json(tmp_path / "three_statement.json", {"models": {"NVDA": {"limitations": ["depreciation_capex_and_working_capital_are_assumption_based"]}, "KO": {"limitations": []}}})
    _write_json(
        tmp_path / "scorecards.json",
        {
            "scorecards": [
                {
                    "ticker": "NVDA",
                    "confidence_score": 0.3,
                    "pm_approval_required": True,
                    "indicators": [{"name": "Valuation sensitivity", "score": -0.5}],
                },
                {"ticker": "KO", "confidence_score": 0.8, "indicators": [{"name": "Valuation sensitivity", "score": 0.2}]},
            ]
        },
    )
    _write_json(tmp_path / "stress.json", {"pm_review_required": True, "ticker_level_impact_ranges": {"NVDA": [-0.25, -0.15], "KO": [-0.02, -0.01]}})
    _write_json(tmp_path / "predictions.json", {"predictions": {"NVDA": {"model_confidence": 0.2}, "KO": {"model_confidence": 0.8}}})
    _write_json(tmp_path / "filing.json", {"tickers": {"NVDA": {"facts": {}}, "KO": {"facts": {}}}})

    result = build_entry_price_models(
        dcf_valuations_path=str(tmp_path / "dcf.json"),
        three_statement_models_path=str(tmp_path / "three_statement.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        portfolio_stress_test_path=str(tmp_path / "stress.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        filing_evidence_path=str(tmp_path / "filing.json"),
        market_dir=str(tmp_path / "market"),
        output_path=str(tmp_path / "entry_price_models.json"),
    )

    nvda = result["entry_prices"]["NVDA"]
    ko = result["entry_prices"]["KO"]
    assert nvda["implied_fair_value_per_share"] == 100.0
    assert nvda["shares_outstanding_source"] == "actual"
    assert nvda["shares_outstanding_is_simulated"] is False
    assert nvda["margin_of_safety"] > 0.15
    assert nvda["entry_price"] == round(100.0 * (1 - nvda["margin_of_safety"]), 6)
    assert nvda["entry_status"] in {"attractive_entry", "watchlist_below_fair_value", "above_fair_value"}
    assert nvda["margin_of_safety"] > ko["margin_of_safety"]
    assert (tmp_path / "entry_price_models.json").exists()


def test_recommendation_packet_has_required_fields(tmp_path: Path) -> None:
    _write_json(tmp_path / "raw_summary.json", {"sec": {}, "fred": {"status": "missing_api_key"}, "market": {"status": "missing_source"}, "news": {}})
    repo_root = Path(__file__).resolve().parents[2]
    _write_json(
        tmp_path / "predictions.json",
        {
            "predictions": {
                "NVDA": {"benchmark": "QQQ", "outperform_probability": 0.61, "model_confidence": 0.7},
                "KO": {"benchmark": "XLP", "outperform_probability": 0.54, "model_confidence": 0.62},
            }
        },
    )
    _write_json(
        tmp_path / "scorecards.json",
        {
            "scorecards": [
                {"ticker": "NVDA", "aggregate_indicator_score": 0.2, "confidence_score": 0.7, "recommendation_band": "hold"},
                {"ticker": "KO", "aggregate_indicator_score": 0.5, "confidence_score": 0.62, "recommendation_band": "accumulate"},
            ]
        },
    )
    _write_json(
        tmp_path / "stress.json",
        {
            "pm_review_required": True,
            "risk_action": "review",
            "portfolio_downside_range": [-0.05, -0.03],
        },
    )
    _write_json(
        tmp_path / "model_comparison.json",
        {
            "tool_name": "model_comparison",
            "status": "insufficient_training_data",
            "models": {"logistic_regression": {"status": "insufficient_training_data", "limitations": ["insufficient_training_data_for_experimental_models"]}, "random_forest": {"status": "insufficient_training_data", "limitations": ["insufficient_training_data_for_experimental_models"]}},
            "target_price_models": {"linear_regression": {"status": "insufficient_training_data", "limitations": ["insufficient_training_data_for_experimental_models"]}, "random_forest_regressor": {"status": "insufficient_training_data", "limitations": ["insufficient_training_data_for_experimental_models"]}},
            "ticker_results": {"NVDA": {}, "KO": {}},
            "limitations": ["insufficient_training_data_for_experimental_models"]
        },
    )
    _write_json(tmp_path / "three_statement_models.json", {"models": {"NVDA": {"ticker": "NVDA"}, "KO": {"ticker": "KO"}}})
    _write_json(tmp_path / "dcf_valuations.json", {"valuations": {"NVDA": {"ticker": "NVDA"}, "KO": {"ticker": "KO"}}})
    _write_json(tmp_path / "entry_price_models.json", {"entry_prices": {"NVDA": {"ticker": "NVDA"}, "KO": {"ticker": "KO"}}})

    result = generate_recommendation_packet(
        raw_summary_path=str(tmp_path / "raw_summary.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        stress_test_path=str(tmp_path / "stress.json"),
        model_comparison_path=str(tmp_path / "model_comparison.json"),
        three_statement_models_path=str(tmp_path / "three_statement_models.json"),
        dcf_valuations_path=str(tmp_path / "dcf_valuations.json"),
        entry_price_models_path=str(tmp_path / "entry_price_models.json"),
        output_path=str(tmp_path / "packet.json"),
    )

    required = {
        "run_id",
        "raw_data_sources",
        "missing_data_warnings",
        "mandate",
        "portfolio",
        "news_evidence",
        "filing_evidence",
        "company_theses",
        "frontend_contract",
        "model_predictions",
        "model_comparison",
        "three_statement_models",
        "dcf_valuations",
        "entry_price_models",
        "indicator_scorecards",
        "rag_evidence",
        "ai_committee_views",
        "portfolio_stress_test",
        "recommendations",
        "draft_trade_tickets",
        "human_review",
        "disclaimer",
    }
    assert required <= set(result)
    assert result["three_statement_models"]["models"]["NVDA"]["ticker"] == "NVDA"
    assert result["dcf_valuations"]["valuations"]["KO"]["ticker"] == "KO"
    assert result["entry_price_models"]["entry_prices"]["NVDA"]["ticker"] == "NVDA"
    assert result["model_predictions"]["legacy_ml_output"] is True
    assert result["model_predictions"]["deprecated_for_senior_model_quality"] is True
    assert result["model_comparison"]["status"] == "deprecated"
    assert result["model_comparison"]["not_senior_evidence"] is True
    assert "models" not in result["model_comparison"]
    assert result["recommendations"]["NVDA"]["not_senior_model_quality_evidence"] is True


def test_recommendation_packet_includes_frontend_ready_evidence(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    _write_json(tmp_path / "raw_summary.json", {"sec": {}, "fred": {"status": "missing_api_key"}, "market": {"status": "missing_source"}, "news": {}})
    _write_json(
        tmp_path / "predictions.json",
        {
            "predictions": {
                "NVDA": {"benchmark": "QQQ", "outperform_probability": 0.61, "model_confidence": 0.35},
                "KO": {"benchmark": "XLP", "outperform_probability": 0.54, "model_confidence": 0.22},
            }
        },
    )
    _write_json(
        tmp_path / "scorecards.json",
        {
            "scorecards": [
                {"ticker": "NVDA", "aggregate_indicator_score": -0.2, "confidence_score": 0.4, "recommendation_band": "reduce", "data_limitations": ["market_missing"]},
                {"ticker": "KO", "aggregate_indicator_score": 0.1, "confidence_score": 0.3, "recommendation_band": "hold", "data_limitations": ["coverage_incomplete"]},
            ]
        },
    )
    _write_json(
        tmp_path / "stress.json",
        {
            "pm_review_required": True,
            "risk_action": "review",
            "portfolio_downside_range": [-0.05, -0.03],
        },
    )
    _write_csv(
        tmp_path / "stock_features.csv",
        ["ticker", "data_completeness_score"],
        [
            {"ticker": "NVDA", "data_completeness_score": 0.35},
            {"ticker": "KO", "data_completeness_score": 0.25},
        ],
    )
    _write_json(
        tmp_path / "news_evidence.json",
        {
            "articles": [
                {
                    "raw_id": "NVDA_1",
                    "ticker": "NVDA",
                    "source_name": "Example News",
                    "source_domain": "example.com",
                    "url": "https://example.com/nvda-1",
                    "published_at": "Mon, 18 May 2026 00:00:00 GMT",
                    "fetch_status": "success",
                    "clean_text": "Export control discussion and AI demand commentary.",
                    "evidence_chunks": ["Export control discussion", "AI demand commentary"],
                    "keyword_hits": {"export_control": 2, "AI_demand": 1},
                    "duplicate_url": False,
                    "duplicate_title": False,
                    "sentiment": "should_not_be_copied",
                },
                {
                    "raw_id": "KO_1",
                    "ticker": "KO",
                    "source_name": "Example News",
                    "source_domain": "example.com",
                    "url": "https://example.com/ko-1",
                    "published_at": "Sun, 17 May 2026 00:00:00 GMT",
                    "fetch_status": "success",
                    "clean_text": "Inflation and pricing power coverage.",
                    "evidence_chunks": ["Inflation", "Pricing power"],
                    "keyword_hits": {"inflation": 2, "pricing_power": 1},
                    "duplicate_url": False,
                    "duplicate_title": False,
                },
            ]
        },
    )
    _write_json(
        tmp_path / "filing_evidence.json",
        {
            "tickers": {
                "NVDA": {
                    "cik": "0001045810",
                    "latest_10k": {"form": "10-K", "filing_date": "2026-02-25"},
                    "latest_10q": {"form": "10-Q", "filing_date": "2025-11-19"},
                    "facts": {"revenue": {"value": 100.0}},
                    "data_limitations": ["example_limitation"],
                },
                "KO": {
                    "cik": "0000021344",
                    "latest_10k": {"form": "10-K", "filing_date": "2026-02-20"},
                    "latest_10q": {"form": "10-Q", "filing_date": "2026-04-30"},
                    "facts": {},
                    "data_limitations": [],
                },
            }
        },
    )
    _write_json(
        tmp_path / "company_theses.json",
        [
            {"ticker": "NVDA", "core_thesis": "AI infrastructure leader"},
            {"ticker": "KO", "core_thesis": "Defensive consumer staple"},
        ],
    )

    result = generate_recommendation_packet(
        raw_summary_path=str(tmp_path / "raw_summary.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        stock_features_path=str(tmp_path / "stock_features.csv"),
        stress_test_path=str(tmp_path / "stress.json"),
        news_evidence_path=str(tmp_path / "news_evidence.json"),
        filing_evidence_path=str(tmp_path / "filing_evidence.json"),
        company_theses_path=str(tmp_path / "company_theses.json"),
        output_path=str(tmp_path / "packet.json"),
    )

    assert result["frontend_contract"]["source_of_truth"] == "backend_generated_recommendation_packet"
    assert result["frontend_contract"]["frontend_should_not_use_mock_data"] is True
    assert result["frontend_contract"]["static_packet_generated_at"] == result["generated_at"]
    assert set(result["news_evidence"]) == {"NVDA", "KO"}
    assert result["news_evidence"]["NVDA"][0]["raw_id"] == "NVDA_1"
    assert "sentiment" not in result["news_evidence"]["NVDA"][0]
    assert result["filing_evidence"]["NVDA"]["cik"] == "0001045810"
    assert result["filing_evidence"]["NVDA"]["limitations"] == ["example_limitation"]
    assert result["company_theses"]["NVDA"]["core_thesis"] == "AI infrastructure leader"


def test_collect_market_raw_uses_yfinance_fallback(monkeypatch, tmp_path: Path) -> None:
    class FakeColumns:
        nlevels = 1

    class FakeRow(dict):
        def get(self, key, default=None):
            return super().get(key, default)

    class FakeIndexValue:
        def __init__(self, value: str) -> None:
            self._value = value

        def date(self):
            class _D:
                def __init__(self, value: str) -> None:
                    self.value = value

                def isoformat(self) -> str:
                    return self.value

            return _D(self._value)

    class FakeFrame:
        def __init__(self) -> None:
            self.empty = False
            self.columns = FakeColumns()
            self._rows = [
                (FakeIndexValue('2026-05-16'), FakeRow({'Open': 100.0, 'High': 101.0, 'Low': 99.0, 'Close': 100.5, 'Adj Close': 100.4, 'Volume': 1000})),
                (FakeIndexValue('2026-05-17'), FakeRow({'Open': 101.0, 'High': 102.0, 'Low': 100.0, 'Close': 101.5, 'Adj Close': 101.4, 'Volume': 1200})),
            ]

        def iterrows(self):
            return iter(self._rows)

    class FakeYFinance:
        @staticmethod
        def download(symbol, period='2y', interval='1d', auto_adjust=False, progress=False, threads=False):
            return FakeFrame()

    monkeypatch.setattr(collector, 'RAW_DIR', tmp_path / 'raw')
    monkeypatch.delenv('ALPHAVANTAGE_API_KEY', raising=False)
    monkeypatch.setattr(collector, 'read_csv_rows', lambda path: [])

    import sys
    sys.modules['yfinance'] = FakeYFinance
    try:
        result = collector._collect_market_raw()
    finally:
        sys.modules.pop('yfinance', None)

    assert result['status'] == 'success'
    assert result['source'] == 'yfinance'
    assert set(result['symbols_collected']) == set(collector.MARKET_SYMBOLS)
    assert result['rows_written'] == 2 * len(collector.MARKET_SYMBOLS)
    assert (tmp_path / 'raw' / 'market' / 'NVDA_prices.csv').exists()


def test_legacy_model_comparison_is_deprecated_in_packet(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    _write_json(tmp_path / "raw_summary.json", {"sec": {}, "fred": {}, "market": {}, "news": {}})
    _write_json(tmp_path / "predictions.json", {"model_type": "transparent_fallback", "predictions": {"NVDA": {"benchmark": "QQQ", "outperform_probability": 0.51, "model_confidence": 0.1}, "KO": {"benchmark": "XLP", "outperform_probability": 0.49, "model_confidence": 0.09}}})
    _write_json(tmp_path / "scorecards.json", {"scorecards": [{"ticker": "NVDA", "aggregate_indicator_score": -0.1, "confidence_score": 0.2, "recommendation_band": "reduce"}, {"ticker": "KO", "aggregate_indicator_score": 0.1, "confidence_score": 0.2, "recommendation_band": "hold"}]})
    _write_json(tmp_path / "stress.json", {"pm_review_required": True, "risk_action": "review", "portfolio_downside_range": [-0.05, -0.03]})
    _write_json(tmp_path / "model_comparison.json", {"tool_name": "model_comparison", "status": "success", "official_model_type": "transparent_fallback", "models": {"logistic_regression": {"status": "success", "limitations": []}, "random_forest": {"status": "success", "limitations": []}}, "target_price_models": {"linear_regression": {"status": "success", "limitations": ["not_used_for_official_recommendation"]}, "random_forest_regressor": {"status": "success", "limitations": ["experimental_price_forecast_low_validation_quality"]}}, "ticker_results": {"NVDA": {"logistic_regression": {"status": "success", "outperform_probability": 0.9}, "random_forest": {"status": "success", "outperform_probability": 0.1}, "target_price_models": {"linear_regression": {"status": "success", "current_price": 100.0, "predicted_60d_return": 0.05, "predicted_60d_price": 105.0, "limitations": ["not_used_for_official_recommendation"]}, "random_forest_regressor": {"status": "success", "current_price": 100.0, "predicted_60d_return": -0.02, "predicted_60d_price": 98.0, "limitations": ["experimental_price_forecast_low_validation_quality"]}}}, "KO": {"logistic_regression": {"status": "success", "outperform_probability": 0.2}, "random_forest": {"status": "success", "outperform_probability": 0.8}, "target_price_models": {"linear_regression": {"status": "unavailable_current_price", "current_price": None, "predicted_60d_return": None, "predicted_60d_price": None, "limitations": ["unavailable_current_price"]}, "random_forest_regressor": {"status": "insufficient_training_data", "current_price": None, "predicted_60d_return": None, "predicted_60d_price": None, "limitations": ["experimental_price_forecast_low_validation_quality"]}}}}, "limitations": ["experimental_models_do_not_override_official_recommendation_logic"]})

    result = generate_recommendation_packet(
        raw_summary_path=str(tmp_path / "raw_summary.json"),
        mandate_path=str(repo_root / "data" / "mandates" / "demo_pm_mandate.json"),
        portfolio_path=str(repo_root / "data" / "portfolio" / "demo_portfolio.json"),
        model_predictions_path=str(tmp_path / "predictions.json"),
        indicator_scorecards_path=str(tmp_path / "scorecards.json"),
        stress_test_path=str(tmp_path / "stress.json"),
        model_comparison_path=str(tmp_path / "model_comparison.json"),
        output_path=str(tmp_path / "packet.json"),
    )

    assert result["model_comparison"]["status"] == "deprecated"
    assert result["model_comparison"]["legacy_ml_output"] is True
    assert result["model_comparison"]["not_senior_evidence"] is True
    assert "models" not in result["model_comparison"]
    assert "target_price_models" not in result["model_comparison"]
    assert "logistic_regression" in result["model_comparison"]["models_present"]
    assert "linear_regression" in result["model_comparison"]["target_price_models_present"]
    assert result["recommendations"]["NVDA"]["action"] in {"hold_review", "review"}
    assert result["recommendations"]["NVDA"]["legacy_recommendation_gate"] is True
    assert result["draft_trade_tickets"][0]["action"] in {"hold_review", "review"}



def test_packet_deprecates_target_price_model_quality_fields() -> None:
    result = json.loads(
        Path(__file__).resolve().parents[2]
        .joinpath('artifacts', 'milestone04_demo', 'recommendation_packet.json')
        .read_text(encoding='utf-8')
    )

    assert result['model_comparison']['status'] == 'deprecated'
    assert result['model_comparison']['not_senior_evidence'] is True
    assert 'ticker_results' not in result['model_comparison']
    assert 'target_price_models' not in result['model_comparison']
    assert result['model_comparison']['presentation_guidance']['do_not_show_regression_rmse_or_outperform_probability_as_senior_evidence'] is True
    assert 'dcf_valuations' in result
    assert 'entry_price_models' in result

    assert result['recommendations']['NVDA']['action'] in {'hold', 'reduce', 'avoid', 'review', 'hold_review', 'accumulate'}



def test_prepare_news_evidence_keeps_core_article_fields(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw_news"
    _write_json(
        raw_dir / "NVDA_news_raw.json",
        [
            {
                "raw_id": "n1",
                "ticker": "NVDA",
                "source_name": "rss",
                "source_domain": "example.com",
                "url": "https://example.com/a",
                "published_at": "2026-05-18",
                "raw_title": "Export control and supply chain risks",
                "raw_description": "AI demand and capex remain strong.",
                "raw_content": None,
                "fetch_status": "success",
            }
        ],
    )
    _write_json(raw_dir / "KO_news_raw.json", [])

    result = prepare_news_evidence(news_dir=str(raw_dir), output_path=str(tmp_path / "news_evidence.json"))

    article = result["articles"][0]
    assert article["raw_id"] == "n1"
    assert article["url"] == "https://example.com/a"
    assert article["source_name"] == "rss"
    assert article["published_at"] == "2026-05-18"
    assert article["evidence_chunks"]
    assert "image_url" not in article
    assert "resolved_url" not in article
    assert "image_source" not in article


def test_prepare_news_evidence_does_not_copy_image_fields_from_raw_payload(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw_news"
    _write_json(
        raw_dir / "NVDA_news_raw.json",
        [
            {
                "raw_id": "n1",
                "ticker": "NVDA",
                "source_name": "rss",
                "source_domain": "example.com",
                "url": "https://example.com/a",
                "published_at": "2026-05-18",
                "raw_title": "Export control and supply chain risks",
                "raw_description": "AI demand and capex remain strong.",
                "raw_content": None,
                "api_payload": {"media_thumbnail": "https://images.example.com/thumb.jpg"},
                "image_url": "https://images.example.com/thumb.jpg",
                "fetch_status": "success",
            }
        ],
    )
    _write_json(raw_dir / "KO_news_raw.json", [])

    result = prepare_news_evidence(news_dir=str(raw_dir), output_path=str(tmp_path / "news_evidence.json"))

    article = result["articles"][0]
    assert "image_url" not in article
    assert "resolved_url" not in article
    assert "image_source" not in article
