"""Deterministic retrieval for the knowledge base in ``rag/knowledge_base/``.

This module intentionally uses simple keyword overlap instead of embeddings or
external APIs. It is enough for Milestone 03 validation and keeps retrieval
fully reproducible.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
KB_DIR = Path(__file__).resolve().parent / "knowledge_base"
INDEX_DIR = Path(__file__).resolve().parent / "index"

_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "if",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "should",
    "that",
    "the",
    "this",
    "to",
    "when",
    "where",
    "with",
}


def _normalize_token(token: str) -> str:
    token = token.lower()
    if len(token) > 4 and token.endswith("ies"):
        return f"{token[:-3]}y"
    if len(token) > 5 and token.endswith("ing"):
        return token[:-3]
    if len(token) > 4 and token.endswith("ed"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9]+", text.lower())
    return [
        normalized
        for token in tokens
        if (normalized := _normalize_token(token)) and normalized not in _STOPWORDS and len(normalized) > 1
    ]


def _resolve_knowledge_base_dir(knowledge_base_dir: str | Path | None) -> Path:
    if knowledge_base_dir is None:
        return KB_DIR

    path = Path(knowledge_base_dir)
    if not path.is_absolute():
        path = _REPO_ROOT / path
    return path


def _document_path_for_output(path: Path) -> str:
    try:
        return path.resolve().relative_to(_REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _load_documents(knowledge_base_dir: str | Path | None = None) -> list[dict[str, str]]:
    kb_dir = _resolve_knowledge_base_dir(knowledge_base_dir)
    documents: list[dict[str, str]] = []
    if not kb_dir.exists():
        return documents

    for path in sorted(kb_dir.glob("*")):
        if path.suffix.lower() not in {".md", ".markdown", ".txt"} or not path.is_file():
            continue

        text = path.read_text(encoding="utf-8")
        title = path.stem.replace("_", " ").replace("-", " ").title()
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                title = stripped.lstrip("#").strip() or title
                break

        documents.append(
            {
                "document_path": _document_path_for_output(path),
                "title": title,
                "text": text,
            }
        )
    return documents


def _clean_excerpt(text: str, max_chars: int = 320) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[: max_chars - 3].rstrip()}..."


def _best_excerpt(text: str, query_tokens: set[str]) -> str:
    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", text) if paragraph.strip()]
    if not paragraphs:
        return ""

    def paragraph_score(paragraph: str) -> tuple[int, int]:
        tokens = _tokenize(paragraph)
        overlap = len(query_tokens.intersection(tokens))
        return overlap, -len(paragraph)

    best = max(paragraphs, key=paragraph_score)
    return _clean_excerpt(best)


def retrieve(query: str, top_k: int = 3, knowledge_base_dir: str | Path | None = None) -> dict:
    """Return the most relevant knowledge-base documents for ``query``.

    Results are ranked by keyword overlap between the query and each document.
    The return value is JSON serializable and safe for callers to serialize or
    include in workflow artifacts.
    """
    safe_top_k = max(0, int(top_k))
    query_text = str(query or "")
    query_tokens = set(_tokenize(query_text))

    if safe_top_k == 0 or not query_tokens:
        return {"query": query_text, "top_k": safe_top_k, "results": []}

    ranked_results: list[dict] = []
    for document in _load_documents(knowledge_base_dir):
        doc_tokens = _tokenize(document["text"])
        doc_counts = Counter(doc_tokens)
        overlap_tokens = query_tokens.intersection(doc_counts)
        if not overlap_tokens:
            continue

        score = sum(doc_counts[token] for token in overlap_tokens)
        ranked_results.append(
            {
                "document_path": document["document_path"],
                "title": document["title"],
                "score": score,
                "excerpt": _best_excerpt(document["text"], query_tokens),
            }
        )

    ranked_results.sort(key=lambda item: (-item["score"], item["document_path"]))
    return {"query": query_text, "top_k": safe_top_k, "results": ranked_results[:safe_top_k]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Keyword retrieval over rag/knowledge_base.")
    parser.add_argument("query", nargs="?", default="export control risk escalation")
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()

    print(json.dumps(retrieve(args.query, top_k=args.top_k), indent=2))
