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
// Brand accent is identity only. Status colors (positive evidence, risk, warnings)
// are intentionally separate and must remain visually distinct from brand color.
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
    hoverBorderCls:'hover:border-emerald-300',
    hoverBgCls:    'hover:bg-emerald-50',
    // Positive evidence: teal (distinct from emerald brand) — no visual clash
    posBg:         'bg-teal-50',  posBorder: 'border-teal-100',
    posLabel:      'text-teal-700', posText: 'text-teal-800', posDot: 'bg-teal-400',
    // Risk: standard red — distinct from green brand
    riskBg:        'bg-red-50',  riskBorder: 'border-red-100',
    riskLabel:     'text-red-700', riskText: 'text-red-800', riskDot: 'bg-red-400',
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
    hoverBorderCls:'hover:border-red-300',
    hoverBgCls:    'hover:bg-red-50',
    // Positive evidence: standard emerald — no conflict with red brand
    posBg:         'bg-emerald-50',  posBorder: 'border-emerald-100',
    posLabel:      'text-emerald-700', posText: 'text-emerald-800', posDot: 'bg-emerald-400',
    // Risk: rose — visually distinguishable from brand red
    riskBg:        'bg-rose-50',  riskBorder: 'border-rose-200',
    riskLabel:     'text-rose-700', riskText: 'text-rose-800', riskDot: 'bg-rose-400',
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
  hoverBorderCls:'hover:border-slate-300',
  hoverBgCls:    'hover:bg-slate-50',
  posBg:         'bg-emerald-50',  posBorder: 'border-emerald-100',
  posLabel:      'text-emerald-700', posText: 'text-emerald-800', posDot: 'bg-emerald-400',
  riskBg:        'bg-red-50',  riskBorder: 'border-red-100',
  riskLabel:     'text-red-700', riskText: 'text-red-800', riskDot: 'bg-red-400',
};

function getTickerTheme(ticker) {
  return TICKER_THEMES[ticker] ?? DEFAULT_THEME;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function humanizeLabel(str) {
  if (!str) return '—';
  return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Handles both decimal (0.38 → 38) and integer (33 → 33) percent formats
function normalizePctToInt(v) {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return Math.abs(n) <= 1 ? Math.round(n * 100) : Math.round(n);
}

// Normalizes entry price model fields that may appear under multiple field names
function normalizeEntryPrice(entry) {
  if (!entry) return {};
  return {
    fairValue:   entry.implied_fair_value_per_share ?? entry.fair_value_per_share ?? entry.fairValuePerShare ?? null,
    mos:         entry.margin_of_safety ?? entry.marginOfSafety ?? null,
    entryPrice:  entry.entry_price ?? entry.entryPrice ?? entry.entry_price_reference ?? entry.entryPriceReference ?? null,
    equityValue: entry.dcf_equity_value ?? entry.equity_value ?? entry.equityValue ?? null,
    isSimulated: !!(entry.shares_outstanding_is_simulated ?? entry.share_count_is_simulated ?? entry.isSimulatedShareCount),
    shareSource: entry.shares_outstanding_source ?? entry.share_count_source ?? entry.shareCountSource ?? null,
  };
}

function memoKey(ticker)       { return `bridgewater_synthesis_memo_${ticker}`; }
function quickNoteKey(ticker)  { return `bridgewater_senior_quick_note_${ticker}`; }
function valReviewKey(ticker)  { return `bridgewater_senior_valuation_review_${ticker}`; }

// ── Markdown / ML text cleanup ────────────────────────────────────────────────
function stripInlineMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^#{1,6}\s+/, '');
}

function isTableSeparator(line) {
  return /^\|[\s\-:|]+\|/.test(line.trim());
}

function isTableRow(line) {
  return line.trim().startsWith('|');
}

function isBulletLine(line) {
  return /^[-*•]\s+/.test(line.trim());
}

function isHorizontalRule(line) {
  return /^[-_*]{3,}\s*$/.test(line.trim());
}

// Lines containing deprecated ML/model-quality terms are suppressed.
const ML_FILTER_RE = [
  /model confidence/i,
  /outperform prob/i,
  /base recommendation band/i,
  /recommendation gate/i,
  /low model confidence/i,
  /transparent fallback model/i,
  /logistic regression/i,
  /random forest/i,
  /sklearn/i,
  /supervised model/i,
];

function containsMLTerm(text) {
  return ML_FILTER_RE.some(re => re.test(text));
}

// Parses raw body text into typed blocks for clean rendering.
// Returns: Array<{ type: 'paragraph'|'bullets', text?: string, items?: {text}[] }>
function parseSectionBody(raw) {
  if (!raw) return [];
  const lines     = raw.split('\n');
  const blocks    = [];
  let bulletAcc   = [];

  function flushBullets() {
    if (bulletAcc.length > 0) {
      blocks.push({ type: 'bullets', items: [...bulletAcc] });
      bulletAcc = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line)                  { flushBullets(); continue; }
    if (isHorizontalRule(line)) { flushBullets(); continue; }
    if (isTableSeparator(line)) continue;
    if (containsMLTerm(line))   continue;

    if (isTableRow(line)) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 1) {
        const text = stripInlineMarkdown(cells[0]);
        if (text && !containsMLTerm(text)) bulletAcc.push({ text });
      }
      continue;
    }

    if (isBulletLine(line)) {
      const text = stripInlineMarkdown(line.replace(/^[-*•]\s+/, ''));
      if (text && !containsMLTerm(text)) bulletAcc.push({ text });
      continue;
    }

    flushBullets();
    const cleaned = stripInlineMarkdown(line);
    if (cleaned && !containsMLTerm(cleaned))
      blocks.push({ type: 'paragraph', text: cleaned });
  }
  flushBullets();
  return blocks;
}

