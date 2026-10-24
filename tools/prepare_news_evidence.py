from __future__ import annotations

import json
import re
from pathlib import Path

from tools.milestone04_common import TARGET_TICKERS, utc_now_iso, write_json


TOPIC_KEYWORDS = {
    "export_control": ["export control", "export restriction", "chip ban", "license"],
    "supply_chain": ["supply chain", "packaging", "substrate", "lead time", "inventory"],
    "capex": ["capex", "capital expenditure", "capital spending", "infrastructure spending"],
    "margin": ["margin", "gross profit", "operating income", "cost pressure"],
    "AI_demand": ["ai demand", "training cluster", "inference", "accelerated computing"],
    "pricing_power": ["pricing power", "price increase", "premium pricing"],
    "volume": ["volume", "shipment", "unit growth", "case volume"],
    "inflation": ["inflation", "input cost", "commodity cost"],
    "FX": ["fx", "foreign exchange", "currency"],
    "dividend": ["dividend", "payout", "shareholder return"],
}


def _strip_html(text: str | None) -> str:
    if not text:
        return ""
    no_tags = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", no_tags).strip()


def _chunk_text(text: str, chunk_size: int = 280) -> list[str]:
    if not text:
        return []
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for word in words:
        current.append(word)
        current_len += len(word) + 1
        if current_len >= chunk_size:
            chunks.append(" ".join(current))
            current = []
            current_len = 0
    if current:
        chunks.append(" ".join(current))
    return chunks


def _keyword_hits(text: str) -> dict[str, int]:
    lowered = text.lower()
    hits: dict[str, int] = {}
    for topic, phrases in TOPIC_KEYWORDS.items():
        hits[topic] = sum(lowered.count(phrase.lower()) for phrase in phrases)
    return hits


def prepare_news_evidence(
    news_dir: str = "data/raw/news",
    output_path: str = "data/processed/news_evidence.json",
) -> dict[str, object]:
    base_dir = Path(news_dir)
    articles: list[dict[str, object]] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()

    for ticker in TARGET_TICKERS:
        payload = []
        file_path = base_dir / f"{ticker}_news_raw.json"
        if file_path.exists():
            try:
                payload = json.loads(file_path.read_text(encoding="utf-8"))
            except Exception:
                payload = []

        for item in payload if isinstance(payload, list) else []:
            title = _strip_html(item.get("raw_title"))
            description = _strip_html(item.get("raw_description"))
            content = _strip_html(item.get("raw_content"))
            combined = " ".join(part for part in [title, description, content] if part).strip()
            url = str(item.get("url") or "")
            duplicate_flags = {
                "duplicate_url": bool(url and url in seen_urls),
                "duplicate_title": bool(title and title in seen_titles),
            }
            if url:
                seen_urls.add(url)
            if title:
                seen_titles.add(title)

            articles.append(
                {
                    "raw_id": item.get("raw_id"),
                    "ticker": item.get("ticker", ticker),
                    "source_name": item.get("source_name"),
                    "source_domain": item.get("source_domain"),
                    "url": url,
                    "published_at": item.get("published_at"),
                    "fetch_status": item.get("fetch_status", "unknown"),
                    "clean_text": combined,
                    "evidence_chunks": _chunk_text(combined),
                    "keyword_hits": _keyword_hits(combined),
                    **duplicate_flags,
                }
            )

    result = {
        "tool_name": "prepare_news_evidence",
        "generated_at": utc_now_iso(),
        "source_dir": str(news_dir),
        "articles": articles,
        "coverage": {
            "tickers_requested": TARGET_TICKERS,
            "articles_processed": len(articles),
            "source_files_found": [
                str(Path(news_dir) / f"{ticker}_news_raw.json")
                for ticker in TARGET_TICKERS
                if (base_dir / f"{ticker}_news_raw.json").exists()
            ],
        },
    }
    write_json(output_path, result)
    return result


if __name__ == "__main__":
    print(json.dumps(prepare_news_evidence(), indent=2))
