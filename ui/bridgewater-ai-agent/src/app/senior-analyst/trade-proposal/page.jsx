'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import SeniorProgressBar from '@/components/workflow/SeniorProgressBar';
import TradingViewChart from '@/components/workflow/TradingViewChart';
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

// ── Senior Stance options ─────────────────────────────────────────────────────
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

function stanceLabel(v) {
  return SENIOR_STANCES.find(s => s.value === v)?.label ?? humanizeLabel(v);
}

function normalizePctToInt(v) {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return Math.abs(n) <= 1 ? Math.round(n * 100) : Math.round(n);
}

function normalizeEntryPrice(entry) {
  if (!entry) return {};
  return {
    fairValue:    entry.implied_fair_value_per_share ?? entry.fair_value_per_share ?? entry.fairValuePerShare ?? null,
    mos:          entry.margin_of_safety ?? entry.marginOfSafety ?? null,
    entryPrice:   entry.entry_price ?? entry.entryPrice ?? entry.entry_price_reference ?? entry.entryPriceReference ?? null,
    equityValue:  entry.dcf_equity_value ?? entry.equity_value ?? entry.equityValue ?? null,
    isSimulated:  !!(entry.shares_outstanding_is_simulated ?? entry.share_count_is_simulated ?? entry.isSimulatedShareCount),
    shareSource:  entry.shares_outstanding_source ?? entry.share_count_source ?? entry.shareCountSource ?? null,
    currentPrice: entry.latest_market_price ?? entry.current_price ?? entry.market_price ?? null,
  };
}

function proposalKey(ticker)  { return `bridgewater_senior_action_proposal_${ticker}`; }
function valReviewKey(ticker) { return `bridgewater_senior_valuation_review_${ticker}`; }

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

