'use client';

import React from 'react';

const LABEL_ST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';

// Reusable panel shown after a /chat drafting call.
// Props:
//   state      — { loading, error, result }
//   onApply    — (answerText: string) => void
//   applyLabel — button label, e.g. "Apply to Executive Summary"
export default function DraftPreviewPanel({ state, onApply, applyLabel = 'Apply draft' }) {
  const { loading, error, result } = state;

  if (!loading && !error && !result) return null;

  const isLLM      = result?.llm_used       === true;
  const isClassLLM = result?.class_llm_used === true;
  const llmModel   = result?.llm_model      ?? null;
  const badge      = isLLM ? 'LLM-assisted' : 'Packet-based draft';

  const sources = result?.sources_used ?? [];
  const limits  = result?.limitations  ?? [];
  const answer  = result?.answer       ?? '';

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/40 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Drafting support only
        </span>
        {result && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border bg-gray-100 text-gray-600 border-gray-300">
              {badge}
            </span>
            {isClassLLM && llmModel && (
              <span className="text-[10px] text-gray-400">Class LLM · {llmModel}</span>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs text-blue-700">Generating draft…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 font-medium">Error: {error}</p>
      )}

      {/* Result */}
      {result && answer && (
        <div className="space-y-2.5">
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
            {typeof answer === 'string' ? answer : JSON.stringify(answer)}
          </p>

          {sources.length > 0 && (
            <div>
              <p className={`${LABEL_ST} mb-1`}>Sources used</p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white text-blue-700 border border-blue-200 text-[10px] rounded font-medium">
                    {typeof s === 'string' ? s : (s?.section || s?.path || JSON.stringify(s))}
                  </span>
                ))}
              </div>
            </div>
          )}

          {limits.length > 0 && (
            <div>
              <p className={`${LABEL_ST} mb-1`}>Limitations</p>
              <div className="flex flex-wrap gap-1.5">
                {limits.map((l, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 text-[10px] rounded font-medium">
                    {typeof l === 'string' ? l : JSON.stringify(l)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              onClick={() => onApply(answer)}
              className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-700 transition-colors"
            >
              {applyLabel}
            </button>
            <p className="text-[10px] text-gray-400">Generated from the source packet and reviewed locally; no trade is routed or executed.</p>
          </div>
        </div>
      )}
    </div>
  );
}
