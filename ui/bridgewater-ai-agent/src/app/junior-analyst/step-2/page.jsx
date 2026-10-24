'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import WorkflowProgressBar from '@/components/workflow/WorkflowProgressBar';
import TradingViewChart from '@/components/workflow/TradingViewChart';
import {
  getJuniorAnalystData,
  getTickerFromPacket,
  getTickerScorecard,
  getDataSourcesForTicker,
  getNewsEvidenceForTicker,
} from '@/lib/recommendationAdapter';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';

// ── Logo map: colored letter-tile fallbacks ───────────────────────────────────

const LOGO_MAP = {
  TSLA:  { initials: 'T',  bg: '#CC0000', fg: '#FFFFFF' },
  AAPL:  { initials: 'A',  bg: '#1D1D1F', fg: '#FFFFFF' },
  NVDA:  { initials: 'N',  bg: '#76B900', fg: '#FFFFFF' },
  MSFT:  { initials: 'M',  bg: '#00A4EF', fg: '#FFFFFF' },
  GOOGL: { initials: 'G',  bg: '#4285F4', fg: '#FFFFFF' },
  GOOG:  { initials: 'G',  bg: '#4285F4', fg: '#FFFFFF' },
  AMZN:  { initials: 'A',  bg: '#FF9900', fg: '#FFFFFF' },
  META:  { initials: 'M',  bg: '#0082FB', fg: '#FFFFFF' },
  JPM:   { initials: 'JP', bg: '#003087', fg: '#FFFFFF' },
  GS:    { initials: 'GS', bg: '#3D5A80', fg: '#FFFFFF' },
  NFLX:  { initials: 'N',  bg: '#E50914', fg: '#FFFFFF' },
  UBER:  { initials: 'U',  bg: '#000000', fg: '#FFFFFF' },
  PLTR:  { initials: 'P',  bg: '#242E3B', fg: '#FFFFFF' },
  BAC:   { initials: 'B',  bg: '#E31837', fg: '#FFFFFF' },
  KO:    { initials: 'KO', bg: '#F40009', fg: '#FFFFFF' },
  XLP:   { initials: 'XL', bg: '#8B0000', fg: '#FFFFFF' },
  SHV:   { initials: 'SH', bg: '#1A3A5C', fg: '#FFFFFF' },
};

// ── FRED series ID → human-readable label ────────────────────────────────────

const FRED_SERIES_LABELS = {
  FEDFUNDS: 'Fed Funds Rate',
  CPIAUCSL: 'CPI',
  UNRATE:   'Unemployment',
  GDP:      'GDP',
  DGS10:    '10Y Yield',
  SP500:    'S&P 500',
  VIXCLS:   'VIX',
};

function fredSeriesLabel(id) {
  return FRED_SERIES_LABELS[id] ?? id;
}

// ── Evidence ref translation ──────────────────────────────────────────────────

const FEATURE_LABELS = {
  '20d_return':                  '20-day return',
  '60d_volatility':              '60-day volatility',
  'revenue_growth':              'Revenue growth',
  'gross_margin':                'Gross margin',
  'export_control_keyword_count':'Export-control news mentions',
  'supply_chain_keyword_count':  'Supply-chain news mentions',
  'capex_keyword_count':         'Capex-related news mentions',
  'inflation_keyword_count':     'Inflation-related news mentions',
  'pricing_power_keyword_count': 'Pricing-power news mentions',
  'dividend_keyword_count':      'Dividend-related news mentions',
};

function translateRef(ref) {
  if (ref === 'news_evidence')   return 'News articles';
  if (ref === 'filing_evidence') return 'SEC filings';
  if (ref.startsWith('model_prediction:')) return `Benchmark model: ${ref.replace('model_prediction:', '')}`;
  if (ref.startsWith('stock_features:')) {
    const key = ref.replace('stock_features:', '');
    return FEATURE_LABELS[key] ?? key.replace(/_/g, ' ');
  }
  return FEATURE_LABELS[ref] ?? ref.replace(/_/g, ' ');
}

