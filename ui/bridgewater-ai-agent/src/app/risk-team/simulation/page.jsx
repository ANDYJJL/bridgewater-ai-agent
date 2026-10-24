'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import RiskTeamStepper from '@/components/workflow/RiskTeamStepper';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';
import StreamingText from '@/components/StreamingText';

const ST  = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';
const LST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';

// ── Ticker brand theme ────────────────────────────────────────────────────────
const TICKER_THEMES = {
  NVDA: { accent: 'text-emerald-700', headerBg: 'bg-emerald-50', headerBorder: 'border-emerald-100', stripe: 'bg-emerald-400', btn: 'bg-emerald-700 text-white border-emerald-700' },
  KO:   { accent: 'text-red-700',     headerBg: 'bg-red-50',     headerBorder: 'border-red-100',     stripe: 'bg-red-400',     btn: 'bg-red-700 text-white border-red-700' },
};
const DEFAULT_THEME = { accent: 'text-slate-600', headerBg: 'bg-slate-50', headerBorder: 'border-slate-200', stripe: 'bg-slate-400', btn: 'bg-slate-700 text-white border-slate-700' };
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
    entryPrice:   entry.entry_price ?? entry.entryPrice ?? entry.entry_price_reference ?? null,
    isSimulated:  !!(entry.shares_outstanding_is_simulated ?? entry.share_count_is_simulated ?? entry.isSimulatedShareCount),
    currentPrice: entry.latest_market_price ?? entry.current_price ?? entry.market_price ?? null,
  };
}
function stanceLabel(v) {
  const map = { no_action: 'No action', review_only: 'Review only', watchlist: 'Watchlist', accumulate_candidate: 'Accumulate candidate', reduce_exposure: 'Reduce exposure' };
  return map[v] ?? humanize(v);
}

// Guard against raw JS/template-literal artifacts leaking into rendered text
const BAD_PATTERNS = ['concat(parseInt', 'proposal ===', 'void 0', 'function ', '=> '];
function sanitizeOutputText(text, fallback = '') {
  if (!text || typeof text !== 'string') return fallback;
  if (BAD_PATTERNS.some(p => text.includes(p))) return fallback;
  return text;
}

// Parse backend impact_chain (array or arrow-delimited string) into string array
function renderImpactChainItems(impactChain) {
  if (!impactChain) return [];
  if (Array.isArray(impactChain)) return impactChain.map(item => typeof item === 'string' ? item : JSON.stringify(item));
  if (typeof impactChain === 'string') {
    const parts = impactChain.split(/\s*→\s*|\n+/).map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [impactChain];
  }
  return [];
}

function scenarioKey(ticker) { return `bridgewater_risk_scenario_analysis_${ticker}`; }

// ── Safe string normalizers — never call .toLowerCase on unknown values ────────
function normalizeStringValue(value, fallback = '') {
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value === 'object') {
    if (typeof value.value === 'string') return value.value.toLowerCase();
    if (typeof value.label === 'string') return value.label.toLowerCase();
  }
  if (value == null) return fallback;
  return String(value).toLowerCase();
}
function normalizeScenario(value) {
  const v = normalizeStringValue(value, 'bear');
  if (v.includes('bear'))   return 'bear';
  if (v.includes('base'))   return 'base';
  if (v.includes('bull'))   return 'bull';
  if (v.includes('custom')) return 'custom';
  return 'bear';
}
function normalizeShock(value, fallback = 'moderate') {
  const v = normalizeStringValue(value, fallback);
  if (v.includes('mild')   || v.includes('low'))    return 'mild';
  if (v.includes('severe') || v.includes('high'))   return 'severe';
  if (v.includes('moderate') || v.includes('medium')) return 'moderate';
  return fallback;
}
function normalizeExportSeverity(value, fallback = 'medium') {
  const v = normalizeStringValue(value, fallback);
  if (v.includes('low'))                             return 'low';
  if (v.includes('high'))                            return 'high';
  if (v.includes('medium') || v.includes('moderate')) return 'medium';
  return fallback;
}
function normalizeBps(value) {
  if (typeof value === 'number') return value;
  const v = normalizeStringValue(value, '0');
  if (v.includes('200')) return 200;
  if (v.includes('100')) return 100;
  return 0;
}
function normalizeHaircut(value) {
  if (typeof value === 'number') return value;
  const v = normalizeStringValue(value, '0');
  if (v.includes('20')) return -0.20;
  if (v.includes('10')) return -0.10;
  return 0;
}
function normalizeMultiplier(value) {
  if (typeof value === 'number') return value;
  const v = normalizeStringValue(value, '1');
  if (v.includes('2.0') || (v.includes('2') && !v.includes('1'))) return 2.0;
  if (v.includes('1.5')) return 1.5;
  return 1.0;
}

// ── Build backend-schema scenario settings safely ─────────────────────────────
function buildBackendScenarioSettings(settings) {
  const s = {
    market_case:              normalizeScenario(settings.scenario),
    ai_capex_shock:           normalizeShock(settings.capexShock, 'moderate'),
    export_control_severity:  normalizeExportSeverity(settings.exportControl, 'medium'),
    discount_rate_shock_bps:  normalizeBps(settings.discountShock),
    fcf_haircut:              normalizeHaircut(settings.fcfHaircut),
    position_size_multiplier: normalizeMultiplier(settings.positionStress),
  };
  if (process.env.NODE_ENV !== 'production') {
    console.log('[risk_scenario_analysis] scenario_settings →', s);
  }
  return s;
}

