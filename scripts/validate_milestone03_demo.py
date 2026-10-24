from __future__ import annotations

import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def main() -> int:
    packet_path = _REPO_ROOT / "artifacts" / "milestone03_demo" / "nvda_workflow_packet.json"
    assert packet_path.exists(), f"Missing packet: {packet_path}"

    packet = json.loads(packet_path.read_text(encoding="utf-8"))

    required_keys = {
        "demo_name",
        "ticker",
        "company_name",
        "thesis_date",
        "original_thesis",
        "step_1_macro_brief",
        "step_2_news_signals",
        "step_3_filing_inputs",
        "step_4_scenario_stress_test",
        "llm_synthesis_prompt",
        "workflow_limitations",
    }
    assert required_keys <= set(packet), "Missing required top-level keys"

    assert isinstance(packet["step_1_macro_brief"], dict)
    assert isinstance(packet["step_2_news_signals"], dict)
    assert isinstance(packet["step_3_filing_inputs"], dict)
    assert isinstance(packet["step_4_scenario_stress_test"], dict)

    scenario_results = packet["step_4_scenario_stress_test"].get("scenario_results", [])
    assert scenario_results, "scenario_results should not be empty"

    synthesis_prompt = packet.get("llm_synthesis_prompt", "")
    assert isinstance(synthesis_prompt, str) and synthesis_prompt.strip(), "llm_synthesis_prompt missing"

    json.dumps(packet)
    print("validate_milestone03_demo: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
