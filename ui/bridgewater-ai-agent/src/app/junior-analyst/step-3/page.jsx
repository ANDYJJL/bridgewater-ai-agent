'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import WorkflowProgressBar from '@/components/workflow/WorkflowProgressBar';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';
import StreamingText from '@/components/StreamingText';

function CompanyLogo({ ticker }) {
  const [imgError, setImgError] = useState(false);
  if (!imgError) {
    return (
      <img
        src={`/logos/${ticker.toLowerCase()}.png`}
        alt={`${ticker} logo`}
        className="w-12 h-12 rounded-xl object-contain border border-gray-100 flex-shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
      {ticker.slice(0, 2)}
    </div>
  );
}

// ── Shared style constants ────────────────────────────────────────────────────
const ST = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';

// ── Human-readable label maps ─────────────────────────────────────────────────
const LIMITATION_LABELS = {
  insufficient_historical_training_rows_for_supervised_model: 'Insufficient historical data for model checks',
  insufficient_market_history_for_latest_features: 'Insufficient market history for features',
  missing_relative_return_vs_benchmark_60d: 'Missing 60-day benchmark-relative return',
  'missing_source_field:20d_return': 'Missing 20-day return feature',
  'missing_source_field:60d_volatility': 'Missing 60-day volatility feature',
  'missing_source_field:gross_margin': 'Missing gross margin data',
  'missing_source_field:operating_margin': 'Missing operating margin data',
  'missing_source_field:debt_to_assets': 'Missing debt-to-assets data',
  missing_gross_margin: 'Missing gross margin data',
  missing_revenue_growth: 'Missing revenue growth data',
  sklearn_not_available_in_project_environment: 'ML library not available in environment',
  transparent_fallback_used_due_to_insufficient_training_rows: 'Rule-based fallback used — insufficient data for model checks',
};

function humanizeLimitation(str) {
  return LIMITATION_LABELS[str] ?? str.split('_').join(' ');
}

function humanizeEvidenceRef(ref) {
  if (ref === 'news_evidence') return 'News evidence';
  if (ref === 'filing_evidence') return 'SEC filing evidence';
  if (ref.startsWith('model_prediction:')) {
    const bench = ref.split(':')[1];
    return `Model prediction vs ${bench}`;
  }
  if (ref.startsWith('stock_features:')) {
    const feat = ref.split(':')[1];
    const FEAT_LABELS = {
      revenue_growth: 'Revenue growth feature',
      gross_margin: 'Gross margin feature',
      '20d_return': '20-day return feature',
      '60d_volatility': '60-day volatility feature',
      operating_margin: 'Operating margin feature',
      debt_to_assets: 'Debt-to-assets feature',
      export_control_keyword_count: 'Export control keyword count',
    };
    return FEAT_LABELS[feat] ?? `${feat.replace(/_/g, ' ')} feature`;
  }
  return ref.replace(/_/g, ' ');
}

const INDICATOR_NAME_LABELS = {
  ai_demand_momentum: 'AI Demand Momentum',
  data_center_growth: 'Data Center Growth',
  gross_margin_quality: 'Gross Margin Quality',
  export_control_risk: 'Export Control Risk',
  supply_chain_risk: 'Supply Chain Risk',
  valuation_sensitivity: 'Valuation Sensitivity',
  hyperscaler_capex_dependence: 'Hyperscaler Capex Dependence',
};

function humanizeIndicatorName(raw) {
  return INDICATOR_NAME_LABELS[raw] ??
    raw.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const BAND_LABELS = {
  accumulate: 'Accumulate',
  hold: 'Hold',
  reduce: 'Reduce',
  hold_review: 'Hold — Pending Review',
  avoid: 'Avoid',
};

const BAND_STYLES = {
  accumulate: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hold: 'bg-blue-50 text-blue-700 border-blue-200',
  reduce: 'bg-red-50 text-red-700 border-red-200',
  hold_review: 'bg-amber-50 text-amber-700 border-amber-200',
  avoid: 'bg-red-100 text-red-800 border-red-300',
};

const DIRECTION_STYLES = {
  positive: {
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-400',
    selectedBorder: 'border-emerald-300',
    interpretation: 'Backend evidence currently supports this as an opportunity driver.',
  },
  negative: {
    pill: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-400',
    selectedBorder: 'border-red-300',
    interpretation: 'Backend evidence currently flags this as a risk or review driver.',
  },
  mixed: {
    pill: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-400',
    selectedBorder: 'border-amber-300',
    interpretation: 'Backend evidence is inconclusive or limited for this indicator.',
  },
};

function directionFromScore(score, direction) {
  if (direction && DIRECTION_STYLES[direction]) return direction;
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'mixed';
}

// ── Info popover (grouped bullets) ───────────────────────────────────────────
// Parent section must have `relative` so the popup anchors inside the card.
function InfoPopover({ title, body, groups }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="More information"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M12 8h.01M12 11v5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-6 top-14 z-30 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-3">
          <p className="text-xs font-bold text-gray-800">{title}</p>
          {body && <p className="text-xs text-gray-500 leading-relaxed">{body}</p>}
          {groups?.map((group, gi) => (
            <div key={gi}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{group.label}</p>
              <ul className="space-y-1">
                {group.items.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-1.5 text-[11px] text-gray-600 leading-snug">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chevron icon ──────────────────────────────────────────────────────────────
function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Lightweight disclosure chevron ───────────────────────────────────────────
function DisclosureChevron({ open, className = '' }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${className}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Single expandable indicator card ─────────────────────────────────────────
function IndicatorCard({ ind, ticker, isOpen, onToggle }) {
  const dir = directionFromScore(ind.score, ind.direction);
  const dStyle = DIRECTION_STYLES[dir] ?? DIRECTION_STYLES.mixed;
  const evidenceRefs = Array.isArray(ind.evidence_refs) ? ind.evidence_refs : [];
  const limitsList = Array.isArray(ind.data_limitations) ? ind.data_limitations : (ind.data_limitations ? [ind.data_limitations] : []);
  const confPct = ind.confidence != null ? Math.round(ind.confidence * 100) : null;

  // Per-card disclosure state — starts collapsed; persists across open/close cycles
  const [showEvidence, setShowEvidence] = useState(false);
  const [showLimitations, setShowLimitations] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  // Per-card AI explanation state (API call, lazy)
  const [explainState, setExplainState] = useState('idle'); // idle | loading | done | error
  const [explanation, setExplanation] = useState(null);
  const [explainMeta, setExplainMeta] = useState(null); // { llm_used, fallback_used, class_llm_used, llm_model }
  const [explainCitations, setExplainCitations] = useState([]);
  const [explainError, setExplainError] = useState(null);
  const [freshExplanation, setFreshExplanation] = useState(false); // true only for the newest backend response

  // Reset freshness when the card is closed so re-opening shows full text instantly
  useEffect(() => {
    if (!isOpen) setFreshExplanation(false);
  }, [isOpen]);

  async function handleExplain(e) {
    e.stopPropagation();
    if (explainState === 'loading') return;
    setExplainState('loading');
    setFreshExplanation(false);
    setExplanation(null);
    setExplainCitations([]);
    setExplainError(null);
    try {
      const question = `Explain the ${ind.name} indicator for ${ticker}.`;
      const res = await fetch('/api/backend/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'indicator_explanation', ticker, question, indicator_name: ind.name }),
      });
      let data;
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) {
        throw new Error(data?.error ?? data?.message ?? `HTTP ${res.status}`);
      }
      const text = data.answer ?? data.response ?? null;
      if (!text) {
        throw new Error(data?.error ?? data?.message ?? 'Backend returned no answer.');
      }
      setExplanation(text);
      setExplainMeta({
        llm_used:       data.llm_used       ?? false,
        fallback_used:  data.fallback_used  ?? false,
        class_llm_used: data.class_llm_used ?? false,
        llm_model:      data.llm_model      ?? null,
      });
      const rawCitations = data.citations ?? data.sources_used ?? [];
      setExplainCitations(Array.isArray(rawCitations) ? rawCitations : []);
      setFreshExplanation(true);
      setExplainState('done');
    } catch (err) {
      setExplainError(err?.message ?? 'Unknown error.');
      setExplainState('error');
    }
  }

  return (
    <div
      className={`rounded-lg border bg-white transition-shadow duration-150 ${
        isOpen
          ? `shadow-md ${dStyle.selectedBorder}`
          : 'border-gray-200 hover:shadow-sm hover:border-gray-300'
      }`}
    >
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dStyle.dot}`} />
        <p className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">
          {humanizeIndicatorName(ind.name)}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${dStyle.pill}`}>
            {dir.charAt(0).toUpperCase() + dir.slice(1)}
          </span>
          {ind.weight != null && (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 hidden sm:inline">
              wt {ind.weight.toFixed(2)}
            </span>
          )}
          {confPct != null && (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 hidden sm:inline">
              conf {confPct}%
            </span>
          )}
          <ChevronIcon open={isOpen} />
        </div>
      </button>

      {/* Expanded detail panel — always rendered; animated with max-height + opacity */}
      <div
        className={`overflow-hidden transition-all duration-350 ease-in-out ${
          isOpen ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3.5">

          {/* ── Signal summary row ── */}
          <div className="pt-3.5">
            <p className="text-xs text-gray-400 leading-relaxed">
              Weighted backend signal · reviewed with source evidence
            </p>
          </div>

          {/* ── Disclosure controls ── */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowEvidence((v) => !v); }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all cursor-pointer select-none ${
                showEvidence
                  ? 'text-slate-700 bg-slate-100 border-slate-300 shadow-sm'
                  : 'text-slate-500 bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              Evidence used
              {evidenceRefs.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${showEvidence ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-500'}`}>
                  {evidenceRefs.length}
                </span>
              )}
              <DisclosureChevron open={showEvidence} className={showEvidence ? 'text-slate-600' : 'text-slate-400'} />
            </button>

            {limitsList.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowLimitations((v) => !v); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-600 border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                Data limitations
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">
                  {limitsList.length}
                </span>
                <DisclosureChevron open={showLimitations} className="text-amber-400" />
              </button>
            )}

            {explainState === 'idle' && (
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExplain}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  Explain this signal
                </button>
                <span className="px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded">Uses LLM</span>
              </div>
            )}
            {explainState === 'loading' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-400 italic">
                <div className="w-2.5 h-2.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                Generating explanation…
              </span>
            )}
          </div>

          {/* ── Evidence used ── */}
          {showEvidence && (
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Evidence used</p>
              {evidenceRefs.length === 0 ? (
                <p className="text-xs text-gray-400">No evidence references in this packet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {evidenceRefs.map((ref, i) => (
                    <span key={i} className="inline-block px-2 py-1 bg-white border border-gray-200 text-gray-600 text-[11px] font-medium rounded-md">
                      {humanizeEvidenceRef(ref)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Data limitations ── */}
          {showLimitations && limitsList.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Data Limitations</p>
              <div className="flex flex-wrap gap-1.5">
                {limitsList.map((lim, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-200 text-amber-800 text-[11px] font-medium rounded-md">
                    ⚠ {humanizeLimitation(lim)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Explanation result ── */}
          {explainState === 'error' && (
            <p className="text-xs text-red-600">
              Explanation unavailable.{explainError ? ` ${explainError}` : ''}
            </p>
          )}

          {explainState === 'done' && explanation && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Analyst Explanation</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {explainMeta?.llm_used && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-slate-200 text-slate-500 bg-white">
                      LLM-assisted
                    </span>
                  )}
                  {!explainMeta?.llm_used && explainMeta?.fallback_used && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-slate-200 text-slate-500 bg-white">
                      Packet-based draft
                    </span>
                  )}
                  {explainMeta?.class_llm_used && explainMeta?.llm_model && (
                    <span className="text-[10px] text-slate-400">Class LLM · {explainMeta.llm_model}</span>
                  )}
                </div>
              </div>
              <p className="text-[13px] text-gray-800 leading-[1.65] whitespace-pre-wrap">
                <StreamingText text={explanation} active={freshExplanation} speedMs={90} />
              </p>
              {explainCitations.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowCitations((v) => !v); }}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Sources used ({explainCitations.length})
                    <DisclosureChevron open={showCitations} className="text-slate-400" />
                  </button>
                  {showCitations && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {explainCitations.map((c, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-white text-slate-500 border border-slate-200 text-[10px] rounded font-medium">
                          {typeof c === 'string' ? c : (c?.section || c?.path || JSON.stringify(c))}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                Generated from the source packet; no trade is routed or executed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 1. Scorecard summary + expandable indicator list ─────────────────────────
function ScorecardModule({ sc, ticker }) {
  if (!sc) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <p className={ST}>Indicator Scorecard</p>
        <p className="mt-4 text-sm text-gray-400">No scorecard available in this packet.</p>
      </section>
    );
  }

  const overall = Math.round((sc.aggregate_indicator_score + 1) / 2 * 100);
  const confidence = Math.round(sc.confidence_score * 100);
  const bandCls = BAND_STYLES[sc.recommendation_band] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  const bandLabel = BAND_LABELS[sc.recommendation_band] ?? sc.recommendation_band;

  return (
    <section className="relative bg-white border border-gray-200 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className={ST}>Indicator Scorecard</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium px-2 py-0.5 bg-gray-50 border border-gray-200 rounded">
            Backend scored
          </span>
          <InfoPopover
            title="How this score is calculated"
            body="This is not LLM-generated. It is a deterministic backend score built from market, filing, news, and model-signal inputs."
            groups={[
              {
                label: 'Inputs used',
                items: [
                  'Market features: recent returns, volatility, drawdown, and benchmark-relative performance.',
                  'Filing metrics: revenue growth, margins, leverage, and data completeness.',
                  'News signals: keyword counts for export controls, supply-chain risk, capex, and inflation.',
                  'Model signal: benchmark comparison and model confidence are used as supporting inputs.',
                ],
              },
              {
                label: 'Scoring logic',
                items: [
                  'Each indicator has a configured data field, weight, threshold, and direction.',
                  'Backend converts each raw feature into a score from negative to positive.',
                  'Weighted indicators are combined into one directional score.',
                  'The UI maps that backend score into a 0–100 display.',
                ],
              },
              {
                label: 'Confidence and band',
                items: [
                  'Evidence support combines data completeness, model confidence, and portfolio context.',
                  'The Reduce / Hold / Increase band comes from fixed backend thresholds.',
                  'This is a review signal, not an automated trading decision.',
                ],
              },
              {
                label: 'What to trust',
                items: [
                  'Data-driven: market features, filing metrics, news keyword counts, and benchmark comparison.',
                  'Configured: indicator list, weights, thresholds, and band cutoffs.',
                  'Use this as an explainable screening layer before analyst review.',
                ],
              },
            ]}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Backend Directional Score</p>
          <p className="text-3xl font-black text-gray-900">
            {overall}<span className="text-lg font-bold text-gray-400"> / 100</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">Based on weighted positive and negative indicators</p>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Evidence Confidence</p>
          <p className="text-3xl font-black text-gray-900">
            {confidence}<span className="text-lg font-bold text-gray-400"> / 100</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">Reflects data completeness and evidence support — not prediction accuracy</p>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Backend Band</p>
          <div>
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${bandCls}`}>
              {bandLabel}
            </span>
            <p className="text-[11px] text-gray-400 mt-2 leading-snug">Backend-generated. Subject to PM review before action.</p>
          </div>
        </div>
      </div>

    </section>
  );
}

// ── 2. Opportunity / Risk two-column summary ──────────────────────────────────
function IndicatorDriversRisks({ indicators, ticker }) {
  const [openKeys, setOpenKeys] = useState(new Set());
  function toggle(key) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (!indicators?.length) return null;

  const drivers = indicators.filter((ind) => directionFromScore(ind.score, ind.direction) === 'positive');
  const risks = indicators.filter((ind) => {
    const d = directionFromScore(ind.score, ind.direction);
    return d === 'negative' || d === 'mixed';
  });

  if (drivers.length === 0 && risks.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className={`${ST} mb-4`}>Opportunity Drivers</p>
        {drivers.length === 0 ? (
          <p className="text-sm text-gray-400">No positive indicators in this packet.</p>
        ) : (
          <div className="space-y-2">
            {drivers.map((ind, i) => (
              <IndicatorCard
                key={`driver-${i}`}
                ind={ind}
                ticker={ticker}
                isOpen={openKeys.has(`driver-${i}`)}
                onToggle={() => toggle(`driver-${i}`)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className={`${ST} mb-4`}>Risk / Review Drivers</p>
        {risks.length === 0 ? (
          <p className="text-sm text-gray-400">No negative or mixed indicators in this packet.</p>
        ) : (
          <div className="space-y-2">
            {risks.map((ind, i) => (
              <IndicatorCard
                key={`risk-${i}`}
                ind={ind}
                ticker={ticker}
                isOpen={openKeys.has(`risk-${i}`)}
                onToggle={() => toggle(`risk-${i}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── 3. RAG Evidence ───────────────────────────────────────────────────────────
function RagEvidenceSection({ rag }) {
  const [open, setOpen] = useState(false);
  const recResults = rag?.recommendation_rules?.results ?? [];
  const riskResults = rag?.risk_rules?.results ?? [];
  const allResults = [
    ...recResults.map((r) => ({ ...r, kind: 'recommendation' })),
    ...riskResults.map((r) => ({ ...r, kind: 'risk' })),
  ];
  const count = allResults.length;

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <p className={ST}>Retrieved Backend Knowledge</p>
          <span className="text-xs text-gray-400 font-medium px-2 py-0.5 bg-gray-50 border border-gray-200 rounded flex-shrink-0">
            RAG evidence
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {!open && count > 0 && (
            <span className="text-[11px] text-gray-400 font-medium hidden sm:inline">
              {count} snippet{count !== 1 ? 's' : ''} retrieved
            </span>
          )}
          <ChevronIcon open={open} />
        </div>
      </button>

      {/* Expandable content */}
      <div
        className={`overflow-hidden transition-all duration-350 ease-in-out ${
          open ? 'max-h-[2400px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 pb-5 border-t border-gray-100">
          {count === 0 ? (
            <p className="text-sm text-gray-400 pt-4">No RAG evidence in this packet.</p>
          ) : (
            <div className="space-y-2.5 pt-4">
              {allResults.map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="text-[13px] font-semibold text-gray-800 leading-snug">{item.title}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${item.kind === 'risk' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                        {item.kind === 'risk' ? 'Risk' : 'Rec'}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border bg-gray-100 text-gray-500 border-gray-200">
                        {item.score}
                      </span>
                    </div>
                  </div>
                  {item.excerpt && (
                    <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{item.excerpt}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


// ── Loading skeleton ───────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-40 bg-gray-100 rounded-xl" />
      ))}
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
function Step3Content() {
  const searchParams = useSearchParams();
  const ticker   = searchParams.get('ticker')   || 'NVDA';
  const company  = searchParams.get('company')  || 'NVIDIA Corporation';
  const theme    = searchParams.get('theme')    || 'AI / Semiconductors';
  const question = searchParams.get('question') || '';
  const params   = new URLSearchParams({ ticker, company, theme, question }).toString();

  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();

  const sc  = packet ? (packet.indicator_scorecards?.scorecards ?? []).find((s) => s.ticker === ticker) : null;
  const rag = packet?.rag_evidence ?? null;

  return (
    <>
      <WorkflowNav />
      <WorkflowProgressBar currentStep={3} params={params} />

      <div className="bg-white">
        {isStaticFallback && (
          <div className="max-w-7xl mx-auto px-8 pt-4">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800 font-medium">Showing cached backend packet. Live data unavailable.</p>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-8 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Analysis</h1>
            <p className="text-base text-gray-600 leading-relaxed">
              Backend indicator scorecard and retrieved evidence for {company} ({ticker}).
              Click any indicator to see its signal, evidence, and limitations.
              These findings anchor the valuation models review in Step 4.
            </p>
          </div>
          <div className="w-24 h-1.5 bg-gray-900 rounded-full mb-10 opacity-40" />
        </div>

        <div className="max-w-7xl mx-auto px-8 pb-24 space-y-10">

          {/* Assignment Summary */}
          <section>
            <p className={`${ST} mb-4`}>From Step 1 — Research Assignment</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
              <div className="flex items-center gap-4 mb-6">
                <CompanyLogo ticker={ticker} />
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-tight">{company}</p>
                  <p className="text-sm font-mono font-semibold text-gray-400 mt-0.5">{ticker}</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-5 border-t border-gray-200">
                <div>
                  <p className={`${ST} mb-1`}>Theme / Sector</p>
                  <p className="text-sm text-gray-700 mt-1">{theme}</p>
                </div>
                {question && (
                  <div className="sm:col-span-2">
                    <p className={`${ST} mb-1`}>Research Question</p>
                    <p className="text-sm text-gray-600 leading-relaxed mt-1 line-clamp-3">{question}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* 1. Indicator Scorecard with expandable per-indicator cards */}
              <ScorecardModule sc={sc} ticker={ticker} />

              {/* 2. Opportunity / Risk grouped two-column summary */}
              {sc?.indicators?.length > 0 && (
                <IndicatorDriversRisks indicators={sc.indicators} ticker={ticker} />
              )}

              {/* 3. RAG Evidence */}
              <RagEvidenceSection rag={rag} />

            </>
          )}

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link
              href={`/junior-analyst/step-2?${params}`}
              className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors"
            >
              ← Back to Step 2
            </Link>
            <Link
              href={`/junior-analyst/step-4?${params}`}
              className="flex-1 py-4 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors"
            >
              Continue to Step 4: Valuation Models →
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}

export default function JuniorAnalystStep3() {
  return (
    <Suspense>
      <Step3Content />
    </Suspense>
  );
}
