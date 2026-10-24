from __future__ import annotations

from typing import Any
from typing import Literal

from pydantic import BaseModel, Field


class RecommendationRunRequest(BaseModel):
    ticker: str = Field(..., min_length=1)
    company: str = Field(..., min_length=1)
    theme: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    ticker: str = Field(..., min_length=1)
    question: str = ''
    company: str | None = None
    role: Literal['junior_analyst', 'senior_analyst', 'risk_team', 'portfolio_manager'] = 'junior_analyst'
    indicator_name: str | None = Field(default=None)
    senior_proposal: dict[str, Any] | None = None
    valuation_basis: dict[str, Any] | None = None
    risk_factors: list[Any] | dict[str, Any] | None = None
    scenario_settings: dict[str, Any] | None = None
    pm_context: dict[str, Any] | None = None
    risk_team_analysis: dict[str, Any] | None = None
    decision_candidate: str | dict[str, Any] | None = None
    pm_answer: str | None = None
    debate_action: Literal['initial', 'turn'] | None = None
    pm_message: str | None = None
    chat_history: list[dict[str, Any]] | None = None
    active_agent: str | None = None
    mode: Literal[
        'packet_qna',
        'junior_memo',
        'senior_risk_handoff',
        'trade_proposal_rationale',
        'indicator_explanation',
        'synthesis_memo',
        'risk_scenario_analysis',
        'pm_decision_debate',
    ] = 'packet_qna'
