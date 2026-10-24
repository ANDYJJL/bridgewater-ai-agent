'use client';

import React, { useState, Suspense, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import WorkflowProgressBar from '@/components/workflow/WorkflowProgressBar';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';
import { useWordReveal, ensureBlinkKeyframe } from '@/components/StreamingText';

// ── Style constants ────────────────────────────────────────────────────────────
const CARD_ST  = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';
const LABEL_ST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';
const SRC_ST   = 'text-[10px] text-gray-300 font-medium';

// ── Version token — bump when backend memo format changes ──────────────────────
// Old drafts lacking this version are silently outdated and should be regenerated.
const MEMO_FORMAT_VERSION = 'valuation_memo_v2';

// ── localStorage key ───────────────────────────────────────────────────────────
function memoStorageKey(ticker) {
  return `bridgewater_synthesis_memo_${ticker}`;
}

// ── LoadingSkeleton ────────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 bg-gray-100 rounded-xl" />
      ))}
    </div>
  );
}

// ── 1. LLM Drafting card ───────────────────────────────────────────────────────
function SynthesisDraftCard({ onGenerate, memoState, hasMemo, isDraftStale }) {
  const { loading, error, result } = memoState;
  const isLLM      = result?.llm_used       === true;
  const isFallback = result?.fallback_used  === true;
  const isClassLLM = result?.class_llm_used === true;
  const llmModel   = result?.llm_model ?? null;
  const btnLabel   = loading ? 'Generating memo…' : hasMemo ? 'Regenerate from packet' : 'Generate synthesis memo';

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xl font-extrabold text-slate-950 tracking-tight">Synthesis Memo Generator</p>
          <p className="text-xs text-gray-500 mt-0.5">
            LLM-assisted draft grounded in packet evidence. Human review required before handoff — no trade action is routed.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded">
            Uses LLM
          </span>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200 rounded">
            Junior Analyst draft
          </span>
        </div>
      </div>
      <div className="px-5 py-5 space-y-4">
        {/* Stale-draft warning */}
        {isDraftStale && hasMemo && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-amber-600 font-bold text-xs flex-shrink-0 mt-px">!</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              Saved draft is from an older memo format that may not include the latest entry price reference section.
              Click <strong>Regenerate from packet</strong> to get the current version.
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onGenerate}
            disabled={loading}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {btnLabel}
          </button>
          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-xs text-blue-700">Generating memo…</span>
            </div>
          )}
          {result && !loading && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-gray-50 text-gray-600 border-gray-200">
                {isLLM ? 'LLM-assisted' : isFallback ? 'Packet-based draft' : 'Draft ready'}
              </span>
              {isClassLLM && llmModel && (
                <span className="text-[10px] text-gray-400">Class LLM · {llmModel}</span>
              )}
              <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-amber-50 text-amber-700 border-amber-100">
                Human review required
              </span>
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600 font-medium">Error: {error}</p>}
      </div>
    </section>
  );
}

