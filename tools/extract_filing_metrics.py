from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


FACT_PATTERNS: dict[str, list[str]] = {
    "mentions_data_center": ["data center"],
    "mentions_hyperscaler": ["hyperscale", "hyperscaler"],
    "mentions_enterprise": ["enterprise"],
    "mentions_gross_margin": ["gross margin"],
    "mentions_supply_constraints": ["supply chain", "lead times", "shipment cadence", "availability"],
    "mentions_advanced_packaging": ["advanced packaging", "packaging"],
    "mentions_export_controls": ["export control", "export controls", "trade policy", "regional restrictions"],
    "mentions_customer_concentration": ["customer concentration", "limited number of", "major customers"],
    "mentions_inventory_commitments": ["inventory", "purchase commitments", "prepayments", "capacity commitments"],
    "mentions_product_transition": ["product transition", "next-generation", "platform transitions"],
}

FLAG_TO_FACT = {
    "customer_concentration_flag": "mentions_customer_concentration",
    "supply_chain_flag": "mentions_supply_constraints",
    "export_control_flag": "mentions_export_controls",
    "margin_pressure_flag": "mentions_gross_margin",
    "inventory_commitment_flag": "mentions_inventory_commitments",
}


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def _extract_snippet(text: str, keyword: str, max_len: int = 180) -> str:
    lower = text.lower()
    idx = lower.find(keyword.lower())
    if idx == -1:
        return _normalize_text(text[:max_len])
    start = max(0, idx - 60)
    end = min(len(text), idx + max_len - 60)
    return _normalize_text(text[start:end])


def _find_matching_sections(sections: list[dict[str, Any]], patterns: list[str]) -> list[dict[str, str]]:
    matches: list[dict[str, str]] = []
    for section in sections:
        excerpt = str(section.get("excerpt", ""))
        excerpt_lower = excerpt.lower()
        for pattern in patterns:
            if pattern in excerpt_lower:
                matches.append(
                    {
                        "section_name": str(section.get("section_name", "unknown")),
                        "snippet": _extract_snippet(excerpt, pattern),
                    }
                )
                break
    return matches


def extract_filing_metrics(
    filing_path: str = "data/filings/raw/nvda_10k_excerpts.json",
    ticker: str | None = None,
    include_segments: bool = True,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "tool_name": "extract_filing_metrics",
        "ticker": ticker.upper() if ticker else None,
        "filing_type": None,
        "fiscal_year": None,
        "sections_processed": 0,
        "extracted_facts": {},
        "risk_flags": {},
        "coverage": {
            "status": "ok",
            "source_path": filing_path,
            "ticker_matched": False,
            "explicit_revenue_number_found": False,
            "explicit_margin_number_found": False,
            "sections_available": [],
            "missing_expected_sections": [],
            "error": None,
        },
    }

    file_path = Path(filing_path)
    if not file_path.exists():
        result["coverage"]["status"] = "missing_file"
        result["coverage"]["error"] = f"File not found: {filing_path}"
        return result

    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as exc:
        result["coverage"]["status"] = "read_error"
        result["coverage"]["error"] = str(exc)
        return result

    sections = payload.get("sections")
    if not isinstance(sections, list):
        result["coverage"]["status"] = "invalid_schema"
        result["coverage"]["error"] = "Expected top-level 'sections' list."
        return result

    file_ticker = str(payload.get("ticker", "")).upper() or None
    requested_ticker = ticker.upper() if ticker else file_ticker
    result["ticker"] = requested_ticker
    result["filing_type"] = payload.get("filing_type")
    result["fiscal_year"] = payload.get("fiscal_year")
    result["coverage"]["ticker_matched"] = requested_ticker == file_ticker if requested_ticker and file_ticker else False

    if ticker and file_ticker and requested_ticker != file_ticker:
        result["coverage"]["status"] = "ticker_mismatch"
        result["coverage"]["error"] = f"Requested ticker {requested_ticker} does not match filing ticker {file_ticker}."
        return result

    section_names = [str(section.get("section_name", "")) for section in sections]
    result["coverage"]["sections_available"] = section_names
    result["sections_processed"] = len(sections)

    expected_sections = [
        "Business overview",
        "Revenue discussion",
        "Gross margin and supply chain",
        "Risk factors",
        "Customer concentration",
        "Inventory and supply commitments",
        "Management outlook",
    ]
    if include_segments:
        expected_sections.append("Segment discussion")

    available_names = set(section_names)
    result["coverage"]["missing_expected_sections"] = [
        name for name in expected_sections if name not in available_names
    ]

    combined_text = " ".join(str(section.get("excerpt", "")) for section in sections)
    revenue_number_match = re.search(r"\brevenue\b[^0-9]{0,20}\$?\d", combined_text, re.IGNORECASE)
    margin_number_match = re.search(r"\bgross margin\b[^0-9]{0,20}\d", combined_text, re.IGNORECASE)
    result["coverage"]["explicit_revenue_number_found"] = bool(revenue_number_match)
    result["coverage"]["explicit_margin_number_found"] = bool(margin_number_match)

    extracted_facts: dict[str, Any] = {}
    for fact_name, patterns in FACT_PATTERNS.items():
        matches = _find_matching_sections(sections, patterns)
        extracted_facts[fact_name] = bool(matches)
        extracted_facts[f"{fact_name}_evidence"] = matches[:2]

    risk_flags: dict[str, Any] = {}
    for flag_name, fact_name in FLAG_TO_FACT.items():
        evidence = extracted_facts.get(f"{fact_name}_evidence", [])
        risk_flags[flag_name] = {
            "triggered": bool(extracted_facts.get(fact_name)),
            "evidence": evidence,
        }

    result["extracted_facts"] = extracted_facts
    result["risk_flags"] = risk_flags
    return result
