'use client';

// Maps tickers to their TradingView exchange-prefixed symbol.
const TV_SYMBOL_MAP = {
  NVDA:  'NASDAQ:NVDA',
  TSLA:  'NASDAQ:TSLA',
  AAPL:  'NASDAQ:AAPL',
  MSFT:  'NASDAQ:MSFT',
  GOOGL: 'NASDAQ:GOOGL',
  GOOG:  'NASDAQ:GOOGL',
  AMZN:  'NASDAQ:AMZN',
  META:  'NASDAQ:META',
  NFLX:  'NASDAQ:NFLX',
  PLTR:  'NASDAQ:PLTR',
  KO:    'NYSE:KO',
  JPM:   'NYSE:JPM',
  GS:    'NYSE:GS',
  UBER:  'NYSE:UBER',
  BAC:   'NYSE:BAC',
  XLP:   'AMEX:XLP',
  SHV:   'NASDAQ:SHV',
};

export default function TradingViewChart({ ticker, height = 420 }) {
  const symbol = TV_SYMBOL_MAP[ticker] ?? `NASDAQ:${ticker}`;
  const src =
    `https://s.tradingview.com/widgetembed/` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=D` +
    `&theme=light` +
    `&style=1` +
    `&locale=en` +
    `&toolbar_bg=%23f1f3f6` +
    `&enable_publishing=false` +
    `&hide_side_toolbar=false` +
    `&allow_symbol_change=false` +
    `&withdateranges=true`;

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-800 font-bold uppercase tracking-widest">
            Market Chart — {ticker}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Live data via TradingView · {symbol}
          </p>
        </div>
      </div>
      <div style={{ height }}>
        <iframe
          src={src}
          className="w-full h-full border-0"
          allowTransparency="true"
          allow="fullscreen"
          title={`${ticker} TradingView chart`}
        />
      </div>
    </section>
  );
}
