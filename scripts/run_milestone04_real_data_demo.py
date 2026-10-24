from __future__ import annotations

import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.collect_real_raw_data import collect_real_raw_data
from tools.build_dcf_model import build_dcf_valuations
from tools.build_entry_price_model import build_entry_price_models
from tools.build_stock_features import build_stock_features
from tools.build_three_statement_model import build_three_statement_models
from tools.generate_recommendation_packet import generate_recommendation_packet
from tools.predict_outperformance import predict_outperformance
from tools.prepare_filing_evidence import prepare_filing_evidence
from tools.prepare_news_evidence import prepare_news_evidence
from tools.run_portfolio_stress_test import run_portfolio_stress_test
from tools.score_stock_indicators import score_stock_indicators


def main() -> int:
    outputs = {
        "collect_real_raw_data": collect_real_raw_data(),
        "prepare_news_evidence": prepare_news_evidence(),
        "prepare_filing_evidence": prepare_filing_evidence(),
        "build_stock_features": build_stock_features(),
        "predict_outperformance": predict_outperformance(),
        "score_stock_indicators": score_stock_indicators(),
        "run_portfolio_stress_test": run_portfolio_stress_test(),
        "build_three_statement_models": build_three_statement_models(),
        "build_dcf_valuations": build_dcf_valuations(),
        "build_entry_price_models": build_entry_price_models(enable_simulated_shares_fallback=True),
    }
    outputs["generate_recommendation_packet"] = generate_recommendation_packet()

    packet_path = _REPO_ROOT / "artifacts" / "milestone04_demo" / "recommendation_packet.json"
    print(json.dumps({"status": "ok", "packet_path": str(packet_path), "steps": list(outputs)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
