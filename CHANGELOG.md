# Changelog

## v1.0.0 — 2026-10-23 (public release)

Initial public release of the MGTA 495 Group 16 final project, prepared from
the course submission package. For a public repository, the following
adjustments were made relative to the course original:

- Personal contact details removed from the UI (school email and phone number
  in the About page and nav); a single public contact email remains.
- The university LLM gateway address is configured through environment
  variables (`LLM_GATEWAY_BASE_URL`, see `.env.example`) instead of a
  hardcoded school URL; gateway API keys were always environment-based and no
  credentials are included.
- The ChatGPT/Codex OAuth helper reads its client id from the environment
  (`OPENAI_CODEX_CLIENT_ID`).
- `data/raw/` bulk pulls (~21 MB of SEC/news source files) are excluded and
  can be regenerated with `scripts/collect_real_raw_data.py`; processed demo
  data and the final recommendation packet are included.
- Added a provenance and non-affiliation note to the README.
