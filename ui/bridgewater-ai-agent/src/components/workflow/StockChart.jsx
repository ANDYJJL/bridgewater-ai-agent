'use client';

import { useState, useRef, useCallback } from 'react';

const TABS = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'ALL'];

// Builds a smooth cubic-bezier SVG path through an array of [x, y] points.
// Adjacent knots share horizontal midpoint control points, producing a natural
// S-curve without requiring any external charting library.
function buildSmoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cpx = ((x0 + x1) / 2).toFixed(2);
    d += ` C${cpx},${y0.toFixed(2)} ${cpx},${y1.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return d;
}

export default function StockChart({ ticker, chartData }) {
  const [tab, setTab]         = useState('1Y');
  const [hoverIdx, setHoverIdx] = useState(null);
  const wrapperRef            = useRef(null);

  // SVG viewport constants
  const W = 600, H = 140, PADX = 0, PADY = 12;

  // Unpack data for the active tab
  const rawPts   = chartData?.[tab] ?? [];
  const values   = rawPts.map(p => (typeof p === 'object' ? p.v     : p));
  const ptLabels = rawPts.map(p => (typeof p === 'object' ? p.label : ''));
  const n        = values.length;

  const currentPrice = chartData?.currentPrice ?? 0;
  const prevClose    = chartData?.prevClose    ?? null;
  const startVal     = values[0] ?? 0;

  // ── Header display values (hover overrides default) ───────────────────────
  const displayPrice    = hoverIdx !== null ? (values[hoverIdx] ?? currentPrice) : currentPrice;
  const displayChange   = startVal > 0 ? displayPrice - startVal : 0;
  const displayChangePct = startVal > 0 ? (displayChange / startVal) * 100 : 0;
  const displayLabel    = hoverIdx !== null ? ptLabels[hoverIdx] : null;
  const displayIsPos    = displayChange >= 0;

  // Line colour follows the full-timeframe direction (first → last value)
  const lastVal   = values[n - 1] ?? currentPrice;
  const tabIsPos  = currentPrice > 0 ? lastVal >= startVal : true;
  const lineColor = currentPrice > 0 ? (tabIsPos ? '#10b981' : '#ef4444') : '#D1D5DB';

  // ── SVG coordinate mapping ─────────────────────────────────────────────────
  const min  = n ? Math.min(...values) : 0;
  const max  = n ? Math.max(...values) : 1;
  const span = max - min || 1;

  const toXY = (v, i) => [
    PADX + (i / Math.max(n - 1, 1)) * (W - PADX * 2),
    PADY + (1 - (v - min) / span) * (H - PADY * 2),
  ];

  const pts      = values.map((v, i) => toXY(v, i));
  const linePath = buildSmoothPath(pts);
  const areaPath = pts.length >= 2
    ? `${linePath} L${pts[n - 1][0].toFixed(2)},${H} L${pts[0][0].toFixed(2)},${H} Z`
    : '';

  // ── 1D previous-close reference line ──────────────────────────────────────
  let refY = null;
  if (tab === '1D' && prevClose !== null && n >= 2) {
    const raw = PADY + (1 - (prevClose - min) / span) * (H - PADY * 2);
    refY = Math.max(PADY, Math.min(H - PADY, raw));
  }

  // ── Hover point SVG coords ─────────────────────────────────────────────────
  const hoverPt = (hoverIdx !== null && pts[hoverIdx]) ? pts[hoverIdx] : null;
  const gradId  = `sg-${ticker}`;

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (!wrapperRef.current || n < 2) return;
    const rect  = wrapperRef.current.getBoundingClientRect();
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(xFrac * (n - 1)));
  }, [n]);

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  // ── Tab click ──────────────────────────────────────────────────────────────
  const handleTab = (t) => { setTab(t); setHoverIdx(null); };

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs text-gray-800 font-bold uppercase tracking-widest mb-2">
            Price Chart
          </p>
          {currentPrice > 0 ? (
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-bold text-gray-900 tracking-tight tabular-nums">
                ${displayPrice.toFixed(2)}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${displayIsPos ? 'text-emerald-600' : 'text-red-500'}`}>
                {displayIsPos ? '+' : ''}{displayChange.toFixed(2)}&nbsp;
                <span className="text-xs font-semibold">
                  ({displayIsPos ? '+' : ''}{displayChangePct.toFixed(2)}%)
                </span>
              </span>
              {displayLabel && (
                <span className="text-xs text-gray-400 font-medium ml-0.5 tabular-nums">
                  {displayLabel}
                </span>
              )}
            </div>
          ) : (
            <span className="text-2xl font-bold text-gray-300">—</span>
          )}
        </div>
        <span className="text-xs font-mono font-bold text-gray-200 tracking-widest mt-1 select-none">
          {ticker}
        </span>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <div
        ref={wrapperRef}
        className="w-full overflow-hidden rounded-lg select-none"
        style={{ height: 140, cursor: n >= 2 ? 'crosshair' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0"    />
            </linearGradient>
          </defs>

          {/* 1D prev-close reference dashed line */}
          {refY !== null && (
            <line
              x1="0"   y1={refY.toFixed(2)}
              x2={W}   y2={refY.toFixed(2)}
              stroke="#D1D5DB"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          )}

          {/* Gradient area fill */}
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

          {/* Main price line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover vertical guide line */}
          {hoverPt && (
            <line
              x1={hoverPt[0].toFixed(2)} y1="0"
              x2={hoverPt[0].toFixed(2)} y2={H}
              stroke="#E5E7EB"
              strokeWidth="1"
            />
          )}

          {/* Hover dot */}
          {hoverPt && (
            <circle
              cx={hoverPt[0].toFixed(2)}
              cy={hoverPt[1].toFixed(2)}
              r="4.5"
              fill={lineColor}
              stroke="white"
              strokeWidth="2"
            />
          )}

          {/* Transparent overlay — captures mouse events across the full surface */}
          <rect x="0" y="0" width={W} height={H} fill="transparent" />
        </svg>
      </div>

      {/* ── Timeframe tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-0.5 mt-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => handleTab(t)}
            className={`flex-1 py-1.5 text-xs font-bold rounded transition-all duration-200 ${
              tab === t
                ? 'bg-gray-900 text-white'
                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

    </section>
  );
}