// Human-readable summary of the settings used for a saved scenario run
function formatAnalyzedSettings(s) {
  if (!s) return null;
  const cas   = normalizeScenario(s.scenario ?? s.market_case ?? 'bear');
  const capex = normalizeShock(s.capexShock ?? s.ai_capex_shock ?? 'moderate', 'moderate');
  const exp   = normalizeExportSeverity(s.exportControl ?? s.export_control_severity ?? 'medium', 'medium');
  const bps   = normalizeBps(s.discountShock ?? s.discount_rate_shock_bps ?? 0);
  const rawFcf = s.fcfHaircut != null ? s.fcfHaircut : s.fcf_haircut != null ? s.fcf_haircut * 100 : 0;
  const fcfPct = Math.round(typeof rawFcf === 'number' ? rawFcf : parseFloat(String(rawFcf)) || 0);
  const pos   = normalizeMultiplier(s.positionStress ?? s.position_size_multiplier ?? 1.0);
  const caseName = cas.charAt(0).toUpperCase() + cas.slice(1);
  return `${caseName} · AI capex ${capex} · Export ${exp} · +${bps}bps · FCF ${fcfPct}% · ${pos}x position`;
}

// True if current UI controls match the settings used for the saved output
function settingsMatch(current, saved) {
  if (!saved) return true;
  const s = saved.scenario_settings ?? saved.settings;
  if (!s) return false;
  return normalizeScenario(s.scenario)          === normalizeScenario(current.scenario) &&
    normalizeShock(s.capexShock)                === normalizeShock(current.capexShock) &&
    normalizeExportSeverity(s.exportControl)    === normalizeExportSeverity(current.exportControl) &&
    normalizeBps(s.discountShock)               === normalizeBps(current.discountShock) &&
    normalizeHaircut(s.fcfHaircut)              === normalizeHaircut(current.fcfHaircut) &&
    normalizeMultiplier(s.positionStress)       === normalizeMultiplier(current.positionStress);
}

// ── Convert any saved/legacy settings format → canonical UI strings ───────────
function canonicalizeLoadedSettings(s) {
  if (!s) return null;
  const scenario = normalizeScenario(s.scenario ?? s.market_case ?? 'bear');

  const capexKey    = normalizeShock(s.capexShock ?? s.ai_capex_shock, 'moderate');
  const capexShock  = capexKey === 'mild' ? 'Mild' : capexKey === 'severe' ? 'Severe' : 'Moderate';

  const expKey        = normalizeExportSeverity(s.exportControl ?? s.export_control_severity, 'medium');
  const exportControl = expKey === 'low' ? 'Low' : expKey === 'high' ? 'High' : 'Medium';

  const bps          = normalizeBps(s.discountShock ?? s.discount_rate_shock_bps ?? 0);
  const discountShock = String(bps);

  const rawFcf    = s.fcfHaircut ?? s.fcf_haircut;
  const fcfNorm   = rawFcf != null ? normalizeHaircut(rawFcf) : -0.10;
  const fcfHaircut = fcfNorm <= -0.19 ? '-20' : fcfNorm <= -0.09 ? '-10' : '0';

  const rawPos       = s.positionStress ?? s.position_size_multiplier;
  const posNorm      = rawPos != null ? normalizeMultiplier(rawPos) : 1.0;
  const positionStress = posNorm >= 1.9 ? '2.0' : posNorm >= 1.4 ? '1.5' : '1.0';

  return { scenario, capexShock, exportControl, discountShock, fcfHaircut, positionStress,
    judgment: s.judgment ?? 'proceed_with_controls' };
}

// ── Discount rate impact on DCF (simplified perpetuity sensitivity) ───────────
function computeDcfAdjustment(baseFV, discountBps, fcfHaircutPct, scenario) {
  if (baseFV == null) return null;
  const scenarioMultiplier = scenario === 'bear' ? 1.0 : scenario === 'custom' ? 1.0 : scenario === 'bull' ? 0.3 : 0.5;
  const discountImpactPct = discountBps === 100 ? -9.0 : discountBps === 200 ? -16.0 : 0;
  const fcfImpact = fcfHaircutPct;
  const combined = (discountImpactPct + fcfImpact) * scenarioMultiplier;
  return {
    adjustedFV: baseFV * (1 + combined / 100),
    totalImpactPct: combined,
  };
}

