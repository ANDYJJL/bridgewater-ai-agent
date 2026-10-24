// Thin wrapper for grounded drafting via the backend /chat proxy.
// Never calls the LLM provider directly — all requests go through /api/backend/chat.
// Supported modes: packet_qna, junior_memo, senior_risk_handoff,
//                  trade_proposal_rationale, indicator_explanation
import { askAnalyst } from './backendApi';

export async function chatWithBackend({ ticker, question, mode }) {
  return askAnalyst({ ticker, question, mode });
}
