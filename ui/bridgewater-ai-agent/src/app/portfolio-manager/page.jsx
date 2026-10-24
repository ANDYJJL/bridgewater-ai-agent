'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';

// ── Style constants ──────────────────────────────────────────────────────────
const ST  = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';
const LST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';

// ── Helpers ──────────────────────────────────────────────────────────────────
function humanizeLabel(str) {
  if (!str) return 'N/A';
  return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function pct(v) { return v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`; }
function safeText(val) {
  if (typeof val !== 'string') return val == null ? '' : String(val);
  return val;
}
function actionLbl(v) {
  const map = {
    hold_review: 'Hold for review', accumulate: 'Accumulate', reduce: 'Reduce',
    hold: 'Hold', avoid: 'Avoid', review: 'Review', review_only: 'Review only',
    no_action: 'No action', buy: 'Buy', sell: 'Sell', increase: 'Increase',
    approved_with_controls: 'Approved with controls',
    deferred: 'Deferred pending evidence',
    reduced_size: 'Reduced size — approved for review',
    rejected: 'Rejected',
  };
  return map[v] ?? humanizeLabel(v);
}
function bucketGroup(bucket) {
  if (!bucket) return 'Other';
  const b = bucket.toLowerCase();
  if (b.includes('tech')) return 'Technology';
  if (b.includes('defensive') || b.includes('consumer') || b.includes('staple')) return 'Defensive';
  if (b.includes('cash') || b.includes('money')) return 'Cash';
  return 'Other';
}
const BUCKET_COLORS = { Technology: '#334155', Defensive: '#10b981', Cash: '#94a3b8', Other: '#cbd5e1' };
const SCENARIO_LABELS = {
  ai_capex_pullback:              'AI capex pullback',
  export_control_tightening:      'Export control tightening',
  rates_higher_for_longer:        'Rates higher for longer',
  recession_consumer_slowdown:    'Recession / consumer slowdown',
  valuation_multiple_compression: 'Valuation multiple compression',
};
function decisionDisplayLabel(decision) {
  if (!decision) return 'Pending PM defense';
  const d = decision.toLowerCase();
  if (d === 'approved_with_controls') return 'Approved with controls';
  if (d === 'approved') return 'Approved locally';
  if (d === 'deferred') return 'Deferred pending evidence';
  if (d === 'reduced_size') return 'Reduced size — approved for review';
  if (d === 'rejected') return 'Rejected';
  return humanizeLabel(decision);
}
function decisionBadgeClass(decision) {
  if (!decision) return 'bg-gray-100 text-gray-500 border-gray-200';
  const d = decision.toLowerCase();
  if (d.includes('approv') || d === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (d.includes('defer')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (d.includes('reject')) return 'bg-red-50 text-red-700 border-red-200';
  if (d.includes('reduc')) return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}
function agentStyle(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('growth') || r.includes('aggressive'))
    return { header: 'bg-blue-50 border-blue-200', title: 'text-blue-900', tag: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (r.includes('risk') || r.includes('conservative'))
    return { header: 'bg-rose-50 border-rose-200', title: 'text-rose-900', tag: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (r.includes('valuation') || r.includes('skeptic'))
    return { header: 'bg-amber-50 border-amber-200', title: 'text-amber-900', tag: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (r.includes('portfolio') || r.includes('construction'))
    return { header: 'bg-teal-50 border-teal-200', title: 'text-teal-900', tag: 'bg-teal-100 text-teal-700 border-teal-200' };
  if (r.includes('policy') || r.includes('governance'))
    return { header: 'bg-violet-50 border-violet-200', title: 'text-violet-900', tag: 'bg-violet-100 text-violet-700 border-violet-200' };
  return { header: 'bg-gray-50 border-gray-200', title: 'text-gray-900', tag: 'bg-gray-100 text-gray-600 border-gray-200' };
}
function severityClass(sev) {
  const s = (sev || '').toLowerCase();
  if (s === 'high' || s === 'critical') return 'bg-red-100 text-red-700 border border-red-200';
  if (s === 'medium' || s === 'moderate') return 'bg-amber-100 text-amber-700 border border-amber-200';
  return 'bg-gray-100 text-gray-500 border border-gray-200';
}
function renderList(items, emptyText = 'None provided') {
  if (!items) return <p className="text-sm text-gray-400 italic">{emptyText}</p>;
  if (typeof items === 'string' && items.trim())
    return <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{items}</p>;
  if (Array.isArray(items) && items.length > 0) {
    return (
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-gray-400 mt-0.5 flex-shrink-0 select-none">·</span>
            <span className="leading-relaxed">{typeof item === 'string' ? item : safeText(item?.text ?? item?.content ?? JSON.stringify(item))}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm text-gray-400 italic">{emptyText}</p>;
}

// ── SVG Donut ────────────────────────────────────────────────────────────────
function polarToXY(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function slicePath(cx, cy, outerR, innerR, startDeg, endDeg) {
  const gap = 2.5, s = startDeg + gap / 2, e = endDeg - gap / 2;
  if (e <= s) return '';
  const oS = polarToXY(cx, cy, outerR, s), oE = polarToXY(cx, cy, outerR, e);
  const iS = polarToXY(cx, cy, innerR, s), iE = polarToXY(cx, cy, innerR, e);
  const la = e - s > 180 ? 1 : 0;
  return `M ${oS.x.toFixed(2)} ${oS.y.toFixed(2)} A ${outerR} ${outerR} 0 ${la} 1 ${oE.x.toFixed(2)} ${oE.y.toFixed(2)} L ${iE.x.toFixed(2)} ${iE.y.toFixed(2)} A ${innerR} ${innerR} 0 ${la} 0 ${iS.x.toFixed(2)} ${iS.y.toFixed(2)} Z`;
}
function DonutChart({ positions, centerLabel, centerSub, size = 260 }) {
  const groups = {};
  let total = 0;
  for (const p of (positions || [])) {
    const g = bucketGroup(p.bucket);
    groups[g] = (groups[g] || 0) + (p.weight || 0);
    total += (p.weight || 0);
  }
  const vb = 240, cx = vb / 2, cy = vb / 2;
  const outerR = (vb / 2) * 0.86, innerR = (vb / 2) * 0.58;
  if (!positions || positions.length === 0 || total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <div className="rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"
          style={{ width: size * 0.6, height: size * 0.6 }}>
          <p className="text-xs text-gray-400 text-center px-4">No position data</p>
        </div>
      </div>
    );
  }
  const slices = [];
  let angle = 0;
  for (const [name, weight] of Object.entries(groups)) {
    if (weight <= 0) continue;
    const sweep = (weight / total) * 360;
    slices.push({ name, weight, startAngle: angle, endAngle: angle + sweep, color: BUCKET_COLORS[name] || BUCKET_COLORS.Other });
    angle += sweep;
  }
  const fs = Math.round(vb * 0.052), fsSub = Math.round(vb * 0.038);
  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}>
        {slices.map((s, i) => <path key={i} d={slicePath(cx, cy, outerR, innerR, s.startAngle, s.endAngle)} fill={s.color} />)}
        <text x={cx} y={cy - fs * 0.3} textAnchor="middle" fontSize={fs} fontWeight="700" fill="#1e293b">{centerLabel}</text>
        {centerSub && <text x={cx} y={cy + fsSub * 1.4} textAnchor="middle" fontSize={fsSub} fill="#94a3b8">{centerSub}</text>}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-gray-600 font-medium">{s.name}</span>
            <span className="text-xs text-gray-400">{pct(s.weight)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Exposure bar ─────────────────────────────────────────────────────────────
function ExposureBar({ label, before, after }) {
  const delta = after != null && before != null ? after - before : null;
  const barPct = after != null ? Math.min(after * 100, 100) : before != null ? Math.min(before * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          {before != null && <span className="text-[10px] text-gray-400">{pct(before)}</span>}
          {after  != null && <span className="text-xs font-bold text-gray-800">{pct(after)}</span>}
          {delta != null && (
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
              Math.abs(delta) < 0.001 ? 'bg-gray-100 text-gray-500'
              : delta > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(1)}pp
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-slate-600 rounded-full transition-all duration-500" style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
}

// ── Module-level localStorage helper ─────────────────────────────────────────
function loadLS(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
const debateChatKey = ticker => `bridgewater_pm_debate_chat_${ticker}`;

// ── Debate seed helpers ───────────────────────────────────────────────────────
function sortAgentsBySeverity(agents) {
  const sev = { high: 3, critical: 3, medium: 2, moderate: 2, low: 1 };
  return [...(agents || [])].sort((a, b) =>
    (sev[(b.severity || '').toLowerCase()] || 0) - (sev[(a.severity || '').toLowerCase()] || 0)
  );
}
function pickSeedContent(data) {
  if (data.strongest_objections) {
    if (Array.isArray(data.strongest_objections) && data.strongest_objections.length > 0) {
      const first = data.strongest_objections[0];
      return safeText(typeof first === 'string' ? first : first?.text ?? first?.content ?? JSON.stringify(first));
    }
    if (typeof data.strongest_objections === 'string') return data.strongest_objections;
  }
  if (data.pm_decision_prompt) return safeText(data.pm_decision_prompt);
  const sorted = sortAgentsBySeverity(data.agents);
  if (sorted[0]?.challenge) return safeText(sorted[0].challenge);
  if (sorted[0]?.pm_must_answer) return safeText(sorted[0].pm_must_answer);
  return data.debate_summary ? safeText(data.debate_summary).slice(0, 500) : 'PM debate initiated. Defend your proposed position.';
}
function pickSeedAgent(data) {
  const sorted = sortAgentsBySeverity(data.agents);
  return safeText(sorted[0]?.role ?? 'Policy / Governance Challenger');
}
function pickSeedFollowUp(data) {
  const sorted = sortAgentsBySeverity(data.agents);
  return sorted[0]?.pm_must_answer ? safeText(sorted[0].pm_must_answer) : null;
}

// ── Assessment / confidence helpers ──────────────────────────────────────────
function assessmentStyle(rating) {
  const r = (rating || '').toLowerCase();
  if (r === 'strong')    return { chip: 'bg-emerald-100 text-emerald-800 border border-emerald-200', bar: 'bg-emerald-500', label: 'Strong' };
  if (r === 'partial')   return { chip: 'bg-amber-100 text-amber-800 border border-amber-200',     bar: 'bg-amber-400',   label: 'Partial' };
  if (r === 'weak')      return { chip: 'bg-rose-100 text-rose-800 border border-rose-200',         bar: 'bg-rose-500',    label: 'Weak' };
  if (r === 'off_topic') return { chip: 'bg-red-100 text-red-800 border border-red-200',            bar: 'bg-red-500',     label: 'Off-topic' };
  return { chip: 'bg-gray-100 text-gray-700 border border-gray-200', bar: 'bg-gray-400', label: humanizeLabel(rating) };
}
function normalizeScore(score) {
  if (score == null) return null;
  const n = Number(score);
  return isNaN(n) ? null : n <= 1 ? Math.round(n * 100) : Math.round(n);
}

// Extract a numeric delta from any backend representation, e.g. "-8", -8, "-8 to decision confidence"
function normalizeConfidenceDelta(value) {
  if (value == null) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const m = String(value).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function clampConfidence(value) {
  if (value == null || isNaN(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// Extract a plain lowercase string from any assessment value the backend may send:
// string, object ({ label, rating, assessment, status, ... }), array, null, etc.
function normalizeAssessment(value) {
  if (value == null) return 'unknown';
  if (typeof value === 'string') return value.toLowerCase().trim() || 'unknown';
  if (Array.isArray(value)) {
    const first = value[0];
    return first != null ? normalizeAssessment(first) : 'unknown';
  }
  if (typeof value === 'object') {
    const pick = value.label ?? value.rating ?? value.assessment ?? value.status ?? value.category;
    if (pick != null) return normalizeAssessment(pick);
    // last resort: try to stringify and extract a known keyword
    try {
      const s = JSON.stringify(value).toLowerCase();
      if (s.includes('strong')) return 'strong';
      if (s.includes('partial')) return 'partial';
      if (s.includes('weak')) return 'weak';
    } catch { /* ignore */ }
    return 'unknown';
  }
  return String(value).toLowerCase().trim() || 'unknown';
}

// Extract display metadata from any assessment shape
function extractAssessmentMeta(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const norm = value.toLowerCase().trim();
    return norm ? { label: norm, rationale: null } : null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const label = normalizeAssessment(value);
    const rationale = typeof value.rationale === 'string' ? value.rationale
      : typeof value.explanation === 'string' ? value.explanation
      : typeof value.reason === 'string' ? value.reason
      : null;
    return { label, rationale };
  }
  if (Array.isArray(value) && value.length > 0) return extractAssessmentMeta(value[0]);
  return null;
}

const WEAK_ASSESSMENTS = new Set([
  'weak', 'incomplete', 'vague', 'missing trigger', 'missing controls',
  'unknown', 'off_topic', 'off-topic', 'none', 'no answer', 'unclear',
]);
function isWeakAssessment(assessment) {
  const r = normalizeAssessment(assessment);
  if (r === 'unknown') return false; // unknown = no assessment, don't penalise
  if (WEAK_ASSESSMENTS.has(r)) return true;
  for (const w of WEAK_ASSESSMENTS) { if (r.startsWith(w)) return true; }
  return false;
}

// Returns true if PM text signals a non-answer regardless of backend assessment
function isPmNonAnswer(text) {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  if (t.length < 8) return true;
  const nonAnswerPhrases = ["i don't know", "i dont know", "idk", "not sure", "no idea", "unsure", "dunno"];
  return nonAnswerPhrases.some(p => t.includes(p));
}

// ── Prefers-reduced-motion guard ─────────────────────────────────────────────
function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// ── Debate agent roster ───────────────────────────────────────────────────────
const DEBATE_AGENTS = [
  { id: 'aggressive_growth',     role: 'Aggressive Growth Analyst',     stance: 'Challenges risk-aversion; pushes for upside capture' },
  { id: 'conservative_risk',     role: 'Conservative Risk Officer',     stance: 'Challenges position sizing and downside exposure' },
  { id: 'valuation_skeptic',     role: 'Valuation Skeptic',             stance: 'Challenges DCF assumptions and entry timing' },
  { id: 'portfolio_construction',role: 'Portfolio Construction PM',     stance: 'Challenges portfolio fit and concentration risk' },
  { id: 'governance',            role: 'Policy / Governance Challenger',stance: 'Challenges mandate compliance and approval gates' },
];

// ── Collapsible ──────────────────────────────────────────────────────────────
function CollapsibleSection({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <p className={ST}>{title}</p>
          {badge && <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-500 border border-gray-200">{badge}</span>}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </section>
  );
}

// ── Static fallback banner ────────────────────────────────────────────────────
function StaticFallbackBanner() {
  return (
    <div className="max-w-7xl mx-auto px-8 pt-3">
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <span className="text-amber-600 text-xs font-bold">!</span>
        <p className="text-xs text-amber-800 font-medium">Showing cached source packet. Live data unavailable.</p>
      </div>
    </div>
  );
}

// ── PM Decision Context card ─────────────────────────────────────────────────
function PMDecisionContextCard({ ticker, seniorProposal, riskScenario, pmApprovalRequired, pmDecision }) {
  const stance          = seniorProposal?.stance ?? seniorProposal?.action ?? null;
  const entryRef        = seniorProposal?.entryPrice ?? seniorProposal?.entry_price ?? null;
  const proposedShares  = seniorProposal?.proposedShares ?? seniorProposal?.proposed_shares ?? null;
  const notional        = seniorProposal?.illustrativeNotional ?? seniorProposal?.illustrative_notional ?? null;
  const mos             = seniorProposal?.marginOfSafety ?? seniorProposal?.margin_of_safety ?? null;
  const riskJudgment    = riskScenario?.risk_team_judgment ?? riskScenario?.scenario_settings?.judgment ?? null;
  const decisionVal     = pmDecision?.decision ?? null;

  return (
    <section className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <p className={ST}>PM Decision Context — {ticker}</p>
      </div>
      <div className="px-5 py-4 flex-1 space-y-3">
        {stance ? (
          <div>
            <p className={`${LST} mb-0.5`}>Proposed Stance</p>
            <p className="text-sm font-bold text-gray-900">{actionLbl(stance)}</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No Senior proposal saved for {ticker}.</p>
        )}
        {entryRef != null && (
          <div>
            <p className={`${LST} mb-0.5`}>Entry Reference</p>
            <p className="text-sm font-bold text-gray-900">${parseFloat(entryRef).toFixed(2)}</p>
          </div>
        )}
        {proposedShares && (
          <div>
            <p className={`${LST} mb-0.5`}>Proposed Shares</p>
            <p className="text-sm font-bold text-gray-900">{parseFloat(proposedShares).toLocaleString()} sh</p>
          </div>
        )}
        {notional != null && (
          <div>
            <p className={`${LST} mb-0.5`}>Illustrative Notional</p>
            <p className="text-sm font-bold text-gray-900">${parseFloat(notional).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        )}
        {mos != null && (
          <div>
            <p className={`${LST} mb-0.5`}>Margin of Safety</p>
            <p className="text-sm font-bold text-gray-900">{mos}%</p>
          </div>
        )}
        {riskJudgment && (
          <div>
            <p className={`${LST} mb-0.5`}>Risk Team Judgment</p>
            <p className="text-xs text-gray-700 leading-relaxed">{humanizeLabel(safeText(riskJudgment))}</p>
          </div>
        )}
        <div>
          <p className={`${LST} mb-1`}>Approval Gate</p>
          {pmApprovalRequired ? (
            <span className="inline-flex px-2.5 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Decision required
            </span>
          ) : (
            <span className="inline-flex px-2.5 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              Gate inactive
            </span>
          )}
        </div>
        <div>
          <p className={`${LST} mb-1`}>Decision Status</p>
          <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-full border ${decisionBadgeClass(decisionVal)}`}>
            {decisionDisplayLabel(decisionVal)}
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Cross-Team Handoff helpers ───────────────────────────────────────────────
function formatScenarioSettings(s) {
  if (!s) return null;
  const parts = [];
  if (s.scenario)       parts.push(humanizeLabel(safeText(s.scenario)));
  if (s.capexShock)     parts.push(`AI capex: ${s.capexShock}`);
  if (s.exportControl)  parts.push(`Export: ${s.exportControl}`);
  if (s.discountShock && s.discountShock !== '0') parts.push(`+${s.discountShock}bps`);
  if (s.fcfHaircut && s.fcfHaircut !== '0')       parts.push(`FCF ${s.fcfHaircut}%`);
  if (s.positionStress && s.positionStress !== '1.0') parts.push(`${s.positionStress}×`);
  return parts.length ? parts.join(' · ') : null;
}

function impactChainSteps(chain) {
  if (!chain) return [];
  if (Array.isArray(chain)) return chain.map(s => safeText(s?.step ?? s?.description ?? s)).filter(Boolean);
  if (typeof chain === 'string') return chain.split(/→|->/).map(s => s.trim()).filter(Boolean);
  return [];
}

function HandoffCard({ id, role, roleLabel, status, statusCls, hasData, metrics, sourceNote, expandedCard, onToggle, accentCls }) {
  const isExpanded = expandedCard === id;
  return (
    <div
      onClick={() => hasData && onToggle(id)}
      className={`
        relative flex flex-col min-h-[280px] bg-white rounded-xl border transition-all duration-300 ease-out
        ${isExpanded ? `shadow-lg ${accentCls}` : 'border-gray-200 shadow-sm'}
        ${hasData ? 'cursor-pointer hover:-translate-y-1 hover:shadow-md hover:border-gray-300' : 'cursor-default'}
      `}
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{role}</p>
          <p className="text-sm font-bold text-gray-900 leading-tight">{roleLabel}</p>
        </div>
        <span className={`flex-shrink-0 mt-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded border ${statusCls}`}>
          {status}
        </span>
      </div>

      {/* Card body — metrics */}
      <div className="flex-1 px-4 py-3 space-y-2.5 overflow-hidden">
        {hasData ? metrics : (
          <div className="flex flex-col items-center justify-center h-full py-4 text-center space-y-1.5">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-1">
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-xs text-gray-400">No data saved</p>
            <p className="text-[10px] text-gray-300">Complete the workflow to populate</p>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
        <p className="text-[10px] text-gray-400 truncate">{sourceNote}</p>
        {hasData && (
          <span className={`flex-shrink-0 text-[10px] font-semibold transition-colors duration-200 ${isExpanded ? 'text-slate-500' : 'text-slate-400 group-hover:text-slate-600'}`}>
            {isExpanded ? 'Close ↑' : 'Details →'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Cross-Team Handoff Summary ────────────────────────────────────────────────
function CrossTeamHandoffSummary({ ticker, seniorProposal, riskScenario, pmHandoff }) {
  const [expandedCard, setExpandedCard] = useState(null);

  // Junior data
  const dcfFairValue   = seniorProposal?.dcfFairValueEstimate ?? null;
  const entryRef       = seniorProposal?.entryPrice ?? null;
  const mos            = seniorProposal?.marginOfSafety ?? null;
  const proposedShares = seniorProposal?.proposedShares ?? null;
  const notional       = seniorProposal?.illustrativeNotional ?? null;
  const timeHorizon    = seniorProposal?.timeHorizon ?? null;
  const rationale      = seniorProposal?.rationale ?? null;
  const action         = seniorProposal?.action ?? seniorProposal?.stance ?? null;
  const reviewTrigger  = seniorProposal?.reviewTrigger ?? seniorProposal?.review_trigger ?? null;

  // Risk data
  const selectedScenario = riskScenario?.selected_scenario ?? riskScenario?.scenario_settings?.scenario ?? null;
  const riskJudgment     = riskScenario?.risk_team_judgment ?? riskScenario?.scenario_settings?.judgment ?? null;
  const riskControls     = riskScenario?.risk_controls ?? null;
  const questionsForPM   = riskScenario?.questions_for_pm ?? null;
  const pmHandoffSummary = pmHandoff?.pm_handoff_summary ?? riskScenario?.pm_handoff_summary ?? null;
  const scenarioSettings = riskScenario?.scenario_settings ?? null;
  const impactChain      = riskScenario?.impact_chain ?? null;
  const llmUsed          = riskScenario?.llm_used;
  const fallbackUsed     = riskScenario?.fallback_used;
  const riskControlsList = Array.isArray(riskControls) ? riskControls : (typeof riskControls === 'string' && riskControls ? [riskControls] : []);
  const settingsLabel    = formatScenarioSettings(scenarioSettings);
  const chainSteps       = impactChainSteps(impactChain);

  const tickerAccent = ticker === 'NVDA' ? 'border border-green-400 shadow-green-100'
                     : ticker === 'KO'   ? 'border border-red-400 shadow-red-100'
                     : 'border border-slate-400 shadow-slate-100';

  function toggle(id) { setExpandedCard(p => p === id ? null : id); }

  // ── Metric rows ──────────────────────────────────────────────────────────────
  const juniorMetrics = dcfFairValue != null ? (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className={LST}>DCF Fair Value</p>
        <p className="text-sm font-bold text-gray-900">${parseFloat(dcfFairValue).toFixed(2)}</p>
      </div>
      {entryRef != null && (
        <div className="flex items-center justify-between">
          <p className={LST}>Entry Reference</p>
          <p className="text-sm font-bold text-gray-900">${parseFloat(entryRef).toFixed(2)}</p>
        </div>
      )}
      {mos != null && (
        <div className="flex items-center justify-between">
          <p className={LST}>Margin of Safety</p>
          <p className="text-sm font-bold text-gray-900">{mos}%</p>
        </div>
      )}
      {proposedShares && (
        <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded bg-slate-50 text-slate-500 border border-slate-200">
          {parseFloat(proposedShares).toLocaleString()} sh · illustrative
        </span>
      )}
    </div>
  ) : null;

  const seniorMetrics = seniorProposal ? (
    <div className="space-y-2.5">
      {action && (
        <div className="flex items-center justify-between">
          <p className={LST}>Proposed Stance</p>
          <p className="text-sm font-bold text-gray-900">{actionLbl(action)}</p>
        </div>
      )}
      {proposedShares && (
        <div className="flex items-center justify-between">
          <p className={LST}>Proposed Shares</p>
          <p className="text-sm font-bold text-gray-900">{parseFloat(proposedShares).toLocaleString()} sh</p>
        </div>
      )}
      {notional != null && (
        <div className="flex items-center justify-between">
          <p className={LST}>Illustrative Notional</p>
          <p className="text-sm font-bold text-gray-900">${parseFloat(notional).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
      )}
      {timeHorizon && (
        <div className="flex items-center justify-between">
          <p className={LST}>Time Horizon</p>
          <p className="text-sm font-bold text-gray-900">{safeText(timeHorizon)}</p>
        </div>
      )}
    </div>
  ) : null;

  const riskStatusLabel = llmUsed && !fallbackUsed ? 'LLM-assisted' : fallbackUsed ? 'Fallback' : 'Local';
  const riskStatusCls   = llmUsed && !fallbackUsed
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : fallbackUsed ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  const riskMetrics = riskScenario ? (
    <div className="space-y-2.5">
      {selectedScenario && (
        <div className="flex items-center justify-between">
          <p className={LST}>Scenario</p>
          <p className="text-sm font-bold text-gray-900">{humanizeLabel(safeText(selectedScenario))}</p>
        </div>
      )}
      {riskJudgment && (
        <div className="flex items-start justify-between gap-2">
          <p className={`${LST} flex-shrink-0`}>Judgment</p>
          <p className="text-xs font-semibold text-gray-800 text-right line-clamp-2">{humanizeLabel(safeText(riskJudgment))}</p>
        </div>
      )}
      {riskControlsList.length > 0 && (
        <div className="flex items-start justify-between gap-2">
          <p className={`${LST} flex-shrink-0`}>Lead Control</p>
          <p className="text-xs text-gray-700 text-right line-clamp-2">{safeText(riskControlsList[0])}</p>
        </div>
      )}
    </div>
  ) : null;

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <p className={ST}>Cross-Team Handoff Summary</p>
        <span className="ml-auto text-[10px] text-gray-400 font-medium">Local drafts · not officially approved</span>
      </div>

      {/* Workflow connector */}
      <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-center gap-1.5 flex-wrap">
        {['Junior Analyst', 'Senior Analyst', 'Risk Team', 'PM Decision'].map((step, i) => (
          <React.Fragment key={step}>
            {i > 0 && <span className="text-gray-300 text-xs select-none">→</span>}
            <span className="text-[10px] font-semibold text-gray-500 tracking-wide">{step}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Three equal-height cards */}
      <div className="p-5 grid md:grid-cols-3 gap-4">
        <HandoffCard
          id="junior"
          role="Junior Analyst"
          roleLabel="Evidence Package"
          status={dcfFairValue != null ? 'Packet + local' : 'Missing data'}
          statusCls={dcfFairValue != null ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-gray-100 text-gray-400 border-gray-200'}
          hasData={dcfFairValue != null}
          metrics={juniorMetrics}
          sourceNote="dcf_valuations · entry_price_models"
          expandedCard={expandedCard}
          onToggle={toggle}
          accentCls={tickerAccent}
        />
        <HandoffCard
          id="senior"
          role="Senior Analyst"
          roleLabel="Action Proposal"
          status={seniorProposal ? 'Local' : 'Missing data'}
          statusCls={seniorProposal ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-100 text-gray-400 border-gray-200'}
          hasData={!!seniorProposal}
          metrics={seniorMetrics}
          sourceNote={`bridgewater_senior_action_proposal_${ticker}`}
          expandedCard={expandedCard}
          onToggle={toggle}
          accentCls={tickerAccent}
        />
        <HandoffCard
          id="risk"
          role="Risk Team"
          roleLabel="Scenario Challenge"
          status={riskScenario ? riskStatusLabel : 'Missing data'}
          statusCls={riskScenario ? riskStatusCls : 'bg-gray-100 text-gray-400 border-gray-200'}
          hasData={!!riskScenario}
          metrics={riskMetrics}
          sourceNote={`bridgewater_risk_scenario_analysis_${ticker}`}
          expandedCard={expandedCard}
          onToggle={toggle}
          accentCls={tickerAccent}
        />
      </div>

      {/* Expanded detail panel — renders below cards */}
      {expandedCard && (
        <div className="mx-5 mb-5 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"
          style={{ animation: 'handoffExpand 0.2s ease-out both' }}>
          <style>{`@keyframes handoffExpand { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>

          {/* Junior expanded */}
          {expandedCard === 'junior' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Junior Analyst Evidence — Detail</p>
                <button onClick={() => setExpandedCard(null)} className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors">Close ✕</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className={`${LST} mb-1`}>Valuation Basis</p>
                  {dcfFairValue != null && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">DCF Fair Value</span>
                      <span className="text-xs font-bold text-gray-900">${parseFloat(dcfFairValue).toFixed(2)}</span>
                    </div>
                  )}
                  {entryRef != null && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Entry Reference</span>
                      <span className="text-xs font-bold text-gray-900">${parseFloat(entryRef).toFixed(2)}</span>
                    </div>
                  )}
                  {mos != null && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Margin of Safety</span>
                      <span className="text-xs font-bold text-gray-900">{mos}%</span>
                    </div>
                  )}
                  {dcfFairValue != null && mos != null && (
                    <p className="text-[10px] text-gray-400 pt-1">
                      Entry = Fair Value × (1 − MoS%) = ${(parseFloat(dcfFairValue) * (1 - parseFloat(mos) / 100)).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className={`${LST} mb-1`}>Key Limitations</p>
                  <ul className="space-y-1.5">
                    {proposedShares && (
                      <li className="flex items-start gap-1.5 text-xs text-gray-600">
                        <span className="text-amber-400 flex-shrink-0 mt-0.5">·</span>
                        Simulated share count — illustrative only
                      </li>
                    )}
                    <li className="flex items-start gap-1.5 text-xs text-gray-600">
                      <span className="text-gray-300 flex-shrink-0 mt-0.5">·</span>
                      Discount rate is a proxy, not a calibrated WACC
                    </li>
                    <li className="flex items-start gap-1.5 text-xs text-gray-600">
                      <span className="text-gray-300 flex-shrink-0 mt-0.5">·</span>
                      DCF output is sensitive to terminal growth assumptions
                    </li>
                  </ul>
                  <div className="pt-1 space-y-0.5">
                    <p className={LST}>Source Paths</p>
                    <p className="text-[10px] font-mono text-gray-400">dcf_valuations.valuations.{ticker}</p>
                    <p className="text-[10px] font-mono text-gray-400">entry_price_models.entry_prices.{ticker}</p>
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Junior produces the valuation package. It is not a trade decision — Senior converts it into a proposal.
                </p>
              </div>
            </div>
          )}

          {/* Senior expanded */}
          {expandedCard === 'senior' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Senior Analyst Proposal — Detail</p>
                <button onClick={() => setExpandedCard(null)} className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors">Close ✕</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className={`${LST} mb-1`}>Proposal Terms</p>
                  {action && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Stance</span>
                      <span className="text-xs font-bold text-gray-900">{actionLbl(action)}</span>
                    </div>
                  )}
                  {entryRef != null && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Entry Reference Used</span>
                      <span className="text-xs font-bold text-gray-900">${parseFloat(entryRef).toFixed(2)}</span>
                    </div>
                  )}
                  {mos != null && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Margin of Safety</span>
                      <span className="text-xs font-bold text-gray-900">{mos}%</span>
                    </div>
                  )}
                  {proposedShares && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Proposed Shares</span>
                      <span className="text-xs font-bold text-gray-900">{parseFloat(proposedShares).toLocaleString()}</span>
                    </div>
                  )}
                  {notional != null && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Illustrative Notional</span>
                      <span className="text-xs font-bold text-gray-900">${parseFloat(notional).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
                  {timeHorizon && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Time Horizon</span>
                      <span className="text-xs font-bold text-gray-900">{safeText(timeHorizon)}</span>
                    </div>
                  )}
                  {seniorProposal?.readyState && (
                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ✓ Marked ready by Senior
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {rationale && (
                    <div>
                      <p className={`${LST} mb-1`}>Senior Rationale</p>
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{rationale}</p>
                    </div>
                  )}
                  {reviewTrigger && (
                    <div>
                      <p className={`${LST} mb-0.5`}>Review Trigger</p>
                      <p className="text-xs text-gray-600">{safeText(reviewTrigger)}</p>
                    </div>
                  )}
                  <div>
                    <p className={`${LST} mb-0.5`}>Source</p>
                    <p className="text-[10px] font-mono text-gray-400">bridgewater_senior_action_proposal_{ticker}</p>
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Senior challenges Junior assumptions and converts the valuation into an actionable proposal. No trade is executed.
                </p>
              </div>
            </div>
          )}

          {/* Risk expanded */}
          {expandedCard === 'risk' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Risk Team Scenario Challenge — Detail</p>
                <button onClick={() => setExpandedCard(null)} className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors">Close ✕</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {settingsLabel && (
                    <div>
                      <p className={`${LST} mb-1`}>Scenario Settings Analyzed</p>
                      <p className="text-xs text-gray-700 font-medium leading-relaxed">{settingsLabel}</p>
                    </div>
                  )}
                  {selectedScenario && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500">Scenario</span>
                      <span className="text-xs font-bold text-gray-900">{humanizeLabel(safeText(selectedScenario))}</span>
                    </div>
                  )}
                  {riskJudgment && (
                    <div className="py-1 border-b border-gray-200">
                      <span className="text-xs text-gray-500 block mb-0.5">Risk Judgment</span>
                      <span className="text-xs font-semibold text-gray-800">{humanizeLabel(safeText(riskJudgment))}</span>
                    </div>
                  )}
                  {pmHandoffSummary && (
                    <div>
                      <p className={`${LST} mb-1`}>Handoff Summary</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{safeText(pmHandoffSummary)}</p>
                    </div>
                  )}
                  {chainSteps.length > 0 && (
                    <div>
                      <p className={`${LST} mb-2`}>Impact Chain</p>
                      <ol className="space-y-1">
                        {chainSteps.slice(0, 5).map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-bold mt-0.5">{i + 1}</span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {riskControlsList.length > 0 && (
                    <div>
                      <p className={`${LST} mb-1`}>Required Controls</p>
                      <ul className="space-y-1">
                        {riskControlsList.map((c, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                            <span className="text-slate-400 flex-shrink-0 mt-0.5">·</span>
                            <span className="leading-relaxed">{safeText(c)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {questionsForPM && (
                    <div>
                      <p className={`${LST} mb-1`}>Questions for PM</p>
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{safeText(questionsForPM)}</p>
                    </div>
                  )}
                  <div>
                    <p className={`${LST} mb-0.5`}>Source</p>
                    <p className="text-[10px] font-mono text-gray-400">bridgewater_risk_scenario_analysis_{ticker}</p>
                  </div>
                  {riskScenario?.llm_used && (
                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                      LLM-assisted scenario
                    </span>
                  )}
                </div>
              </div>
              <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Risk Team stress-tests the Senior proposal under adverse scenarios. It does not execute trades.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Agent card ────────────────────────────────────────────────────────────────
function AgentCard({ agent }) {
  const style = agentStyle(agent.role ?? '');
  const sev   = agent.severity;
  return (
    <div className={`border rounded-xl overflow-hidden ${style.header}`}>
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <p className={`text-xs font-bold uppercase tracking-wide ${style.title}`}>{safeText(agent.role ?? 'Analyst')}</p>
        <div className="flex items-center gap-2">
          {agent.stance && (
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${style.tag}`}>
              {safeText(agent.stance)}
            </span>
          )}
          {sev && (
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${severityClass(sev)}`}>
              {safeText(sev).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      <div className="bg-white border-t border-gray-100 px-4 py-3 space-y-3">
        {agent.challenge && (
          <div>
            <p className={`${LST} mb-1`}>Challenge</p>
            <p className="text-sm text-gray-800 leading-relaxed">{safeText(agent.challenge)}</p>
          </div>
        )}
        {agent.evidence_used && (
          <div>
            <p className={`${LST} mb-1`}>Evidence Used</p>
            {renderList(agent.evidence_used)}
          </div>
        )}
        {agent.pm_must_answer && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <p className={`${LST} mb-1`}>PM Must Answer</p>
            <p className="text-xs text-slate-800 leading-relaxed font-medium">{safeText(agent.pm_must_answer)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PM chat bubble ────────────────────────────────────────────────────────────
function PMBubble({ message }) {
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex justify-end mb-5">
      <div className="max-w-[75%] space-y-1.5">
        <div className="flex items-center justify-end gap-2">
          <span className="text-[10px] text-gray-400">{time}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">PM</span>
        </div>
        <div className="bg-slate-700 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

// ── Agent chat bubble ─────────────────────────────────────────────────────────
function AgentBubble({ message, isStreaming, streamedContent, streamedFollowUp }) {
  const style = agentStyle(message.agent_role ?? '');
  const time  = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const evidenceList = Array.isArray(message.evidence_used)
    ? message.evidence_used
    : (message.evidence_used ? [message.evidence_used] : []);
  const assessmentMeta = extractAssessmentMeta(message.answer_assessment);
  const aStyle = assessmentMeta ? assessmentStyle(assessmentMeta.label) : null;
  const resolvedPts   = Array.isArray(message.resolved_points)   ? message.resolved_points.filter(Boolean)   : [];
  const unresolvedPts = Array.isArray(message.unresolved_points) ? message.unresolved_points.filter(Boolean) : [];
  const confScore = normalizeScore(message.decision_confidence_score);
  const confDelta = normalizeConfidenceDelta(message.decision_confidence_delta);

  // Streaming state: if isStreaming, only show streamed text and hide post-text details
  const displayContent  = isStreaming && streamedContent  != null ? streamedContent  : message.content;
  const displayFollowUp = isStreaming ? streamedFollowUp : message.follow_up_question;
  const showDetails     = !isStreaming; // assessment, resolved/unresolved, evidence, confidence, suggested

  return (
    <div className="flex justify-start mb-5">
      <div className="max-w-[84%] space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${style.title}`}>{message.agent_role ?? 'Challenger'}</span>
          {message.pressure_level && (
            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${severityClass(message.pressure_level)}`}>
              {safeText(message.pressure_level).toUpperCase()}
            </span>
          )}
          {message.llm_used && !message.fallback_used && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">LLM</span>
          )}
          {message.fallback_used && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-50 text-amber-700 border border-amber-200">Fallback</span>
          )}
          {message.human_review_required && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-50 text-red-700 border border-red-200">Human review required</span>
          )}
          <span className="text-[10px] text-gray-400">{time}</span>
        </div>

        <div className={`rounded-2xl rounded-tl-sm border px-4 py-3 space-y-3 shadow-sm ${style.header}`}>
          {/* Answer assessment — only after streaming completes */}
          {showDetails && aStyle && (
            <div className="bg-white/80 border border-white/80 rounded-lg px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Answer assessment</p>
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${aStyle.chip}`}>
                  {aStyle.label}
                </span>
              </div>
              {assessmentMeta?.rationale && (
                <p className="text-xs text-gray-700 leading-relaxed">{safeText(assessmentMeta.rationale)}</p>
              )}
            </div>
          )}

          {/* Main response text with optional streaming cursor */}
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
            {displayContent}
            {isStreaming && !streamedFollowUp && (
              <span className="inline-block w-px h-[1em] bg-gray-600 ml-0.5 align-text-bottom"
                style={{ animation: 'debateBlink 1s step-end infinite' }} />
            )}
          </p>

          {/* Resolved / unresolved points — only after streaming completes */}
          {showDetails && (resolvedPts.length > 0 || unresolvedPts.length > 0) && (
            <div className="grid grid-cols-2 gap-2 border-t border-white/60 pt-2.5">
              {resolvedPts.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Resolved</p>
                  <div className="flex flex-col gap-1">
                    {resolvedPts.slice(0, 3).map((p, i) => (
                      <span key={i} className="text-[10px] text-emerald-800 leading-snug">✓ {safeText(p)}</span>
                    ))}
                  </div>
                </div>
              )}
              {unresolvedPts.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-rose-700 uppercase tracking-widest mb-1">Still unresolved</p>
                  <div className="flex flex-col gap-1">
                    {unresolvedPts.slice(0, 3).map((p, i) => (
                      <span key={i} className="text-[10px] text-rose-800 leading-snug">✗ {safeText(p)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Follow-up question — streams in after main text finishes */}
          {displayFollowUp && (
            <div className="bg-white/80 border border-white rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold text-gray-400 mb-0.5 uppercase tracking-widest">Follow-up question</p>
              <p className="text-xs font-semibold text-gray-800 leading-relaxed">
                {displayFollowUp}
                {isStreaming && streamedFollowUp != null && (
                  <span className="inline-block w-px h-[1em] bg-gray-700 ml-0.5 align-text-bottom"
                    style={{ animation: 'debateBlink 1s step-end infinite' }} />
                )}
              </p>
            </div>
          )}

          {/* Confidence delta — only after streaming completes */}
          {showDetails && confDelta != null && (
            <p className={`text-[10px] font-semibold border-t border-white/60 pt-2 ${confDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {confDelta >= 0 ? `+${confDelta}` : confDelta} to decision confidence
              {confScore != null && <span className="text-gray-500 font-normal"> → now {confScore}%</span>}
            </p>
          )}

          {/* Evidence chips — only after streaming completes */}
          {showDetails && evidenceList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-white/60 pt-2">
              {evidenceList.slice(0, 5).map((e, i) => (
                <span key={i} className="px-2 py-0.5 text-[10px] font-medium rounded bg-white/70 border border-white text-gray-600">
                  {safeText(typeof e === 'string' ? e : (e?.source ?? e?.text ?? JSON.stringify(e)))}
                </span>
              ))}
            </div>
          )}

          {showDetails && message.suggested_next_agent && (
            <p className="text-[10px] text-gray-500 pt-1">→ <span className="font-semibold">{safeText(message.suggested_next_agent)}</span> may challenge next</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Debate Room (live multi-turn chat) ────────────────────────────────────────
const PM_CHIPS = [
  { label: 'Add sizing trigger',       text: 'I would size down if ' },
  { label: 'Add valuation threshold',  text: 'My valuation threshold is ' },
  { label: 'Add risk control',         text: 'The risk control I would apply is ' },
  { label: 'Add deferral condition',   text: 'I would defer if ' },
];

function DebateRoom({ ticker, packet, seniorProposal, riskScenario, pmHandoff }) {
  const [chatMessages,  setChatMessages]  = useState([]);
  const [debateContext, setDebateContext] = useState(null);
  const [activeAgent,   setActiveAgent]   = useState('auto');
  const [pmChatInput,   setPmChatInput]   = useState('');
  const [isDebating,    setIsDebating]    = useState(false);
  const [debateError,   setDebateError]   = useState(null);
  // streamingInfo: { idx, mainWords, followUpWords, wordCount, phase: 'main'|'followup'|'complete' }
  const [streamingInfo, setStreamingInfo] = useState(null);
  const chatContainerRef = useRef(null);
  const inputRef         = useRef(null);

  useEffect(() => {
    const saved = loadLS(debateChatKey(ticker));
    if (saved) {
      setChatMessages(saved.messages ?? []);
      setDebateContext(saved.debateContext ?? null);
    } else {
      setChatMessages([]);
      setDebateContext(null);
    }
    setStreamingInfo(null);
    setDebateError(null);
    setPmChatInput('');
  }, [ticker]);

  // Scroll only the chat container — not the full page
  useEffect(() => {
    const el = chatContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, streamingInfo]);

  // Word-by-word typewriter drive
  useEffect(() => {
    if (!streamingInfo || streamingInfo.phase === 'complete') return;
    const delay = 45 + Math.random() * 25; // 45–70 ms per word
    const timer = setTimeout(() => {
      setStreamingInfo(prev => {
        if (!prev || prev.phase === 'complete') return prev;
        if (prev.phase === 'main') {
          const next = prev.wordCount + 1;
          if (next >= prev.mainWords.length) {
            return prev.followUpWords.length > 0
              ? { ...prev, wordCount: 0, phase: 'followup' }
              : { ...prev, wordCount: next, phase: 'complete' };
          }
          return { ...prev, wordCount: next };
        }
        if (prev.phase === 'followup') {
          const next = prev.wordCount + 1;
          if (next >= prev.followUpWords.length) {
            return { ...prev, wordCount: next, phase: 'complete' };
          }
          return { ...prev, wordCount: next };
        }
        return prev;
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [streamingInfo]);

  function persistDebate(msgs, ctx) {
    try { localStorage.setItem(debateChatKey(ticker), JSON.stringify({ messages: msgs, debateContext: ctx })); } catch {}
  }

  function handleClearDebate() {
    try { localStorage.removeItem(debateChatKey(ticker)); } catch {}
    setChatMessages([]);
    setDebateContext(null);
    setDebateError(null);
    setPmChatInput('');
  }

  function buildBase() {
    const portfolio    = packet?.portfolio ?? {};
    const positions    = portfolio.positions ?? [];
    const mandate      = packet?.mandate ?? {};
    const theses       = packet?.company_theses ?? {};
    const companyName  = theses[ticker]?.company_name ?? ticker;
    const techWeight   = positions.filter(p => bucketGroup(p.bucket) === 'Technology').reduce((s, p) => s + (p.weight || 0), 0);
    const cashWeight   = positions.filter(p => bucketGroup(p.bucket) === 'Cash').reduce((s, p) => s + (p.weight || 0), 0);
    const tickerWeight = positions.find(p => p.ticker === ticker)?.weight ?? null;
    return {
      mode: 'pm_decision_debate',
      ticker,
      company: companyName,
      question: "Run a Bridgewater-style devil's advocate debate for the PM decision.",
      pm_context: {
        portfolio_composition: positions.map(p => ({ ticker: p.ticker, weight: p.weight, bucket: p.bucket })),
        current_ticker_weight: tickerWeight,
        max_single_name_weight: mandate.max_single_name_weight ?? null,
        cash_weight: cashWeight,
        technology_exposure: techWeight,
      },
      senior_proposal: seniorProposal,
      valuation_basis: {
        dcf_fair_value: seniorProposal?.dcfFairValueEstimate ?? null,
        entry_reference: seniorProposal?.entryPrice ?? null,
        margin_of_safety: seniorProposal?.marginOfSafety ?? null,
        valuation_basis_text: seniorProposal?.valuationBasis ?? null,
      },
      risk_team_analysis: { scenario_analysis: riskScenario, pm_handoff: pmHandoff },
      decision_candidate: {
        action: seniorProposal?.action ?? seniorProposal?.stance ?? null,
        proposed_shares: seniorProposal?.proposedShares ?? null,
        illustrative_notional: seniorProposal?.illustrativeNotional ?? null,
        entry_reference: seniorProposal?.entryPrice ?? null,
        time_horizon: seniorProposal?.timeHorizon ?? null,
      },
    };
  }

  async function handleStart() {
    setIsDebating(true);
    setDebateError(null);
    try {
      const body = { ...buildBase(), debate_action: 'initial' };
      const res  = await fetch('/api/backend/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setDebateContext(data);
      const sorted = sortAgentsBySeverity(data.agents);
      const initConfidence = normalizeScore(data.decision_readiness_score) ?? 50;
      const seedMsg = {
        role: 'agent',
        agent_role: pickSeedAgent(data),
        content: pickSeedContent(data),
        follow_up_question: pickSeedFollowUp(data),
        evidence_used: [],
        pressure_level: sorted[0]?.severity ?? null,
        llm_used: data.llm_used ?? false,
        fallback_used: data.fallback_used ?? false,
        human_review_required: data.human_review_required ?? false,
        decision_confidence_score: initConfidence,
        timestamp: new Date().toISOString(),
      };
      const newCtx = { ...data, decision_confidence_score: initConfidence };
      const newMsgs = [seedMsg];
      setDebateContext(newCtx);
      setChatMessages(newMsgs);
      persistDebate(newMsgs, newCtx);
      if (!prefersReducedMotion()) {
        const mainWords     = (seedMsg.content || '').split(/\s+/).filter(Boolean);
        const followUpWords = seedMsg.follow_up_question ? seedMsg.follow_up_question.split(/\s+/).filter(Boolean) : [];
        setStreamingInfo({ idx: 0, mainWords, followUpWords, wordCount: 0, phase: 'main' });
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      setDebateError(err.message ?? String(err));
    } finally {
      setIsDebating(false);
    }
  }

  async function handleSend() {
    const text = pmChatInput.trim();
    if (!text || isDebating) return;
    const pmMsg = { role: 'pm', content: text, timestamp: new Date().toISOString() };
    const msgsWithPm = [...chatMessages, pmMsg];
    setChatMessages(msgsWithPm);
    setPmChatInput('');
    persistDebate(msgsWithPm, debateContext);
    setIsDebating(true);
    setDebateError(null);
    try {
      const chosenAgent = activeAgent === 'auto' ? null : DEBATE_AGENTS.find(a => a.id === activeAgent)?.role ?? null;
      const body = {
        ...buildBase(),
        debate_action: 'turn',
        pm_answer: text,
        debate_context: debateContext,
        agent_role: chosenAgent,
        chat_history: msgsWithPm.map(m => ({ role: m.role, content: m.content, agent_role: m.agent_role ?? null })),
      };
      const res  = await fetch('/api/backend/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

      // Compute new confidence score
      const prevConf    = clampConfidence(normalizeScore(debateContext?.decision_confidence_score) ?? 50) ?? 50;
      const rawDelta    = normalizeConfidenceDelta(data.decision_confidence_delta);
      const directScore = normalizeScore(data.decision_confidence_score);
      const assessment  = normalizeAssessment(data.answer_assessment);

      // Enforce: weak assessments and non-answers must decrease confidence
      let delta = rawDelta;
      const weakAnswer = isWeakAssessment(assessment) || isPmNonAnswer(text);
      if (weakAnswer) {
        if (delta == null || delta > 0) delta = -10;          // default penalty
        else if (delta > -8) delta = Math.min(delta, -8);    // floor at -8 for weak
        else delta = -Math.abs(delta);                        // ensure negative
      }

      // Resolve: use backend directScore only when it is consistent with the delta.
      // "Consistent" means the score actually moved in the delta's direction.
      // If the backend returns the same score as before (stale) or contradicts the
      // delta direction, compute from delta instead.
      let newConf;
      if (delta != null) {
        const deltaComputed = clampConfidence(prevConf + delta) ?? prevConf;
        if (directScore != null) {
          const scoreIsStale       = directScore === prevConf;          // backend echoed old value
          const scoreContradictsUp = delta > 0 && directScore < prevConf;
          const scoreContradictsDown = delta < 0 && directScore > prevConf;
          if (scoreIsStale || scoreContradictsUp || scoreContradictsDown) {
            newConf = deltaComputed; // delta wins
          } else {
            newConf = directScore;   // backend score moved in the right direction — trust it
          }
        } else {
          newConf = deltaComputed;
        }
      } else if (directScore != null) {
        newConf = directScore;
      } else {
        newConf = prevConf;
      }

      const agentMsg = {
        role: 'agent',
        agent_role: data.agent_role ?? chosenAgent ?? 'Challenger',
        content: data.response ?? data.message ?? JSON.stringify(data),
        answer_assessment: data.answer_assessment ?? null,
        resolved_points: data.resolved_points ?? [],
        unresolved_points: data.unresolved_points ?? [],
        follow_up_question: data.follow_up_question ?? null,
        unresolved_issue: data.unresolved_issue ?? null,
        evidence_used: data.evidence_used ?? [],
        pressure_level: data.pressure_level ?? null,
        suggested_next_agent: data.suggested_next_agent ?? null,
        decision_confidence_score: newConf,
        decision_confidence_delta: delta ?? rawDelta,
        llm_used: data.llm_used ?? false,
        fallback_used: data.fallback_used ?? false,
        human_review_required: data.human_review_required ?? false,
        timestamp: new Date().toISOString(),
      };

      const newCtx = { ...(debateContext ?? {}), decision_confidence_score: newConf };
      setDebateContext(newCtx);
      const newMsgs = [...msgsWithPm, agentMsg];
      setChatMessages(newMsgs);
      persistDebate(newMsgs, newCtx);
      if (!prefersReducedMotion()) {
        const mainWords     = (agentMsg.content || '').split(/\s+/).filter(Boolean);
        const followUpWords = agentMsg.follow_up_question ? agentMsg.follow_up_question.split(/\s+/).filter(Boolean) : [];
        setStreamingInfo({ idx: newMsgs.length - 1, mainWords, followUpWords, wordCount: 0, phase: 'main' });
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      setDebateError(err.message ?? String(err));
    } finally {
      setIsDebating(false);
    }
  }

  const hasStarted   = chatMessages.length > 0;
  const lastAgentMsg = [...chatMessages].reverse().find(m => m.role === 'agent');
  const confScore    = normalizeScore(debateContext?.decision_confidence_score) ?? (hasStarted ? 50 : null);
  const lastDelta    = normalizeConfidenceDelta(lastAgentMsg?.decision_confidence_delta);

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <style>{`@keyframes debateBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className={ST}>Live Devil&apos;s Advocate Debate</p>
          <p className="text-xs text-gray-500 mt-0.5">Pressure-test the PM decision in a live multi-turn debate before recording a local approval.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastAgentMsg?.llm_used && !lastAgentMsg?.fallback_used && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-emerald-50 text-emerald-700 border-emerald-200">LLM challenger</span>
          )}
          {lastAgentMsg?.fallback_used && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-amber-50 text-amber-700 border-amber-200">Fallback mode</span>
          )}
          {lastAgentMsg?.human_review_required && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-red-50 text-red-700 border-red-200">Human PM review required</span>
          )}
          {hasStarted && (
            <button type="button" onClick={handleClearDebate}
              className="px-3 py-1 text-[10px] font-bold text-gray-400 border border-gray-200 rounded hover:text-red-600 hover:border-red-200 transition-colors">
              Clear Debate
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {/* Left: agent roster + decision confidence */}
        <div className="lg:col-span-2 p-5 space-y-5">
          <div>
            <p className={`${LST} mb-3`}>Select Challenger Agent</p>
            <div className="space-y-2">
              <button type="button" onClick={() => setActiveAgent('auto')}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  activeAgent === 'auto' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}>
                <span className="font-bold text-xs block">Auto-pick challenger</span>
                <span className={`text-[10px] ${activeAgent === 'auto' ? 'text-slate-300' : 'text-gray-400'}`}>Backend selects based on context</span>
              </button>
              {DEBATE_AGENTS.map(agent => {
                const st = agentStyle(agent.role);
                const isActive = activeAgent === agent.id;
                return (
                  <button type="button" key={agent.id} onClick={() => setActiveAgent(agent.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      isActive ? `${st.header} border-transparent` : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <span className={`font-bold text-xs block ${isActive ? st.title : 'text-gray-800'}`}>{agent.role}</span>
                    <span className={`text-[10px] ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>{agent.stance}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Decision Confidence */}
          {confScore != null && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className={LST}>Decision Confidence</p>
                <span className={`text-lg font-bold ${confScore >= 70 ? 'text-emerald-700' : confScore >= 50 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {confScore}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${confScore >= 70 ? 'bg-emerald-500' : confScore >= 50 ? 'bg-amber-400' : 'bg-rose-500'}`}
                  style={{ width: `${confScore}%` }} />
              </div>
              {lastDelta != null && (
                <p className={`text-[10px] font-semibold ${lastDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {lastDelta >= 0 ? `+${lastDelta}` : lastDelta} after latest answer
                </p>
              )}
              {confScore < 60 && hasStarted && (
                <p className="text-[10px] text-rose-600 font-medium border-t border-gray-200 pt-2">
                  Defense needs strengthening before approval.
                </p>
              )}
            </div>
          )}

          <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-3">
            This debate is a decision-support tool only. No trade is executed, routed, or approved.
          </p>
        </div>

        {/* Right: chat thread + input */}
        <div className="lg:col-span-3 flex flex-col" style={{ minHeight: '520px' }}>
          {/* Chat container — scroll only this div */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto px-5 py-5"
            style={{ maxHeight: '480px' }}
          >
            {!hasStarted ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Start the PM Debate</p>
                  <p className="text-xs text-gray-400 mt-1">Challenger agents will pressure-test your decision.</p>
                </div>
                <button type="button" onClick={handleStart} disabled={isDebating}
                  className="px-6 py-2.5 bg-slate-700 text-white text-sm font-bold rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors">
                  {isDebating ? 'Starting debate…' : 'Start PM Debate'}
                </button>
              </div>
            ) : (
              <>
                {chatMessages.map((msg, i) => {
                  if (msg.role === 'pm') return <PMBubble key={i} message={msg} />;
                  const isStreamingThis = streamingInfo != null && streamingInfo.idx === i && streamingInfo.phase !== 'complete';
                  if (isStreamingThis) {
                    const { mainWords, followUpWords, wordCount, phase } = streamingInfo;
                    const streamedContent  = phase === 'main'
                      ? mainWords.slice(0, wordCount + 1).join(' ')
                      : mainWords.join(' ');
                    const streamedFollowUp = phase === 'followup'
                      ? followUpWords.slice(0, wordCount + 1).join(' ')
                      : null;
                    return (
                      <AgentBubble key={i} message={msg}
                        isStreaming={true}
                        streamedContent={streamedContent}
                        streamedFollowUp={streamedFollowUp} />
                    );
                  }
                  return <AgentBubble key={i} message={msg} />;
                })}
                {isDebating && (
                  <div className="flex justify-start mb-4">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium ml-1">Challenger thinking…</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Error banner — never erases chat */}
          {debateError && (
            <div className="mx-5 mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-bold text-red-700 mb-0.5">Debate error</p>
              <p className="text-xs text-red-600">{safeText(debateError)}</p>
              <button type="button" onClick={hasStarted ? handleSend : handleStart} disabled={isDebating}
                className="mt-2 px-3 py-1 bg-red-700 text-white text-xs font-bold rounded hover:bg-red-800 disabled:opacity-40 transition-colors">
                Retry
              </button>
            </div>
          )}

          {/* PM input area */}
          {hasStarted && (
            <div className="border-t border-gray-100 px-5 py-4 space-y-2">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={pmChatInput}
                  onChange={e => setPmChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Respond to the challenge… (Enter to send, Shift+Enter for newline)"
                  disabled={isDebating}
                  className="flex-1 text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:border-gray-400 disabled:opacity-50"
                  rows={3}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isDebating || !pmChatInput.trim()}
                  className="px-4 py-2 bg-slate-700 text-white text-sm font-bold rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors self-end"
                >
                  {isDebating ? 'Sending…' : 'Send'}
                </button>
              </div>
              <p className="text-[10px] text-gray-400">
                Strong defense includes: decision stance · evidence · risk controls · measurable trigger
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PM_CHIPS.map(chip => (
                  <button
                    type="button"
                    key={chip.label}
                    disabled={isDebating}
                    onClick={() => setPmChatInput(prev => prev ? `${prev} ${chip.text}` : chip.text)}
                    className="px-2 py-1 text-[10px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  >
                    + {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Confirmation modal ────────────────────────────────────────────────────────
const DECISION_OPTS = [
  {
    value:    'approved_with_controls',
    label:    'Approve with controls',
    subtitle: 'Record local approval only after controls are accepted.',
    selected: 'border-emerald-500 bg-emerald-50 shadow-sm',
    idle:     'border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm hover:-translate-y-px',
    labelCls: 'text-emerald-800',
    subCls:   'text-emerald-600',
  },
  {
    value:    'deferred',
    label:    'Defer pending evidence',
    subtitle: 'Pause until missing evidence or triggers are resolved.',
    selected: 'border-amber-400 bg-amber-50 shadow-sm',
    idle:     'border-gray-200 bg-white hover:border-amber-300 hover:shadow-sm hover:-translate-y-px',
    labelCls: 'text-amber-800',
    subCls:   'text-amber-600',
  },
  {
    value:    'reduced_size',
    label:    'Reduce size — approve for review',
    subtitle: 'Proceed only with smaller sizing and PM/Risk controls.',
    selected: 'border-sky-400 bg-sky-50 shadow-sm',
    idle:     'border-gray-200 bg-white hover:border-sky-300 hover:shadow-sm hover:-translate-y-px',
    labelCls: 'text-sky-800',
    subCls:   'text-sky-600',
  },
  {
    value:    'rejected',
    label:    'Reject proposal',
    subtitle: 'Do not proceed under current evidence.',
    selected: 'border-red-400 bg-red-50 shadow-sm',
    idle:     'border-gray-200 bg-white hover:border-red-300 hover:shadow-sm hover:-translate-y-px',
    labelCls: 'text-red-800',
    subCls:   'text-red-600',
  },
];

function ConfirmationModal({ pending, ticker, seniorProposal, pmApprovalRequired, onConfirm, onCancel }) {
  if (!pending) return null;
  const { value: decision } = pending;
  const qty     = seniorProposal?.proposedShares  ? parseFloat(seniorProposal.proposedShares)  : null;
  const ep      = seniorProposal?.entryPrice      ? parseFloat(seniorProposal.entryPrice)      : null;
  const notional = qty && ep ? qty * ep : null;

  const bodyMap = {
    approved_with_controls: (
      <>
        <p className="text-sm text-gray-700 leading-relaxed">
          Local approval with controls recorded for <span className="font-bold text-gray-900">{ticker}</span>.
          {qty && ep && <> Proposed order noted: <span className="font-bold text-gray-900">{qty.toLocaleString()} shares</span> at <span className="font-bold text-gray-900">${ep.toFixed(2)}</span>.</>}
        </p>
        <p className="text-sm text-gray-500 mt-2">No trade has been routed or executed. This is a local demo record only.</p>
      </>
    ),
    deferred: (
      <p className="text-sm text-gray-700 leading-relaxed">
        Local deferral recorded for <span className="font-bold text-gray-900">{ticker}</span>. The proposal remains pending further evidence. No trade has been routed or executed.
      </p>
    ),
    reduced_size: (
      <p className="text-sm text-gray-700 leading-relaxed">
        Local reduced-size approval recorded for <span className="font-bold text-gray-900">{ticker}</span>. Position size should be reviewed before proceeding. No trade has been routed or executed.
      </p>
    ),
    rejected: (
      <p className="text-sm text-gray-700 leading-relaxed">
        Local rejection recorded for <span className="font-bold text-gray-900">{ticker}</span>. The proposed trade is not approved in this demo workflow. No trade has been routed or executed.
      </p>
    ),
  };
  const confirmBtnClass = {
    approved_with_controls: 'bg-emerald-600 hover:bg-emerald-700',
    deferred: 'bg-amber-500 hover:bg-amber-600',
    reduced_size: 'bg-sky-600 hover:bg-sky-700',
    rejected: 'bg-red-600 hover:bg-red-700',
  }[decision] || 'bg-slate-700 hover:bg-slate-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'pmModalIn 0.18s ease-out both' }}>
        <style>{`@keyframes pmModalIn { from { opacity:0; transform:scale(0.95) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Confirm Local Decision</p>
          <div className="flex items-baseline gap-2">
            <p className={`text-xl font-bold ${decisionBadgeClass(decision).includes('emerald') ? 'text-emerald-700' : decisionBadgeClass(decision).includes('amber') ? 'text-amber-700' : decisionBadgeClass(decision).includes('red') ? 'text-red-700' : 'text-sky-700'}`}>
              {decisionDisplayLabel(decision)}
            </p>
            <p className="text-sm text-gray-500">· {ticker}</p>
          </div>
        </div>
        <div className="px-6 py-4 space-y-4">
          {(qty || ep) && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
              {qty && <div className="flex items-center justify-between"><span className={LST}>Proposed Shares</span><span className="text-sm font-bold text-gray-900">{qty.toLocaleString()} sh</span></div>}
              {ep  && <div className="flex items-center justify-between"><span className={LST}>Entry Reference</span><span className="text-sm font-bold text-gray-900">${ep.toFixed(2)}</span></div>}
              {notional && <div className="flex items-center justify-between"><span className={LST}>Est. Notional</span><span className="text-sm font-bold text-gray-900">${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>}
              {pmApprovalRequired && <div className="flex items-center justify-between pt-1"><span className={LST}>Approval Gate</span><span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">Active</span></div>}
            </div>
          )}
          {bodyMap[decision] ?? bodyMap.deferred}
          <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
              Local decision only · no trade execution · no external system approval
            </p>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-colors ${confirmBtnClass}`}>Confirm Local Decision</button>
        </div>
      </div>
    </div>
  );
}

// ── Decision confirmation card ────────────────────────────────────────────────
function DecisionConfirmationCard({ pmDecision, ticker }) {
  if (!pmDecision?.decision) return null;
  const { decision, rationale, savedAt } = pmDecision;
  const borderColor = decisionBadgeClass(decision).split(' ').find(c => c.startsWith('border-')) || 'border-gray-200';
  const bgColor = decisionBadgeClass(decision).split(' ').find(c => c.startsWith('bg-')) || 'bg-gray-50';
  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl px-5 py-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">{decisionDisplayLabel(decision)} — {ticker}</p>
        {savedAt && <span className="text-[10px] text-gray-400">{new Date(savedAt).toLocaleString()}</span>}
      </div>
      <p className="text-xs text-gray-700 leading-relaxed">
        Local decision recorded. No trade has been routed, executed, or submitted to any external system.
      </p>
      {rationale && <p className="text-xs text-gray-600 italic">PM rationale: {rationale}</p>}
    </div>
  );
}

// ── Success overlay ───────────────────────────────────────────────────────────
function SuccessOverlay({ decision, ticker, nextTicker, onDismiss, onReviewNext }) {
  const headlineMap = {
    approved_with_controls: 'Approved with controls',
    deferred:               'Deferred pending evidence',
    reduced_size:           'Reduced-size approval recorded',
    rejected:               'Rejection recorded',
    Approved:               'Local approval recorded',
    Deferred:               'Local deferral recorded',
    Rejected:               'Rejection recorded',
  };
  const colorMap = {
    approved_with_controls: '#10b981',
    deferred:               '#f59e0b',
    reduced_size:           '#0ea5e9',
    rejected:               '#94a3b8',
    Approved:               '#10b981',
    Deferred:               '#f59e0b',
    Rejected:               '#94a3b8',
  };
  const textColorMap = {
    approved_with_controls: 'text-emerald-700',
    deferred:               'text-amber-700',
    reduced_size:           'text-sky-700',
    rejected:               'text-slate-600',
    Approved:               'text-emerald-700',
    Deferred:               'text-amber-700',
    Rejected:               'text-slate-600',
  };
  const circleColor = colorMap[decision] || '#94a3b8';
  const circ = (2 * Math.PI * 35).toFixed(1);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', animation: 'successFadeIn 0.2s ease-out both' }}>
      <style>{`
        @keyframes successFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes successCardIn { from { opacity:0; transform:scale(0.92) translateY(18px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes circleStroke { from { stroke-dashoffset:${circ}; } to { stroke-dashoffset:0; } }
        @keyframes checkDraw { from { stroke-dashoffset:55; opacity:0; } to { stroke-dashoffset:0; opacity:1; } }
      `}</style>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'successCardIn 0.22s ease-out 0.04s both' }}>
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r="35" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle cx="44" cy="44" r="35" fill="none" stroke={circleColor} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ} transform="rotate(-90 44 44)"
              style={{ animation: 'circleStroke 0.55s ease-out 0.05s both' }} />
            <path d="M 26 44 L 38 56 L 62 32" fill="none" stroke={circleColor} strokeWidth="3.5"
              strokeLinecap="round" strokeLinejoin="round" strokeDasharray="55" strokeDashoffset="55"
              style={{ animation: 'checkDraw 0.28s ease-out 0.5s both' }} />
          </svg>
          <p className={`text-lg font-bold mt-3 text-center ${textColorMap[decision] || 'text-gray-700'}`}>
            {headlineMap[decision] || decisionDisplayLabel(decision)}
          </p>
        </div>
        <div className="px-6 pb-5 space-y-1.5">
          <p className="text-sm text-gray-600 text-center leading-relaxed">Local decision recorded for {ticker}.</p>
          <p className="text-sm text-gray-600 text-center leading-relaxed">No trade has been routed or executed.</p>
        </div>
        <div className="px-6 pb-7 space-y-2.5">
          {nextTicker && (
            <button onClick={onReviewNext}
              className="w-full py-2.5 bg-slate-700 text-white text-sm font-bold rounded-lg text-center hover:bg-slate-800 transition-colors">
              Review Another Ticker — {nextTicker}
            </button>
          )}
          <Link href="/"
            className="block w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-bold rounded-lg text-center hover:bg-gray-200 transition-colors">
            Back to Role Dashboard
          </Link>
          <button onClick={onDismiss}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Stay on This Decision
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
function PortfolioManagerContent() {
  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();

  const tickers        = packet ? Object.keys(packet.recommendations || {}) : ['NVDA', 'KO'];
  const [selectedTicker, setSelectedTicker] = useState('NVDA');

  const [seniorProposal,  setSeniorProposal]  = useState(null);
  const [riskScenario,    setRiskScenario]    = useState(null);
  const [pmHandoff,       setPmHandoff]       = useState(null);
  const [pmDecision,      setPmDecision]      = useState(null);
  const [pmRationale,     setPmRationale]     = useState('');
  const [pendingDecision, setPendingDecision] = useState(null);
  const [showSuccess,     setShowSuccess]     = useState(false);

  const [decisionWarning, setDecisionWarning] = useState(null);

  useEffect(() => {
    const sp = loadLS(`bridgewater_senior_action_proposal_${selectedTicker}`)
            ?? loadLS(`bridgewater_senior_trade_proposal_${selectedTicker}`);
    setSeniorProposal(sp);

    const rs = loadLS(`bridgewater_risk_scenario_analysis_${selectedTicker}`);
    setRiskScenario(rs);

    const ph = loadLS(`bridgewater_risk_pm_handoff_${selectedTicker}`);
    setPmHandoff(ph);

    const existing = loadLS(`bridgewater_pm_decision_${selectedTicker}`);
    setPmDecision(existing);
    setPmRationale(existing?.rationale ?? '');
    setPendingDecision(null);
    setShowSuccess(false);
    setDecisionWarning(null);
  }, [selectedTicker]);

  function openModal(decisionValue) {
    const savedDebate = loadLS(debateChatKey(selectedTicker));
    const hasAgentMsg = (savedDebate?.messages ?? []).some(m => m.role === 'agent');
    if (!hasAgentMsg) {
      setDecisionWarning('Run the PM debate and receive at least one challenger response before recording a local decision.');
      return;
    }
    setDecisionWarning(null);
    setPendingDecision({ value: decisionValue });
  }

  function commitDecision() {
    if (!pendingDecision) return;
    const savedDebate = loadLS(debateChatKey(selectedTicker));
    const msgs = savedDebate?.messages ?? [];
    const lastAgentMsg = [...msgs].reverse().find(m => m.role === 'agent');
    const latestUnresolved = lastAgentMsg?.unresolved_points ?? [];
    const confScore = normalizeScore(savedDebate?.debateContext?.decision_confidence_score)
                   ?? normalizeScore(lastAgentMsg?.decision_confidence_score)
                   ?? null;
    const record = {
      decision: pendingDecision.value,
      rationale: pmRationale,
      debate_chat_history: msgs,
      debate_summary: savedDebate?.debateContext?.debate_summary ?? null,
      unresolved_questions: savedDebate?.debateContext?.unresolved_questions ?? null,
      latest_unresolved_points: latestUnresolved,
      suggested_controls: savedDebate?.debateContext?.suggested_controls ?? null,
      controls_accepted: savedDebate?.debateContext?.suggested_controls ?? [],
      decision_confidence_score: confScore,
      savedAt: new Date().toISOString(),
      noTradeExecution: true,
    };
    try { localStorage.setItem(`bridgewater_pm_decision_${selectedTicker}`, JSON.stringify(record)); } catch {}
    setPmDecision(record);
    setPendingDecision(null);
    setShowSuccess(true);
  }

  if (isLoading) {
    return (
      <>
        <WorkflowNav role="Portfolio Manager" subtitle="Final decision dashboard — review, debate, and record a local decision" />
        <div className="max-w-7xl mx-auto px-8 pb-24 space-y-6 animate-pulse mt-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-gray-100 rounded-xl" />)}
        </div>
      </>
    );
  }

  const humanReview        = packet?.human_review || {};
  const pmApprovalRequired = humanReview.pm_approval_required || false;
  const portfolio          = packet?.portfolio || {};
  const mandate            = packet?.mandate || {};
  const positions          = portfolio.positions || [];
  const tradeTicket        = (packet?.draft_trade_tickets || []).find(t => t.ticker === selectedTicker) || {};
  const stressTest         = packet?.portfolio_stress_test || {};
  const scenarios          = stressTest.scenarios || [];

  const twc = tradeTicket.target_weight_change;
  let afterPositions = null;
  if (twc != null && twc !== 0 && positions.length > 0) {
    const raw   = positions.map(p => ({ ...p, weight: p.ticker === selectedTicker ? Math.max(0, (p.weight || 0) + twc) : (p.weight || 0) }));
    const total = raw.reduce((s, p) => s + p.weight, 0);
    afterPositions = total > 0 ? raw.map(p => ({ ...p, weight: p.weight / total })) : null;
  }

  function groupedExposure(pos) {
    const g = {};
    for (const p of (pos || [])) {
      const key = bucketGroup(p.bucket);
      g[key] = (g[key] || 0) + (p.weight || 0);
    }
    const sel = (pos || []).find(p => p.ticker === selectedTicker);
    return { ...g, [selectedTicker]: sel?.weight ?? null };
  }
  const beforeExp = groupedExposure(positions);
  const afterExp  = afterPositions ? groupedExposure(afterPositions) : null;

  const currentIdx = tickers.indexOf(selectedTicker);
  const nextTicker = tickers.length > 1 ? tickers[(currentIdx + 1) % tickers.length] : null;

  // Decision gate confidence — computed once before render
  const savedDebateForGate = loadLS(debateChatKey(selectedTicker));
  const gateMsgs     = savedDebateForGate?.messages ?? [];
  const gateLastAgent = [...gateMsgs].reverse().find(m => m.role === 'agent');
  const gateConf     = normalizeScore(savedDebateForGate?.debateContext?.decision_confidence_score)
                    ?? normalizeScore(gateLastAgent?.decision_confidence_score)
                    ?? null;
  const gateHasAgent = gateMsgs.some(m => m.role === 'agent');
  const confLow      = gateHasAgent && gateConf != null && gateConf < 60;

  return (
    <>
      <WorkflowNav role="Portfolio Manager" subtitle="Final decision dashboard — review, debate, and record a local decision" />
      {isStaticFallback && <StaticFallbackBanner />}

      <ConfirmationModal
        pending={pendingDecision}
        ticker={selectedTicker}
        seniorProposal={seniorProposal}
        pmApprovalRequired={pmApprovalRequired}
        onConfirm={commitDecision}
        onCancel={() => setPendingDecision(null)}
      />

      {showSuccess && (
        <SuccessOverlay
          decision={pmDecision?.decision}
          ticker={selectedTicker}
          nextTicker={nextTicker}
          onDismiss={() => setShowSuccess(false)}
          onReviewNext={() => { setSelectedTicker(nextTicker); setShowSuccess(false); }}
        />
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-8 pt-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-gray-900">PM Decision Dashboard</h1>
          {pmApprovalRequired && (
            <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">Approval gate active</span>
          )}
          {pmDecision?.decision && (
            <span className={`px-3 py-1 text-xs font-bold rounded-full border ${decisionBadgeClass(pmDecision.decision)}`}>
              {decisionDisplayLabel(pmDecision.decision)}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          Review upstream evidence, run a devil&apos;s advocate debate, then record a local decision.
        </p>
      </div>

      {/* Ticker tabs */}
      <div className="max-w-7xl mx-auto px-8 mb-5">
        <div className="flex items-center gap-3">
          <p className={`${LST} mr-1`}>Ticker</p>
          {tickers.map(t => (
            <button key={t} onClick={() => setSelectedTicker(t)}
              className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                selectedTicker === t ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 pb-24 space-y-5">

        {/* ── A: Portfolio Context ── */}
        <div className="grid lg:grid-cols-5 gap-5">
          <section className="lg:col-span-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <p className={ST}>Portfolio Composition</p>
              {afterPositions && (
                <span className="ml-auto text-[10px] text-gray-400 font-medium px-2 py-0.5 bg-gray-50 border border-gray-200 rounded">
                  Local what-if · not official
                </span>
              )}
            </div>
            {afterPositions ? (
              <div className="p-5 grid grid-cols-2 gap-6">
                <div className="flex flex-col items-center gap-1">
                  <p className={`${LST} mb-2`}>Current Portfolio</p>
                  <DonutChart positions={positions} centerLabel="Current" centerSub={portfolio.as_of_date || ''} size={220} />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className={`${LST} mb-2`}>After Local Proposal</p>
                  <DonutChart positions={afterPositions} centerLabel="After" centerSub={`${twc >= 0 ? '+' : ''}${(twc * 100).toFixed(1)}pp`} size={220} />
                </div>
              </div>
            ) : (
              <div className="p-6 flex justify-center">
                <div className="flex flex-col items-center gap-1">
                  <p className={`${LST} mb-3`}>Current Portfolio</p>
                  <DonutChart positions={positions} centerLabel="Current" centerSub={portfolio.as_of_date || ''} size={270} />
                </div>
              </div>
            )}
          </section>

          <PMDecisionContextCard
            ticker={selectedTicker}
            seniorProposal={seniorProposal}
            riskScenario={riskScenario}
            pmApprovalRequired={pmApprovalRequired}
            pmDecision={pmDecision}
          />
        </div>

        {/* ── G: Exposure Comparison ── */}
        {positions.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <p className={ST}>Exposure Comparison — {selectedTicker}</p>
              {afterExp && <span className="ml-auto text-[10px] text-gray-400 font-medium px-2 py-0.5 bg-gray-50 border border-gray-200 rounded">Before → After ticket applied</span>}
            </div>
            <div className="px-5 py-4 grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {['Technology', 'Defensive', 'Cash', 'Other'].map(g =>
                beforeExp[g] != null || (afterExp && afterExp[g] != null) ? (
                  <ExposureBar key={g} label={g} before={beforeExp[g] ?? null} after={afterExp ? (afterExp[g] ?? null) : null} />
                ) : null
              )}
              <ExposureBar label={`${selectedTicker} weight`} before={beforeExp[selectedTicker]} after={afterExp ? afterExp[selectedTicker] : null} />
              {mandate.max_single_name_weight != null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">Max single-name constraint</span>
                    <span className="text-xs font-bold text-gray-800">{pct(mandate.max_single_name_weight)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-300 rounded-full" style={{ width: `${Math.min(mandate.max_single_name_weight * 100, 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── B: Cross-Team Handoff Summary ── */}
        <CrossTeamHandoffSummary
          ticker={selectedTicker}
          seniorProposal={seniorProposal}
          riskScenario={riskScenario}
          pmHandoff={pmHandoff}
          mandate={mandate}
        />

        {/* ── C/D/E: Devil's Advocate Debate Room ── */}
        <DebateRoom
          ticker={selectedTicker}
          packet={packet}
          seniorProposal={seniorProposal}
          riskScenario={riskScenario}
          pmHandoff={pmHandoff}
        />

        {/* ── D: Supporting Evidence ── */}
        <CollapsibleSection title={`Stress Test — ${selectedTicker} Impact`} badge="Source packet">
          <div className="overflow-x-auto">
            {scenarios.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-bold uppercase tracking-wider">Scenario</th>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-bold uppercase tracking-wider">Downside Range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {scenarios.map((s, i) => {
                    const impact = s.ticker_level_impacts?.[selectedTicker]?.downside_range;
                    return (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-800">{SCENARIO_LABELS[s.scenario_id] || humanizeLabel(s.scenario_id || '')}</td>
                        <td className="px-5 py-3 text-gray-700 font-bold">
                          {impact ? `${pct(impact[1])} to ${pct(impact[0])}` : <span className="text-gray-400 font-normal">N/A</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-400">No stress scenarios in source packet.</p>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Portfolio Detail" badge="Source packet">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            <div className="p-5">
              <p className={`${LST} mb-3`}>
                Current Positions
                {portfolio.as_of_date && <span className="ml-2 text-gray-300 font-normal normal-case">as of {portfolio.as_of_date}</span>}
              </p>
              {positions.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">Ticker</th>
                      <th className="text-left py-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">Weight</th>
                      <th className="text-left py-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">Bucket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {positions.map((p, i) => (
                      <tr key={i} className={`hover:bg-gray-50 transition-colors ${p.ticker === selectedTicker ? 'bg-blue-50' : ''}`}>
                        <td className="py-2 font-bold text-gray-900">{p.ticker}</td>
                        <td className="py-2 text-gray-700">{pct(p.weight)}</td>
                        <td className="py-2 text-gray-500 text-xs">{humanizeLabel(p.bucket || '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-400">No position data available.</p>
              )}
            </div>
            <div className="p-5">
              <p className={`${LST} mb-3`}>Mandate</p>
              <dl className="space-y-2.5">
                {mandate.benchmark && <div><dt className={LST}>Benchmark</dt><dd className="text-sm font-bold text-gray-900 mt-0.5">{mandate.benchmark}</dd></div>}
                {mandate.risk_tolerance && <div><dt className={LST}>Risk Tolerance</dt><dd className="text-sm font-bold text-gray-900 mt-0.5">{humanizeLabel(mandate.risk_tolerance)}</dd></div>}
                {mandate.target_horizon_days != null && <div><dt className={LST}>Target Horizon</dt><dd className="text-sm font-bold text-gray-900 mt-0.5">{mandate.target_horizon_days} days</dd></div>}
                {mandate.max_single_name_weight != null && <div><dt className={LST}>Max Single-Name Weight</dt><dd className="text-sm font-bold text-gray-900 mt-0.5">{pct(mandate.max_single_name_weight)}</dd></div>}
              </dl>
            </div>
          </div>
        </CollapsibleSection>

        {/* ── E: Final PM Decision Gate ── */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <p className={ST}>Final PM Decision Gate — {selectedTicker}</p>
            {gateConf != null && (
              <span className={`ml-2 px-2 py-0.5 text-[10px] font-bold rounded border ${
                gateConf >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : gateConf >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>Confidence {gateConf}%</span>
            )}
            <span className="ml-auto text-[10px] text-gray-400 font-medium">Local decision only · no trade execution</span>
          </div>
          <div className="px-5 py-5 space-y-5">
            <p className="text-xs text-gray-500 leading-relaxed">
              After reviewing the cross-team handoff and debate challenges above, record your local decision.
              This saves to the browser only. No trade is routed, executed, or submitted.
            </p>

            {/* Decision cards — 2×2 grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DECISION_OPTS.map(opt => {
                const isSaved = pmDecision?.decision === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => openModal(opt.value)}
                    className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-150 ${
                      isSaved ? opt.selected : opt.idle
                    }`}
                  >
                    {isSaved && (
                      <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Selected</span>
                    )}
                    <p className={`text-sm font-bold ${opt.labelCls}`}>{opt.label}</p>
                    <p className={`text-xs mt-1 leading-relaxed ${opt.subCls}`}>{opt.subtitle}</p>
                  </button>
                );
              })}
            </div>

            {decisionWarning && (
              <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-bold text-amber-700 mb-0.5">Debate required</p>
                <p className="text-xs text-amber-600">{decisionWarning}</p>
              </div>
            )}

            {confLow && !decisionWarning && (
              <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg">
                <p className="text-xs font-bold text-rose-700 mb-0.5">Decision defense is weak</p>
                <p className="text-xs text-rose-600">
                  Confidence score is {gateConf}%. Add stronger controls or defer pending evidence.
                </p>
              </div>
            )}

            <div>
              <p className={`${LST} mb-1`}>PM Rationale</p>
              <textarea value={pmRationale} onChange={e => setPmRationale(e.target.value)}
                placeholder="Defend the final decision. Reference debate challenges, risk controls, and unresolved evidence…"
                className="w-full h-24 text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:border-gray-400" />
            </div>

            {pmDecision?.savedAt && (
              <p className="text-[10px] text-gray-400">Decision recorded {new Date(pmDecision.savedAt).toLocaleString()}</p>
            )}
            <p className="text-[10px] text-gray-400">
              This is a local demo workflow. No trade is executed, routed, or approved in any external system.
              Official PM approval remains required per source packet guardrails.
            </p>
          </div>
        </section>

        <DecisionConfirmationCard pmDecision={pmDecision} ticker={selectedTicker} />

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link href="/"
            className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm">
            ← Back to Roles
          </Link>
          <div className="flex-1 py-3 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg text-center text-sm font-medium flex items-center justify-center">
            {pmDecision?.decision
              ? `✓ Decision recorded — ${decisionDisplayLabel(pmDecision.decision)}`
              : 'Run the debate and record a decision above to complete review'}
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center pt-1">
          <Link href={`/risk-team/handoff?ticker=${selectedTicker}`} className="text-slate-500 hover:underline mr-3">
            ← Risk Team Handoff
          </Link>
          <Link href={`/senior-analyst/trade-proposal?ticker=${selectedTicker}`} className="text-slate-500 hover:underline">
            View Senior Proposal
          </Link>
        </p>
        {packet?.disclaimer && (
          <p className="text-[10px] text-gray-400 leading-relaxed text-center pt-2">{packet.disclaimer}</p>
        )}
      </div>
    </>
  );
}

export default function PortfolioManagerPage() {
  return (
    <Suspense>
      <PortfolioManagerContent />
    </Suspense>
  );
}