function translateLimitation(lim) {
  const key = lim.replace('missing_source_field:', '').replace('missing:', '');
  const label = FEATURE_LABELS[key] ?? key.replace(/_/g, ' ');
  return `Missing ${label.toLowerCase()} data`;
}

// ── Presentational helpers ────────────────────────────────────────────────────

function LogoMark({ ticker, size = 48 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logo = LOGO_MAP[ticker];
  const fontSize = size * 0.36;

  if (!imgFailed) {
    return (
      <img
        src={`/logos/${ticker.toLowerCase()}.png`}
        alt={`${ticker} logo`}
        className="rounded-xl object-contain flex-shrink-0 bg-white border border-gray-100"
        style={{ width: size, height: size, padding: size * 0.08 }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  if (!logo) {
    return (
      <div
        className="flex items-center justify-center rounded-xl flex-shrink-0 font-bold text-gray-600"
        style={{ width: size, height: size, background: '#E5E7EB', fontSize }}
      >
        {ticker.slice(0, 2)}
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-xl flex-shrink-0 font-bold tracking-wide"
      style={{ width: size, height: size, background: logo.bg, color: logo.fg, fontSize }}
    >
      {logo.initials}
    </div>
  );
}

function StatusBadge({ ok, label }) {
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        {label ?? 'Collected'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
      {label ?? 'Not available'}
    </span>
  );
}

function UnavailableCard({ title, rawMessage }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-amber-900">{title}</p>
        <div className="relative group flex-shrink-0">
          <svg className="w-4 h-4 text-amber-500 cursor-help mt-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          <div className="absolute right-0 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 leading-relaxed">
            <p className="font-semibold text-gray-300 mb-1">Backend message</p>
            {rawMessage}
          </div>
        </div>
      </div>
      <StatusBadge ok={false} />
    </div>
  );
}

function DirectionBadge({ direction }) {
  const styles = {
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    negative: 'bg-red-50 text-red-700 border-red-200',
    mixed:    'bg-gray-100 text-gray-600 border-gray-200',
  };
  const labels = { positive: 'Positive', negative: 'Negative', mixed: 'Mixed' };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[direction] ?? styles.mixed}`}>
      {labels[direction] ?? direction}
    </span>
  );
}

function RefChip({ label, kind }) {
  const styles = {
    evidence:   'bg-blue-50 text-blue-700 border-blue-200',
    model:      'bg-violet-50 text-violet-700 border-violet-200',
    limitation: 'bg-amber-50 text-amber-700 border-amber-200',
    feature:    'bg-gray-50 text-gray-600 border-gray-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${styles[kind] ?? styles.feature}`}>
      {label}
    </span>
  );
}


const SECTION_TITLE = 'text-xs text-gray-500 font-bold uppercase tracking-wide';
const CARD_TITLE    = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';

// ── UTC date formatter ────────────────────────────────────────────────────────

function fmtUtcDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }) + ' UTC';
}

// ── News preview card (Robinhood-style) ───────────────────────────────────────

