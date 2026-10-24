'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import SeniorProgressBar from '@/components/workflow/SeniorProgressBar';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';

// ── Style constants ───────────────────────────────────────────────────────────
const CARD_ST  = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';
const LABEL_ST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';

// ── Ticker brand theme ────────────────────────────────────────────────────────
const TICKER_THEMES = {
  NVDA: {
    accentText:    'text-emerald-700',
    accentBg:      'bg-emerald-50',
    accentBorder:  'border-emerald-200',
    headerBg:      'bg-emerald-50',
    headerBorder:  'border-emerald-100',
    accentStripe:  'bg-emerald-400',
    pillCls:       'bg-emerald-50 text-emerald-700 border border-emerald-200',
    selectedBtnCls:'bg-emerald-700 text-white border-emerald-700',
  },
  KO: {
    accentText:    'text-red-700',
    accentBg:      'bg-red-50',
    accentBorder:  'border-red-200',
    headerBg:      'bg-red-50',
    headerBorder:  'border-red-100',
    accentStripe:  'bg-red-400',
    pillCls:       'bg-red-50 text-red-700 border border-red-200',
    selectedBtnCls:'bg-red-700 text-white border-red-700',
  },
};
const DEFAULT_THEME = {
  accentText:    'text-slate-600',
  accentBg:      'bg-slate-50',
  accentBorder:  'border-slate-200',
  headerBg:      'bg-slate-50',
  headerBorder:  'border-slate-200',
  accentStripe:  'bg-slate-400',
  pillCls:       'bg-slate-100 text-slate-700 border border-slate-200',
  selectedBtnCls:'bg-slate-800 text-white border-slate-800',
};
function getTickerTheme(ticker) { return TICKER_THEMES[ticker] ?? DEFAULT_THEME; }

// ── Scenario labels ───────────────────────────────────────────────────────────
const SCENARIO_LABELS = {
  ai_capex_pullback:              'AI capex pullback',
  export_control_tightening:      'Export control tightening',
  rates_higher_for_longer:        'Rates higher for longer',
  recession_consumer_slowdown:    'Recession / consumer slowdown',
  valuation_multiple_compression: 'Valuation multiple compression',
};

