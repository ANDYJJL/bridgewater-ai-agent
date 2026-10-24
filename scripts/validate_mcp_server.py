from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

_VENV_PYTHON = _REPO_ROOT / ".venv" / "bin" / "python"
try:
    from mcp.server.fastmcp import FastMCP as _FastMCP  # noqa: F401
except Exception:
    if _VENV_PYTHON.exists() and Path(sys.executable) != _VENV_PYTHON:
        os.execv(str(_VENV_PYTHON), [str(_VENV_PYTHON), __file__])

from mcp_servers import bridgewater_server


def main() -> int:
    assert hasattr(bridgewater_server, "mcp"), "MCP server object `mcp` is missing"

    wrappers = {
        "get_macro_trends": bridgewater_server.get_macro_trends,
        "extract_filing_metrics": bridgewater_server.extract_filing_metrics,
        "retrieve_rag_context": bridgewater_server.retrieve_rag_context,
        "prepare_news_evidence": bridgewater_server.prepare_news_evidence,
        "prepare_filing_evidence": bridgewater_server.prepare_filing_evidence,
        "build_stock_features": bridgewater_server.build_stock_features,
        "predict_outperformance": bridgewater_server.predict_outperformance,
        "score_stock_indicators": bridgewater_server.score_stock_indicators,
        "run_portfolio_stress_test": bridgewater_server.run_portfolio_stress_test,
        "generate_recommendation_packet": bridgewater_server.generate_recommendation_packet,
    }

    outputs = {
        "get_macro_trends": wrappers["get_macro_trends"](),
        "extract_filing_metrics": wrappers["extract_filing_metrics"](),
        "retrieve_rag_context": wrappers["retrieve_rag_context"](
            query="export control risk escalation",
            top_k=3,
        ),
        "prepare_news_evidence": wrappers["prepare_news_evidence"](),
        "prepare_filing_evidence": wrappers["prepare_filing_evidence"](),
        "build_stock_features": wrappers["build_stock_features"](),
        "predict_outperformance": wrappers["predict_outperformance"](),
        "score_stock_indicators": wrappers["score_stock_indicators"](),
        "run_portfolio_stress_test": wrappers["run_portfolio_stress_test"](),
        "generate_recommendation_packet": wrappers["generate_recommendation_packet"](),
    }

    for name, output in outputs.items():
        assert isinstance(output, dict), f"{name} did not return a dict"
        json.dumps(output)

    print("validate_mcp_server: OK")
    print("registered_wrappers:", ", ".join(wrappers))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