// ── Deterministic fallback scenario draft ────────────────────────────────────
function buildScenarioDraft(ticker, proposal, valBasis, settings) {
  const { scenario, capexShock, exportControl, discountShock, fcfHaircut, positionStress } = settings;
  const discountBps    = parseInt(discountShock) || 0;
  const fcfHaircutPct  = parseInt(fcfHaircut) || 0;
  const stressX        = parseFloat(positionStress) || 1.0;

  const baseFV     = valBasis?.dcfFairValue;
  const entryRef   = proposal?.referenceEntry ? parseFloat(proposal.referenceEntry) : null;
  const mos        = proposal?.marginOfSafety ?? valBasis?.packetMoS;
  const shares     = proposal?.proposedShares ? parseFloat(proposal.proposedShares) : null;

  const adj  = computeDcfAdjustment(baseFV, discountBps, fcfHaircutPct, scenario);
  const adjFV = adj?.adjustedFV;
  const totalImpact = adj?.totalImpactPct ?? 0;

  const stressedShares   = shares != null ? Math.round(shares * stressX) : null;
  const stressedNotional = stressedShares != null && entryRef != null ? stressedShares * entryRef : null;
  const baselineText     = proposal?.illustrativeNotional
    ? ` vs Senior baseline of $${parseInt(proposal.illustrativeNotional || 0).toLocaleString()}`
    : '';

  const entryStillValid = adjFV != null && entryRef != null ? adjFV > entryRef : null;

  const capexDescriptions = {
    Mild:     'Mild AI capex moderation assumed. Hyperscaler spend growth slows but remains positive; near-term demand impact limited.',
    Moderate: 'Moderate capex shock scenario. Hyperscaler CapEx growth decelerates materially, reducing data center demand growth.',
    Severe:   'Severe AI capex pullback. Material hyperscaler CapEx retrenchment; GPU data center demand outlook may compress by 30–50%.',
  };
  const exportDescriptions = {
    Low:    'Export control exposure assessed as contained. Current restrictions do not materially alter near-term revenue assumptions.',
    Medium: 'Moderate export control risk. Potential revenue headwind of 5–15% on affected segments if restrictions tighten.',
    High:   'Elevated export control risk. Severe restrictions could reduce addressable market by 20–35% for relevant hardware segments.',
  };

  const scenarioCaseText = scenario === 'bear' ? 'Bear Case' : scenario === 'bull' ? 'Bull Case' : scenario === 'custom' ? 'Custom' : 'Base Case';

  const scenario_summary =
    `${scenarioCaseText} scenario. ${capexDescriptions[capexShock] || ''} ${exportDescriptions[exportControl] || ''}`.trim();

  const valuation_impact = adjFV != null
    ? `Under selected assumptions (discount rate shock +${discountBps}bps, FCF haircut ${fcfHaircutPct}%), DCF fair value estimate adjusts to approximately $${adjFV.toFixed(2)} (${totalImpact >= 0 ? '+' : ''}${totalImpact.toFixed(1)}% vs base of $${baseFV.toFixed(2)}). Entry reference${entryStillValid === true ? ' remains valid' : entryStillValid === false ? ' may be compromised — reassess before escalating' : ' validity unconfirmed'} under adjusted assumptions.`
    : `Discount rate shock +${discountBps}bps, FCF haircut ${fcfHaircutPct}% applied. Recalculate DCF fair value with adjusted assumptions before confirming entry reference validity.`;

  const portfolio_impact = stressedNotional != null
    ? `At ${positionStress}x position stress (${stressedShares?.toLocaleString()} shares), illustrative notional becomes $${stressedNotional.toLocaleString('en-US', { maximumFractionDigits: 0 })}${baselineText}.${mos != null ? ` MoS of ${mos}% provides buffer, but entry reference should be reassessed against adjusted DCF under ${scenarioCaseText.toLowerCase()}.` : ''}`
    : `Position stress ${positionStress}x applied to proposed sizing. Re-evaluate entry reference if valuation impact is material.`;

  const risk_team_judgment = scenario === 'bear' || (exportControl === 'High') || (capexShock === 'Severe')
    ? `${scenarioCaseText} warrants additional scrutiny before escalation. ${entryStillValid === false ? 'Adjusted DCF falls below entry reference — entry assumptions should be revised. ' : ''}Recommend size reduction or additional PM pre-approval condition.`
    : scenario === 'bull'
    ? `${scenarioCaseText}: upside assumptions hold. Proposed entry reference and sizing remain within reasonable parameters under current assumptions. Standard controls apply.`
    : `${scenarioCaseText}: assumptions broadly consistent with packet inputs. Standard controls apply. Monitor flagged risk factors.`;

  const risk_controls = [
    discountBps > 0 ? `DCF sensitivity confirmed at discount rate +${discountBps}bps` : null,
    fcfHaircutPct < 0 ? `FCF haircut scenario documented (${fcfHaircutPct}%)` : null,
    exportControl !== 'Low' ? `Export control risk monitoring active (${exportControl} severity)` : null,
    capexShock !== 'Mild' ? `Hyperscaler CapEx risk flagged (${capexShock} scenario)` : null,
    stressX > 1.0 ? `Position size stress check at ${positionStress}x proposed shares` : null,
    'PM review required before any action',
    'Human override required at all steps',
    'No trade execution — proposal only',
  ].filter(Boolean);

  return { scenario_summary, valuation_impact, portfolio_impact, risk_team_judgment, risk_controls, source: 'frontend_deterministic' };
}