// ── Senior Stance options (mirrors trade-proposal) ────────────────────────────
const SENIOR_STANCES = [
  { value: 'no_action',            label: 'No action' },
  { value: 'review_only',          label: 'Review only' },
  { value: 'watchlist',            label: 'Watchlist' },
  { value: 'accumulate_candidate', label: 'Accumulate candidate' },
  { value: 'reduce_exposure',      label: 'Reduce exposure' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function humanizeLabel(str) {
  if (!str) return '—';
  return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function humanizeScenario(s) { return SCENARIO_LABELS[s] ?? humanizeLabel(s); }
function stanceLabel(v) {
  return SENIOR_STANCES.find(s => s.value === v)?.label ?? humanizeLabel(v);
}

function handoffKey(ticker)    { return `bridgewater_senior_risk_handoff_${ticker}`; }
function memoKey(ticker)       { return `bridgewater_synthesis_memo_${ticker}`; }
function proposalKey(ticker)   { return `bridgewater_senior_action_proposal_${ticker}`; }
function valReviewKey(ticker)  { return `bridgewater_senior_valuation_review_${ticker}`; }

// ── Valuation normalizers ─────────────────────────────────────────────────────
function normalizePctToInt(v) {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return Math.abs(n) <= 1 ? Math.round(n * 100) : Math.round(n);
}
// Returns a clean percentage string like "12.5" (no % sign — caller appends it)
function normalizePctDisplay(v) {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return parseFloat(pct.toFixed(2)).toString();
}
function normalizeEntryPrice(entry) {
  if (!entry) return {};
  return {
    fairValue:   entry.implied_fair_value_per_share ?? entry.fair_value_per_share ?? entry.fairValuePerShare ?? null,
    mos:         entry.margin_of_safety ?? entry.marginOfSafety ?? null,
    entryPrice:  entry.entry_price ?? entry.entryPrice ?? entry.entry_price_reference ?? null,
    equityValue: entry.dcf_equity_value ?? entry.equity_value ?? entry.equityValue ?? null,
    isSimulated: !!(entry.shares_outstanding_is_simulated ?? entry.share_count_is_simulated ?? entry.isSimulatedShareCount),
    shareSource: entry.shares_outstanding_source ?? entry.share_count_source ?? null,
  };
}

// ── Company Logo ──────────────────────────────────────────────────────────────
function CompanyLogo({ ticker, size = 'md' }) {
  const [imgError, setImgError] = useState(false);
  const sizeMap = { sm: 'w-7 h-7 text-[10px]', md: 'w-10 h-10 text-xs', lg: 'w-14 h-14 text-sm' };
  const cls = sizeMap[size] ?? sizeMap.md;
  if (!imgError) {
    return (
      <img
        src={`/logos/${ticker.toLowerCase()}.png`}
        alt={`${ticker} logo`}
        className={`${cls} object-contain rounded`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${cls} flex-shrink-0 bg-gray-100 border border-gray-200 rounded flex items-center justify-center font-black text-gray-600`}>
      {ticker.slice(0, 2)}
    </div>
  );
}

function StaticFallbackBanner() {
  return (
    <div className="max-w-4xl mx-auto px-8 pt-4">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
        <span className="text-amber-600 text-xs font-bold">!</span>
        <p className="text-xs text-amber-800 font-medium">Showing cached backend packet. Live data unavailable.</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-8 pb-24 space-y-5 animate-pulse">
      {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}
    </div>
  );
}

// ── Build default summary from proposal + packet (no backend rec fields) ──────
function buildDefaultSummary(proposal, step1, rec, stress, ticker) {
  const pmRequired     = rec?.requires_pm_review ? 'Required' : 'Not required';
  const proposedStance = proposal?.stance ? stanceLabel(proposal.stance) : 'Review only';
  const timeHorizon    = proposal?.timeHorizon ?? null;
  const riskDrivers    = (stress?.main_risk_drivers ?? [])
    .filter(d => d.startsWith(`${ticker}:`))
    .map(d => humanizeScenario(d.split(':')[1]))
    .join(', ') || 'None identified';
  const stressAction   = stress?.risk_action ? humanizeLabel(stress.risk_action) : '—';

  const lines = [
    `PM review: ${pmRequired}`,
    `Senior proposed stance: ${proposedStance}`,
    timeHorizon ? `Time horizon: ${timeHorizon}` : null,
    `Key risk drivers: ${riskDrivers}`,
    `Stress test review action: ${stressAction}`,
    'Valuation review: DCF sensitivity to discount rate and terminal growth, entry price reference is illustrative.',
    'Export control risk and supply chain risk flagged for Risk Team review.',
  ].filter(Boolean);

  if (proposal?.riskLimitNote) {
    lines.push(`Risk limit note: ${proposal.riskLimitNote}`);
  }
  if (proposal?.reviewTrigger) {
    lines.push(`Review trigger: ${proposal.reviewTrigger}`);
  }

  if (step1?.discountRate != null || step1?.terminalGrowth != null) {
    lines.push(`Senior-adjusted assumptions: WACC ${step1?.discountRate ?? '—'}%, TGR ${step1?.terminalGrowth ?? '—'}%`);
  }

  return lines.join('\n');
}

function buildDefaultAssumptions(thesis) {
  if (!thesis?.key_assumptions?.length) return '';
  return thesis.key_assumptions.map((a, i) => `${i + 1}. ${a}`).join('\n');
}

// ── Local draft builder (no backend call) ─────────────────────────────────────
function safeParsePositive(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return (!isNaN(n) && n > 0) ? n : null;
}

function buildLocalHandoffDraft(ticker, packet, proposal, step1) {
  const dcfData   = packet?.dcf_valuations?.valuations?.[ticker] ?? null;
  const entryData = packet?.entry_price_models?.entry_prices?.[ticker] ?? null;
  const stress    = packet?.portfolio_stress_test ?? {};
  const norm      = normalizeEntryPrice(entryData);

  // DCF fair value: proposal field first (user-confirmed in Step 2), then packet
  const fairVal = safeParsePositive(proposal?.dcfFairValueEstimate)
    ?? safeParsePositive(norm.fairValue)
    ?? safeParsePositive(dcfData?.implied_share_price)
    ?? null;

  // Margin of safety: proposal field first, then packet
  const resolvedMoS = normalizePctToInt(
    proposal?.marginOfSafety ?? norm.mos
  );

  // Entry price: priority order —
  //   1. referenceEntry (user-typed/confirmed in Step 2 form — most direct)
  //   2. seniorAdjustedEntry (computed from step1 MoS, saved alongside proposal)
  //   3. packet entry price model
  //   4. computed from DCF fair value × (1 - MoS)
  const entryRef = safeParsePositive(proposal?.referenceEntry)
    ?? safeParsePositive(proposal?.seniorAdjustedEntry)
    ?? (norm.entryPrice != null ? safeParsePositive(norm.entryPrice) : null)
    ?? (fairVal != null && resolvedMoS != null ? fairVal * (1 - resolvedMoS / 100) : null);

  const packetMoS = resolvedMoS;

  const riskDrivers = (stress?.main_risk_drivers ?? [])
    .filter(d => d.startsWith(`${ticker}:`))
    .map(d => humanizeScenario(d.split(':')[1]));

  const illustrativeNotional = proposal?.illustrativeNotional != null
    ? parseFloat(proposal.illustrativeNotional) : null;
  const proposedShares = proposal?.proposedShares ?? null;

  const lines = [
    `Senior Proposed Stance: ${proposal?.stance ? stanceLabel(proposal.stance) : 'Review only'}`,
    proposal?.timeHorizon ? `Time Horizon: ${proposal.timeHorizon}` : null,
    '',
    '--- Valuation Basis ---',
    `DCF fair value estimate: ${fairVal != null ? `$${Number(fairVal).toFixed(2)} (illustrative)` : 'Not available'}`,
    `Entry price reference: ${entryRef != null ? `$${Number(entryRef).toFixed(2)} (illustrative)` : 'Not available'}`,
    `Margin of safety: ${packetMoS != null ? `${packetMoS}%` : 'Not available'}`,
    norm.isSimulated || norm.shareSource === 'simulated'
      ? 'Note: Share count is simulated — entry reference is illustrative only.'
      : null,
    proposedShares ? `Proposed illustrative shares: ${Number(proposedShares).toLocaleString()}` : null,
    illustrativeNotional != null ? `Illustrative notional: $${illustrativeNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })} (not a commitment)` : null,
    '',
  ];

  if (step1 && (step1.discountRate != null || step1.terminalGrowth != null)) {
    lines.push('--- Senior Assumption Adjustments (Step 1) ---');
    if (step1.discountRate   != null) lines.push(`WACC: ${normalizePctDisplay(step1.discountRate)}%`);
    if (step1.terminalGrowth != null) lines.push(`Terminal growth rate: ${normalizePctDisplay(step1.terminalGrowth)}%`);
    if (step1.marginOfSafety != null) lines.push(`Margin of safety: ${normalizePctToInt(step1.marginOfSafety)}%`);
    if (step1.revenueScenario)        lines.push(`Revenue scenario: ${step1.revenueScenario}`);
    if (step1.fcfHaircut && step1.fcfHaircut !== '0%') lines.push(`FCF haircut: ${step1.fcfHaircut}`);
    lines.push('');
  }

  if (riskDrivers.length > 0) {
    lines.push('--- Key Risks Flagged ---');
    riskDrivers.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }

  if (proposal?.keyRiskControls) {
    lines.push('--- Key Risk Controls ---');
    lines.push(proposal.keyRiskControls);
    lines.push('');
  }

  if (proposal?.reviewTrigger) {
    lines.push('--- Review Trigger ---');
    lines.push(proposal.reviewTrigger);
    lines.push('');
  }

  if (proposal?.riskLimitNote) {
    lines.push('--- Risk Limit Note ---');
    lines.push(proposal.riskLimitNote);
    lines.push('');
  }

  lines.push('--- Escalation Gates ---');
  lines.push('- PM approval required before any action');
  lines.push('- Risk Team review required');
  if (norm.isSimulated || norm.shareSource === 'simulated') lines.push('- Simulated share count limitation noted');
  lines.push('- DCF sensitivity review pending');
  lines.push('- Human review required');

  if (proposal?.rationale) {
    lines.push('');
    lines.push('--- Senior Rationale (Step 2) ---');
    lines.push(proposal.rationale);
  }

  return lines.filter(l => l !== null).join('\n');
}

// ── Source checklist ──────────────────────────────────────────────────────────
function SourceChecklist({ ticker, packet, hasMemo, hasProposal }) {
  const rec          = packet?.recommendations?.[ticker] ?? {};
  const stress       = packet?.portfolio_stress_test ?? {};
  const pmReq        = rec?.requires_pm_review ?? false;
  const stressAvail  = !!(stress?.scenarios?.length);
  const hasValuation = !!(packet?.dcf_valuations || packet?.three_statement_models);

  const items = [
    { label: 'Junior memo',                      ok: hasMemo },
    { label: 'Action Proposal (Step 2)',          ok: hasProposal },
    { label: 'Valuation package (DCF / 3-stmt)', ok: hasValuation },
    { label: 'Stress test',                      ok: stressAvail },
    { label: 'PM approval required',             ok: pmReq, warn: pmReq },
  ];

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <p className={CARD_ST}>Source Summary</p>
      <div className="space-y-1.5">
        {items.map(({ label, ok, warn }) => (
          <div key={label} className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? (warn ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-gray-300'}`} />
            <span className={`text-sm ${ok ? 'text-gray-800' : 'text-gray-400'}`}>{label}</span>
            {!ok  && <span className="text-[10px] text-gray-400">unavailable</span>}
            {warn && ok && <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">required</span>}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400">Read-only. Reflects current backend packet and localStorage state.</p>
    </section>
  );
}

// ── Editable section ──────────────────────────────────────────────────────────
function EditableSection({ title, badge, value, onChange, placeholder, rows = 5 }) {
  return (
    <section className="bg-white border border-amber-200 rounded-xl p-6 space-y-3 transition-all duration-200 hover:border-amber-300 hover:shadow-sm">
      <div className="flex items-center gap-2">
        <p className={CARD_ST}>{title}</p>
        {badge && (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border bg-amber-100 text-amber-700 border-amber-200">
            {badge}
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full text-sm text-gray-800 leading-relaxed border border-amber-200 rounded-lg p-4 resize-none focus:outline-none focus:border-amber-400 focus:bg-white bg-amber-50 transition-colors"
      />
    </section>
  );
}

// ── Main handoff form ─────────────────────────────────────────────────────────
function RiskHandoffForm({ ticker, packet, theme }) {
  const rec    = packet?.recommendations?.[ticker] ?? {};
  const stress = packet?.portfolio_stress_test ?? {};
  const theses = packet?.company_theses ?? {};
  const thesis = theses[ticker] ?? {};

  const dcfData   = packet?.dcf_valuations?.valuations?.[ticker] ?? null;
  const entryData = packet?.entry_price_models?.entry_prices?.[ticker] ?? null;
  const norm      = normalizeEntryPrice(entryData);
  const packetFairVal  = norm.fairValue ?? dcfData?.implied_share_price ?? null;
  const packetMoSRaw   = norm.mos;
  const packetMoSInt   = normalizePctToInt(packetMoSRaw);
  const packetEntryRef = norm.entryPrice != null
    ? parseFloat(norm.entryPrice)
    : (packetFairVal != null && packetMoSInt != null ? packetFairVal * (1 - packetMoSInt / 100) : null);
  const packetIsSimulated = norm.isSimulated || norm.shareSource === 'simulated';

  const [summary,           setSummary]           = useState('');
  const [assumptions,       setAssumptions]       = useState('');
  const [seniorNotes,       setSeniorNotes]       = useState('');
  const [reviewerQuestions, setReviewerQuestions] = useState('');
  const [showReviewerQ,     setShowReviewerQ]     = useState(false);
  const [readyState,        setReadyState]        = useState(false);
  const [savedAt,           setSavedAt]           = useState(null);
  const [readyMarkedAt,     setReadyMarkedAt]     = useState(null);
  const [loaded,            setLoaded]            = useState(false);
  const [hasMemo,           setHasMemo]           = useState(false);
  const [proposal,          setProposal]          = useState(null);
  const [step1,             setStep1]             = useState(null);
  const [draftGeneratedAt,  setDraftGeneratedAt]  = useState(null);
  const [isDrafting,        setIsDrafting]        = useState(false);

  function buildDefaults(proposalData, step1Data) {
    return {
      summary:     buildDefaultSummary(proposalData, step1Data, rec, stress, ticker),
      assumptions: buildDefaultAssumptions(thesis),
    };
  }

  useEffect(() => {
    let proposalData = null;
    let step1Data    = null;

    try {
      const raw = localStorage.getItem(proposalKey(ticker));
      if (raw) { proposalData = JSON.parse(raw); setProposal(proposalData); }
    } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem(valReviewKey(ticker));
      if (raw) { step1Data = JSON.parse(raw); setStep1(step1Data); }
    } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem(handoffKey(ticker));
      if (raw) {
        const p = JSON.parse(raw);
        setSummary(p.summary ?? '');
        setAssumptions(p.assumptions ?? '');
        setSeniorNotes(p.seniorNotes ?? '');
        const oldQs = [p.questionsRisk, p.questionsPM].filter(Boolean).join('\n\n');
        setReviewerQuestions(p.reviewerQuestions ?? oldQs);
        setReadyState(p.readyState ?? false);
        setSavedAt(p.savedAt ?? null);
        setReadyMarkedAt(p.readyMarkedAt ?? null);
      } else {
        const defaults = buildDefaults(proposalData, step1Data);
        setSummary(defaults.summary);
        setAssumptions(defaults.assumptions);
      }
    } catch { /* ignore */ }

    try {
      const memoRaw    = localStorage.getItem(memoKey(ticker));
      const parsedMemo = memoRaw ? JSON.parse(memoRaw) : null;
      setHasMemo(!!(parsedMemo?.memo || (Array.isArray(parsedMemo?.sections) && parsedMemo.sections.length > 0)));
    } catch { /* ignore */ }

    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  function persist(overrides = {}) {
    const payload = {
      summary, assumptions, seniorNotes, reviewerQuestions,
      readyState, savedAt: new Date().toISOString(), readyMarkedAt,
      ...overrides,
    };
    try {
      localStorage.setItem(handoffKey(ticker), JSON.stringify(payload));
      setSavedAt(payload.savedAt);
    } catch { /* ignore */ }
    return payload;
  }

  function handleSave() { persist(); }

  function handleReset() {
    const defaults = buildDefaults(proposal, step1);
    setSummary(defaults.summary);
    setAssumptions(defaults.assumptions);
    setSeniorNotes('');
    setReviewerQuestions('');
    setReadyState(false);
    setReadyMarkedAt(null);
    setDraftGeneratedAt(null);
    persist({ ...defaults, seniorNotes: '', reviewerQuestions: '', readyState: false, readyMarkedAt: null });
  }

  function handleMarkReady() {
    const ts = new Date().toISOString();
    setReadyState(true);
    setReadyMarkedAt(ts);
    persist({ readyState: true, readyMarkedAt: ts });
  }

  function handleDraftFromProposal() {
    setIsDrafting(true);

    // Re-read latest localStorage — avoids stale closure from initial mount
    let latestProposal = null;
    let latestStep1 = null;
    try {
      const raw = localStorage.getItem(proposalKey(ticker));
      if (raw) { latestProposal = JSON.parse(raw); setProposal(latestProposal); }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(valReviewKey(ticker));
      if (raw) { latestStep1 = JSON.parse(raw); setStep1(latestStep1); }
    } catch { /* ignore */ }

    const draft = buildLocalHandoffDraft(ticker, packet, latestProposal, latestStep1);
    const thesis = (packet?.company_theses ?? {})[ticker] ?? {};
    const newAssumptions = buildDefaultAssumptions(thesis);

    const ts = new Date().toISOString();
    setSummary(draft);
    setAssumptions(newAssumptions);
    setDraftGeneratedAt(ts);

    // Persist overwrite — keep user-typed senior notes and reviewer questions
    const overwritePayload = {
      summary: draft,
      assumptions: newAssumptions,
      seniorNotes,
      reviewerQuestions,
      readyState,
      readyMarkedAt,
      savedAt: ts,
    };
    try {
      localStorage.setItem(handoffKey(ticker), JSON.stringify(overwritePayload));
      setSavedAt(ts);
    } catch { /* ignore */ }

    setTimeout(() => setIsDrafting(false), 500);
  }

  if (!loaded) return null;

  const pmRequired = rec?.requires_pm_review ?? false;

  return (
    <div className="space-y-5">

      {/* Senior Proposal Summary (read-only) */}
      {proposal && (
        <section className={`bg-white border ${theme.accentBorder} rounded-xl overflow-hidden`}>
          <div className={`${theme.headerBg} border-b ${theme.headerBorder} px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap`}>
            <div>
              <p className={CARD_ST}>Senior Action Proposal (Step 2)</p>
              <p className={`text-[10px] ${theme.accentText} font-medium mt-0.5`}>Imported from local draft</p>
            </div>
            <span className="text-[10px] text-gray-400 flex-shrink-0">Read-only</span>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className={`${LABEL_ST} mb-0.5`}>Proposed Stance</p>
                <p className="text-base font-bold text-gray-900">
                  {proposal.stance ? stanceLabel(proposal.stance) : '—'}
                </p>
              </div>
              <div>
                <p className={`${LABEL_ST} mb-0.5`}>Time Horizon</p>
                <p className="text-base font-bold text-gray-900">{proposal.timeHorizon ?? '—'}</p>
              </div>
              <div>
                <p className={`${LABEL_ST} mb-0.5`}>PM Approval</p>
                <p className={`text-base font-bold ${pmRequired ? 'text-amber-700' : 'text-gray-900'}`}>
                  {pmRequired ? 'Required' : 'Not required'}
                </p>
              </div>
              {safeParsePositive(proposal.referenceEntry) != null && (
                <div>
                  <p className={`${LABEL_ST} mb-0.5`}>Reference Entry</p>
                  <p className="text-base font-bold text-gray-900">${safeParsePositive(proposal.referenceEntry).toFixed(2)}</p>
                </div>
              )}
              {proposal.riskLimitNote && (
                <div className="sm:col-span-2">
                  <p className={`${LABEL_ST} mb-0.5`}>Risk Limit Note</p>
                  <p className="text-sm text-gray-700">{proposal.riskLimitNote}</p>
                </div>
              )}
            </div>
            {proposal.rationale && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className={`${LABEL_ST} mb-1`}>Senior Rationale</p>
                <p className="text-xs text-gray-700 leading-relaxed">{proposal.rationale}</p>
              </div>
            )}
            {proposal.savedAt && (
              <p className="text-[10px] text-gray-300 mt-2">Saved {new Date(proposal.savedAt).toLocaleString()}</p>
            )}
          </div>
        </section>
      )}

      {/* Valuation Basis (read-only) */}
      {(() => {
        // Proposal-first resolution
        const propFairVal  = safeParsePositive(proposal?.dcfFairValueEstimate);
        // referenceEntry (user-typed) takes priority over seniorAdjustedEntry (computed)
        const propEntry    = safeParsePositive(proposal?.referenceEntry)
          ?? safeParsePositive(proposal?.seniorAdjustedEntry);
        const propMoS      = proposal?.marginOfSafety != null ? normalizePctToInt(proposal.marginOfSafety) : null;
        const propSimulated= !!(proposal?.simulatedShares);

        const fairVal    = propFairVal  ?? packetFairVal;
        const entryRef   = propEntry    ?? (packetEntryRef != null ? packetEntryRef : null);
        const mos        = propMoS      ?? packetMoSInt;
        const isSimulated= propSimulated || packetIsSimulated;

        const hasAnyVal  = fairVal != null || entryRef != null || mos != null;

        // Source label
        const fromDraft  = propFairVal != null || propEntry != null || propMoS != null;
        const fromPacket = packetFairVal != null || packetEntryRef != null || packetMoSInt != null;
        const sourceLabel = fromDraft && fromPacket
          ? 'Senior Step 2 local proposal + packet valuation models'
          : fromDraft ? 'Senior Step 2 local proposal'
          : 'dcf_valuations, entry_price_models';

        return (
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className={CARD_ST}>Valuation Basis</p>
              <span className="text-[10px] text-gray-400">Read-only · illustrative</span>
            </div>

            {!hasAnyVal ? (
              <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800 font-medium">
                  Valuation package not found. Return to Senior Step 2 or regenerate the Junior valuation packet.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className={`${LABEL_ST} mb-0.5`}>DCF Fair Value Est.</p>
                    <p className="text-base font-bold text-gray-900">
                      {fairVal != null ? `$${Number(fairVal).toFixed(2)}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className={`${LABEL_ST} mb-0.5`}>Entry Reference</p>
                    <p className="text-base font-bold text-gray-900">
                      {entryRef != null ? `$${Number(entryRef).toFixed(2)}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className={`${LABEL_ST} mb-0.5`}>Margin of Safety</p>
                    <p className="text-base font-bold text-gray-900">
                      {mos != null ? `${mos}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className={`${LABEL_ST} mb-0.5`}>Simulated Shares</p>
                    <p className={`text-base font-bold ${isSimulated ? 'text-amber-700' : 'text-gray-500'}`}>
                      {isSimulated ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
                {isSimulated && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
                    Entry reference is illustrative because share count is simulated.
                  </p>
                )}
                {step1 && (step1.discountRate != null || step1.terminalGrowth != null || step1.marginOfSafety != null) && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className={`${LABEL_ST} mb-1.5`}>Senior-adjusted assumptions (Step 1)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step1.discountRate   != null && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">WACC {normalizePctDisplay(step1.discountRate)}%</span>}
                      {step1.terminalGrowth != null && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">TGR {normalizePctDisplay(step1.terminalGrowth)}%</span>}
                      {step1.marginOfSafety != null && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">MoS {normalizePctToInt(step1.marginOfSafety)}%</span>}
                      {step1.revenueScenario && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">Revenue: {step1.revenueScenario}</span>}
                      {step1.fcfHaircut && step1.fcfHaircut !== '0%' && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">FCF haircut: {step1.fcfHaircut}</span>}
                    </div>
                  </div>
                )}
              </>
            )}
            <p className="text-[9px] text-gray-300">Source: {sourceLabel}</p>
          </section>
        );
      })()}


      {/* Draft from proposal */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className={CARD_ST}>Draft Handoff from Proposal</p>
            <p className="text-xs text-gray-400 mt-1">
              Assemble a local handoff draft from the Senior Action Proposal and valuation data. No backend call.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDraftFromProposal}
            disabled={isDrafting}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors min-w-[160px] text-center ${
              isDrafting
                ? 'bg-gray-400 text-white cursor-default'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            {isDrafting ? 'Drafting…' : 'Draft from proposal'}
          </button>
        </div>
        {draftGeneratedAt && (
          <p className="text-[10px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5 mt-3">
            Draft regenerated from latest Step 2 proposal at {new Date(draftGeneratedAt).toLocaleTimeString()}. Review and edit below before saving.
          </p>
        )}
        {!proposal && !draftGeneratedAt && (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-1.5 mt-3">
            No saved Action Proposal found. Complete Step 2 first for the best handoff draft.
          </p>
        )}
      </section>

      {/* A. Risk Team Summary */}
      <EditableSection
        title="Risk Team Summary"
        badge="Senior-authored"
        value={summary}
        onChange={setSummary}
        placeholder="Summarize the senior proposed stance, valuation basis, key risk drivers, DCF sensitivity, PM review requirement, and escalation rationale..."
        rows={6}
      />

      {/* B. Key Assumptions to Challenge */}
      <EditableSection
        title="Key Assumptions to Challenge"
        badge="Senior-authored"
        value={assumptions}
        onChange={setAssumptions}
        placeholder="List key thesis assumptions that warrant challenge or stress testing by the Risk Team..."
        rows={5}
      />

      {/* C. Senior Notes */}
      <EditableSection
        title="Senior Analyst Notes"
        badge="Senior judgment"
        value={seniorNotes}
        onChange={setSeniorNotes}
        placeholder="Add your own judgment, concerns, or context not captured elsewhere..."
        rows={4}
      />

      {/* D. Optional reviewer questions (collapsible) */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-200 hover:border-gray-300 hover:shadow-sm">
        <button
          type="button"
          onClick={() => setShowReviewerQ(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <p className={CARD_ST}>Optional Reviewer Questions</p>
            <p className="text-xs text-gray-400 mt-0.5">Questions for Risk Team or PM — optional</p>
          </div>
          <span className="text-gray-400 text-sm font-bold">{showReviewerQ ? '▲' : '▼'}</span>
        </button>
        {showReviewerQ && (
          <div className="px-6 pb-5">
            <textarea
              value={reviewerQuestions}
              onChange={e => setReviewerQuestions(e.target.value)}
              placeholder="Add questions for the Risk Team or Portfolio Manager..."
              rows={4}
              className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg p-4 resize-none focus:outline-none focus:border-gray-400 bg-gray-50 focus:bg-white transition-colors"
            />
          </div>
        )}
      </section>

      {/* Source checklist */}
      <SourceChecklist ticker={ticker} packet={packet} hasMemo={hasMemo} hasProposal={!!proposal} />

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-sm hover:bg-gray-800 transition-colors"
        >
          Save Handoff Locally
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="py-3 px-6 bg-white text-gray-700 border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-50 transition-colors"
        >
          Reset from Defaults
        </button>
        <button
          type="button"
          onClick={handleMarkReady}
          disabled={readyState}
          className={`py-3 px-6 rounded-lg font-bold text-sm transition-colors border ${
            readyState
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {readyState ? '✓ Marked Ready for Risk Team' : 'Mark Ready for Risk Team'}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
        <p className="text-xs text-gray-600 font-semibold">Saved locally for demo purposes.</p>
        <p className="text-xs text-gray-500">
          Backend routing is not implemented. &ldquo;Mark ready&rdquo; is a local UI state only and does not send anything to the Risk Team.
        </p>
        {readyMarkedAt && (
          <p className="text-[10px] text-gray-400">Marked ready: {new Date(readyMarkedAt).toLocaleString()}</p>
        )}
      </div>

      {savedAt && (
        <p className="text-[10px] text-gray-300">Last saved {new Date(savedAt).toLocaleString()}</p>
      )}
    </div>
  );
}

// ── Page content ──────────────────────────────────────────────────────────────
function RiskHandoffContent() {
  const searchParams = useSearchParams();
  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();

  const tickers = packet ? Object.keys(packet.recommendations || {}) : ['NVDA', 'KO'];
  const [selectedTicker, setSelectedTicker] = useState(
    searchParams.get('ticker') || 'NVDA'
  );

  const params      = new URLSearchParams({ ticker: selectedTicker }).toString();
  const theses      = packet?.company_theses ?? {};
  const companyName = (theses[selectedTicker] ?? {}).company_name ?? selectedTicker;
  const theme       = getTickerTheme(selectedTicker);

  if (isLoading) {
    return (
      <>
        <WorkflowNav role="Senior Analyst" subtitle="Review, challenge, and prepare escalation." />
        <SeniorProgressBar currentStep={3} />
        <LoadingSkeleton />
      </>
    );
  }

  return (
    <>
      <WorkflowNav role="Senior Analyst" subtitle="Review, challenge, and prepare escalation." />
      <SeniorProgressBar currentStep={3} params={params} />

      {isStaticFallback && <StaticFallbackBanner />}

      {/* Page header */}
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-4">
          <CompanyLogo ticker={selectedTicker} size="lg" />
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Risk Handoff Package</h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">
              {companyName} · {selectedTicker}
            </p>
          </div>
        </div>
        <p className="text-base text-gray-600 leading-relaxed max-w-2xl">
          Package the Senior proposal, valuation assumptions, and key risks for Risk Team review.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Senior-authored · local only · no backend routing
        </p>
        <div className={`w-20 h-1.5 ${theme.accentStripe} rounded-full mt-6 opacity-70`} />
      </div>

      {/* Ticker selector */}
      <div className="max-w-4xl mx-auto px-8 mb-8">
        <div className="flex items-center gap-3">
          <p className={`${CARD_ST} mr-2`}>Select Ticker</p>
          {tickers.map(t => {
            const tTheme = getTickerTheme(t);
            return (
              <button
                key={t}
                onClick={() => setSelectedTicker(t)}
                className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                  selectedTicker === t
                    ? tTheme.selectedBtnCls
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 pb-24 space-y-6">
        <RiskHandoffForm ticker={selectedTicker} packet={packet} theme={theme} />

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href={`/senior-analyst/trade-proposal?${params}`}
            className="py-4 px-6 bg-gray-100 text-gray-900 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm"
          >
            ← Action Proposal
          </Link>
          <Link
            href="/"
            className="flex-1 py-4 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm"
          >
            Return to Role Dashboard
          </Link>
          <Link
            href={`/risk-team?${params}`}
            className="py-4 px-6 bg-white text-gray-700 border border-gray-300 rounded-lg font-bold text-center hover:bg-gray-50 transition-colors text-sm"
          >
            Open Risk Team Review
          </Link>
        </div>
        <p className="text-[10px] text-gray-400">
          Local handoff complete. Senior Analyst review done. No trade execution. Human review required before any action.
        </p>
      </div>
    </>
  );
}

export default function RiskHandoffPage() {
  return (
    <Suspense>
      <RiskHandoffContent />
    </Suspense>
  );
}
