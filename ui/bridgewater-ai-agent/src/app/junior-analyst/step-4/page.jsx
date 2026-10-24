'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import WorkflowProgressBar from '@/components/workflow/WorkflowProgressBar';
import { getLatestRecommendation } from '@/lib/backendApi';
import staticPacket from '@/data/recommendation_packet.json';

const LS_KEY = 'bridgewater_latest_recommendation_packet';

// Always try the live backend first so Step 4 gets the latest packet
// (which includes three_statement_models and dcf_valuations).
function useFreshPacket() {
  const [packet, setPacket] = useState(null);
  const [isStaticFallback, setIsStaticFallback] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getLatestRecommendation();
        if (!cancelled) {
          try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
          setPacket(data); setIsStaticFallback(false); setIsLoading(false); return;
        }
      } catch { /* fall through */ }
      try {
        const stored = localStorage.getItem(LS_KEY);
        if (stored && !cancelled) {
          setPacket(JSON.parse(stored)); setIsStaticFallback(false); setIsLoading(false); return;
        }
      } catch { /* fall through */ }
      if (!cancelled) { setPacket(staticPacket); setIsStaticFallback(true); setIsLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { packet, isStaticFallback, isLoading };
}

// ── Style constants ──────────────────────────────────────────────────────────
const LABEL_ST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';
const TH_BASE  = 'py-2.5 px-4 text-[10px] font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap bg-gray-50 border-b border-gray-200';
const TD_PROJ  = 'py-2.5 px-4 text-sm font-mono text-right text-gray-800 whitespace-nowrap';
const TD_DASH  = 'py-2.5 px-4 text-sm font-mono text-right text-gray-300 whitespace-nowrap';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtB(v) {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v) {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  if (Math.abs(n) <= 1) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

// ── Shared primitives ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 bg-gray-100 rounded-xl" />
      <div className="h-80 bg-gray-100 rounded-xl" />
      <div className="h-72 bg-gray-100 rounded-xl" />
    </div>
  );
}

function StaticFallbackBanner() {
  return (
    <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-xs text-amber-800 font-medium">
        Showing cached packet — live backend unavailable. Valuation fields may be absent.
      </p>
    </div>
  );
}

