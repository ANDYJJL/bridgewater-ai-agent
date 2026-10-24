'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import RiskTeamStepper from '@/components/workflow/RiskTeamStepper';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';

const ST  = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';
const LST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';

// ── Ticker brand theme ────────────────────────────────────────────────────────
const TICKER_THEMES = {
  NVDA: { accent: 'text-emerald-700', headerBg: 'bg-emerald-50', headerBorder: 'border-emerald-100', stripe: 'bg-emerald-400', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', btn: 'bg-emerald-700 text-white border-emerald-700' },
  KO:   { accent: 'text-red-700',     headerBg: 'bg-red-50',     headerBorder: 'border-red-100',     stripe: 'bg-red-400',     pill: 'bg-red-50 text-red-700 border-red-200',         btn: 'bg-red-700 text-white border-red-700' },
};
const DEFAULT_THEME = { accent: 'text-slate-600', headerBg: 'bg-slate-50', headerBorder: 'border-slate-200', stripe: 'bg-slate-400', pill: 'bg-slate-50 text-slate-700 border-slate-200', btn: 'bg-slate-700 text-white border-slate-700' };
function getTheme(ticker) { return TICKER_THEMES[ticker] ?? DEFAULT_THEME; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function humanize(str) {
  if (!str) return '—';
  return str.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
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
    isSimulated:  !!(entry.shares_outstanding_is_simulated ?? entry.share_count_is_simulated ?? entry.isSimulatedShareCount),
    currentPrice: entry.latest_market_price ?? entry.current_price ?? entry.market_price ?? null,
  };
}

function stanceLabel(v) {
  const map = { no_action: 'No action', review_only: 'Review only', watchlist: 'Watchlist', accumulate_candidate: 'Accumulate candidate', reduce_exposure: 'Reduce exposure' };
  return map[v] ?? humanize(v);
}

const RISK_FACTORS = [
  { id: 'export_control',        label: 'Export control risk' },
  { id: 'hyperscaler_capex',     label: 'Hyperscaler capex dependence' },
  { id: 'supply_chain',          label: 'Supply chain risk' },
  { id: 'dcf_sensitivity',       label: 'DCF sensitivity' },
  { id: 'simulated_share_count', label: 'Simulated share count limitation' },
];

function StaticFallbackBanner() {
  return (
    <div className="max-w-4xl mx-auto px-8 pt-3">
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <span className="text-amber-600 text-xs font-bold">!</span>
        <p className="text-xs text-amber-800 font-medium">Showing cached backend packet. Live data unavailable.</p>
      </div>
    </div>
  );
}

function RiskIntakeContent() {
  const searchParams = useSearchParams();
  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();
  const tickers = packet ? Object.keys(packet.recommendations || {}) : ['NVDA', 'KO'];
  const [selectedTicker, setSelectedTicker] = useState(searchParams.get('ticker') || 'NVDA');
  const [proposal,  setProposal]  = useState(null);
  const [step1,     setStep1]     = useState(null);
  const [loaded,    setLoaded]    = useState(false);

  useEffect(() => {
    setLoaded(false);
    const load = k => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
    setProposal(load(`bridgewater_senior_action_proposal_${selectedTicker}`));
    setStep1(load(`bridgewater_senior_valuation_review_${selectedTicker}`));
    setLoaded(true);
  }, [selectedTicker]);

  const theme = getTheme(selectedTicker);
  const simQ  = new URLSearchParams({ ticker: selectedTicker }).toString();

  // Packet valuation data
  const dcfData   = packet?.dcf_valuations?.valuations?.[selectedTicker] ?? null;
  const entryData = packet?.entry_price_models?.entry_prices?.[selectedTicker] ?? null;
  const normalized = normalizeEntryPrice(entryData);
  const dcfFairValue = normalized.fairValue ?? dcfData?.implied_share_price ?? null;
  const packetMoS    = normalizePctToInt(normalized.mos);
  const currentPrice = normalized.currentPrice ?? dcfData?.latest_market_price ?? dcfData?.current_price ?? null;
  const tickerResult = packet?.model_comparison?.ticker_results?.[selectedTicker] ?? {};
  const tpModels     = tickerResult?.target_price_models ?? null;
  const currentPriceFallback = tpModels?.linear_regression?.current_price ?? tpModels?.random_forest_regressor?.current_price ?? null;
  const displayCurrentPrice  = currentPrice ?? currentPriceFallback;

  const juniorEntryRef = dcfFairValue != null && packetMoS != null
    ? (dcfFairValue * (1 - packetMoS / 100)).toFixed(2)
    : normalized.entryPrice != null ? Number(normalized.entryPrice).toFixed(2) : null;

  const seniorMoS = proposal?.marginOfSafety ?? step1?.marginOfSafety ?? packetMoS;
  const seniorEntryRef = proposal?.referenceEntry
    ? parseFloat(proposal.referenceEntry).toFixed(2)
    : (dcfFairValue != null && seniorMoS != null
      ? (dcfFairValue * (1 - seniorMoS / 100)).toFixed(2)
      : juniorEntryRef);

  const hasProposal = !!(proposal?.stance || proposal?.referenceEntry);
  const isReady     = !!(proposal?.readyForRiskHandoff || proposal?.readyState);

  const sharesNum  = proposal?.proposedShares ? parseFloat(proposal.proposedShares) : null;
  const notional   = proposal?.illustrativeNotional ?? (sharesNum && seniorEntryRef ? (sharesNum * parseFloat(seniorEntryRef)).toFixed(0) : null);

  return (
    <>
      <WorkflowNav role="Risk Team" subtitle="Scenario analysis and PM escalation review" />
      <RiskTeamStepper activeStep={1} ticker={selectedTicker} />
      {isStaticFallback && <StaticFallbackBanner />}

      <div className="max-w-4xl mx-auto px-8 pt-6 pb-3">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Risk Intake</h1>
        <p className="text-sm text-gray-500">Review the Senior Action Proposal and valuation basis before running scenario analysis.</p>
        <div className={`w-16 h-1 ${theme.stripe} rounded-full mt-4 opacity-70`} />
      </div>

      {/* Ticker selector */}
      <div className="max-w-4xl mx-auto px-8 py-3">
        <div className="flex items-center gap-3">
          <p className={`${LST} mr-1`}>Ticker</p>
          {tickers.map(t => {
            const tTheme = getTheme(t);
            return (
              <button key={t} onClick={() => setSelectedTicker(t)}
                className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                  selectedTicker === t ? tTheme.btn : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}>
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading || !loaded ? (
        <div className="max-w-4xl mx-auto px-8 pb-24 space-y-5 animate-pulse">
          {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-gray-100 rounded-xl" />)}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-8 pb-24 space-y-5">

          {/* Senior Proposal Intake */}
          <section className={`bg-white border border-gray-200 rounded-xl overflow-hidden`}>
            <div className={`${theme.headerBg} border-b ${theme.headerBorder} px-5 py-3.5 flex items-center gap-2 flex-wrap`}>
              <p className={ST}>Senior Proposal Intake</p>
              {isReady ? (
                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ Marked ready by Senior
                </span>
              ) : hasProposal ? (
                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Draft — not marked ready
                </span>
              ) : null}
              <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">Local draft · bridgewater_senior_action_proposal_{selectedTicker}</span>
            </div>

            {!hasProposal ? (
              <div className="px-5 py-5 space-y-3">
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-amber-600 font-bold text-sm flex-shrink-0 mt-px">!</span>
                  <div>
                    <p className="text-sm text-amber-900 font-semibold">No saved Senior Action Proposal found</p>
                    <p className="text-xs text-amber-800 mt-1">
                      Return to Senior Step 2 and complete the Action Proposal, then click <strong>Mark Ready for Risk Handoff</strong>.
                    </p>
                    <Link href={`/senior-analyst/trade-proposal?ticker=${selectedTicker}`}
                      className="inline-block mt-2 text-xs text-amber-700 font-bold hover:underline">
                      Go to Senior Step 2: Action Proposal →
                    </Link>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 font-mono">
                  Expected: bridgewater_senior_action_proposal_{selectedTicker}
                </p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className={`${LST} mb-0.5`}>Proposed Stance</p>
                    <p className="text-sm font-bold text-gray-900">{stanceLabel(proposal.stance)}</p>
                  </div>
                  <div>
                    <p className={`${LST} mb-0.5`}>Entry Reference</p>
                    <p className="text-sm font-bold text-gray-900">
                      {proposal.referenceEntry ? `$${parseFloat(proposal.referenceEntry).toFixed(2)}` : '—'}
                    </p>
                    <p className="text-[9px] text-gray-400">Not a trade instruction</p>
                  </div>
                  <div>
                    <p className={`${LST} mb-0.5`}>Proposed Shares</p>
                    <p className="text-sm font-bold text-gray-900">
                      {proposal.proposedShares ? parseInt(proposal.proposedShares).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div>
                    <p className={`${LST} mb-0.5`}>Illustrative Notional</p>
                    <p className="text-sm font-bold text-gray-900">
                      {notional ? `$${parseInt(notional).toLocaleString()}` : '—'}
                    </p>
                    <p className="text-[9px] text-amber-600 font-medium">Proposal only</p>
                  </div>
                  <div>
                    <p className={`${LST} mb-0.5`}>Margin of Safety</p>
                    <p className="text-sm font-bold text-gray-900">
                      {seniorMoS != null ? `${seniorMoS}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className={`${LST} mb-0.5`}>Time Horizon</p>
                    <p className="text-sm font-bold text-gray-900">{proposal.timeHorizon || '—'}</p>
                  </div>
                  <div>
                    <p className={`${LST} mb-0.5`}>PM Approval</p>
                    <p className={`text-sm font-bold ${proposal.pmApprovalRequired ? 'text-amber-700' : 'text-gray-900'}`}>
                      {proposal.pmApprovalRequired ? 'Required' : 'Not required'}
                    </p>
                  </div>
                  <div>
                    <p className={`${LST} mb-0.5`}>Handoff Status</p>
                    {isReady ? (
                      <span className="inline-flex px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Ready</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-500 border border-gray-200">Not marked ready</span>
                    )}
                  </div>
                </div>

                {proposal.rationale && (
                  <div>
                    <p className={`${LST} mb-1`}>Senior Rationale</p>
                    <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 line-clamp-3">
                      {proposal.rationale}
                    </p>
                  </div>
                )}
                {proposal.savedAt && (
                  <p className="text-[9px] text-gray-300">Proposal saved {new Date(proposal.savedAt).toLocaleString()}</p>
                )}
              </div>
            )}
          </section>

          {/* Valuation Basis */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3.5 flex items-center gap-2">
              <p className={ST}>Valuation Basis</p>
              <span className="ml-auto text-[10px] text-gray-400">From backend packet · read-only</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className={`${LST} mb-0.5`}>DCF Fair Value Est.</p>
                  <p className="text-base font-bold text-gray-900">
                    {dcfFairValue != null ? `$${dcfFairValue.toFixed(2)}` : '—'}
                  </p>
                  <p className="text-[9px] text-gray-400">Illustrative estimate</p>
                </div>
                <div>
                  <p className={`${LST} mb-0.5`}>Current Price</p>
                  <p className="text-base font-bold text-gray-900">
                    {displayCurrentPrice != null ? `$${Number(displayCurrentPrice).toFixed(2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className={`${LST} mb-0.5`}>Junior Baseline Entry</p>
                  <p className="text-base font-bold text-gray-900">
                    {juniorEntryRef ? `$${juniorEntryRef}` : '—'}
                  </p>
                  <p className="text-[9px] text-gray-400">MoS {packetMoS != null ? `${packetMoS}%` : '—'}</p>
                </div>
                <div>
                  <p className={`${LST} mb-0.5`}>Senior Adjusted Entry</p>
                  <p className={`text-base font-bold ${proposal?.referenceEntry ? 'text-slate-900' : 'text-gray-500'}`}>
                    {seniorEntryRef ? `$${seniorEntryRef}` : '—'}
                  </p>
                  <p className="text-[9px] text-gray-400">MoS {seniorMoS != null ? `${seniorMoS}%` : '—'}</p>
                </div>
              </div>
              {normalized.isSimulated && (
                <p className="text-[10px] text-amber-700 font-medium bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
                  ⚠ Share count is simulated in Junior packet — entry reference is illustrative only.
                </p>
              )}
              <p className="text-[9px] text-gray-300 font-mono">
                Source: dcf_valuations.valuations.{selectedTicker} · entry_price_models.entry_prices.{selectedTicker}
              </p>
            </div>
          </section>

          {/* Risk Factors to Test */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3.5">
              <p className={ST}>Risk Factors to Test</p>
              <p className="text-xs text-gray-400 mt-0.5">These will be tested in Scenario Analysis.</p>
            </div>
            <div className="px-5 py-4">
              <div className="flex flex-wrap gap-2">
                {RISK_FACTORS.map(rf => (
                  <span key={rf.id}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg">
                    {rf.label}
                  </span>
                ))}
              </div>
              <p className="text-[9px] text-gray-400 mt-3">
                Configure severity in Scenario Analysis → Scenario Control Center.
              </p>
            </div>
          </section>

          {/* Step 1 assumptions if available */}
          {step1 && (
            <section className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className={`${ST} mb-2`}>Senior Step 1 Assumptions</p>
              <div className="flex flex-wrap gap-1.5">
                {step1.discountRate   != null && <span className="px-2 py-0.5 bg-white border border-gray-200 text-[10px] rounded font-medium text-slate-600">WACC {step1.discountRate}%</span>}
                {step1.terminalGrowth != null && <span className="px-2 py-0.5 bg-white border border-gray-200 text-[10px] rounded font-medium text-slate-600">TGR {step1.terminalGrowth}%</span>}
                {step1.marginOfSafety != null && <span className="px-2 py-0.5 bg-white border border-gray-200 text-[10px] rounded font-medium text-slate-600">MoS {step1.marginOfSafety}%</span>}
                {step1.revenueScenario && <span className="px-2 py-0.5 bg-white border border-gray-200 text-[10px] rounded font-medium text-slate-600">Revenue: {step1.revenueScenario}</span>}
                {step1.fcfHaircut && step1.fcfHaircut !== '0%' && <span className="px-2 py-0.5 bg-white border border-gray-200 text-[10px] rounded font-medium text-slate-600">FCF haircut: {step1.fcfHaircut}</span>}
              </div>
            </section>
          )}

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link href="/"
              className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm">
              ← Back to Roles
            </Link>
            <Link href={`/risk-team/simulation?${simQ}`}
              className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm">
              Continue to Scenario Analysis →
            </Link>
          </div>
          <p className="text-[10px] text-gray-400 text-center">
            {hasProposal
              ? 'Senior proposal loaded above. Proceed to test under risk scenarios.'
              : 'No Senior proposal found. You can still run scenario analysis using packet data.'}
          </p>
        </div>
      )}
    </>
  );
}

export default function RiskIntakePage() {
  return (
    <Suspense>
      <RiskIntakeContent />
    </Suspense>
  );
}