// ── 4. Section source disclosure ───────────────────────────────────────────────
function SectionSources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1 transition-colors"
      >
        Sources used ({sources.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.map((s, i) => {
            const label  = typeof s === 'string' ? s : (s?.label || s?.path || s?.section || JSON.stringify(s));
            const usedFor = typeof s === 'object' ? s?.used_for : null;
            return (
              <div key={i} className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-[10px]">
                <span className="font-mono text-gray-500">{label}</span>
                {usedFor && <span className="text-gray-400">· {usedFor}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Resize constants ───────────────────────────────────────────────────────────
const MIN_SECTION_H = 160;
const MAX_SECTION_H = 900;

// ── Drag-to-resize handle ──────────────────────────────────────────────────────
function ResizeHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      title="Drag to resize memo section"
      className="w-full h-5 flex items-center justify-center cursor-ns-resize select-none group -mt-1"
    >
      <div className="w-10 h-[3px] rounded-full bg-gray-200 group-hover:bg-gray-400 transition-colors duration-150" />
    </div>
  );
}

// ── 5. Editable memo section ───────────────────────────────────────────────────
function EditableMemoSection({ section, onChange, sourceMap, isStreaming, onStreamComplete }) {
  const { id, title, body, sources: sectionSources } = section;
  const resolvedSources = sectionSources?.length ? sectionSources : (sourceMap?.[id] ?? []);
  const [height, setHeight] = useState(MIN_SECTION_H);

  // Word-by-word reveal when freshly generated
  const { displayedText, isDone } = useWordReveal(body ?? '', isStreaming, 90);

  // Inject blink keyframe and notify parent when this section finishes streaming
  useEffect(() => { if (isStreaming) ensureBlinkKeyframe(); }, [isStreaming]);
  useEffect(() => {
    if (isStreaming && isDone) onStreamComplete?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, isDone]);

  function handleResizeMouseDown(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    function onMove(me) {
      setHeight(Math.min(MAX_SECTION_H, Math.max(MIN_SECTION_H, startH + (me.clientY - startY))));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div className="space-y-2 pb-5 border-b border-gray-100 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-slate-900 tracking-tight">{title}</p>
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-600 border border-blue-100 flex-shrink-0">
          {isStreaming && !isDone ? 'Generating…' : 'Editable'}
        </span>
      </div>

      {/* While streaming: read-only reveal display */}
      {isStreaming && !isDone ? (
        <div
          className="w-full text-sm text-gray-800 leading-relaxed bg-white border border-gray-200 rounded-lg p-3 overflow-y-auto whitespace-pre-wrap font-sans"
          style={{ minHeight: height }}
        >
          {displayedText}
          <span
            className="inline-block w-px h-[1em] bg-gray-500 ml-0.5 align-text-bottom"
            style={{ animation: 'debateBlink 1s step-end infinite' }}
          />
        </div>
      ) : (
        <>
          <textarea
            value={body ?? ''}
            onChange={(e) => onChange(id, e.target.value)}
            style={{ height }}
            className="w-full text-sm text-gray-800 leading-relaxed bg-white border border-gray-200 rounded-lg p-3 resize-none overflow-y-auto focus:outline-none focus:border-gray-400 transition-colors font-sans"
          />
          <ResizeHandle onMouseDown={handleResizeMouseDown} />
        </>
      )}

      <SectionSources sources={resolvedSources} />
    </div>
  );
}

// ── Markdown memo editor (fallback) ───────────────────────────────────────────
function MarkdownMemoEditor({ memoMarkdown, onMarkdownChange }) {
  const [height, setHeight] = useState(280);

  function handleResizeMouseDown(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    function onMove(me) {
      setHeight(Math.min(MAX_SECTION_H, Math.max(MIN_SECTION_H, startH + (me.clientY - startY))));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xl font-extrabold text-slate-950 tracking-tight">Synthesis Memo</p>
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Analyst-editable
        </span>
      </div>
      <div className="px-5 py-5 space-y-2">
        <p className="text-xs text-gray-400">
          LLM-drafted memo. Edit freely before handoff. Changes are local and do not overwrite source evidence.
        </p>
        <textarea
          value={memoMarkdown}
          onChange={(e) => onMarkdownChange(e.target.value)}
          style={{ height }}
          className="w-full text-sm text-gray-800 leading-relaxed bg-white border border-gray-200 rounded-lg p-4 resize-none overflow-y-auto focus:outline-none focus:border-gray-400 transition-colors font-mono"
        />
        <ResizeHandle onMouseDown={handleResizeMouseDown} />
      </div>
    </section>
  );
}

// ── 6. Memo editor (sections or markdown fallback) ─────────────────────────────
function MemoSectionsEditor({ sections, memoMarkdown, sourceMap, onSectionChange, onMarkdownChange, memoSource, isDraftStale, streamingSectionIdx, onSectionStreamComplete }) {
  if (sections && sections.length > 0) {
    const sourceLabel = isDraftStale
      ? { text: 'Outdated draft · regenerate recommended', cls: 'text-amber-600' }
      : memoSource === 'generated'
        ? { text: 'Generated from latest valuation packet', cls: 'text-emerald-600' }
        : memoSource === 'saved'
          ? { text: 'Saved draft · regenerate available', cls: 'text-gray-400' }
          : null;

    return (
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xl font-extrabold text-slate-950 tracking-tight">Memo Sections</p>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {sourceLabel && (
              <span className={`text-[10px] font-medium ${sourceLabel.cls}`}>{sourceLabel.text}</span>
            )}
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Analyst-editable
            </span>
          </div>
        </div>
        <div className="px-5 py-5 space-y-5">
          <p className="text-xs text-gray-400">
            Edit freely before handoff. Changes are local human edits and do not overwrite source evidence.
          </p>
          {sections.map((section, idx) => (
            <EditableMemoSection
              key={section.id ?? section.title}
              section={section}
              onChange={onSectionChange}
              sourceMap={sourceMap}
              isStreaming={streamingSectionIdx === idx}
              onStreamComplete={() => onSectionStreamComplete?.(idx, sections.length)}
            />
          ))}
        </div>
      </section>
    );
  }

  if (memoMarkdown) {
    return <MarkdownMemoEditor memoMarkdown={memoMarkdown} onMarkdownChange={onMarkdownChange} />;
  }

  return null;
}

// ── 7. Human review notes ──────────────────────────────────────────────────────
function HumanReviewNotes({ notes }) {
  if (!notes) return null;
  const items = Array.isArray(notes) ? notes : [notes];
  if (items.length === 0) return null;
  return (
    <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
      <p className="text-sm font-bold text-amber-900 tracking-tight">Human review checklist</p>
      <ul className="space-y-1.5">
        {items.map((note, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
            <span className="text-xs text-amber-800 leading-relaxed">{note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── 8. Evidence traceability (right column) ────────────────────────────────────
function EvidenceTraceability({ packet, ticker }) {
  if (!packet) return null;

  const rds        = packet.raw_data_sources ?? {};
  const filing     = packet.filing_evidence?.[ticker] ?? null;
  const newsStat   = rds.news?.tickers?.[ticker]?.status ?? 'unknown';
  const newsCount  = rds.news?.tickers?.[ticker]?.articles_written ?? 0;
  const rag        = packet.rag_evidence ?? {};
  const ragCount   = (rag.recommendation_rules?.results?.length ?? 0) + (rag.risk_rules?.results?.length ?? 0);
  const sc         = (packet.indicator_scorecards?.scorecards ?? []).find((s) => s.ticker === ticker);
  const stress     = packet.portfolio_stress_test ?? null;
  const threeStmt  = packet.three_statement_models?.models?.[ticker]   ?? null;
  const dcf        = packet.dcf_valuations?.valuations?.[ticker]       ?? null;
  const entryPrice = packet.entry_price_models?.entry_prices?.[ticker] ?? null;

  function Row({ label, ok, note }) {
    return (
      <div className="flex items-start gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${ok ? 'bg-emerald-400' : 'bg-gray-300'}`} />
        <div>
          <span className="text-xs font-semibold text-gray-700">{label}</span>
          {note && <span className="text-xs text-gray-400 ml-1.5">{note}</span>}
        </div>
      </div>
    );
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-2.5">
      <div>
        <p className={CARD_ST}>Evidence Sources</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Read-only. Grounded in backend packet.
        </p>
      </div>
      <div className="space-y-1.5">
        <Row
          label="SEC Filings"
          ok={!!filing?.latest_10k}
          note={filing?.latest_10k ? `10-K ${filing.latest_10k.filing_date}` : 'not collected'}
        />
        <Row
          label="News Evidence"
          ok={newsStat === 'success'}
          note={newsStat === 'success' ? `${newsCount} articles` : newsStat}
        />
        <Row
          label="RAG Policy Snippets"
          ok={ragCount > 0}
          note={ragCount > 0 ? `${ragCount} rules` : 'none'}
        />
        <Row
          label="Indicator Scorecard"
          ok={!!sc}
          note={sc ? `${sc.recommendation_band} band` : 'unavailable'}
        />
        <Row
          label="3-Statement Model"
          ok={!!threeStmt}
          note={threeStmt ? 'available' : 'unavailable'}
        />
        <Row
          label="DCF Valuation"
          ok={!!dcf}
          note={dcf ? 'available' : 'unavailable'}
        />
        <Row
          label="Entry Price Reference"
          ok={!!entryPrice}
          note={entryPrice ? (entryPrice.entry_status?.replace(/_/g, ' ') ?? 'available') : 'unavailable'}
        />
        <Row
          label="Portfolio Stress Test"
          ok={!!stress}
          note={stress ? `${(stress.scenarios ?? []).length} scenarios` : 'unavailable'}
        />
      </div>
      <p className={SRC_ST}>Source: backend packet</p>
    </section>
  );
}

// ── 9. Handoff panel ───────────────────────────────────────────────────────────
function HandoffPanel({ pmRequired, onSave, onReset, readyForReview, onMarkReady, savedAt }) {
  return (
    <section className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <p className={CARD_ST}>Handoff Readiness</p>
        <p className="text-xs text-gray-400 mt-1">
          UI-only. No actual backend handoff or delivery is supported in this demo.
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
          <p className="text-sm text-gray-700 font-medium">Prepared for Senior Analyst Review</p>
        </div>
        {pmRequired && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-700">PM approval required before execution</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
          <p className="text-sm text-gray-500">Trade execution is not supported from Junior Analyst workflow.</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          onClick={onSave}
          className="flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-900 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors"
        >
          Save draft locally
        </button>
        <button
          onClick={onReset}
          className="flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors"
        >
          Clear saved draft
        </button>
        <button
          onClick={onMarkReady}
          disabled={readyForReview}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-colors
            ${readyForReview
              ? 'bg-emerald-100 border border-emerald-300 text-emerald-700 cursor-default'
              : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
        >
          {readyForReview ? '✓ Marked ready for review' : 'Mark ready for review'}
        </button>
      </div>
      {readyForReview && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-xs text-emerald-800 font-medium">
            Memo marked ready for review locally. No trade action routed or executed.
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">
            Share the memo contents manually with your Senior Analyst or Portfolio Manager.
          </p>
        </div>
      )}
      {savedAt && <p className="text-[10px] text-gray-400">Last saved locally: {savedAt}</p>}
      <p className={SRC_ST}>Memo is stored in browser localStorage only. No backend writes are performed.</p>
    </section>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
function Step5Content() {
  const searchParams = useSearchParams();
  const ticker   = searchParams.get('ticker')   || 'NVDA';
  const company  = searchParams.get('company')  || 'NVIDIA Corporation';
  const theme    = searchParams.get('theme')    || 'AI / Semiconductors';
  const question = searchParams.get('question') || '';
  const params   = new URLSearchParams({ ticker, company, theme, question }).toString();

  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();

  const [memoState, setMemoState] = useState({ loading: false, error: null, result: null });
  const [sections, setSections]               = useState(null);
  const [memoMarkdown, setMemoMarkdown]       = useState(null);
  const [sourceMap, setSourceMap]             = useState(null);
  const [readyForReview, setReady]            = useState(false);
  const [savedAt, setSavedAt]                 = useState(null);
  const [memoSource, setMemoSource]           = useState(null); // null | 'generated' | 'saved'
  const [isDraftStale, setIsDraftStale]       = useState(false);
  const [streamingSectionIdx, setStreamingSectionIdx] = useState(null); // null or section index currently streaming

  function handleSectionStreamComplete(idx, total) {
    setStreamingSectionIdx(prev => {
      if (prev !== idx) return prev; // stale callback, ignore
      const next = idx + 1;
      return next < total ? next : null;
    });
  }

  // Restore saved draft on mount — flag as stale when version token is missing or old
  useEffect(() => {
    try {
      const stored = localStorage.getItem(memoStorageKey(ticker));
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const versionOk = parsed.memoFormatVersion === MEMO_FORMAT_VERSION;
      setIsDraftStale(!versionOk);
      if (parsed.sections)       setSections(parsed.sections);
      if (parsed.memoMarkdown)   setMemoMarkdown(parsed.memoMarkdown);
      if (parsed.sourceMap)      setSourceMap(parsed.sourceMap);
      if (parsed.readyForReview) setReady(parsed.readyForReview);
      if (parsed.savedAt)        setSavedAt(new Date(parsed.savedAt).toLocaleTimeString());
      setMemoSource('saved');
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  async function handleGenerate() {
    setMemoState({ loading: true, error: null, result: null });
    try {
      const res = await fetch('/api/backend/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mode: 'synthesis_memo', ticker, company, question, role: 'junior_analyst' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

      setMemoState({ loading: false, error: null, result: data });

      if (data.memo_sections?.length) {
        setSections(
          data.memo_sections.map((s, i) => ({
            id:      s.id      ?? `section_${i}`,
            title:   s.title   ?? `Section ${i + 1}`,
            body:    s.body    ?? '',
            sources: s.sources ?? [],
          }))
        );
        setStreamingSectionIdx(0); // start word-by-word reveal from first section
      } else {
        setSections(null);
      }
      setMemoMarkdown(data.memo_markdown ?? null);
      setSourceMap(data.source_map ?? null);
      setMemoSource('generated');
      setIsDraftStale(false);
    } catch (err) {
      setMemoState({ loading: false, error: err.message, result: null });
    }
  }

  function handleSectionChange(id, newBody) {
    setSections((prev) => prev?.map((s) => (s.id === id ? { ...s, body: newBody } : s)) ?? prev);
  }

  const persistDraft = useCallback((opts = {}) => {
    try {
      localStorage.setItem(
        memoStorageKey(ticker),
        JSON.stringify({
          sections,
          memoMarkdown,
          sourceMap,
          readyForReview: opts.ready ?? readyForReview,
          savedAt: new Date().toISOString(),
          memoFormatVersion: MEMO_FORMAT_VERSION,
        })
      );
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      // ignore
    }
  }, [sections, memoMarkdown, sourceMap, readyForReview, ticker]);

  const handleSave      = useCallback(() => persistDraft(), [persistDraft]);
  const handleMarkReady = useCallback(() => { setReady(true); persistDraft({ ready: true }); }, [persistDraft]);
  const handleReset     = useCallback(() => {
    setSections(null);
    setMemoMarkdown(null);
    setSourceMap(null);
    setMemoState({ loading: false, error: null, result: null });
    setReady(false);
    setSavedAt(null);
    setMemoSource(null);
    setIsDraftStale(false);
    try { localStorage.removeItem(memoStorageKey(ticker)); } catch { /* ignore */ }
  }, [ticker]);

  const pmRequired       = packet?.human_review?.pm_approval_required ?? false;
  const hasMemo          = (sections && sections.length > 0) || !!memoMarkdown;
  const humanReviewNotes = memoState.result?.human_review_notes ?? null;

  return (
    <>
      <WorkflowNav />
      <WorkflowProgressBar currentStep={5} params={params} />

      <div className="bg-white">
        {/* Static fallback notice */}
        {isStaticFallback && (
          <div className="max-w-6xl mx-auto px-8 pt-4">
            <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800 font-medium">
                Showing cached backend packet. Live data unavailable.
              </p>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="max-w-6xl mx-auto px-8 py-10">
          <h1 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">Synthesis Memo</h1>
          <p className="text-base text-gray-600 leading-relaxed max-w-3xl">
            Generate a source-grounded memo from indicator drivers, valuation models, entry price reference, and packet evidence.
          </p>
          {question && (
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 max-w-2xl">
              <p className={`${LABEL_ST} mb-1`}>Research question</p>
              <p className="text-xs text-gray-700 leading-relaxed">{question}</p>
            </div>
          )}
          <div className="mt-6 w-16 h-1 bg-gray-900 rounded-full opacity-40" />
        </div>

        {/* Main content */}
        <div className="max-w-6xl mx-auto px-8 pb-24 space-y-5">
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* 2-col: main left + evidence right */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
                <div className="space-y-5">
                  {/* LLM Drafting card */}
                  <SynthesisDraftCard
                    onGenerate={handleGenerate}
                    memoState={memoState}
                    hasMemo={hasMemo}
                    isDraftStale={isDraftStale}
                  />

                  {/* Editable memo sections */}
                  {hasMemo && (
                    <MemoSectionsEditor
                      sections={sections}
                      memoMarkdown={memoMarkdown}
                      sourceMap={sourceMap}
                      onSectionChange={handleSectionChange}
                      onMarkdownChange={setMemoMarkdown}
                      memoSource={memoSource}
                      isDraftStale={isDraftStale}
                      streamingSectionIdx={streamingSectionIdx}
                      onSectionStreamComplete={handleSectionStreamComplete}
                    />
                  )}

                  {/* Human review checklist */}
                  {humanReviewNotes && <HumanReviewNotes notes={humanReviewNotes} />}

                </div>

                {/* Right column: evidence traceability — sticky on lg+ */}
                <div className="lg:sticky lg:top-48 xl:top-56 lg:self-start transition-all duration-300 ease-out">
                  <EvidenceTraceability packet={packet} ticker={ticker} />
                </div>
              </div>

              {/* Handoff panel — only after a memo exists */}
              {hasMemo && (
                <HandoffPanel
                  pmRequired={pmRequired}
                  onSave={handleSave}
                  onReset={handleReset}
                  readyForReview={readyForReview}
                  onMarkReady={handleMarkReady}
                  savedAt={savedAt}
                />
              )}
            </>
          )}

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <Link
              href={`/junior-analyst/step-4?${params}`}
              className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors"
            >
              ← Back to Step 4: Valuation Models
            </Link>
            <Link
              href="/"
              className="flex-1 py-4 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors"
            >
              Finish Junior Review — Return to Roles
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function JuniorAnalystStep5() {
  return (
    <Suspense>
      <Step5Content />
    </Suspense>
  );
}