function ChevronIcon({ open, className = '' }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''} ${className}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function InfoPopover({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold hover:bg-gray-300 transition-colors flex items-center justify-center flex-shrink-0 select-none"
        aria-label="Model info"
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-5 z-30 w-80 p-4 bg-white border border-gray-200 rounded-xl shadow-xl space-y-3">
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors pt-1 border-t border-gray-100 w-full text-left"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function PopoverSection({ title, text }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{title}</p>
      <p className="text-[11px] text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}

function AssumptionPill({ label, value }) {
  if (value == null) return null;
  return (
    <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm min-w-[88px]">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

function CompanyLogo({ ticker, size = 'md' }) {
  const [err, setErr] = useState(false);
  const sz = { sm: 'w-8 h-8 text-[10px]', md: 'w-11 h-11 text-xs', lg: 'w-14 h-14 text-sm' }[size] ?? 'w-11 h-11 text-xs';
  if (!err) {
    return (
      <img
        src={`/logos/${ticker.toLowerCase()}.png`}
        alt={`${ticker} logo`}
        className={`${sz} object-contain rounded flex-shrink-0`}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className={`${sz} flex-shrink-0 bg-gray-100 border border-gray-200 rounded flex items-center justify-center font-black text-gray-600`}>
      {ticker.slice(0, 2)}
    </div>
  );
}

// ── Company identity card ─────────────────────────────────────────────────────
function CompanyHeader({ ticker, company, theme }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
      <CompanyLogo ticker={ticker} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-base font-bold text-gray-900 leading-tight">{company}</p>
          <span className="text-xs font-mono font-semibold text-gray-500">{ticker}</span>
        </div>
        {theme && <p className="text-xs text-gray-400 mt-0.5">{theme}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 text-[10px] rounded font-bold whitespace-nowrap">
          Filing-derived actuals
        </span>
        <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] rounded font-bold whitespace-nowrap">
          Assumption-based projections
        </span>
        <span className="px-2 py-1 bg-gray-100 text-gray-500 border border-gray-200 text-[10px] rounded font-bold whitespace-nowrap">
          No trade execution
        </span>
      </div>
    </div>
  );
}

// ── 3-Statement section helpers ───────────────────────────────────────────────
const GROUP_VARIANTS = {
  income:   { bg: 'bg-slate-800', text: 'text-white' },
  cashflow: { bg: 'bg-slate-500', text: 'text-slate-100' },
  balance:  { bg: 'bg-slate-200', text: 'text-slate-700' },
};

function GroupHeader({ label, colSpan, variant = 'income' }) {
  const { bg, text } = GROUP_VARIANTS[variant] ?? GROUP_VARIANTS.income;
  return (
    <tr>
      <td colSpan={colSpan} className={`py-2 px-4 ${bg}`}>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${text}`}>{label}</span>
      </td>
    </tr>
  );
}

function DataRow({ label, historical, projValues, dash }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-slate-50/60 transition-colors">
      <td className="py-2.5 px-4 text-sm text-left text-gray-700 font-medium whitespace-nowrap">{label}</td>
      <td className="py-2.5 px-4 text-sm text-right font-mono font-semibold text-gray-900 whitespace-nowrap bg-slate-50/60">
        {historical ?? <span className="text-gray-300 font-normal">—</span>}
      </td>
      {projValues.map((v, i) => (
        <td key={i} className={dash ? TD_DASH : TD_PROJ}>
          {dash ? '—' : (v ?? <span className="text-gray-300">—</span>)}
        </td>
      ))}
    </tr>
  );
}

// ── 3-Statement Model ─────────────────────────────────────────────────────────
function ThreeStatementSection({ model, ticker }) {
  const [showTable, setShowTable] = useState(false);

  if (!model) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
          <p className="text-xl font-extrabold text-slate-950 tracking-tight">3-Statement Model</p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-gray-400">3-statement model not available in this packet.</p>
        </div>
      </section>
    );
  }

  const hist     = model.historical_inputs ?? {};
  const bss      = model.balance_sheet_stub ?? {};
  const isp      = model.income_statement_projection ?? [];
  const cfp      = model.cash_flow_projection ?? [];
  const assum    = model.assumptions ?? {};
  const limits   = model.limitations ?? [];
  const baseYear = model.base_year ?? 'Base';

  const years  = isp.length > 0 ? isp.map((r) => r.year) : [1, 2, 3, 4, 5];
  const nCols  = 2 + years.length;
  const blanks = Array(years.length).fill(null);

  const projISP  = (key) => isp.map((r) => fmtB(r[key]));
  const projCFP  = (key) => cfp.map((r) => fmtB(r[key]));
  const firstFcf = cfp[0]?.free_cash_flow;
  const lastFcf  = cfp.length > 0 ? cfp[cfp.length - 1]?.free_cash_flow : null;

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-xl font-extrabold text-slate-950 tracking-tight">3-Statement Model</p>
            <InfoPopover>
              <PopoverSection
                title="Inputs"
                text="Filing-derived revenue, gross profit, operating income, net income, cash, debt, assets, and liabilities from the most recent 10-K."
              />
              <PopoverSection
                title="Logic"
                text="Projects the income statement and free cash flow for 5 years using explicit growth, margin, tax, D&A, CapEx, and working capital assumptions."
              />
              <PopoverSection
                title="Limitations"
                text="Balance sheet is base-year only. Projections are assumption-based estimates. Analyst review required before use."
              />
            </InfoPopover>
          </div>
          <p className="text-xs text-gray-500">
            Base year <span className="font-semibold text-gray-700">{baseYear}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 text-[10px] rounded font-bold">Actual</span>
            <span className="mx-1 text-gray-300">/</span>
            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] rounded font-bold">Projection</span>
          </p>
        </div>
      </div>

      {/* Assumptions bar */}
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/40">
        <p className={`${LABEL_ST} mb-2`}>Model Assumptions</p>
        <div className="flex flex-wrap gap-2">
          <AssumptionPill label="Rev. Growth"  value={fmtPct(assum.revenue_growth_start)} />
          <AssumptionPill label="Gross Margin" value={fmtPct(assum.gross_margin)} />
          <AssumptionPill label="Op. Margin"   value={fmtPct(assum.operating_margin)} />
          <AssumptionPill label="Tax Rate"     value={fmtPct(assum.tax_rate)} />
          <AssumptionPill label="CapEx % Rev"  value={fmtPct(assum.capex_pct_revenue)} />
          <AssumptionPill label="D&A % Rev"    value={fmtPct(assum.depreciation_pct_revenue)} />
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Explanation note */}
        <p className="text-xs text-gray-500 leading-relaxed border-l-4 border-slate-200 pl-3">
          The 3-statement model is used to estimate future operating performance. Revenue, margins, capex, D&A, and working capital are projection assumptions. Balance sheet detail is shown only as base-year reference.
        </p>

        {/* Compact summary */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className={`${LABEL_ST} mb-1`}>Base-Year Revenue</p>
            <p className="text-sm font-bold text-gray-900">{fmtB(hist.revenue) ?? '—'}</p>
            <p className="text-[10px] text-blue-600 font-semibold mt-0.5">Uses SEC filing evidence</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className={`${LABEL_ST} mb-1`}>Year 1 FCF</p>
            <p className="text-sm font-bold text-gray-900">{fmtB(firstFcf) ?? '—'}</p>
            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Uses assumption-based projections</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className={`${LABEL_ST} mb-1`}>Year {cfp.length || 5} FCF</p>
            <p className="text-sm font-bold text-gray-900">{fmtB(lastFcf) ?? '—'}</p>
            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Uses assumption-based projections</p>
          </div>
        </div>

        {/* Collapsible full table */}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors cursor-pointer ${
            showTable
              ? 'bg-slate-100 border-slate-300 text-slate-700'
              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest">View full 3-statement table</p>
          <ChevronIcon open={showTable} className="text-gray-500" />
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            showTable ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr>
                    <th className={`${TH_BASE} text-left min-w-[180px]`}>Metric</th>
                    <th className={`${TH_BASE} text-right text-slate-600 bg-slate-50`}>{baseYear} · Actual</th>
                    {years.map((y, i) => (
                      <th key={i} className={`${TH_BASE} text-right text-emerald-700`}>
                        {y ? `Y${i + 1} · ${y}` : `Y${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <GroupHeader label="Income Statement" colSpan={nCols} variant="income" />
                  <DataRow label="Revenue"          historical={fmtB(hist.revenue)}         projValues={projISP('revenue')} />
                  <DataRow label="Gross Profit"     historical={fmtB(hist.gross_profit)}     projValues={projISP('gross_profit')} />
                  <DataRow label="Operating Income" historical={fmtB(hist.operating_income)} projValues={projISP('operating_income')} />
                  <DataRow label="Net Income"       historical={fmtB(hist.net_income)}       projValues={projISP('net_income')} />

                  <GroupHeader label="Cash Flow" colSpan={nCols} variant="cashflow" />
                  <DataRow label="Depreciation & Amortization" historical={null} projValues={projCFP('depreciation')} />
                  <DataRow label="Capital Expenditures"        historical={null} projValues={projCFP('capital_expenditures')} />
                  <DataRow label="Δ Net Working Capital"       historical={null} projValues={projCFP('change_in_net_working_capital')} />
                  <DataRow label="Free Cash Flow"              historical={null} projValues={projCFP('free_cash_flow')} />

                  <GroupHeader label="Balance Sheet Snapshot" colSpan={nCols} variant="balance" />
                  <DataRow label="Cash"              historical={fmtB(bss.cash ?? hist.cash)}             projValues={blanks} dash />
                  <DataRow label="Debt"              historical={fmtB(bss.debt ?? hist.debt)}             projValues={blanks} dash />
                  <DataRow label="Total Assets"      historical={fmtB(bss.assets ?? hist.assets)}         projValues={blanks} dash />
                  <DataRow label="Total Liabilities" historical={fmtB(bss.liabilities ?? hist.liabilities)} projValues={blanks} dash />
                  <tr>
                    <td colSpan={nCols} className="px-4 pb-3 pt-1 bg-slate-50/40">
                      <p className="text-[10px] text-gray-400">
                        Balance sheet projection is not modeled in this demo — shown as base-year actuals for reference.
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {limits.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                <p className={`${LABEL_ST} mb-2`}>Limitations</p>
                <div className="flex flex-wrap gap-1.5">
                  {limits.map((l, i) => (
                    <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 text-[10px] rounded font-medium">
                      {typeof l === 'string' ? l.replace(/_/g, ' ') : JSON.stringify(l)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── DCF Sensitivity grid ──────────────────────────────────────────────────────
function SensitivityGrid({ table }) {
  if (!table?.length) return null;
  const drs = [...new Set(table.map((r) => r.discount_rate))].sort((a, b) => a - b);
  const tgs = [...new Set(table.map((r) => r.terminal_growth_rate))].sort((a, b) => a - b);
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className={`${TH_BASE} text-left`}>WACC \ TG</th>
            {tgs.map((tg, i) => (
              <th key={i} className={`${TH_BASE} text-right`}>TG {fmtPct(tg)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drs.map((dr, ri) => (
            <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 px-4 font-semibold text-gray-700 whitespace-nowrap">WACC {fmtPct(dr)}</td>
              {tgs.map((tg, ci) => {
                const cell = table.find((r) => r.discount_rate === dr && r.terminal_growth_rate === tg);
                return (
                  <td key={ci} className="py-2 px-4 text-right font-mono text-gray-800 whitespace-nowrap">
                    {cell?.enterprise_value != null ? fmtB(cell.enterprise_value) : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DCF Valuation ─────────────────────────────────────────────────────────────
function DcfSection({ valuation, ticker }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showSensitivity, setShowSensitivity] = useState(false);

  if (!valuation) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
          <p className="text-xl font-extrabold text-slate-950 tracking-tight">DCF Valuation</p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-gray-400">DCF valuation not available in this packet.</p>
        </div>
      </section>
    );
  }

  const {
    base_free_cash_flow,
    projection_years,
    discount_rate,
    terminal_growth_rate,
    terminal_value,
    present_value_of_fcf      = [],
    free_cash_flow_projection = [],
    enterprise_value,
    net_debt,
    equity_value,
    shares_outstanding,
    implied_share_price,
    latest_market_price,
    upside_downside_pct,
    sensitivity_table = [],
    limitations = [],
    valuation_date,
  } = valuation;

  const sumPvFcf   = present_value_of_fcf.reduce((acc, r) => acc + (r.present_value ?? 0), 0);
  const pvTerminal = terminal_value != null && discount_rate != null && projection_years != null
    ? terminal_value / Math.pow(1 + discount_rate, projection_years)
    : null;

  const fcfRows = free_cash_flow_projection.map((row, i) => {
    const df      = discount_rate != null ? 1 / Math.pow(1 + discount_rate, i + 1) : null;
    const pvEntry = present_value_of_fcf[i];
    return {
      year: row.year ?? `Y${i + 1}`,
      fcf:  row.free_cash_flow,
      df,
      pv:   pvEntry?.present_value ?? (row.free_cash_flow != null && df != null ? row.free_cash_flow * df : null),
    };
  });

  const impliedAvailable = implied_share_price != null && shares_outstanding != null;
  const terminalDf = discount_rate != null && projection_years != null
    ? 1 / Math.pow(1 + discount_rate, projection_years)
    : null;

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-xl font-extrabold text-slate-950 tracking-tight">DCF Valuation</p>
            <InfoPopover>
              <PopoverSection
                title="Inputs"
                text="Projected FCF (from 3-statement model), discount rate (WACC proxy), terminal growth rate, net debt, and latest market price."
              />
              <PopoverSection
                title="Logic"
                text="Discounts each year's FCF and a terminal value back to today to estimate enterprise value. Equity value = enterprise value minus net debt."
              />
              <PopoverSection
                title="Limitations"
                text="Implied share price is unavailable when shares outstanding is missing. DCF is highly sensitive to discount rate and terminal growth assumptions."
              />
            </InfoPopover>
          </div>
          {valuation_date && (
            <p className="text-xs text-gray-500">
              Valuation snapshot: <span className="font-semibold text-gray-700">{valuation_date}</span>
            </p>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Explanation note */}
        <p className="text-xs text-gray-500 leading-relaxed border-l-4 border-slate-200 pl-3">
          The DCF model estimates value by discounting projected free cash flow. It is sensitive to discount rate, terminal growth, and FCF assumptions, so the output should be reviewed rather than treated as a final answer.
        </p>

        {/* Formula strip */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-l-4 border-slate-400 rounded-r-lg">
          <p className="text-xs font-mono text-slate-700">
            Enterprise Value = Σ PV(FCF<sub>t</sub>) + PV(Terminal Value)
          </p>
        </div>

        {/* Key assumptions */}
        <div className="space-y-2">
          <p className={LABEL_ST}>Key Assumptions</p>
          <div className="flex flex-wrap gap-2.5">
            <AssumptionPill label="Discount Rate (WACC)" value={fmtPct(discount_rate)} />
            <AssumptionPill label="Terminal Growth"       value={fmtPct(terminal_growth_rate)} />
            <AssumptionPill label="Projection Years"      value={projection_years != null ? String(projection_years) : null} />
            <AssumptionPill label="Base FCF"              value={fmtB(base_free_cash_flow)} />
          </div>
        </div>

        {/* Valuation bridge */}
        <div className="space-y-2">
          <p className={LABEL_ST}>Valuation Summary</p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-100">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-600">PV of Projected FCF</span>
                <span className="text-sm font-mono text-gray-800">{fmtB(sumPvFcf || null) ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-600">PV of Terminal Value</span>
                <span className="text-sm font-mono text-gray-800">{fmtB(pvTerminal) ?? '—'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-4 bg-slate-800 border-t border-slate-700">
              <span className="text-sm font-bold text-white uppercase tracking-wide">Enterprise Value</span>
              <span className="text-lg font-bold font-mono text-white">{fmtB(enterprise_value) ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <span className="text-sm text-gray-500 pl-2">
                (−) Net Debt
                {net_debt != null && net_debt < 0 && (
                  <span className="ml-1.5 text-[10px] text-gray-400">(net cash — adds to value)</span>
                )}
              </span>
              <span className="text-sm font-mono text-gray-700">{fmtB(net_debt) ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4 bg-slate-700 border-t border-slate-600">
              <span className="text-sm font-bold text-white uppercase tracking-wide">Equity Value</span>
              <span className="text-lg font-bold font-mono text-white">{fmtB(equity_value) ?? '—'}</span>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 bg-gray-50/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-gray-900">Implied Share Price</p>
                  {latest_market_price != null && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Market: <span className="font-semibold text-gray-700">${latest_market_price.toFixed(2)}</span>
                      {upside_downside_pct != null && (
                        <span className={`ml-2 font-bold ${upside_downside_pct > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {upside_downside_pct > 0 ? '+' : ''}{(upside_downside_pct * 100).toFixed(1)}%
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {impliedAvailable ? (
                  <span className="text-xl font-bold font-mono text-gray-900">${implied_share_price.toFixed(2)}</span>
                ) : (
                  <div className="text-right">
                    <p className="text-sm font-semibold text-amber-700">Unavailable</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Shares outstanding missing from filing data</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible: FCF table + sensitivity + limitations */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors cursor-pointer ${
            showDetails
              ? 'bg-slate-100 border-slate-300 text-slate-700'
              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest">View DCF calculation details</p>
          <ChevronIcon open={showDetails} className="text-gray-500" />
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            showDetails ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {fcfRows.length > 0 && (
              <div className="p-4 space-y-2">
                <p className={LABEL_ST}>Free Cash Flow Projection &amp; Discounting</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={`${TH_BASE} text-left`}>Year</th>
                        <th className={`${TH_BASE} text-right`}>FCF</th>
                        <th className={`${TH_BASE} text-right`}>Discount Factor</th>
                        <th className={`${TH_BASE} text-right`}>Present Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fcfRows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-slate-50/60">
                          <td className="py-2.5 px-4 text-sm font-semibold text-gray-700">{row.year}</td>
                          <td className={TD_PROJ}>{fmtB(row.fcf) ?? '—'}</td>
                          <td className="py-2.5 px-4 text-sm font-mono text-right text-gray-500 whitespace-nowrap">
                            {row.df != null ? row.df.toFixed(4) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-sm font-mono text-right font-bold text-gray-900 whitespace-nowrap">
                            {fmtB(row.pv) ?? '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-b border-gray-200 bg-slate-50/50">
                        <td className="py-2.5 px-4 text-sm font-semibold text-gray-500 italic">Terminal</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-right text-gray-400 whitespace-nowrap">
                          {fmtB(terminal_value) ?? '—'}
                          <span className="ml-1 text-[10px] text-gray-300">(undiscounted)</span>
                        </td>
                        <td className="py-2.5 px-4 text-sm font-mono text-right text-gray-500 whitespace-nowrap">
                          {terminalDf != null ? terminalDf.toFixed(4) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-sm font-mono text-right font-bold text-gray-900 whitespace-nowrap">
                          {fmtB(pvTerminal) ?? '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {sensitivity_table?.length > 0 && (
              <div className="border-t border-gray-100 p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSensitivity((v) => !v)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    showSensitivity
                      ? 'bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest">Sensitivity Analysis — Enterprise Value</p>
                    <span className="text-[10px] text-gray-400">WACC × Terminal Growth</span>
                  </div>
                  <ChevronIcon open={showSensitivity} className="text-gray-500" />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    showSensitivity ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="pt-1 border border-gray-200 rounded-lg overflow-hidden">
                    <SensitivityGrid table={sensitivity_table} />
                  </div>
                </div>
              </div>
            )}

            {limitations.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-3">
                <p className={`${LABEL_ST} mb-2`}>Limitations</p>
                <div className="flex flex-wrap gap-1.5">
                  {limitations.map((l, i) => (
                    <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 text-[10px] rounded font-medium">
                      {typeof l === 'string' ? l.replace(/_/g, ' ') : JSON.stringify(l)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Illustrative Entry Reference ──────────────────────────────────────────────
function EntryPriceSection({ entry }) {
  if (!entry) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
          <p className="text-xl font-extrabold text-slate-950 tracking-tight">Illustrative Entry Reference</p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-gray-400">Entry price model not available in this packet.</p>
        </div>
      </section>
    );
  }

  const {
    latest_market_price,
    dcf_equity_value,
    shares_outstanding,
    shares_outstanding_is_simulated = false,
    shares_outstanding_source,
    implied_fair_value_per_share,
    margin_of_safety,
    entry_price,
    current_price_vs_entry_price_pct,
    current_price_vs_fair_value_pct,
    entry_status,
    risk_adjustments = [],
    presentation_guidance,
  } = entry;

  const sharesUnavailable = shares_outstanding == null;
  const isSimulated       = shares_outstanding_is_simulated === true;

  const bridgeSteps = [
    { label: 'DCF Equity Value',   value: fmtB(dcf_equity_value),                                                                       sub: 'from DCF model' },
    { label: 'Fair Value / Share', value: implied_fair_value_per_share != null ? `$${implied_fair_value_per_share.toFixed(2)}` : null,   sub: 'equity ÷ shares' },
    { label: 'Margin of Safety',   value: fmtPct(margin_of_safety),                                                                      sub: 'risk-adjusted discount' },
    { label: 'Entry Reference',    value: entry_price != null ? `$${entry_price.toFixed(2)}` : null,                                     sub: 'fair value × (1 − MoS)' },
  ];

  const contextRows = [
    { label: 'Latest Market Price', value: latest_market_price != null ? `$${latest_market_price.toFixed(2)}` : null },
    { label: 'Entry Status',        value: entry_status ? entry_status.replace(/_/g, ' ') : null },
    { label: 'Price vs Entry Ref',  value: current_price_vs_entry_price_pct != null ? fmtPct(current_price_vs_entry_price_pct) : null },
    { label: 'Price vs Fair Value', value: current_price_vs_fair_value_pct  != null ? fmtPct(current_price_vs_fair_value_pct)  : null },
  ];

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-xl font-extrabold text-slate-950 tracking-tight">Illustrative Entry Reference</p>
            <InfoPopover>
              <PopoverSection
                title="Inputs"
                text="DCF equity value, share count, latest market price, and risk-adjustment signals from stress tests and indicator scorecards."
              />
              <PopoverSection
                title="Logic"
                text="Fair value per share = equity value ÷ shares outstanding. Entry reference = fair value per share × (1 − margin of safety)."
              />
              <PopoverSection
                title="Limitations"
                text="Not a buy recommendation. When share count is simulated, the entry reference is illustrative only. Sensitive to DCF assumptions."
              />
            </InfoPopover>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 text-[10px] rounded font-bold whitespace-nowrap">Analyst review only</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 text-[10px] rounded font-bold whitespace-nowrap">Not a target price</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 text-[10px] rounded font-bold whitespace-nowrap">No trade execution</span>
            {isSimulated && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] rounded font-bold whitespace-nowrap">Simulated share count</span>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">DCF fair value adjusted by risk-based margin of safety — for analyst review discussion only</p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Explanation note */}
        <p className="text-xs text-gray-500 leading-relaxed border-l-4 border-slate-200 pl-3">
          This reference applies a margin of safety to the valuation snapshot. Because share count is simulated in this demo, the entry reference is illustrative and should only be used for review discussion.
        </p>

        {/* Valuation bridge */}
        <div>
          <p className={`${LABEL_ST} mb-3`}>Valuation Bridge</p>
          <div className="flex items-stretch gap-0 overflow-x-auto">
            {bridgeSteps.map((step, i, arr) => (
              <React.Fragment key={step.label}>
                <div className="flex-1 min-w-[120px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex flex-col gap-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{step.label}</p>
                  {step.value != null ? (
                    <p className="text-lg font-bold font-mono text-gray-900 leading-snug">{step.value}</p>
                  ) : (
                    <p className="text-sm font-semibold text-amber-600">Unavailable</p>
                  )}
                  <p className="text-[10px] text-gray-400">{step.sub}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className="flex items-center px-1.5 text-gray-300 text-lg font-light flex-shrink-0 select-none">→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Simulation notice */}
        {isSimulated && (
          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-sm font-semibold text-slate-700 mb-0.5">Share count is simulated for demo purposes.</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              The entry reference shown is illustrative — share count was not available from filing data
              {shares_outstanding_source ? ` (source: ${shares_outstanding_source})` : ''}.
            </p>
          </div>
        )}

        {/* Unavailable notice */}
        {sharesUnavailable && !isSimulated && (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-semibold text-amber-800 mb-0.5">Entry reference unavailable — shares outstanding missing.</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              The model can estimate enterprise and equity value, but cannot calculate a per-share entry reference without a share count.
            </p>
          </div>
        )}

        {/* Market context */}
        <div>
          <p className={`${LABEL_ST} mb-3`}>Market Context</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {contextRows.map(({ label, value }) => (
              <div key={label} className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
                {value != null ? (
                  <p className="text-sm font-bold text-gray-900">{value}</p>
                ) : (
                  <p className="text-sm font-semibold text-amber-600">Unavailable</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Risk adjustments */}
        {risk_adjustments.length > 0 && (
          <div>
            <p className={`${LABEL_ST} mb-2`}>Risk Adjustments Applied</p>
            <div className="flex flex-wrap gap-2">
              {risk_adjustments.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] font-medium text-slate-600">{r.reason.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] font-bold font-mono text-slate-800">+{(r.adjustment * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presentation guidance from backend */}
        {presentation_guidance && (
          <p className="text-[10px] text-gray-400 italic border-t border-gray-100 pt-3">{presentation_guidance}</p>
        )}
      </div>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function Step4Content() {
  const searchParams = useSearchParams();
  const ticker   = (searchParams.get('ticker') || 'NVDA').toUpperCase();
  const company  = searchParams.get('company')  || 'NVIDIA Corporation';
  const theme    = searchParams.get('theme')    || 'AI / Semiconductors';
  const question = searchParams.get('question') || '';
  const params   = new URLSearchParams({ ticker, company, theme, question }).toString();

  const { packet, isStaticFallback, isLoading } = useFreshPacket();

  const threeStmtModel = packet?.three_statement_models?.models?.[ticker]    ?? null;
  const dcfValuation   = packet?.dcf_valuations?.valuations?.[ticker]        ?? null;
  const entryPrice     = packet?.entry_price_models?.entry_prices?.[ticker]  ?? null;

  return (
    <>
      <WorkflowNav />
      <WorkflowProgressBar currentStep={4} params={params} />

      <div className="bg-white">
        {/* Page header */}
        <div className="max-w-7xl mx-auto px-8 pt-8 pb-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Valuation Model Review</h1>
          <p className="text-sm text-gray-500">
            Review the financial model snapshots before drafting the synthesis memo. These outputs are analyst review aids, not trade instructions.
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-8 pb-24 space-y-5">
          {isStaticFallback && <StaticFallbackBanner />}

          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <CompanyHeader ticker={ticker} company={company} theme={theme} />

              {/* What this page does */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">What this page does</p>
                <ul className="space-y-2">
                  {[
                    ['3-statement model', 'estimates revenue, margin, net income, and free cash flow.'],
                    ['DCF model', 'converts projected free cash flow into a valuation snapshot.'],
                    ['Entry reference', 'applies a margin of safety to create an illustrative review price.'],
                    ['PM approval', 'is still required. No trade is routed or executed.'],
                  ].map(([bold, rest]) => (
                    <li key={bold} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-slate-400 mt-0.5 flex-shrink-0">·</span>
                      <span><span className="font-semibold">{bold}</span> {rest}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <ThreeStatementSection model={threeStmtModel} ticker={ticker} />
              <DcfSection valuation={dcfValuation} ticker={ticker} />
              <EntryPriceSection entry={entryPrice} />
            </>
          )}

          {/* Model caveats */}
          {!isLoading && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Model Caveats</p>
              <ul className="space-y-1.5">
                {[
                  'Some projection assumptions are simplified for demo stability.',
                  'Share count may be simulated if filing data is incomplete.',
                  'DCF is sensitive to WACC, terminal growth, and FCF assumptions.',
                  'Outputs support review; they do not approve or execute trades.',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className="text-gray-400 mt-0.5 flex-shrink-0">·</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <Link
              href={`/junior-analyst/step-3?${params}`}
              className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors"
            >
              ← Back to Step 3: Evidence Review
            </Link>
            <Link
              href={`/junior-analyst/step-5?${params}`}
              className="flex-1 py-4 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors"
            >
              Continue to Step 5: Synthesis Memo →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function JuniorAnalystStep4() {
  return (
    <Suspense>
      <Step4Content />
    </Suspense>
  );
}
