from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from rag.retrieval import retrieve as _retrieve_rag_context
from tools.build_stock_features import build_stock_features as _build_stock_features
from tools.extract_filing_metrics import extract_filing_metrics as _extract_filing_metrics
from tools.generate_recommendation_packet import generate_recommendation_packet as _generate_recommendation_packet
from tools.get_macro_trends import get_macro_trends as _get_macro_trends
from tools.predict_outperformance import predict_outperformance as _predict_outperformance
from tools.prepare_filing_evidence import prepare_filing_evidence as _prepare_filing_evidence
from tools.prepare_news_evidence import prepare_news_evidence as _prepare_news_evidence
from tools.run_portfolio_stress_test import run_portfolio_stress_test as _run_portfolio_stress_test
from tools.score_stock_indicators import score_stock_indicators as _score_stock_indicators


mcp = FastMCP("milestone03-bridgewater-tools")


@mcp.tool()
def get_macro_trends(
    path: str = "data/fred_macro/fred_macro_sample.csv",
    series_ids: list[str] | None = None,
    lookback_periods: int = 4,
) -> dict:
    """Use when the LLM needs deterministic FRED macro trend features before thesis-specific macro synthesis."""
    return _get_macro_trends(path=path, series_ids=series_ids, lookback_periods=lookback_periods)


@mcp.tool()
def extract_filing_metrics(
    filing_path: str = "data/filings/raw/nvda_10k_excerpts.json",
    ticker: str | None = None,
    include_segments: bool = True,
) -> dict:
    """Use when the LLM needs deterministic filing flags, snippets, and coverage from raw filing excerpts."""
    return _extract_filing_metrics(
        filing_path=filing_path,
        ticker=ticker,
        include_segments=include_segments,
    )


@mcp.tool()
def retrieve_rag_context(query: str, top_k: int = 3) -> dict:
    """Use when the LLM needs Bridgewater-style framework context from the local RAG knowledge base."""
    return _retrieve_rag_context(query=query, top_k=top_k, knowledge_base_dir="rag/knowledge_base")


@mcp.tool()
def prepare_news_evidence(
    news_dir: str = "data/raw/news",
    output_path: str = "data/processed/news_evidence.json",
) -> dict:
    """Use when the LLM needs cleaned news evidence chunks and keyword hits from raw public-source news."""
    return _prepare_news_evidence(news_dir=news_dir, output_path=output_path)


@mcp.tool()
def prepare_filing_evidence(
    sec_root: str = "data/raw/sec",
    output_path: str = "data/processed/filing_evidence.json",
) -> dict:
    """Use when the LLM needs structured filing evidence derived from raw SEC submissions and companyfacts."""
    return _prepare_filing_evidence(sec_root=sec_root, output_path=output_path)


@mcp.tool()
def build_stock_features(
    market_dir: str = "data/raw/market",
    fred_path: str = "data/raw/fred/macro_observations.csv",
    news_evidence_path: str = "data/processed/news_evidence.json",
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    output_path: str = "data/processed/stock_features.csv",
) -> dict:
    """Use when the LLM needs deterministic stock features from raw market, macro, news, and filing evidence."""
    return _build_stock_features(
        market_dir=market_dir,
        fred_path=fred_path,
        news_evidence_path=news_evidence_path,
        filing_evidence_path=filing_evidence_path,
        output_path=output_path,
    )


@mcp.tool()
def predict_outperformance(
    market_dir: str = "data/raw/market",
    stock_features_path: str = "data/processed/stock_features.csv",
    output_path: str = "data/processed/model_predictions.json",
) -> dict:
    """Use when the LLM needs a deterministic prediction of 60-day benchmark outperformance."""
    return _predict_outperformance(
        market_dir=market_dir,
        stock_features_path=stock_features_path,
        output_path=output_path,
    )


@mcp.tool()
def score_stock_indicators(
    stock_features_path: str = "data/processed/stock_features.csv",
    model_predictions_path: str = "data/processed/model_predictions.json",
    indicator_config_path: str = "data/indicators/indicator_config.json",
    portfolio_path: str = "data/portfolio/demo_portfolio.json",
    mandate_path: str = "data/mandates/demo_pm_mandate.json",
    news_evidence_path: str = "data/processed/news_evidence.json",
    filing_evidence_path: str = "data/processed/filing_evidence.json",
    output_path: str = "data/processed/indicator_scorecards.json",
) -> dict:
    """Use when the LLM needs weighted stock indicator scorecards grounded in deterministic evidence."""
    return _score_stock_indicators(
        stock_features_path=stock_features_path,
        model_predictions_path=model_predictions_path,
        indicator_config_path=indicator_config_path,
        portfolio_path=portfolio_path,
        mandate_path=mandate_path,
        news_evidence_path=news_evidence_path,
        filing_evidence_path=filing_evidence_path,
        output_path=output_path,
    )


@mcp.tool()
def run_portfolio_stress_test(
    indicator_scorecards_path: str = "data/processed/indicator_scorecards.json",
    portfolio_path: str = "data/portfolio/demo_portfolio.json",
    mandate_path: str = "data/mandates/demo_pm_mandate.json",
    output_path: str = "data/processed/portfolio_stress_test.json",
) -> dict:
    """Use when the LLM needs deterministic portfolio downside ranges under internal stress scenarios."""
    return _run_portfolio_stress_test(
        indicator_scorecards_path=indicator_scorecards_path,
        portfolio_path=portfolio_path,
        mandate_path=mandate_path,
        output_path=output_path,
    )


@mcp.tool()
def generate_recommendation_packet(
    raw_summary_path: str = "data/raw/collection_summary.json",
    mandate_path: str = "data/mandates/demo_pm_mandate.json",
    portfolio_path: str = "data/portfolio/demo_portfolio.json",
    model_predictions_path: str = "data/processed/model_predictions.json",
    indicator_scorecards_path: str = "data/processed/indicator_scorecards.json",
    stress_test_path: str = "data/processed/portfolio_stress_test.json",
    output_path: str = "artifacts/milestone04_demo/recommendation_packet.json",
) -> dict:
    """Use when the LLM needs the final milestone04 recommendation packet assembled from deterministic outputs."""
    return _generate_recommendation_packet(
        raw_summary_path=raw_summary_path,
        mandate_path=mandate_path,
        portfolio_path=portfolio_path,
        model_predictions_path=model_predictions_path,
        indicator_scorecards_path=indicator_scorecards_path,
        stress_test_path=stress_test_path,
        output_path=output_path,
    )


if __name__ == "__main__":
    mcp.run()