// ── Action Proposal Form ──────────────────────────────────────────────────────
// key={ticker} in caller ensures full remount on ticker change.
function ActionProposalForm({ ticker, packet, theme }) {
  // ── Fixed packet paths ──────────────────────────────────────────────────────
  const dcfData   = packet?.dcf_valuations?.valuations?.[ticker] ?? null;
  const entryData = packet?.entry_price_models?.entry_prices?.[ticker] ?? null;
  const rec        = packet?.recommendations?.[ticker] ?? {};
  const pmRequired = rec?.requires_pm_review ?? false;

  // ── Normalised packet values ────────────────────────────────────────────────
  const normalized   = normalizeEntryPrice(entryData);
  const dcfFairValue = normalized.fairValue ?? dcfData?.implied_share_price ?? null;
  const packetMoS    = normalizePctToInt(normalized.mos);
  const packetEntry  = normalized.entryPrice;
  const isSimulated  = normalized.isSimulated;

  const tickerResult      = packet?.model_comparison?.ticker_results?.[ticker] ?? {};
  const targetPriceModels = tickerResult?.target_price_models ?? null;
  const currentPrice =
    normalized.currentPrice ??
    dcfData?.latest_market_price ?? dcfData?.current_price ??
    targetPriceModels?.linear_regression?.current_price ??
    targetPriceModels?.random_forest_regressor?.current_price ?? null;

  // Junior baseline entry (packet-only, no Senior override)
  const juniorEntryRef = dcfFairValue != null && packetMoS != null
    ? (dcfFairValue * (1 - packetMoS / 100)).toFixed(2)
    : packetEntry != null ? Number(packetEntry).toFixed(2) : null;

  // ── State ───────────────────────────────────────────────────────────────────
  const [stance,          setStance]          = useState('review_only');
  const [referenceEntry,  setReferenceEntry]  = useState('');
  const [proposedShares,  setProposedShares]  = useState('1000');
  const [riskLimitNote,   setRiskLimitNote]   = useState('');
  const [keyRiskControls, setKeyRiskControls] = useState('');
  const [timeHorizon,     setTimeHorizon]     = useState('Medium-term');
  const [reviewTrigger,   setReviewTrigger]   = useState('');
  const [rationale,       setRationale]       = useState('');
  const [readyState,      setReadyState]      = useState(false);
  const [savedAt,         setSavedAt]         = useState(null);
  const [readyAt,         setReadyAt]         = useState(null);
  const [loaded,          setLoaded]          = useState(false);
  const [step1,           setStep1]           = useState(null);

  useEffect(() => {
    // Load step1 first so we can seed entry ref from senior MoS
    let s1 = null;
    try {
      const s1Raw = localStorage.getItem(valReviewKey(ticker));
      if (s1Raw) { s1 = JSON.parse(s1Raw); setStep1(s1); }
    } catch { /* ignore */ }

    const s1MoS = s1?.marginOfSafety ?? packetMoS;
    const seniorSeedEntry = dcfFairValue != null && s1MoS != null
      ? (dcfFairValue * (1 - s1MoS / 100)).toFixed(2)
      : juniorEntryRef;

    try {
      const raw = localStorage.getItem(proposalKey(ticker));
      if (raw) {
        const p = JSON.parse(raw);
        setStance(p.stance ?? 'review_only');
        setReferenceEntry(p.referenceEntry ?? seniorSeedEntry ?? '');
        setProposedShares(p.proposedShares ?? '1000');
        setRiskLimitNote(p.riskLimitNote ?? '');
        setKeyRiskControls(p.keyRiskControls ?? '');
        setTimeHorizon(p.timeHorizon ?? 'Medium-term');
        setReviewTrigger(p.reviewTrigger ?? '');
        setRationale(p.rationale ?? '');
        setReadyState(p.readyForRiskHandoff ?? p.readyState ?? false);
        setSavedAt(p.savedAt ?? null);
        setReadyAt(p.readyAt ?? null);
      } else if (seniorSeedEntry) {
        setReferenceEntry(String(seniorSeedEntry));
      }
    } catch { /* ignore */ }
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // key=ticker guarantees remount per ticker

  // Derived values (live — update whenever state changes)
  const seniorMoS = step1?.marginOfSafety ?? packetMoS;
  const seniorEntryRef = dcfFairValue != null && seniorMoS != null
    ? (dcfFairValue * (1 - seniorMoS / 100)).toFixed(2)
    : juniorEntryRef;
  const hasSeniorOverride = step1?.marginOfSafety != null && packetMoS != null
    && step1.marginOfSafety !== packetMoS;

  const sharesNum   = parseFloat(proposedShares);
  const refEntryNum = parseFloat(referenceEntry);
  const illustrativeNotional = !isNaN(sharesNum) && !isNaN(refEntryNum) && sharesNum > 0 && refEntryNum > 0
    ? sharesNum * refEntryNum
    : null;

  const valuationGap = dcfFairValue != null && currentPrice != null
    ? ((dcfFairValue - currentPrice) / currentPrice * 100).toFixed(1)
    : null;

  const aggressiveStance = stance === 'accumulate_candidate' || stance === 'reduce_exposure';

  // ── Persist ─────────────────────────────────────────────────────────────────
  function persist(overrides = {}) {
    const payload = {
      ticker,
      stance,
      referenceEntry,
      proposedShares,
      illustrativeNotional: illustrativeNotional != null ? illustrativeNotional.toFixed(2) : null,
      dcfFairValueEstimate:  dcfFairValue != null ? dcfFairValue.toFixed(2) : null,
      juniorBaselineEntry:   juniorEntryRef,
      seniorAdjustedEntry:   seniorEntryRef,
      marginOfSafety:        seniorMoS,
      timeHorizon,
      riskLimitNote,
      keyRiskControls,
      reviewTrigger,
      rationale,
      pmApprovalRequired:    pmRequired,
      readyState,
      readyAt,
      readyForRiskHandoff:   overrides.readyForRiskHandoff ?? readyState,
      savedAt:               new Date().toISOString(),
      sourcePaths: {
        dcf:   `dcf_valuations.valuations.${ticker}`,
        entry: `entry_price_models.entry_prices.${ticker}`,
      },
      ...overrides,
    };
    try {
      localStorage.setItem(proposalKey(ticker), JSON.stringify(payload));
      setSavedAt(payload.savedAt);
    } catch { /* ignore */ }
    return payload;
  }

  function handleSave() { persist(); }

  function handleReset() {
    const s1MoS = step1?.marginOfSafety ?? packetMoS;
    const seedEntry = dcfFairValue != null && s1MoS != null
      ? (dcfFairValue * (1 - s1MoS / 100)).toFixed(2)
      : juniorEntryRef;
    setStance('review_only');
    setReferenceEntry(seedEntry ?? '');
    setProposedShares('1000');
    setRiskLimitNote(''); setKeyRiskControls('');
    setTimeHorizon('Medium-term'); setReviewTrigger('');
    setRationale(''); setReadyState(false); setReadyAt(null);
  }

  function handleMarkReady() {
    const ts = new Date().toISOString();
    setReadyState(true); setReadyAt(ts);
    persist({ readyForRiskHandoff: true, readyAt: ts });
  }

  if (!loaded) return null;

  return (
    <div className="space-y-5">

      {/* A. Valuation Basis */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className={`${theme.headerBg} border-b ${theme.headerBorder} px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap`}>
          <div>
            <p className={CARD_ST}>A. Valuation Basis</p>
            <p className={`text-[10px] ${theme.accentText} font-medium mt-0.5`}>From backend packet · DCF estimate · illustrative only</p>
          </div>
          <span className="text-[10px] text-gray-400 flex-shrink-0">Read-only</span>
        </div>
        <div className="px-5 py-4 space-y-3">

          {/* Missing packet warning */}
          {!dcfFairValue && !juniorEntryRef && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-amber-600 font-bold text-xs flex-shrink-0 mt-px">!</span>
              <div>
                <p className="text-xs text-amber-800 font-medium">Valuation package not loaded from Junior packet</p>
                <p className="text-[9px] text-amber-700 font-mono mt-0.5">
                  Attempted: entry_price_models.entry_prices.{ticker} · dcf_valuations.valuations.{ticker}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className={`${LABEL_ST} mb-0.5`}>DCF Fair Value Est.</p>
              <p className="text-lg font-bold text-gray-900">
                {dcfFairValue != null ? `$${dcfFairValue.toFixed(2)}` : '—'}
              </p>
              <p className="text-[9px] text-gray-400">Illustrative estimate</p>
            </div>
            <div>
              <p className={`${LABEL_ST} mb-0.5`}>Entry Reference</p>
              <p className="text-lg font-bold text-gray-900">
                {seniorEntryRef ? `$${seniorEntryRef}` : '—'}
              </p>
              <p className="text-[9px] text-gray-400">Not a trade instruction</p>
            </div>
            <div>
              <p className={`${LABEL_ST} mb-0.5`}>Margin of Safety</p>
              <p className="text-lg font-bold text-gray-900">
                {seniorMoS != null ? `${seniorMoS}%` : '—'}
              </p>
            </div>
            <div>
              <p className={`${LABEL_ST} mb-0.5`}>Current Price</p>
              <p className="text-lg font-bold text-gray-900">
                {currentPrice != null ? `$${Number(currentPrice).toFixed(2)}` : '—'}
              </p>
              {valuationGap && (
                <p className="text-[9px] text-gray-400">
                  Gap: {parseFloat(valuationGap) > 0 ? '+' : ''}{valuationGap}%
                </p>
              )}
            </div>
          </div>

          {/* Senior override comparison */}
          {dcfFairValue && hasSeniorOverride && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <div className="space-y-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] rounded font-semibold">
                  Senior override active
                </span>
                <p className="text-[9px] text-gray-400">Changed locally for review; no backend artifact overwritten.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Junior baseline</p>
                  <p className="text-xs text-gray-600">MoS: <span className="font-semibold">{packetMoS != null ? `${packetMoS}%` : '—'}</span></p>
                  <p className="text-xs text-gray-600">Entry ref: <span className="font-semibold">{juniorEntryRef ? `$${juniorEntryRef}` : '—'}</span></p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Senior adjusted</p>
                  <p className="text-xs text-slate-700">MoS: <span className="font-semibold text-slate-900">{step1.marginOfSafety}%</span></p>
                  <p className="text-xs text-slate-700">Entry ref: <span className="font-semibold text-slate-900">${seniorEntryRef}</span></p>
                </div>
              </div>
            </div>
          )}

          {isSimulated && (
            <p className="text-[10px] text-amber-700 font-medium bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
              ⚠ Share count is simulated — entry reference is illustrative only.
            </p>
          )}

          {/* Senior Step 1 assumption chips */}
          {step1 && (
            <div className="pt-2 border-t border-gray-100">
              <p className={`${LABEL_ST} mb-1.5`}>Senior-adjusted assumptions (Step 1)</p>
              <div className="flex flex-wrap gap-1.5">
                {step1.discountRate   != null && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">WACC {step1.discountRate}%</span>}
                {step1.terminalGrowth != null && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">TGR {step1.terminalGrowth}%</span>}
                {step1.marginOfSafety != null && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">MoS {step1.marginOfSafety}%</span>}
                {step1.revenueScenario && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">Revenue: {step1.revenueScenario}</span>}
                {step1.fcfHaircut && step1.fcfHaircut !== '0%' && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">FCF haircut: {step1.fcfHaircut}</span>}
                {step1.reviewStance && step1.reviewStance !== 'Balanced' && <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-[10px] rounded font-medium text-slate-600">Stance: {step1.reviewStance}</span>}
              </div>
            </div>
          )}

          <p className="text-[9px] text-gray-300 font-mono">
            Source: dcf_valuations.valuations.{ticker} · entry_price_models.entry_prices.{ticker} · Not a trade instruction
          </p>
        </div>
      </section>

      {/* B. Proposed Senior Stance */}
      <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-amber-100">
          <p className={CARD_ST}>B. Proposed Senior Stance</p>
          <p className="text-xs text-gray-400 mt-0.5">Select the stance that best reflects the reviewed valuation package. Default is conservative.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {SENIOR_STANCES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setStance(value)}
                className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all duration-150 ${
                  stance === value
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {aggressiveStance && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-amber-500 font-bold text-xs flex-shrink-0 mt-0.5">⚠</span>
              <p className="text-xs text-amber-900">
                <span className="font-bold">{stanceLabel(stance)}</span> requires PM approval and Risk Team review before any action. This is a draft proposal only — no trade is submitted.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* C. Proposal Parameters */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <p className={CARD_ST}>C. Proposal Parameters</p>
          <p className="text-xs text-gray-400 mt-0.5">Illustrative sizing for escalation review. Not execution instructions.</p>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`${LABEL_ST} mb-1.5 block`}>Reference Entry Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">$</span>
                <input
                  type="number"
                  value={referenceEntry}
                  onChange={e => setReferenceEntry(e.target.value)}
                  placeholder={seniorEntryRef ?? 'e.g. 150.00'}
                  step="0.01"
                  className="w-full text-sm text-gray-800 pl-7 pr-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Illustrative entry reference · not a price target</p>
              {!seniorEntryRef && (
                <p className="text-[9px] text-amber-600 font-mono mt-0.5">
                  Valuation package not loaded · entry_price_models.entry_prices.{ticker}
                </p>
              )}
            </div>
            <div>
              <label className={`${LABEL_ST} mb-1.5 block`}>Proposed Shares</label>
              <input
                type="number"
                value={proposedShares}
                onChange={e => setProposedShares(e.target.value)}
                placeholder="e.g. 1000"
                min="0"
                step="1"
                className="w-full text-sm text-gray-800 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Illustrative sizing · proposal only</p>
            </div>
          </div>

          {/* Illustrative notional */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg">
            <p className={`${LABEL_ST} mb-1`}>Illustrative Capital Required Estimate</p>
            {illustrativeNotional != null ? (
              <>
                <p className="text-xl font-bold text-gray-900">
                  ${illustrativeNotional.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  {proposedShares} shares × ${parseFloat(referenceEntry).toFixed(2)} reference entry price
                </p>
                <p className="text-[9px] text-amber-700 font-medium mt-0.5">
                  Not execution · illustrative sizing · for escalation review only
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Enter shares and reference entry price to calculate</p>
            )}
          </div>

          <div>
            <label className={`${LABEL_ST} mb-1.5 block`}>Time Horizon</label>
            <div className="flex gap-1.5">
              {['Short-term', 'Medium-term', 'Long-term'].map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setTimeHorizon(h)}
                  className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold border transition-colors ${
                    timeHorizon === h
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`${LABEL_ST} mb-1.5 block`}>Risk Limit Note</label>
              <input
                type="text"
                value={riskLimitNote}
                onChange={e => setRiskLimitNote(e.target.value)}
                placeholder="e.g. max 2% portfolio weight"
                className="w-full text-sm text-gray-800 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className={`${LABEL_ST} mb-1.5 block`}>Review Trigger</label>
              <input
                type="text"
                value={reviewTrigger}
                onChange={e => setReviewTrigger(e.target.value)}
                placeholder="e.g. earnings miss, export news"
                className="w-full text-sm text-gray-800 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
              />
            </div>
          </div>
        </div>
      </section>

      {/* D. Review Notes */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <p className={CARD_ST}>D. Review Notes</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Senior review focuses on challenging the draft thesis, checking evidence quality, and deciding whether additional risk or PM review is needed before the packet moves forward.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'Evidence quality check',
            'Risk review if needed',
            'PM review before final action',
          ].map((label) => (
            <span
              key={label}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200"
            >
              {label}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-gray-400">No trade is submitted from this prototype. Any investment-facing action requires human approval.</p>
      </section>

      {/* E. Senior Rationale */}
      <section className="bg-white border border-amber-200 rounded-xl p-5 space-y-3">
        <div>
          <p className={CARD_ST}>E. Senior Rationale</p>
          <p className="text-xs text-gray-400 mt-0.5">Explain why this stance follows from the DCF, entry reference, and risk review.</p>
        </div>
        <textarea
          value={rationale}
          onChange={e => setRationale(e.target.value)}
          placeholder="Explain why this senior stance follows from the DCF, entry reference, and risk review. Link stance to specific valuation assumptions and identified risks."
          rows={4}
          className="w-full text-sm text-gray-800 bg-amber-50 border border-amber-200 rounded-lg p-4 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-colors leading-relaxed"
        />
        <div>
          <label className={`${LABEL_ST} mb-1.5 block`}>Key Risk Controls</label>
          <textarea
            value={keyRiskControls}
            onChange={e => setKeyRiskControls(e.target.value)}
            placeholder="List key risk controls, stop-loss levels, or monitoring conditions relevant to this proposal..."
            rows={2}
            className="w-full text-sm text-gray-800 bg-amber-50 border border-amber-200 rounded-lg p-3 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
          />
        </div>
      </section>

      {/* F. Proposal Summary — live updates with state */}
      <section className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
        <p className={CARD_ST}>F. Proposal Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>Proposed Stance</p>
            <p className="text-base font-bold text-gray-900">{stanceLabel(stance)}</p>
          </div>
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>DCF Fair Value Est.</p>
            <p className="text-base font-bold text-gray-900">
              {dcfFairValue != null ? `$${dcfFairValue.toFixed(2)}` : '—'}
            </p>
          </div>
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>Entry Reference</p>
            <p className="text-base font-bold text-gray-900">
              {referenceEntry ? `$${parseFloat(referenceEntry).toFixed(2)}` : '—'}
            </p>
          </div>
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>Margin of Safety</p>
            <p className="text-base font-bold text-gray-900">
              {seniorMoS != null ? `${seniorMoS}%` : '—'}
            </p>
          </div>
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>Proposed Shares</p>
            <p className="text-base font-bold text-gray-900">{proposedShares || '—'}</p>
          </div>
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>Illustrative Notional</p>
            <p className="text-base font-bold text-gray-900">
              {illustrativeNotional != null
                ? `$${illustrativeNotional.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                : '—'
              }
            </p>
          </div>
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>Time Horizon</p>
            <p className="text-base font-bold text-gray-900">{timeHorizon}</p>
          </div>
          <div>
            <p className={`${LABEL_ST} mb-0.5`}>PM Approval</p>
            <p className={`text-base font-bold ${pmRequired ? 'text-amber-700' : 'text-gray-900'}`}>
              {pmRequired ? 'Required' : 'Not required'}
            </p>
          </div>
        </div>
        <div className="pt-2 border-t border-gray-200 space-y-1">
          <p className="text-[10px] text-gray-500 font-medium">
            Next step: <span className="text-gray-700">Package in Risk Handoff Package for Risk Team review</span>
          </p>
          <p className="text-[9px] text-amber-600 font-medium">
            Illustrative sizing · Capital required estimate · Proposal only · Not execution · Not a trade instruction
          </p>
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-sm hover:bg-gray-800 transition-colors"
        >
          Save Proposal Locally
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="py-3 px-6 bg-white text-gray-700 border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-50 transition-colors"
        >
          Reset
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
          {readyState ? '✓ Marked Ready for Handoff' : 'Mark Ready for Risk Handoff'}
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400">
        Draft proposal only — not execution. No trade is submitted. PM approval and Risk Team review required before any action.
        {readyAt && ` · Marked ready: ${new Date(readyAt).toLocaleString()}`}
      </p>
      {savedAt && (
        <p className="text-[10px] text-gray-300">Last saved {new Date(savedAt).toLocaleString()}</p>
      )}
    </div>
  );
}

// ── Page content ──────────────────────────────────────────────────────────────
function ActionProposalContent() {
  const searchParams = useSearchParams();
  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();

  const tickers = packet ? Object.keys(packet.recommendations || {}) : ['NVDA', 'KO'];
  const [selectedTicker, setSelectedTicker] = useState(
    searchParams.get('ticker') || 'NVDA'
  );

  const params      = new URLSearchParams({ ticker: selectedTicker }).toString();
  const theses      = packet?.company_theses ?? {};
  const companyName = theses[selectedTicker]?.company_name ?? selectedTicker;
  const theme       = getTickerTheme(selectedTicker);

  if (isLoading) {
    return (
      <>
        <WorkflowNav role="Senior Analyst" subtitle="Review, challenge, and prepare escalation." />
        <SeniorProgressBar currentStep={2} />
        <LoadingSkeleton />
      </>
    );
  }

  return (
    <>
      <WorkflowNav role="Senior Analyst" subtitle="Review, challenge, and prepare escalation." />
      <SeniorProgressBar currentStep={2} params={params} />

      {isStaticFallback && <StaticFallbackBanner />}

      {/* Page header */}
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-4">
          <CompanyLogo ticker={selectedTicker} size="lg" />
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Senior Action Proposal</h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">
              {companyName} · {selectedTicker}
            </p>
          </div>
        </div>
        <p className="text-base text-gray-600 leading-relaxed max-w-2xl">
          Convert the reviewed valuation package into a draft action view for escalation.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Local draft only · PM approval required · No trade execution
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

        {/* Price chart */}
        <TradingViewChart ticker={selectedTicker} height={280} />

        {/* Proposal form — key=ticker forces full remount on ticker change */}
        <ActionProposalForm key={selectedTicker} ticker={selectedTicker} packet={packet} theme={theme} />

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href={`/senior-analyst?${params}`}
            className="py-4 px-6 bg-gray-100 text-gray-900 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm"
          >
            ← Memo &amp; Valuation Review
          </Link>
          <Link
            href={`/senior-analyst/risk-handoff?${params}`}
            className="flex-1 py-4 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm"
          >
            Continue to Risk Handoff Package →
          </Link>
        </div>
        <p className="text-[10px] text-gray-400">
          No backend send performed. Opens Risk Handoff Package with Senior proposal available.
        </p>
      </div>
    </>
  );
}

export default function ActionProposalPage() {
  return (
    <Suspense>
      <ActionProposalContent />
    </Suspense>
  );
}
