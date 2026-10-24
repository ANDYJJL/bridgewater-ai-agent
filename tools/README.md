# Tools

This folder contains deterministic tool-style Python functions for the current backend pipeline.

These modules are:
- deterministic
- JSON-serializable
- free of hidden global state
- designed to be MCP-friendly later

They are **not** yet exposed through an MCP server. At this stage, they provide stable function signatures and structured return payloads that a later MCP layer can wrap.

## Current pipeline tools

The active workflow uses tools for raw data collection, evidence preparation, stock feature generation, indicator scoring, valuation artifacts, portfolio stress testing, and recommendation packet generation.

## Workflow role
These tools do calculation, extraction, and scoring only.

They do **not**:
- write an analyst memo
- produce a final recommendation
- classify the thesis as buy, sell, intact, or broken

That synthesis step belongs in the active backend skills, where the LLM can draft explanations, memos, scenario reviews, and PM debate challenges from grounded packet context.