function NewsPreviewCard({ article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all duration-150 group no-underline"
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 leading-none">
            {article.sourceName}
          </span>
          <span className="text-gray-300 text-xs leading-none">·</span>
          <span className="text-[10px] text-gray-400 leading-none">{fmtUtcDate(article.rawPublishedAt || article.publishedAt)}</span>
          <svg className="w-3 h-3 text-gray-300 ml-auto flex-shrink-0 group-hover:text-blue-400 transition-colors"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
          {article.title}
        </p>
        {article.snippet && (
          <p className="text-xs text-gray-500 leading-snug line-clamp-2">{article.snippet}</p>
        )}
      </div>
    </a>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function Step2Content() {
  const searchParams = useSearchParams();

  const ticker   = searchParams.get('ticker')   || 'TSLA';
  const company  = searchParams.get('company')  || 'Tesla, Inc.';
  const theme    = searchParams.get('theme')    || 'Electric Vehicles / Clean Energy';
  const question = searchParams.get('question') || '';

  const params = new URLSearchParams({ ticker, company, theme, question }).toString();

  // ── Packet loading ─────────────────────────────────────────────────────────
  const {
    packet: resolvedPacket,
    isLoading: isLoadingPacket,
    packetSource,
    packetGeneratedAt,
    lastLoadedAt,
    packetRefreshStatus,
    packetRefreshMessage,
    packetAgeHours,
  } = useRecommendationPacket();
  const [newsVisibleCount, setNewsVisibleCount] = useState(10);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoadingPacket) {
    return (
      <>
        <WorkflowNav />
        <WorkflowProgressBar currentStep={2} params={params} />
        <div className="bg-white min-h-screen">
          <div className="max-w-4xl mx-auto px-8 py-12">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-100 rounded-lg w-72" />
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-3/4" />
              <div className="h-40 bg-gray-100 rounded-2xl mt-8" />
              <div className="h-40 bg-gray-100 rounded-2xl" />
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Adapt packet data ──────────────────────────────────────────────────────
  const pkt          = resolvedPacket;
  const packetData   = getJuniorAnalystData(pkt);
  const tickerPacket = getTickerFromPacket(ticker, pkt);
  const scorecard    = getTickerScorecard(ticker, pkt);
  const dataSources  = getDataSourcesForTicker(ticker, pkt);
  const newsArticles = getNewsEvidenceForTicker(ticker, pkt).sort((a, b) => {
    const da = Date.parse(a.published_at || a.publishedAt);
    const db = Date.parse(b.published_at || b.publishedAt);
    if (isNaN(da) || isNaN(db)) return 0;
    return db - da;
  });

  const otherPositions = packetData.portfolio.positions.filter((p) => p.ticker !== ticker);

  const newsTotal     = newsArticles.length;
  const newsCollected = tickerPacket.news?.articles ?? newsTotal;
  const newsShown     = Math.min(newsVisibleCount, newsTotal);

  return (
    <>
      <WorkflowNav />
      <WorkflowProgressBar currentStep={2} params={params} />

      <div className="bg-white">

        {/* Page Header */}
        <div className="max-w-4xl mx-auto px-8 py-12">
          <div className="mb-6">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Collect Macro &amp; Company Data
            </h1>
            <p className="text-base text-gray-600 leading-relaxed">
              Raw data collection status and evidence references from the backend
              recommendation packet. All content below is sourced from{' '}
              <span className="font-mono text-sm">recommendation_packet.json</span> unless
              explicitly marked as an external reference.
            </p>
          </div>

          {/* Packet source status */}
          {packetSource && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                packetSource === 'live_backend'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  packetSource === 'live_backend' ? 'bg-emerald-500' : 'bg-amber-500'
                }`} />
                {packetSource === 'live_backend' ? 'Live source packet loaded' : 'Using cached source packet'}
              </span>
              {packetGeneratedAt && (
                <span className="text-[10px] text-gray-400">
                  Packet generated:{' '}
                  {new Date(packetGeneratedAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
              {lastLoadedAt && (
                <span className="text-[10px] text-gray-400">Loaded at: {lastLoadedAt}</span>
              )}
              {packetRefreshStatus && (
                <span
                  className="text-[10px] text-gray-400"
                  title={packetRefreshMessage || undefined}
                >
                  Refresh: {packetRefreshStatus}
                  {typeof packetAgeHours === 'number' ? ` (${packetAgeHours.toFixed(1)}h old)` : ''}
                </span>
              )}
            </div>
          )}

          <div className="w-24 h-1.5 bg-gray-900 rounded-full mb-10 opacity-40" />
        </div>

        <div className="max-w-7xl mx-auto px-8 pb-24 space-y-10">

          {/* ── Assignment Summary ── */}
          <section className="bg-gray-50 border border-gray-200 rounded-2xl p-8">
            <p className={`${SECTION_TITLE} mb-5`}>Research Assignment — from Step 1</p>
            <div className="flex items-center gap-5 mb-6">
              <LogoMark ticker={ticker} size={56} />
              <div>
                <p className="text-2xl font-bold text-gray-900 leading-tight">{company}</p>
                <p className="text-base font-mono font-semibold text-gray-400 mt-1">{ticker}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-5 border-t border-gray-200">
              <div>
                <p className={`${SECTION_TITLE} mb-1`}>Theme / Sector</p>
                <p className="text-sm font-medium text-gray-700 mt-1">{theme}</p>
              </div>
              {question && (
                <div className="sm:col-span-2">
                  <p className={`${SECTION_TITLE} mb-1`}>Research Question</p>
                  <p className="text-sm text-gray-600 leading-relaxed mt-1">{question}</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Raw Data Collection Status ── */}
          <section className="bg-white border border-gray-200 rounded-2xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
              <p className={CARD_TITLE}>Raw Data Collection Status</p>
              {packetData.pmReviewRequired && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 border border-amber-300 text-amber-800">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                  PM Review Required
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-6">
              Source: backend recommendation packet ·{' '}
              <span className="font-mono">run {packetData.runId}</span>
            </p>

            {tickerPacket.inPacket ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-5">
                <div className="flex items-center gap-3 mb-5">
                  <LogoMark ticker={ticker} size={36} />
                  <div>
                    <span className="font-bold text-gray-900 font-mono text-base">{ticker}</span>
                    <span className="ml-2 text-xs text-gray-400">— selected company</span>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { label: 'SEC EDGAR — Submissions',  ok: true },
                    { label: 'SEC EDGAR — Company Facts', ok: true },
                    { label: 'News RSS feed',             ok: true },
                  ].map(({ label, ok }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-600">{label}</span>
                      <StatusBadge ok={ok} />
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Articles collected</span>
                    <span className="text-sm font-bold text-gray-900">
                      {tickerPacket.news?.articles ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-5 text-center">
                <p className="text-sm font-semibold text-gray-700">
                  <span className="font-mono">{ticker}</span> was not included in this packet run.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Current packet covers: {packetData.packetTickers.join(', ')}.
                </p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4 mb-5">

              {/* FRED — success or unavailable */}
              {packetData.fred.status === 'success' ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-emerald-900 mb-2">Macro data collected</p>
                  <StatusBadge ok label="Collected" />
                  {packetData.fred.note && (
                    <p className="text-xs text-emerald-700 mt-2 italic">{packetData.fred.note}</p>
                  )}
                  {packetData.fred.rowsWritten != null && (
                    <p className="text-xs text-emerald-800 mt-1">
                      {packetData.fred.rowsWritten.toLocaleString()} observations
                    </p>
                  )}
                  {packetData.fred.seriesRequested?.length > 0 && (
                    <p className="text-xs text-emerald-700 mt-1">
                      {packetData.fred.seriesRequested.map(fredSeriesLabel).join(', ')}
                    </p>
                  )}
                </div>
              ) : (
                <UnavailableCard
                  title="Macro data not available"
                  rawMessage={packetData.fred.note}
                />
              )}

              {/* Market Data — conditional on status */}
              {packetData.market.status === 'success' ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-emerald-900 mb-2">Market data collected</p>
                  <StatusBadge ok label="Collected" />
                  {packetData.market.note && (
                    <p className="text-xs text-emerald-700 mt-2 italic">{packetData.market.note}</p>
                  )}
                  {packetData.market.source && (
                    <p className="text-xs text-emerald-800 mt-1">Source: {packetData.market.source}</p>
                  )}
                  {packetData.market.rowsWritten != null && (
                    <p className="text-xs text-emerald-800 mt-1">
                      {packetData.market.rowsWritten.toLocaleString()} price rows
                    </p>
                  )}
                  {(packetData.market.symbolsCollected ?? packetData.market.symbolsRequested).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(packetData.market.symbolsCollected ?? packetData.market.symbolsRequested).map((s) => (
                        <span key={s} className="px-1.5 py-0.5 bg-white border border-emerald-200 text-emerald-700 text-xs font-semibold rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <UnavailableCard
                  title="Market data not available"
                  rawMessage={packetData.market.note}
                />
              )}

            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { label: 'Benchmark',      value: packetData.mandate.benchmark },
                { label: 'Risk Tolerance', value: packetData.mandate.riskTolerance },
                { label: 'Horizon',        value: `${packetData.mandate.horizonDays} days` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-sm font-bold text-gray-900 capitalize">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── External Market View (TradingView) ── */}
          <section>
            <div className="mb-4">
              <p className={CARD_TITLE}>External Market View</p>
              <p className="text-xs text-gray-500 mt-1.5">
                Live chart is provided by TradingView for analyst reference.
                Backend market data remains governed by the recommendation packet.
              </p>
            </div>
            <TradingViewChart ticker={ticker} />
          </section>

          {/* ── 2-col: Indicator Evidence + News Articles ── */}
          <div className="grid md:grid-cols-2 gap-6 items-start">

            {/* Indicator Evidence References */}
            <section className="bg-white border border-gray-200 rounded-2xl p-7">
              <p className={`${CARD_TITLE} mb-1`}>Indicator Evidence References</p>
              <p className="text-xs text-gray-400 mb-6">
                Source: backend recommendation packet · indicator_scorecards
              </p>

              {scorecard.inPacket ? (
                <>
                  <div className="space-y-5">
                    {scorecard.indicators?.map((ind) => {
                      const evidenceLabels = ind.evidenceRefs.map((r) => ({
                        label: translateRef(r),
                        kind: r === 'news_evidence' || r === 'filing_evidence'
                          ? 'evidence'
                          : r.startsWith('model_prediction:')
                          ? 'model'
                          : 'feature',
                      }));
                      const limitLabels = ind.dataLimitations.map((l) => ({
                        label: translateLimitation(l),
                        kind: 'limitation',
                      }));
                      return (
                        <div key={ind.name} className="pb-5 border-b border-gray-50 last:border-0 last:pb-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-sm font-bold text-gray-800 capitalize leading-snug">
                              {ind.name}
                            </p>
                            <DirectionBadge direction={ind.direction} />
                          </div>
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs text-gray-400 mb-1.5">Evidence used</p>
                              <div className="flex flex-wrap gap-1.5">
                                {evidenceLabels.map(({ label, kind }) => (
                                  <RefChip key={label} label={label} kind={kind} />
                                ))}
                              </div>
                            </div>
                            {limitLabels.length > 0 && (
                              <div>
                                <p className="text-xs text-gray-400 mb-1.5">Data limitations</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {limitLabels.map(({ label, kind }) => (
                                    <RefChip key={label} label={label} kind={kind} />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="bg-gray-50 rounded-xl p-6 text-center">
                  <p className="text-sm text-gray-500">
                    No scorecard for <span className="font-mono font-semibold">{ticker}</span> in this packet run.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Current packet covers: {packetData.packetTickers.join(', ')}.
                  </p>
                </div>
              )}
            </section>

            {/* News Evidence Articles or RSS fallback */}
            <section className="bg-white border border-gray-200 rounded-2xl p-7">
              <p className={`${CARD_TITLE} mb-1`}>News Evidence</p>
              <p className="text-xs text-gray-400 mb-6">
                Source: source packet · news_evidence
              </p>

              {newsArticles.length > 0 ? (
                <div className="space-y-2">
                  {newsArticles.slice(0, newsVisibleCount).map((article) => (
                    <NewsPreviewCard key={article.rawId} article={article} />
                  ))}

                  {/* Count + collected note */}
                  <div className="pt-2 space-y-0.5">
                    <p className="text-xs text-gray-500 font-medium">
                      Showing {newsShown} of {newsTotal} articles in packet evidence.
                    </p>
                    {newsCollected > newsTotal && (
                      <p className="text-[10px] text-gray-400">
                        {newsCollected} articles collected via RSS — top {newsTotal} stored as evidence.
                      </p>
                    )}
                  </div>

                  {/* Expand / collapse controls */}
                  {newsTotal > 10 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {newsVisibleCount < newsTotal && newsVisibleCount < 20 && (
                        <button
                          onClick={() => setNewsVisibleCount(Math.min(20, newsTotal))}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                        >
                          Show more news
                        </button>
                      )}
                      {newsVisibleCount >= 20 && newsVisibleCount < newsTotal && (
                        <button
                          onClick={() => setNewsVisibleCount(newsTotal)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                        >
                          Show all news
                        </button>
                      )}
                      {newsVisibleCount > 10 && (
                        <button
                          onClick={() => setNewsVisibleCount(10)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-400 bg-white border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  )}
                </div>

              ) : tickerPacket.inPacket && tickerPacket.news ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-sm font-semibold text-gray-900">Google News RSS — 30-day query</p>
                      <StatusBadge ok label={`${tickerPacket.news.articles} articles`} />
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      Collected:{' '}
                      {tickerPacket.news.collectedAt.replace('T', ' ').replace('Z', ' UTC')}
                    </p>
                    <a
                      href={tickerPacket.news.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Open source
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {tickerPacket.news.articles} articles referenced as news evidence in indicator scoring.
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-6 text-center">
                  <p className="text-sm text-gray-500">
                    No news collected for{' '}
                    <span className="font-mono font-semibold">{ticker}</span> in this packet run.
                  </p>
                </div>
              )}
            </section>

          </div>

          {/* ── Key Data Sources ── */}
          <section className="bg-white border border-gray-200 rounded-2xl p-7">
            <p className={`${CARD_TITLE} mb-6`}>Key Data Sources</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {dataSources.map((src) => (
                <div key={src.name} className="flex flex-col gap-3 p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900 leading-snug">{src.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{src.type}</p>
                  </div>
                  <StatusBadge
                    ok={src.status === 'success'}
                    label={src.status === 'success' ? 'Collected' : 'Not available'}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Portfolio Context — Other Holdings ── */}
          {otherPositions.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-2xl p-7">
              <p className={`${CARD_TITLE} mb-1`}>Portfolio Context — Other Holdings</p>
              <p className="text-xs text-gray-400 mb-5">
                Other positions in the mandate portfolio as of {packetData.portfolio.asOfDate}.
                These are not part of the current{' '}
                <span className="font-mono font-semibold">{ticker}</span> analysis.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {otherPositions.map((pos) => (
                  <div
                    key={pos.ticker}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <LogoMark ticker={pos.ticker} size={32} />
                      <div>
                        <p className="text-sm font-bold text-gray-800 font-mono">{pos.ticker}</p>
                        <p className="text-xs text-gray-400 capitalize">
                          {pos.bucket.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <span className="text-base font-bold text-gray-500">
                      {(pos.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Navigation ── */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link
              href="/junior-analyst/step-1"
              className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-xl font-bold text-center hover:bg-gray-200 transition-colors"
            >
              ← Back to Step 1
            </Link>
            <Link
              href={`/junior-analyst/step-3?ticker=${encodeURIComponent(ticker)}&company=${encodeURIComponent(company)}&theme=${encodeURIComponent(theme)}&question=${encodeURIComponent(question)}`}
              className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-bold text-center hover:bg-gray-800 transition-colors"
            >
              Continue to Step 3: Analysis →
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}

export default function JuniorAnalystStep2() {
  return (
    <Suspense>
      <Step2Content />
    </Suspense>
  );
}