// ── Section body renderer ─────────────────────────────────────────────────────
function MemoSectionBody({ body }) {
  const blocks = parseSectionBody(body);
  if (!blocks.length) return null;
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        if (block.type === 'paragraph') {
          return (
            <p key={i} className="text-sm text-gray-700 leading-relaxed">
              {block.text}
            </p>
          );
        }
        if (block.type === 'bullets') {
          return (
            <ul key={i} className="space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-[5px]" />
                  {item.text}
                </li>
              ))}
            </ul>
          );
        }
        return null;
      })}
    </div>
  );
}

// Returns true for sections whose content belongs in Evidence Challenge Summary, not the memo card.
function isIndicatorSection(sec) {
  const id    = (sec.id    ?? '').toLowerCase();
  const title = (sec.title ?? '').toLowerCase();
  return id.includes('indicator') || id.includes('driver')
    || title.includes('indicator') || title.includes('driver');
}

// ── Junior Memo Summary ───────────────────────────────────────────────────────
const SENIOR_REVIEW_FOCUS = [
  'Are revenue growth and margin assumptions reasonable?',
  'Does the DCF rely too heavily on terminal value?',
  'Is the entry price clearly labeled as illustrative?',
  'Are risks clearly linked to evidence?',
];

// Fallback when no saved memo is found — no indicator section included.
const FALLBACK_SECTIONS = [
  {
    id:   'key_thesis',
    title: 'Key thesis',
    body:  'NVIDIA shows strong AI infrastructure demand and revenue momentum, supported by 3-statement projections and DCF valuation.',
  },
  {
    id:   'valuation_assumptions',
    title: 'Valuation assumptions to challenge',
    body:  '- DCF sensitivity to discount rate and terminal growth rate\n- Entry price reference uses simulated share count\n- Revenue growth assumptions are aggressive relative to historical range',
  },
  {
    id:   'senior_takeaway',
    title: 'Senior takeaway',
    body:  'Package is ready for senior review. Key escalation items: export control exposure, valuation sensitivity, and entry price illustration caveat.',
  },
];

