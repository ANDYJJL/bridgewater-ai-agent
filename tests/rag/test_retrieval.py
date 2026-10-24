from __future__ import annotations

import json

from rag.retrieval import retrieve


def test_retrieve_returns_json_serializable_dict() -> None:
    output = retrieve("macro risk policy", top_k=2)

    assert isinstance(output, dict)
    assert output["query"] == "macro risk policy"
    assert output["top_k"] == 2
    assert isinstance(output["results"], list)
    json.dumps(output)


def test_retrieve_respects_top_k() -> None:
    output = retrieve("risk thesis evidence policy filing macro scenario", top_k=1)

    assert len(output["results"]) <= 1


def test_export_control_risk_escalation_returns_relevant_document() -> None:
    output = retrieve("export control risk escalation", top_k=3)
    document_paths = {result["document_path"] for result in output["results"]}

    assert "rag/knowledge_base/risk_escalation_rules.md" in document_paths


def test_result_shape_contains_required_fields() -> None:
    output = retrieve("filing margin concentration", top_k=1)

    assert output["results"]
    result = output["results"][0]
    assert {"document_path", "title", "score", "excerpt"} <= set(result)
    assert isinstance(result["document_path"], str)
    assert isinstance(result["title"], str)
    assert isinstance(result["score"], int)
    assert isinstance(result["excerpt"], str)


def test_unrelated_query_returns_gracefully() -> None:
    output = retrieve("zzzzzz qqqqqq nonexistenttoken", top_k=3)

    assert output["results"] == []