// ── Impact chain computation (Section B — always local) ───────────────────────
function computeImpactChain(settings, proposal, valBasis) {
  const { scenario, capexShock, exportControl, discountShock, fcfHaircut, positionStress } = settings;
  const discountBps   = parseInt(discountShock) || 0;
  const fcfHaircutPct = parseInt(fcfHaircut) || 0;
  const stressX       = parseFloat(positionStress) || 1.0;
  const baseFV        = valBasis?.dcfFairValue;
  const entryRef      = proposal?.referenceEntry ? parseFloat(proposal.referenceEntry) : null;
  const shares        = proposal?.proposedShares  ? parseFloat(proposal.proposedShares)  : null;
  const adj           = computeDcfAdjustment(baseFV, discountBps, fcfHaircutPct, scenario);

  const shockLevel = capexShock === 'Severe' || exportControl === 'High' ? 'High' : capexShock === 'Moderate' || exportControl === 'Medium' ? 'Moderate' : 'Low';
  const shockColor = shockLevel === 'High' ? 'text-red-700 bg-red-50 border-red-200' : shockLevel === 'Moderate' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200';

  const fcfColor = fcfHaircutPct < -10 ? 'text-red-700 bg-red-50 border-red-200' : fcfHaircutPct < 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-gray-600 bg-gray-50 border-gray-200';
  const dcfColor = (adj?.totalImpactPct ?? 0) < -10 ? 'text-red-700 bg-red-50 border-red-200' : (adj?.totalImpactPct ?? 0) < 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-gray-600 bg-gray-50 border-gray-200';
  const entryValid = adj?.adjustedFV != null && entryRef != null ? adj.adjustedFV > entryRef : null;
  const entryColor = entryValid === false ? 'text-red-700 bg-red-50 border-red-200' : entryValid === true ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-600 bg-gray-50 border-gray-200';

  const stressedShares   = shares != null ? Math.round(shares * stressX) : null;
  const stressedNotional = stressedShares != null && entryRef != null ? stressedShares * entryRef : null;
  const notionalColor    = stressX > 1.5 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-gray-600 bg-gray-50 border-gray-200';

  return [
    {
      label: 'Market / Policy Shock',
      value: `${scenario === 'bear' ? 'Bear' : scenario === 'bull' ? 'Bull' : scenario === 'custom' ? 'Custom' : 'Base'} · Capex: ${capexShock} · Export: ${exportControl}`,
      color: shockColor,
    },
    {
      label: 'Business Driver Impact',
      value: shockLevel === 'High' ? 'Material revenue / margin headwind expected' : shockLevel === 'Moderate' ? 'Moderate demand / margin pressure' : 'Limited near-term impact on business drivers',
      color: shockColor,
    },
    {
      label: 'FCF / Margin Impact',
      value: fcfHaircutPct < 0 ? `FCF haircut ${fcfHaircutPct}% — reduced free cash flow projection` : 'No FCF haircut applied',
      color: fcfColor,
    },
    {
      label: 'DCF Fair Value Impact',
      value: adj?.adjustedFV != null
        ? `$${adj.adjustedFV.toFixed(2)} (${(adj.totalImpactPct >= 0 ? '+' : '')}${adj.totalImpactPct.toFixed(1)}% vs $${baseFV?.toFixed(2) ?? '—'})`
        : discountBps > 0 || fcfHaircutPct < 0 ? `+${discountBps}bps discount, ${fcfHaircutPct}% FCF — recalculate DCF` : 'No adjustment',
      color: dcfColor,
    },
    {
      label: 'Entry Reference Validity',
      value: entryValid === true ? `Valid — adjusted DCF $${adj.adjustedFV.toFixed(2)} above entry ref $${entryRef.toFixed(2)}`
        : entryValid === false ? `Compromised — adjusted DCF $${adj.adjustedFV.toFixed(2)} below entry ref $${entryRef.toFixed(2)}`
        : entryRef != null ? `Entry ref $${entryRef.toFixed(2)} · No DCF adjustment computed`
        : 'Entry reference not available',
      color: entryColor,
    },
    {
      label: 'Position / Notional Risk',
      value: stressedNotional != null
        ? `${stressX}x stress · ${stressedShares?.toLocaleString()} shares · $${stressedNotional.toLocaleString('en-US', { maximumFractionDigits: 0 })} notional`
        : `${stressX}x position stress · shares or entry ref not set`,
      color: notionalColor,
    },
    {
      label: 'Risk Team Judgment',
      value: shockLevel === 'High' || entryValid === false
        ? 'Recommend: reduce sizing or require additional controls'
        : shockLevel === 'Moderate'
        ? 'Recommend: proceed with enhanced monitoring'
        : 'Standard controls apply — proceed to PM review',
      color: shockLevel === 'High' || entryValid === false
        ? 'text-red-700 bg-red-50 border-red-200'
        : shockLevel === 'Moderate'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
  ];
}

// ── Risk / Reward judgment options ────────────────────────────────────────────
const JUDGMENT_OPTIONS = [
  { value: 'proceed_with_controls', label: 'Proceed to PM review with controls' },
  { value: 'reduce_sizing',         label: 'Reduce proposed sizing' },
  { value: 'require_review',        label: 'Require additional review' },
  { value: 'block_escalation',      label: 'Block escalation' },
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

// ── Output source badge label ─────────────────────────────────────────────────
function outputSourceLabel(scenarioOutput, outputSource) {
  if (!outputSource) return null;
  if (outputSource === 'frontend_deterministic') return { text: 'Deterministic draft', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  // Use truthy checks — backend may return llm_used as boolean, 1, or "true"
  if (scenarioOutput?.llm_used && !scenarioOutput?.fallback_used) return { text: 'LLM-assisted scenario analysis', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (scenarioOutput?.fallback_used) return { text: 'Deterministic fallback', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { text: 'Backend scenario analysis', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
}

function SimulationContent() {
  const searchParams = useSearchParams();
  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();
  const tickers = packet ? Object.keys(packet.recommendations || {}) : ['NVDA', 'KO'];
  const [selectedTicker, setSelectedTicker] = useState(searchParams.get('ticker') || 'NVDA');

  // Scenario settings — risk-oriented defaults
  const [scenario,       setScenario]       = useState('bear');
  const [capexShock,     setCapexShock]     = useState('Moderate');
  const [exportControl,  setExportControl]  = useState('Medium');
  const [discountShock,  setDiscountShock]  = useState('100');
  const [fcfHaircut,     setFcfHaircut]     = useState('-10');
  const [positionStress, setPositionStress] = useState('1.0');
  const [judgment,       setJudgment]       = useState('proceed_with_controls');

  // Loaded data
  const [proposal,  setProposal]  = useState(null);
  const [step1,     setStep1]     = useState(null);
  const [loaded,    setLoaded]    = useState(false);

  // Output state
  const [scenarioOutput,   setScenarioOutput]   = useState(null);
  const [generating,       setGenerating]       = useState(false);
  const [savedAt,          setSavedAt]          = useState(null);
  const [outputSource,     setOutputSource]     = useState(null);
  const [backendError,     setBackendError]     = useState(null);
  const [scenarioMismatch, setScenarioMismatch] = useState(false);
  const [freshAnalysis,    setFreshAnalysis]    = useState(false); // true only for newest LLM backend response

  useEffect(() => {
    setLoaded(false);
    const load = k => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
    setProposal(load(`bridgewater_senior_action_proposal_${selectedTicker}`));
    setStep1(load(`bridgewater_senior_valuation_review_${selectedTicker}`));

    const prev = load(scenarioKey(selectedTicker));
    if (prev) {
      if (prev.scenario_summary || prev.risk_team_judgment) {
        // Normalize scenario_settings on load so stored objects/mixed types can't cause errors
        const canonical = canonicalizeLoadedSettings(prev.scenario_settings);
        const normalizedPrev = canonical
          ? { ...prev, scenario_settings: canonical }
          : prev;
        setScenarioOutput(normalizedPrev);
        setOutputSource(prev.source ?? 'frontend_deterministic');
        setSavedAt(prev.savedAt);
        if (canonical) {
          setScenario(canonical.scenario);
          setCapexShock(canonical.capexShock);
          setExportControl(canonical.exportControl);
          setDiscountShock(canonical.discountShock);
          setFcfHaircut(canonical.fcfHaircut);
          setPositionStress(canonical.positionStress);
          setJudgment(canonical.judgment);
        }
      } else if (prev.output) {
        // Legacy structure — migrate on the fly
        const out = prev.output;
        const migrated = {
          scenario_summary:      out.scenarioSummary,
          valuation_impact:      out.valuationImpact,
          portfolio_impact:      out.proposalImpact,
          risk_team_judgment:    out.riskJudgment,
          risk_controls:         out.requiredControls,
          source:                out.source,
          llm_used:              out.llmUsed ?? null,
          fallback_used:         out.fallbackUsed ?? false,
          human_review_required: out.humanReviewRequired ?? true,
        };
        const canonical = canonicalizeLoadedSettings(prev.settings);
        if (canonical) migrated.scenario_settings = canonical;
        setScenarioOutput(migrated);
        setOutputSource(out.source ?? 'frontend_deterministic');
        setSavedAt(prev.savedAt);
        if (canonical) {
          setScenario(canonical.scenario);
          setCapexShock(canonical.capexShock);
          setExportControl(canonical.exportControl);
          setDiscountShock(canonical.discountShock);
          setFcfHaircut(canonical.fcfHaircut);
          setPositionStress(canonical.positionStress);
          setJudgment(canonical.judgment);
        }
      }
    }
    setLoaded(true);
  }, [selectedTicker]);

  const theme = getTheme(selectedTicker);
  const theses = packet?.company_theses ?? {};
  const companyName = theses[selectedTicker]?.company_name ?? selectedTicker;

  // Valuation basis from packet
  const dcfData      = packet?.dcf_valuations?.valuations?.[selectedTicker] ?? null;
  const entryData    = packet?.entry_price_models?.entry_prices?.[selectedTicker] ?? null;
  const normalized   = normalizeEntryPrice(entryData);
  const dcfFairValue = normalized.fairValue ?? dcfData?.implied_share_price ?? null;
  const packetMoS    = normalizePctToInt(normalized.mos);
  const valBasis     = { dcfFairValue, packetMoS };

  const currentSettings = { scenario, capexShock, exportControl, discountShock, fcfHaircut, positionStress, judgment };
  const chainSteps      = computeImpactChain(currentSettings, proposal, valBasis);
  const isOutputStale   = scenarioOutput != null && !settingsMatch(currentSettings, scenarioOutput);

  function persistOutput(output) {
    const ts = new Date().toISOString();
    const payload = {
      ticker:     selectedTicker,
      source:     output.source,
      selected_scenario:     output.selected_scenario ?? scenario,
      scenario_summary:      output.scenario_summary,
      impact_chain:          output.impact_chain ?? null,
      valuation_impact:      output.valuation_impact,
      portfolio_impact:      output.portfolio_impact,
      risk_team_judgment:    output.risk_team_judgment,
      risk_controls:         output.risk_controls,
      questions_for_pm:       output.questions_for_pm ?? null,
      pm_handoff_summary:     output.pm_handoff_summary ?? null,
      historical_risk_pattern: output.historical_risk_pattern ?? null,
      llm_used:               output.llm_used ?? null,
      fallback_used:         output.fallback_used ?? false,
      human_review_required: output.human_review_required ?? true,
      scenario_settings:     currentSettings,
      proposalSnapshot: proposal ? {
        stance:               proposal.stance,
        referenceEntry:       proposal.referenceEntry,
        proposedShares:       proposal.proposedShares,
        illustrativeNotional: proposal.illustrativeNotional,
        marginOfSafety:       proposal.marginOfSafety,
        timeHorizon:          proposal.timeHorizon,
      } : null,
      valBasis,
      savedAt: ts,
    };
    try {
      localStorage.setItem(scenarioKey(selectedTicker), JSON.stringify(payload));
      setSavedAt(ts);
    } catch { /* ignore */ }
  }

  async function handleRunAnalysis() {
    setGenerating(true);
    setFreshAnalysis(false);
    setScenarioOutput(null);
    setBackendError(null);
    setScenarioMismatch(false);

    const fallback = buildScenarioDraft(selectedTicker, proposal, valBasis, currentSettings);
    const backendSettings = buildBackendScenarioSettings(currentSettings);

    let backendSucceeded = false;
    let errorReason = null;

    // Sanitize proposal to plain fields before serializing — avoids any circular ref
    const safeProposal = proposal ? {
      ticker:               proposal.ticker,
      stance:               proposal.stance,
      referenceEntry:       proposal.referenceEntry,
      proposedShares:       proposal.proposedShares,
      illustrativeNotional: proposal.illustrativeNotional,
      marginOfSafety:       proposal.marginOfSafety,
      dcfFairValueEstimate: proposal.dcfFairValueEstimate,
      timeHorizon:          proposal.timeHorizon,
      rationale:            proposal.rationale,
      readyForRiskHandoff:  proposal.readyForRiskHandoff,
    } : null;

    let requestBody;
    try {
      requestBody = JSON.stringify({
        mode: 'risk_scenario_analysis',
        ticker: selectedTicker,
        company: companyName,
        question: 'Run Risk Team scenario analysis for the selected scenario controls.',
        senior_proposal: safeProposal,
        valuation_basis: valBasis,
        risk_factors: ['export_control', 'hyperscaler_capex', 'supply_chain', 'dcf_sensitivity'],
        scenario_settings: backendSettings,
      });
    } catch (serErr) {
      errorReason = `Request serialization failed: ${serErr?.message ?? String(serErr)} — using deterministic draft.`;
      console.error('[risk_scenario_analysis] JSON.stringify error:', serErr);
    }

    if (requestBody) {
      try {
        const res = await fetch('/api/backend/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

        if (res.ok) {
          const data = await res.json();
          const hasTopLevelFields = !!(data.scenario_summary || data.valuation_impact || data.portfolio_impact || data.risk_team_judgment || data.impact_chain);
          const hasLegacyContent  = !!(data.content && !data.error);

          if ((hasTopLevelFields || hasLegacyContent) && !data.error) {
            // Detect scenario mismatch — use normalizeScenario so any type is safe
            const returnedScenario = normalizeScenario(data.selected_scenario ?? scenario);
            const mismatch = returnedScenario && returnedScenario !== normalizeScenario(scenario);
            if (mismatch) setScenarioMismatch(true);

            const output = {
              selected_scenario:       normalizeScenario(data.selected_scenario ?? scenario),
              scenario_summary:        sanitizeOutputText(data.scenario_summary ?? data.content, fallback.scenario_summary),
              impact_chain:            data.impact_chain ?? null,
              valuation_impact:        sanitizeOutputText(data.valuation_impact, fallback.valuation_impact),
              portfolio_impact:        sanitizeOutputText(data.portfolio_impact, fallback.portfolio_impact),
              risk_team_judgment:      sanitizeOutputText(data.risk_team_judgment, fallback.risk_team_judgment),
              risk_controls:           Array.isArray(data.risk_controls) ? data.risk_controls : fallback.risk_controls,
              questions_for_pm:        data.questions_for_pm ?? null,
              pm_handoff_summary:      data.pm_handoff_summary ?? null,
              historical_risk_pattern: data.historical_risk_pattern ?? null,
              llm_used:                data.llm_used              ?? null,
              fallback_used:           data.fallback_used         ?? false,
              human_review_required:   data.human_review_required ?? true,
              source: 'backend',
            };
            setScenarioOutput(output);
            setOutputSource('backend');
            persistOutput(output);
            setBackendError(null);
            setScenarioMismatch(false);
            // Animate only real LLM output, not fallbacks
            if (output.llm_used && !output.fallback_used) setFreshAnalysis(true);
            setGenerating(false);
            backendSucceeded = true;
            return;
          }
          errorReason = data.error
            ? `Backend error: ${data.error}`
            : 'Backend returned no recognizable scenario fields — using deterministic draft.';
        } else {
          let bodyText = '';
          try { bodyText = await res.text(); } catch { /* ignore */ }
          const detail = bodyText ? ` — ${bodyText.slice(0, 300)}` : '';
          errorReason = `Backend returned HTTP ${res.status}${detail}`;
          console.error('[risk_scenario_analysis] non-OK response:', res.status, bodyText);
        }
      } catch (fetchErr) {
        const msg = fetchErr?.message ?? String(fetchErr);
        console.error('[risk_scenario_analysis] fetch error:', msg);
        errorReason = `Fetch failed: ${msg}`;
      }
    }

    if (!backendSucceeded) {
      setBackendError(errorReason);
      setScenarioOutput(fallback);
      setOutputSource('frontend_deterministic');
      persistOutput(fallback);
    }
    setGenerating(false);
  }

  function handleSave() {
    if (scenarioOutput) persistOutput(scenarioOutput);
  }

  function handleClearScenario() {
    try { localStorage.removeItem(scenarioKey(selectedTicker)); } catch { /* ignore */ }
    setScenarioOutput(null);
    setOutputSource(null);
    setSavedAt(null);
    setBackendError(null);
    setScenarioMismatch(false);
  }

  const handQ = new URLSearchParams({ ticker: selectedTicker }).toString();
  const srcBadge = outputSourceLabel(scenarioOutput, outputSource);

  return (
    <>
      <WorkflowNav role="Risk Team" subtitle="Scenario analysis and PM escalation review" />
      <RiskTeamStepper activeStep={2} ticker={selectedTicker} />
      {isStaticFallback && <StaticFallbackBanner />}

      <div className="max-w-4xl mx-auto px-8 pt-6 pb-3">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Scenario Analysis</h1>
        <p className="text-sm text-gray-500">
          Test the Senior proposal under stress scenarios. All analysis is local and illustrative — not official risk numbers.
        </p>
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
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-8 pb-24 space-y-5">

          {/* Proposal reference bar */}
          {proposal?.stance && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Senior proposal</span>
              <span className="text-xs font-bold text-gray-900">{stanceLabel(proposal.stance)}</span>
              {proposal.referenceEntry && <span className="text-xs text-gray-600">Entry ref: <strong>${parseFloat(proposal.referenceEntry).toFixed(2)}</strong></span>}
              {proposal.proposedShares && <span className="text-xs text-gray-600">Shares: <strong>{parseInt(proposal.proposedShares).toLocaleString()}</strong></span>}
              {proposal.illustrativeNotional && <span className="text-xs text-gray-600">Notional: <strong>${parseInt(proposal.illustrativeNotional).toLocaleString()}</strong></span>}
              <span className="text-[9px] text-amber-600 font-medium ml-auto">Proposal only · not execution</span>
            </div>
          )}

          {/* A. Scenario Control Center */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className={`${theme.headerBg} border-b ${theme.headerBorder} px-5 py-3.5 flex items-center gap-2`}>
              <p className={ST}>A. Scenario Control Center</p>
              <span className="ml-auto px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600 border border-slate-200">
                Local simulation · not official risk
              </span>
            </div>
            <div className="px-5 py-5 space-y-5">

              {/* Scenario */}
              <div>
                <p className={`${LST} mb-2`}>Scenario</p>
                <div className="flex flex-wrap gap-2">
                  {[['bear','Bear'],['base','Base'],['bull','Bull'],['custom','Custom']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setScenario(val)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                        scenario === val
                          ? val === 'bear' ? 'bg-red-700 text-white border-red-700'
                          : val === 'bull' ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* AI Capex Shock */}
                <div>
                  <p className={`${LST} mb-2`}>AI Capex Shock</p>
                  <div className="flex gap-1.5">
                    {['Mild','Moderate','Severe'].map(v => (
                      <button key={v} onClick={() => setCapexShock(v)}
                        className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition-colors ${
                          capexShock === v
                            ? v === 'Severe' ? 'bg-red-700 text-white border-red-700' : v === 'Moderate' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-600 text-white border-slate-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export Control Severity */}
                <div>
                  <p className={`${LST} mb-2`}>Export Control Severity</p>
                  <div className="flex gap-1.5">
                    {['Low','Medium','High'].map(v => (
                      <button key={v} onClick={() => setExportControl(v)}
                        className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition-colors ${
                          exportControl === v
                            ? v === 'High' ? 'bg-red-700 text-white border-red-700' : v === 'Medium' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-600 text-white border-slate-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discount Rate Shock */}
                <div>
                  <p className={`${LST} mb-2`}>Discount Rate Shock</p>
                  <div className="flex gap-1.5">
                    {[['0','0 bps'],['100','+100 bps'],['200','+200 bps']].map(([val, lbl]) => (
                      <button key={val} onClick={() => setDiscountShock(val)}
                        className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition-colors ${
                          discountShock === val ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                        }`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FCF Haircut */}
                <div>
                  <p className={`${LST} mb-2`}>FCF Haircut</p>
                  <div className="flex gap-1.5">
                    {[['0','0%'],['-10','-10%'],['-20','-20%']].map(([val, lbl]) => (
                      <button key={val} onClick={() => setFcfHaircut(val)}
                        className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition-colors ${
                          fcfHaircut === val
                            ? val === '-20' ? 'bg-red-700 text-white border-red-700' : val === '-10' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-600 text-white border-slate-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                        }`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Position Size Stress */}
              <div>
                <p className={`${LST} mb-2`}>Position Size Stress</p>
                <div className="flex gap-2 flex-wrap">
                  {[['1.0','1.0× proposed'],['1.5','1.5× proposed'],['2.0','2.0× proposed']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setPositionStress(val)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                        positionStress === val ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {proposal?.proposedShares && (
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Base: {parseInt(proposal.proposedShares).toLocaleString()} shares →
                    stress: {Math.round(parseFloat(proposal.proposedShares) * parseFloat(positionStress)).toLocaleString()} shares
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* B. Impact Chain */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3.5">
              <p className={ST}>B. Impact Chain</p>
              <p className="text-xs text-gray-400 mt-0.5">Live — updates as you adjust scenario controls above.</p>
            </div>
            <div className="px-5 py-5">
              <div className="space-y-0">
                {chainSteps.map((step, i) => (
                  <div key={step.label}>
                    <div className={`flex items-start gap-3 p-3 rounded-lg border ${step.color}`}>
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white border-2 border-current flex items-center justify-center mt-px">
                        <span className="text-[9px] font-black">{i + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-0.5">{step.label}</p>
                        <p className="text-xs font-semibold leading-snug">{step.value}</p>
                      </div>
                    </div>
                    {i < chainSteps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <div className="w-0.5 h-4 bg-gray-200" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* C. Scenario Output */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3.5 flex items-center gap-2 flex-wrap">
              <p className={ST}>C. Scenario Output</p>
              {srcBadge && !isOutputStale && (
                <span className={`px-2 py-0.5 text-[9px] font-bold rounded border ${srcBadge.cls}`}>
                  {srcBadge.text}
                </span>
              )}
              {isOutputStale && (
                <span className="px-2 py-0.5 text-[9px] font-bold rounded border bg-amber-50 text-amber-700 border-amber-200">
                  Settings changed · rerun required
                </span>
              )}
              {scenarioOutput?.llm_used != null && !isOutputStale && (
                <span className="px-2 py-0.5 text-[9px] font-medium rounded border bg-gray-50 text-gray-500 border-gray-200">
                  LLM: {String(scenarioOutput.llm_used)}
                </span>
              )}
              {scenarioOutput?.human_review_required && !isOutputStale && (
                <span className="px-2 py-0.5 text-[9px] font-bold rounded border bg-amber-50 text-amber-700 border-amber-200">
                  Human review required
                </span>
              )}
              {savedAt && <span className="text-[9px] text-gray-400 ml-auto">Saved {new Date(savedAt).toLocaleTimeString()}</span>}
            </div>
            {/* Analyzed settings bar — shows what controls produced the saved output */}
            {scenarioOutput && (() => {
              const label = formatAnalyzedSettings(scenarioOutput.scenario_settings ?? scenarioOutput.settings);
              return label ? (
                <div className={`px-5 py-2 border-b text-[10px] font-medium ${isOutputStale ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                  {isOutputStale ? 'Last analyzed: ' : 'Scenario analyzed: '}{label}
                </div>
              ) : null;
            })()}
            <div className="px-5 py-5 space-y-4">

              {/* Visible fallback / error state */}
              {backendError && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-xs font-bold flex-shrink-0 mt-px">→</span>
                  <p className="text-xs text-slate-700 leading-relaxed">{backendError}</p>
                </div>
              )}

              {/* Scenario mismatch warning */}
              {scenarioMismatch && !generating && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <span className="text-red-600 text-xs font-bold flex-shrink-0 mt-px">!</span>
                  <p className="text-xs text-red-800">Backend scenario mismatch — rerun required. The backend may have normalized the scenario differently. Current output may not reflect the selected controls.</p>
                </div>
              )}

              {!scenarioOutput && !generating && (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500 mb-4">Configure scenario controls above, then run analysis to generate output.</p>
                  <button onClick={handleRunAnalysis}
                    className="px-6 py-3 bg-gray-900 text-white rounded-lg font-bold text-sm hover:bg-gray-800 transition-colors">
                    Run Scenario Analysis
                  </button>
                </div>
              )}

              {generating && (
                <div className="flex items-center gap-3 py-6 justify-center">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  <p className="text-sm text-gray-600">Running scenario analysis — attempting backend mode risk_scenario_analysis…</p>
                </div>
              )}

              {scenarioOutput && !generating && (
                <div className="space-y-4">
                  {/* Stale output notice */}
                  {isOutputStale && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <span className="text-amber-600 text-xs font-bold flex-shrink-0 mt-px">!</span>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        <strong>Scenario controls have changed.</strong> The output below was generated with different settings. Click <em>Rerun with Current Settings</em> to generate a fresh analysis.
                      </p>
                    </div>
                  )}

                  {/* fallback_used notice from backend */}
                  {scenarioOutput.fallback_used && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <span className="text-amber-600 text-xs font-bold flex-shrink-0 mt-px">!</span>
                      <p className="text-xs text-amber-800">Backend returned a fallback response — content may be less specific than a full LLM analysis.</p>
                    </div>
                  )}

                  {/* Scenario Summary */}
                  {sanitizeOutputText(scenarioOutput.scenario_summary) && (
                    <div>
                      <p className={`${LST} mb-1`}>Scenario Summary</p>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3">
                        <StreamingText text={sanitizeOutputText(scenarioOutput.scenario_summary)} active={freshAnalysis} speedMs={95} />
                      </p>
                    </div>
                  )}

                  {/* Backend Impact Chain — shown when backend provides it */}
                  {scenarioOutput.impact_chain && renderImpactChainItems(scenarioOutput.impact_chain).length > 0 && (
                    <div>
                      <p className={`${LST} mb-2`}>Impact Chain</p>
                      <div className="space-y-0">
                        {renderImpactChainItems(scenarioOutput.impact_chain).map((item, i, arr) => (
                          <div key={i}>
                            <div className="flex items-start gap-3 p-3 rounded-lg border bg-slate-50 border-slate-200 text-slate-700">
                              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white border-2 border-slate-400 flex items-center justify-center mt-px">
                                <span className="text-[9px] font-black text-slate-600">{i + 1}</span>
                              </div>
                              <p className="text-xs leading-relaxed">{item}</p>
                            </div>
                            {i < arr.length - 1 && (
                              <div className="flex justify-center py-1">
                                <div className="w-0.5 h-4 bg-gray-200" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Valuation Impact */}
                  {sanitizeOutputText(scenarioOutput.valuation_impact) && (
                    <div>
                      <p className={`${LST} mb-1`}>Valuation Impact</p>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3">
                        <StreamingText text={sanitizeOutputText(scenarioOutput.valuation_impact)} active={freshAnalysis} speedMs={95} />
                      </p>
                    </div>
                  )}

                  {/* Portfolio / Proposal Impact */}
                  {sanitizeOutputText(scenarioOutput.portfolio_impact) && (
                    <div>
                      <p className={`${LST} mb-1`}>Portfolio / Proposal Impact</p>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3">
                        <StreamingText text={sanitizeOutputText(scenarioOutput.portfolio_impact)} active={freshAnalysis} speedMs={95} />
                      </p>
                    </div>
                  )}

                  {/* Risk Team Judgment */}
                  {sanitizeOutputText(scenarioOutput.risk_team_judgment) && (
                    <div>
                      <p className={`${LST} mb-1`}>Risk Team Judgment</p>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3">
                        <StreamingText text={sanitizeOutputText(scenarioOutput.risk_team_judgment)} active={freshAnalysis} speedMs={95} />
                      </p>
                    </div>
                  )}

                  {/* Required Controls */}
                  {Array.isArray(scenarioOutput.risk_controls) && scenarioOutput.risk_controls.length > 0 && (
                    <div>
                      <p className={`${LST} mb-2`}>Required Controls</p>
                      <ul className="space-y-1.5">
                        {scenarioOutput.risk_controls.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Historical risk pattern — shown when backend provides it */}
                  {sanitizeOutputText(scenarioOutput.historical_risk_pattern) && (
                    <div>
                      <p className={`${LST} mb-1`}>Historical Risk Pattern</p>
                      <p className="text-sm text-gray-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3 whitespace-pre-line">
                        {sanitizeOutputText(scenarioOutput.historical_risk_pattern)}
                      </p>
                    </div>
                  )}

                  {/* Questions for PM (from backend) */}
                  {sanitizeOutputText(scenarioOutput.questions_for_pm) && (
                    <div>
                      <p className={`${LST} mb-1`}>Questions for PM</p>
                      <p className="text-sm text-gray-700 leading-relaxed bg-blue-50 border border-blue-100 rounded-lg px-3.5 py-3 whitespace-pre-line">
                        {sanitizeOutputText(scenarioOutput.questions_for_pm)}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button onClick={handleRunAnalysis}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                        isOutputStale
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}>
                      Rerun with Current Settings
                    </button>
                    <button onClick={handleSave}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-50 transition-colors">
                      Save Analysis
                    </button>
                  </div>
                </div>
              )}
              <p className="text-[9px] text-gray-300">Scenario analysis only · not official risk numbers · no trade execution</p>
            </div>
          </section>

          {/* D. Risk / Reward Summary */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3.5">
              <p className={ST}>D. Risk / Reward Summary</p>
              <p className="text-xs text-gray-400 mt-0.5">Risk Team judgment for escalation. Select the appropriate recommendation.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {JUDGMENT_OPTIONS.map(({ value, label }) => (
                  <button key={value} onClick={() => setJudgment(value)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                      judgment === value
                        ? value === 'block_escalation' ? 'bg-red-700 text-white border-red-700'
                        : value === 'require_review' ? 'bg-amber-600 text-white border-amber-600'
                        : value === 'reduce_sizing' ? 'bg-slate-600 text-white border-slate-600'
                        : 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400">
                This is the Risk Team&apos;s recommendation for PM review — not a trade instruction or official approval.
              </p>
            </div>
          </section>

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link href={`/risk-team?${handQ}`}
              className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm">
              ← Risk Intake
            </Link>
            <Link href={`/risk-team/handoff?${handQ}`}
              className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm">
              Continue to PM Handoff →
            </Link>
          </div>
          <div className="flex justify-center">
            <button onClick={handleClearScenario}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2">
              Clear saved scenario for {selectedTicker}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center">
            Scenario analysis saved locally. PM Handoff will read the saved scenario output.
          </p>
        </div>
      )}
    </>
  );
}

export default function SimulationPage() {
  return (
    <Suspense>
      <SimulationContent />
    </Suspense>
  );
}