function JuniorMemoSummary({ ticker, theme }) {
  const [memoData, setMemoData] = useState(null);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(memoKey(ticker));
      setMemoData(raw ? JSON.parse(raw) : null);
    } catch {
      setMemoData(null);
    }
    setLoaded(true);
  }, [ticker]);

  if (!loaded) return null;

  const hasSections   = Array.isArray(memoData?.sections) && memoData.sections.length > 0;
  const hasLegacyMemo = memoData?.memo && typeof memoData.memo === 'object';
  const isFallback    = !hasSections && !hasLegacyMemo;

  const allSections = hasSections
    ? memoData.sections
    : hasLegacyMemo
      ? Object.entries(memoData.memo)
          .filter(([, val]) => val?.trim())
          .map(([key, val]) => ({ id: key, title: humanizeLabel(key), body: val }))
      : FALLBACK_SECTIONS;

  // Indicator / driver sections are shown in Evidence Challenge Summary — not here.
  const visibleSections = allSections.filter(sec => !isIndicatorSection(sec));

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className={`${theme.headerBg} border-b ${theme.headerBorder} px-6 py-4 flex items-center justify-between gap-3 flex-wrap`}>
        <div className="flex items-center gap-2 flex-wrap">
          <p className={CARD_ST}>Junior Memo Summary</p>
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${theme.pillCls}`}>
            Junior-authored
          </span>
          <span className={`text-[10px] ${theme.accentText}`}>Read-only</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {isFallback && (
            <span className="text-[10px] text-gray-400">No saved memo — showing illustrative summary</span>
          )}
          {memoData?.readyForReview && (
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Marked ready for review
            </span>
          )}
          {memoData?.savedAt && (
            <span className="text-[10px] text-gray-400">
              Saved {new Date(memoData.savedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {visibleSections.map((sec, i) => (
          <div key={sec.id ?? i} className="px-6 py-4">
            <p className={`${LABEL_ST} ${theme.accentText} mb-2`}>{sec.title}</p>
            <MemoSectionBody body={sec.body} />
          </div>
        ))}
      </div>

      {/* Senior review focus */}
      <div className="px-6 pb-5 pt-1">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <p className={`${LABEL_ST} text-slate-600`}>Senior Review Focus</p>
          <ul className="space-y-1.5">
            {SENIOR_REVIEW_FOCUS.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-[4px]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Valuation Model Review (Interactive Workspace) ────────────────────────────

// compact=true uses smaller font/padding to fit longer option labels (e.g. "Conservative") without clipping
function SegmentedControl({ options, value, onChange, compact = false }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 font-semibold transition-colors border-r last:border-r-0 border-gray-200 text-center leading-tight
            ${compact ? 'py-2 px-1 text-[9px]' : 'py-1.5 px-2 text-[11px]'}
            ${value === opt ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ChallengeQ({ q }) {
  return (
    <div className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
      <span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-slate-600 font-bold text-[8px] mt-0.5">?</span>
      {q}
    </div>
  );
}

function SeniorNoteField({ value, onChange, placeholder }) {
  return (
    <div className="space-y-1.5">
      <p className={LABEL_ST}>Senior Rationale</p>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full text-xs text-gray-800 bg-amber-50 border border-amber-200 rounded-lg p-3 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-colors leading-relaxed"
      />
    </div>
  );
}

function ThreeStmtPanel({ revenueScenario, setRevenueScenario, grossMarginAdj, setGrossMarginAdj, fcfConversion, setFcfConversion, note, setNote, baselineStr }) {
  const CHALLENGES = [
    'Are revenue growth assumptions supported by verifiable demand evidence?',
    'Are gross margin assumptions too optimistic relative to the industry range?',
    'Does projected FCF align with the identified business risk profile?',
  ];
  const scenarioDesc = { Downside: '~8–12% YoY est.', Base: '~18–25% YoY est.', Upside: '~30–40% YoY est.' };
  const marginDesc   = { '0%': 'No adjustment', '-2%': 'Moderate haircut for cycle risk', '-5%': 'Stressed — apply if structural risk' };
  const fcfDesc      = { Conservative: 'Higher capex, lower conversion', Base: 'As projected', Aggressive: 'Full FCF realization assumed' };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <p className={LABEL_ST}>Revenue Growth Scenario</p>
          <SegmentedControl options={['Downside', 'Base', 'Upside']} value={revenueScenario} onChange={setRevenueScenario} />
          <p className="text-[10px] text-gray-500 min-h-[14px]">{scenarioDesc[revenueScenario]}</p>
        </div>
        <div className="space-y-1.5">
          <p className={LABEL_ST}>Gross Margin Adjustment</p>
          <SegmentedControl options={['0%', '-2%', '-5%']} value={grossMarginAdj} onChange={setGrossMarginAdj} />
          <p className="text-[10px] text-gray-500 min-h-[14px]">{marginDesc[grossMarginAdj]}</p>
        </div>
        <div className="space-y-1.5">
          <p className={LABEL_ST}>FCF Conversion</p>
          <SegmentedControl options={['Conservative', 'Base', 'Aggressive']} value={fcfConversion} onChange={setFcfConversion} compact />
          <p className="text-[10px] text-gray-500 min-h-[14px]">{fcfDesc[fcfConversion]}</p>
        </div>
      </div>
      {baselineStr && (
        <p className="text-[10px] text-gray-400">
          <span className="font-semibold">Junior baseline:</span> {baselineStr}
        </p>
      )}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
        <p className={`${LABEL_ST} mb-2`}>Scenario Summary</p>
        <p className="text-xs text-slate-700">
          Revenue: <span className="font-semibold">{revenueScenario}</span> · Gross margin: <span className="font-semibold">{grossMarginAdj}</span> · FCF conversion: <span className="font-semibold">{fcfConversion}</span>
        </p>
        {revenueScenario === 'Downside' && (
          <p className="text-[10px] text-amber-700 mt-1.5 font-medium">Downside scenario may require escalation rationale documentation.</p>
        )}
      </div>
      <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-lg space-y-2.5">
        <p className={`${LABEL_ST} text-blue-600`}>Challenge Questions</p>
        {CHALLENGES.map((q, i) => <ChallengeQ key={i} q={q} />)}
      </div>
      <p className="text-[10px] text-gray-300">Source: three_statement_models</p>
      <SeniorNoteField value={note} onChange={setNote} placeholder="Add a senior note on 3-statement assumptions…" />
    </div>
  );
}

function DcfPanel({ dcfData, discountRate, setDiscountRate, terminalGrowth, setTerminalGrowth, fcfHaircut, setFcfHaircut, note, setNote, baselineStr, fairValuePerShare }) {
  const CHALLENGES = [
    'Is terminal value driving more than 60–70% of total DCF value?',
    'How sensitive is fair value to a 100–200 bps discount rate change?',
    'Should a downside FCF haircut be applied before escalation?',
  ];
  const haircuts    = { '0%': 0, '-5%': 0.05, '-10%': 0.10, '-15%': 0.15 };
  const fairValue   = fairValuePerShare ?? null;
  const haircutPct  = haircuts[fcfHaircut] ?? 0;
  const conservativeFV = fairValue ? (fairValue * (1 - haircutPct)).toFixed(2) : null;
  return (
    <div className="space-y-5">
      <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-[10px] font-mono text-gray-600">DCF = PV of projected FCF + PV of terminal value</p>
      </div>
      {baselineStr && (
        <p className="text-[10px] text-gray-400">
          <span className="font-semibold">Junior baseline:</span> {baselineStr}
        </p>
      )}
      {dcfData?.valuation_date && (
        <p className="text-[10px] text-gray-400" title="Latest market price row used by the DCF model.">
          <span className="font-semibold">Valuation snapshot date:</span> {dcfData.valuation_date}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={LABEL_ST}>Discount Rate (WACC)</p>
            <span className="text-xs font-bold text-gray-900">{discountRate}%</span>
          </div>
          <input
            type="range" min={7} max={16} step={0.5} value={discountRate}
            onChange={e => setDiscountRate(parseFloat(e.target.value))}
            className="w-full accent-slate-800 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-400"><span>7%</span><span>16%</span></div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={LABEL_ST}>Terminal Growth Rate</p>
            <span className="text-xs font-bold text-gray-900">{terminalGrowth}%</span>
          </div>
          <input
            type="range" min={1} max={5} step={0.5} value={terminalGrowth}
            onChange={e => setTerminalGrowth(parseFloat(e.target.value))}
            className="w-full accent-slate-800 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-400"><span>1%</span><span>5%</span></div>
        </div>
        <div className="space-y-1.5">
          <p className={LABEL_ST}>FCF Haircut</p>
          <SegmentedControl options={['0%', '-5%', '-10%', '-15%']} value={fcfHaircut} onChange={setFcfHaircut} />
          <p className="text-[10px] text-gray-500">
            {fcfHaircut === '0%' ? 'No haircut applied' : `${fcfHaircut} reduction to projected FCF`}
          </p>
        </div>
      </div>
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
        <p className={`${LABEL_ST} mb-1`}>Sensitivity Review</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2.5 bg-white border border-gray-200 rounded-lg">
            <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-1">Base Case</p>
            <p className="text-xs font-bold text-gray-900">{fairValue ? `$${fairValue.toFixed(2)}` : 'Illustrative'}</p>
            <p className="text-[9px] text-gray-500">WACC {discountRate}% · TGR {terminalGrowth}%</p>
          </div>
          <div className="text-center p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 mb-1">Conservative</p>
            <p className="text-xs font-bold text-gray-900">
              {conservativeFV && fcfHaircut !== '0%' ? `$${conservativeFV}` : (fcfHaircut !== '0%' ? `${fcfHaircut} haircut` : 'No haircut')}
            </p>
            <p className="text-[9px] text-gray-500">FCF haircut: {fcfHaircut}</p>
          </div>
          <div className="text-center p-2.5 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-[9px] font-bold uppercase tracking-wide text-red-600 mb-1">Sensitivity Risk</p>
            <p className="text-xs font-bold text-gray-700">Rate + growth</p>
            <p className="text-[9px] text-gray-500">WACC sensitivity high</p>
          </div>
        </div>
        {!dcfData && <p className="text-[10px] text-amber-600 font-medium">No DCF packet data — illustrative only.</p>}
      </div>
      <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-lg space-y-2.5">
        <p className={`${LABEL_ST} text-blue-600`}>Challenge Questions</p>
        {CHALLENGES.map((q, i) => <ChallengeQ key={i} q={q} />)}
      </div>
      <p className="text-[10px] text-gray-300">Source: dcf_valuations</p>
      <SeniorNoteField value={note} onChange={setNote} placeholder="Add a senior note on DCF sensitivity…" />
    </div>
  );
}

function EntryPricePanel({ entryData, marginOfSafety, setMarginOfSafety, reviewStance, setReviewStance, note, setNote, baselineStr, fairValuePerShare: externalFVPS, ticker }) {
  const CHALLENGES = [
    'Is the margin of safety appropriate given current market conditions?',
    'Is the fair value per share clearly based on an illustrative DCF, not a live market price?',
    'If share count is simulated, is the illustrative caveat prominently documented?',
  ];
  const normalized    = normalizeEntryPrice(entryData);
  const fairValuePS   = externalFVPS ?? normalized.fairValue ?? null;
  const isSimulated   = normalized.isSimulated;
  const sharesSource  = normalized.shareSource;
  const packetMoSPct  = normalizePctToInt(normalized.mos);
  const computedEntry = fairValuePS != null ? (fairValuePS * (1 - marginOfSafety / 100)).toFixed(2) : null;
  const juniorEntryRef = fairValuePS != null && packetMoSPct != null
    ? (fairValuePS * (1 - packetMoSPct / 100)).toFixed(2)
    : (normalized.entryPrice != null ? Number(normalized.entryPrice).toFixed(2) : null);
  const stanceDesc    = {
    Conservative: 'Higher MoS · lower entry reference · more protective',
    Balanced:     'Standard MoS · balanced risk / return framing',
    Aggressive:   'Lower MoS · higher entry reference · less protective',
  };
  return (
    <div className="space-y-5">
      {isSimulated && (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-amber-600 font-bold flex-shrink-0">⚠</span>
          <div>
            <p className="text-xs font-semibold text-amber-800">Share count is simulated for demo purposes, so this reference is illustrative only.</p>
            {sharesSource && <p className="text-[10px] text-amber-700 mt-0.5">Source: {sharesSource}</p>}
          </div>
        </div>
      )}
      {baselineStr && (
        <p className="text-[10px] text-gray-400">
          <span className="font-semibold">Junior baseline:</span> {baselineStr}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={LABEL_ST}>Margin of Safety</p>
            <div className="flex items-center gap-2">
              {packetMoSPct != null && <span className="text-[9px] text-gray-400">Packet: {packetMoSPct}%</span>}
              <span className="text-sm font-bold text-gray-900">{marginOfSafety}%</span>
            </div>
          </div>
          <input
            type="range" min={15} max={50} step={1} value={marginOfSafety}
            onChange={e => setMarginOfSafety(parseInt(e.target.value))}
            className="w-full accent-slate-800 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-gray-400">
            <span>15% (Aggressive)</span><span>50% (Conservative)</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className={LABEL_ST}>Review Stance</p>
          <SegmentedControl options={['Conservative', 'Balanced', 'Aggressive']} value={reviewStance} onChange={setReviewStance} compact />
          <p className="text-[10px] text-gray-500">{stanceDesc[reviewStance]}</p>
        </div>
      </div>
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
        <p className={`${LABEL_ST} mb-1`}>Illustrative Entry Reference</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-center">
            <p className="text-[9px] text-gray-400 mb-0.5">Fair Value / Share</p>
            <p className="text-sm font-bold text-gray-900">{fairValuePS ? `$${fairValuePS.toFixed(2)}` : '—'}</p>
          </div>
          <p className="text-gray-300 font-bold text-lg">×</p>
          <div className="text-center">
            <p className="text-[9px] text-gray-400 mb-0.5">Price factor after MoS</p>
            <p className="text-sm font-bold text-gray-900">{100 - marginOfSafety}%</p>
            <p className="text-[8px] text-gray-400 mt-0.5">= 1 − MoS</p>
          </div>
          <p className="text-gray-300 font-bold text-lg">=</p>
          <div className="text-center">
            <p className="text-[9px] text-gray-400 mb-0.5">Entry Reference</p>
            <p className="text-sm font-bold text-emerald-700">{computedEntry ? `$${computedEntry}` : '—'}</p>
          </div>
        </div>
        <p className="text-[9px] font-mono text-gray-400">Entry Price Reference = Fair Value per Share × (1 − Margin of Safety)</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {['Illustrative entry reference', 'Requires human review', 'Not a trade instruction'].map(lbl => (
            <span key={lbl} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-[9px] font-semibold text-gray-500">{lbl}</span>
          ))}
        </div>
        {fairValuePS && (() => {
          const isUnchanged = packetMoSPct != null && marginOfSafety === packetMoSPct;
          return (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              {packetMoSPct != null && (
                isUnchanged ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 text-[9px] rounded font-semibold">
                    Unchanged from Junior baseline
                  </span>
                ) : (
                  <div className="space-y-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] rounded font-semibold">
                      Senior override active
                    </span>
                    <p className="text-[9px] text-gray-400">Changed locally for review; no backend artifact overwritten.</p>
                  </div>
                )
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Junior baseline</p>
                  <p className="text-xs text-gray-600">MoS: <span className="font-semibold">{packetMoSPct != null ? `${packetMoSPct}%` : '—'}</span></p>
                  <p className="text-xs text-gray-600">Entry ref: <span className="font-semibold">{juniorEntryRef ? `$${juniorEntryRef}` : '—'}</span></p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Senior adjusted</p>
                  <p className="text-xs text-slate-700">MoS: <span className="font-semibold text-slate-900">{marginOfSafety}%</span></p>
                  <p className="text-xs text-slate-700">Entry ref: <span className="font-semibold text-slate-900">{computedEntry ? `$${computedEntry}` : '—'}</span></p>
                </div>
              </div>
              <p className="text-[9px] text-gray-400 font-mono leading-relaxed">
                Source: Junior Step 4 valuation package · entry_price_models.entry_prices.{ticker}
              </p>
            </div>
          );
        })()}
        {!fairValuePS && (
          <div className="mt-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-semibold text-amber-800 mb-0.5">Valuation package not loaded from Junior packet.</p>
            <p className="text-[10px] text-gray-400 font-mono">entry_price_models.entry_prices.{ticker ?? '[ticker]'}</p>
          </div>
        )}
      </div>
      <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-lg space-y-2.5">
        <p className={`${LABEL_ST} text-blue-600`}>Challenge Questions</p>
        {CHALLENGES.map((q, i) => <ChallengeQ key={i} q={q} />)}
      </div>
      <p className="text-[10px] text-gray-300">Source: entry_price_models.entry_prices.{ticker}</p>
      <SeniorNoteField value={note} onChange={setNote} placeholder="Add a senior note on margin of safety or entry reference…" />
    </div>
  );
}

function ValuationModelReview({ packet, ticker, theme }) {
  const [expandedCard, setExpandedCard] = useState(null);
  const [revenueScenario, setRevenueScenario] = useState('Base');
  const [grossMarginAdj, setGrossMarginAdj]   = useState('0%');
  const [fcfConversion, setFcfConversion]     = useState('Base');

  // Compute packet baselines before seeding initial state.
  // parent guards isLoading so packet is always defined on first mount.
  const dcfData         = packet?.dcf_valuations?.valuations?.[ticker] ?? null;
  const entryData       = packet?.entry_price_models?.entry_prices?.[ticker] ?? null;
  const normalizedEntry = normalizeEntryPrice(entryData);
  const fairValuePerShare = normalizedEntry.fairValue ?? dcfData?.implied_share_price ?? null;
  const dcfBaseWACC     = parseFloat((dcfData?.wacc ?? dcfData?.discount_rate ?? 9).toFixed(1));
  const dcfBaseTGR      = parseFloat((dcfData?.terminal_growth_rate ?? dcfData?.terminal_growth ?? 2.7).toFixed(1));
  const baselineMoS     = normalizePctToInt(normalizedEntry.mos) ?? 38;

  const [discountRate, setDiscountRate]       = useState(dcfBaseWACC);
  const [terminalGrowth, setTerminalGrowth]   = useState(dcfBaseTGR);
  const [fcfHaircut, setFcfHaircut]           = useState('0%');
  const [marginOfSafety, setMarginOfSafety]   = useState(baselineMoS);
  const [reviewStance, setReviewStance]       = useState('Balanced');
  const [notes, setNotes] = useState({
    three_statement_models: '',
    dcf_valuations:         '',
    entry_price_models:     '',
  });

  const setNote = (key, val) => setNotes(prev => ({ ...prev, [key]: val }));
  const toggle  = key => setExpandedCard(prev => prev === key ? null : key);

  // Persist valuation review adjustments so Step 2 (Action Proposal) can read them
  useEffect(() => {
    try {
      const raw = localStorage.getItem(valReviewKey(ticker));
      if (raw) {
        const s = JSON.parse(raw);
        if (s.revenueScenario) setRevenueScenario(s.revenueScenario);
        if (s.grossMarginAdj)  setGrossMarginAdj(s.grossMarginAdj);
        if (s.fcfConversion)   setFcfConversion(s.fcfConversion);
        if (s.discountRate  != null) setDiscountRate(s.discountRate);
        if (s.terminalGrowth != null) setTerminalGrowth(s.terminalGrowth);
        if (s.fcfHaircut)      setFcfHaircut(s.fcfHaircut);
        if (s.marginOfSafety != null) setMarginOfSafety(s.marginOfSafety);
        if (s.reviewStance)    setReviewStance(s.reviewStance);
        if (s.notes)           setNotes(s.notes);
      } else {
        // No saved state — seed defaults from packet data
        const pMoS = normalizePctToInt(normalizedEntry.mos);
        if (pMoS != null) setMarginOfSafety(pMoS);
        const pWACC = dcfData?.discount_rate ?? dcfData?.wacc;
        if (pWACC != null) setDiscountRate(parseFloat(Number(pWACC).toFixed(1)));
        const pTGR = dcfData?.terminal_growth_rate ?? dcfData?.terminal_growth;
        if (pTGR != null) setTerminalGrowth(parseFloat(Number(pTGR).toFixed(1)));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    try {
      localStorage.setItem(valReviewKey(ticker), JSON.stringify({
        revenueScenario, grossMarginAdj, fcfConversion,
        discountRate, terminalGrowth, fcfHaircut,
        marginOfSafety, reviewStance, notes,
      }));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueScenario, grossMarginAdj, fcfConversion, discountRate, terminalGrowth, fcfHaircut, marginOfSafety, reviewStance, notes.three_statement_models, notes.dcf_valuations, notes.entry_price_models, ticker]);

  const hasData = {
    three_statement_models: !!(packet?.three_statement_models?.models?.[ticker]),
    dcf_valuations:         !!(packet?.dcf_valuations?.valuations?.[ticker]),
    entry_price_models:     !!(packet?.entry_price_models?.entry_prices?.[ticker]),
  };

  function resetThreeStmt() { setRevenueScenario('Base'); setGrossMarginAdj('0%'); setFcfConversion('Base'); }
  function resetDcf()       { setDiscountRate(dcfBaseWACC); setTerminalGrowth(dcfBaseTGR); setFcfHaircut('0%'); }
  function resetEntry()     { setMarginOfSafety(baselineMoS); setReviewStance('Balanced'); setNotes(prev => ({ ...prev, entry_price_models: '' })); }

  const BASELINE_STRINGS = {
    three_statement_models: 'Base scenario · 0% margin adjustment · Base FCF conversion',
    dcf_valuations:         `${dcfBaseWACC.toFixed(1)}% discount rate · ${dcfBaseTGR.toFixed(1)}% terminal growth · 0% FCF haircut`,
    entry_price_models:     `${baselineMoS}% margin of safety · Balanced stance`,
  };
  const RESET_HANDLERS = {
    three_statement_models: resetThreeStmt,
    dcf_valuations:         resetDcf,
    entry_price_models:     resetEntry,
  };

  const CARDS = [
    { key: 'three_statement_models', title: '3-Statement Model',     purposeShort: 'Challenge revenue, margin, and FCF assumptions.',             formula: null },
    { key: 'dcf_valuations',         title: 'DCF Valuation',         purposeShort: 'Stress-test discount rate, terminal growth, and FCF haircut.', formula: 'DCF = PV of projected FCF + PV of terminal value' },
    { key: 'entry_price_models',     title: 'Entry Price Reference', purposeShort: 'Adjust margin of safety and document escalation readiness.',   formula: null },
  ];

  const ACTION_LABELS = {
    three_statement_models: 'Challenge assumptions',
    dcf_valuations:         'Stress-test valuation',
    entry_price_models:     'Adjust margin of safety',
  };

  const expandedConfig = CARDS.find(c => c.key === expandedCard);
  const secondaryCards = CARDS.filter(c => c.key !== expandedCard);

  function renderPanel(key) {
    const baselineStr = BASELINE_STRINGS[key];
    if (key === 'three_statement_models') {
      return (
        <ThreeStmtPanel
          revenueScenario={revenueScenario} setRevenueScenario={setRevenueScenario}
          grossMarginAdj={grossMarginAdj}   setGrossMarginAdj={setGrossMarginAdj}
          fcfConversion={fcfConversion}     setFcfConversion={setFcfConversion}
          note={notes.three_statement_models}
          setNote={val => setNote('three_statement_models', val)}
          baselineStr={baselineStr}
        />
      );
    }
    if (key === 'dcf_valuations') {
      return (
        <DcfPanel
          dcfData={dcfData}
          discountRate={discountRate} setDiscountRate={setDiscountRate}
          terminalGrowth={terminalGrowth} setTerminalGrowth={setTerminalGrowth}
          fcfHaircut={fcfHaircut} setFcfHaircut={setFcfHaircut}
          note={notes.dcf_valuations}
          setNote={val => setNote('dcf_valuations', val)}
          baselineStr={baselineStr}
          fairValuePerShare={fairValuePerShare}
        />
      );
    }
    if (key === 'entry_price_models') {
      return (
        <EntryPricePanel
          entryData={entryData}
          marginOfSafety={marginOfSafety} setMarginOfSafety={setMarginOfSafety}
          reviewStance={reviewStance} setReviewStance={setReviewStance}
          note={notes.entry_price_models}
          setNote={val => setNote('entry_price_models', val)}
          baselineStr={baselineStr}
          fairValuePerShare={fairValuePerShare}
          ticker={ticker}
        />
      );
    }
    return null;
  }

  function DataBadge({ dataAvailable }) {
    if (dataAvailable) {
      return (
        <span className="flex items-center gap-1 text-[9px] font-semibold text-teal-700 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
          Ready
        </span>
      );
    }
    return <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">No data</span>;
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <div>
        <p className={`${CARD_ST} mb-1`}>Valuation Model Review</p>
        <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
          Challenge assumptions, stress-test valuation, and document senior rationale. Select a model to open the review workspace.
        </p>
      </div>

      {expandedCard ? (
        <div className="flex flex-col md:flex-row gap-4">
          {/* Expanded panel — ~3/4 width for more room */}
          <div className="md:flex-[3] min-w-0">
            <div className={`bg-white border ${theme.accentBorder} rounded-xl overflow-hidden shadow-sm`}>
              {/* Brand accent top bar */}
              <div className={`h-1 ${theme.accentStripe}`} />
              <div className={`${theme.headerBg} border-b ${theme.headerBorder} px-5 py-3.5 flex items-center justify-between gap-3`}>
                <div>
                  <p className="text-sm font-bold text-gray-900">{expandedConfig.title}</p>
                  <p className={`text-[10px] ${theme.accentText} font-semibold uppercase tracking-wide mt-0.5`}>
                    {ACTION_LABELS[expandedCard]}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={RESET_HANDLERS[expandedCard]}
                    className="text-[10px] text-gray-400 hover:text-gray-700 font-medium px-2.5 py-1.5 rounded-md bg-white hover:bg-gray-50 transition-colors border border-gray-200 hover:border-gray-300"
                  >
                    Reset to Junior baseline
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedCard(null)}
                    className="text-xs text-gray-400 hover:text-gray-700 font-semibold px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
              <div className="p-5">
                {renderPanel(expandedCard)}
              </div>
            </div>
          </div>

          {/* Secondary cards — ~1/4 */}
          <div className="md:flex-[1] flex flex-col gap-3 min-w-0">
            <p className={`${LABEL_ST} text-gray-300 px-1`}>Other models</p>
            {secondaryCards.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => toggle(c.key)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-bold text-gray-900">{c.title}</p>
                  <DataBadge dataAvailable={hasData[c.key]} />
                </div>
                <p className={`text-[10px] ${theme.accentText} font-semibold`}>{ACTION_LABELS[c.key]} →</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4 items-stretch">
          {CARDS.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              className={`w-full text-left bg-white border border-gray-200 rounded-xl p-5 flex flex-col cursor-pointer transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg ${theme.hoverBorderCls} ${theme.hoverBgCls} group`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">{c.title}</p>
                <DataBadge dataAvailable={hasData[c.key]} />
              </div>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">{c.purposeShort}</p>
              {c.formula ? (
                <div className="mt-3 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                  <p className="text-[10px] font-mono text-gray-500">{c.formula}</p>
                </div>
              ) : (
                <div className="mt-3 px-3 py-2 invisible" aria-hidden="true">
                  <p className="text-[10px]">&nbsp;</p>
                </div>
              )}
              <div className="mt-auto pt-3 flex items-center justify-between border-t border-gray-100">
                <span className={`text-xs font-bold ${theme.accentText}`}>{ACTION_LABELS[c.key]}</span>
                <span className="text-[10px] text-gray-400 group-hover:text-gray-600 transition-colors font-medium">Open workspace →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Evidence Challenge Summary ────────────────────────────────────────────────
const FALLBACK_POSITIVES = [
  { label: 'AI demand momentum' },
  { label: 'Data center revenue growth' },
  { label: 'Gross margin quality' },
];

const FALLBACK_RISKS = [
  { label: 'Export control risk' },
  { label: 'Supply chain risk' },
  { label: 'Valuation sensitivity' },
  { label: 'Hyperscaler capex dependence' },
];

const ECS_SENIOR_READ =
  'The evidence is constructive on demand and margins, but senior review should focus on concentration risk, export controls, and DCF sensitivity.';

// Guard against "Indicator" appearing as a raw parsed label.
function isSpuriousLabel(label) {
  return /^indicator\s*$/i.test(label.trim());
}

function EvidenceChallengeSummary({ scorecard, ragEvidence, selectedTicker, theme }) {
  const indicators    = scorecard?.indicators ?? [];
  const hasIndicators = indicators.length > 0;

  const positives = hasIndicators
    ? indicators
        .filter(i => i.direction === 'positive')
        .map(i => ({ label: humanizeLabel(i.name) }))
        .filter(item => !isSpuriousLabel(item.label))
    : FALLBACK_POSITIVES;

  const risks = hasIndicators
    ? indicators
        .filter(i => i.direction !== 'positive')
        .map(i => ({ label: humanizeLabel(i.name) }))
        .filter(item => !isSpuriousLabel(item.label))
    : FALLBACK_RISKS;

  const recRuleNames  = (ragEvidence?.recommendation_rules?.results ?? []).map(r => r.title).slice(0, 3);
  const riskRuleNames = (ragEvidence?.risk_rules?.results ?? []).map(r => r.title).slice(0, 2);

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={CARD_ST}>Evidence Challenge Summary</p>
        <span className="text-[10px] text-gray-400 font-medium">
          {hasIndicators
            ? `From indicator scorecard · ${selectedTicker}`
            : 'Showing illustrative items — no scorecard loaded'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 ${theme.posBg} border ${theme.posBorder} rounded-lg`}>
          <p className={`${LABEL_ST} ${theme.posLabel} mb-2`}>Positive Evidence to Validate</p>
          <ul className="space-y-1.5">
            {positives.slice(0, 4).map((item, i) => (
              <li key={i} className={`flex items-center gap-1.5 text-xs ${theme.posText}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${theme.posDot} flex-shrink-0`} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <div className={`p-4 ${theme.riskBg} border ${theme.riskBorder} rounded-lg`}>
          <p className={`${LABEL_ST} ${theme.riskLabel} mb-2`}>Risk / Review Items</p>
          <ul className="space-y-1.5">
            {risks.slice(0, 4).map((item, i) => (
              <li key={i} className={`flex items-center gap-1.5 text-xs ${theme.riskText}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${theme.riskDot} flex-shrink-0`} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Senior read */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <p className={`${LABEL_ST} text-slate-500 mb-1`}>Senior read</p>
        <p className="text-xs text-slate-700 leading-relaxed italic">&ldquo;{ECS_SENIOR_READ}&rdquo;</p>
      </div>

      {(recRuleNames.length > 0 || riskRuleNames.length > 0) && (
        <div>
          <p className={`${LABEL_ST} mb-2`}>Policy Evidence (RAG)</p>
          <div className="flex flex-wrap gap-1.5">
            {recRuleNames.map((name, i) => (
              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 text-[10px] rounded font-medium">
                {name}
              </span>
            ))}
            {riskRuleNames.map((name, i) => (
              <span key={`r${i}`} className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-100 text-[10px] rounded font-medium">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-300">Source: indicator_scorecards, rag_evidence</p>
    </section>
  );
}

// ── Senior Quick Note ─────────────────────────────────────────────────────────
function SeniorQuickNote({ ticker }) {
  const [note, setNote]     = useState('');
  const [saved, setSaved]   = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(quickNoteKey(ticker));
      setNote(raw ?? '');
    } catch { /* ignore */ }
    setLoaded(true);
  }, [ticker]);

  function handleChange(val) {
    setNote(val);
    setSaved(false);
    try {
      localStorage.setItem(quickNoteKey(ticker), val);
      setSaved(true);
    } catch { /* ignore */ }
  }

  if (!loaded) return null;

  return (
    <section className="bg-white border border-amber-200 rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className={CARD_ST}>Senior Quick Note</p>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            Senior-authored
          </span>
        </div>
        {saved && note && (
          <span className="text-[10px] text-gray-400">Saved</span>
        )}
      </div>
      <textarea
        value={note}
        onChange={e => handleChange(e.target.value)}
        placeholder="Add a quick senior review note on the Junior memo, valuation assumptions, or escalation concerns."
        rows={3}
        className="w-full text-sm text-gray-800 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-4 resize-none focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
      />
      <p className="text-[10px] text-gray-400">
        Saved to <span className="font-mono">bridgewater_senior_quick_note_{ticker}</span> (local only).
        Full notes and Risk Team handoff summary are in Step 3: Risk Handoff Package.
      </p>
    </section>
  );
}

// ── Banners ───────────────────────────────────────────────────────────────────
function StaticFallbackBanner() {
  return (
    <div className="max-w-5xl mx-auto px-8 pt-4">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
        <span className="text-amber-600 text-xs font-bold">!</span>
        <p className="text-xs text-amber-800 font-medium">Showing cached backend packet. Live data unavailable.</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-8 pb-24 space-y-5 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}
    </div>
  );
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

// ── Page content ──────────────────────────────────────────────────────────────
function SeniorAnalystContent() {
  const searchParams = useSearchParams();
  const { packet, isStaticFallback, isLoading } = useRecommendationPacket();

  const tickers = packet ? Object.keys(packet.recommendations || {}) : ['NVDA', 'KO'];
  const [selectedTicker, setSelectedTicker] = useState(
    searchParams.get('ticker') || 'NVDA'
  );

  const params = new URLSearchParams({ ticker: selectedTicker }).toString();

  if (isLoading) {
    return (
      <>
        <WorkflowNav role="Senior Analyst" subtitle="Review, challenge, and prepare escalation." />
        <SeniorProgressBar currentStep={1} />
        <LoadingSkeleton />
      </>
    );
  }

  const scorecard   = (packet?.indicator_scorecards?.scorecards ?? []).find(s => s.ticker === selectedTicker) ?? {};
  const ragEvidence = packet?.rag_evidence ?? {};
  const theses      = packet?.company_theses ?? {};
  const thesis      = theses[selectedTicker] ?? {};
  const companyName = thesis.company_name ?? selectedTicker;
  const theme       = getTickerTheme(selectedTicker);

  return (
    <>
      <WorkflowNav role="Senior Analyst" subtitle="Review, challenge, and prepare escalation." />
      <SeniorProgressBar currentStep={1} params={params} />

      {isStaticFallback && <StaticFallbackBanner />}

      {/* Page header */}
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-4">
          <CompanyLogo ticker={selectedTicker} size="lg" />
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Memo &amp; Valuation Review</h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">
              {companyName} · {selectedTicker}
            </p>
          </div>
        </div>
        <p className="text-base text-gray-600 leading-relaxed max-w-2xl">
          Review the Junior synthesis memo, challenge valuation assumptions, and decide whether the package is ready for escalation.
        </p>
        <div className={`w-20 h-1.5 ${theme.accentStripe} rounded-full mt-6 opacity-70`} />
      </div>

      {/* Ticker selector */}
      <div className="max-w-5xl mx-auto px-8 mb-8">
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

      <div className="max-w-5xl mx-auto px-8 pb-24 space-y-6">

        {/* A. Junior Memo Summary */}
        <JuniorMemoSummary ticker={selectedTicker} theme={theme} />

        {/* B. Valuation Model Review */}
        <ValuationModelReview packet={packet} ticker={selectedTicker} theme={theme} />

        {/* C. Evidence Challenge Summary */}
        <EvidenceChallengeSummary
          scorecard={scorecard}
          ragEvidence={ragEvidence}
          selectedTicker={selectedTicker}
          theme={theme}
        />

        {/* D. Senior Quick Note */}
        <SeniorQuickNote ticker={selectedTicker} />

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/"
            className="py-4 px-6 bg-gray-100 text-gray-900 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm"
          >
            ← Back to Role Selection
          </Link>
          <Link
            href={`/senior-analyst/trade-proposal?${params}`}
            className="flex-1 py-4 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm"
          >
            Continue to Action Proposal →
          </Link>
        </div>
      </div>
    </>
  );
}

export default function SeniorAnalystPage() {
  return (
    <Suspense>
      <SeniorAnalystContent />
    </Suspense>
  );
}
