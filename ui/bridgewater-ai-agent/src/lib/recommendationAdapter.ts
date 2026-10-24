import packet from '@/data/recommendation_packet.json';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DataSourceItem {
  name: string;
  type: string;
  status: 'success' | 'warning';
  detail: string;
}

export interface NewsCollectionRecord {
  status: string;
  articles: number;
  sourceUrl: string;
  collectedAt: string;
}

export interface TickerPacketData {
  ticker: string;
  inPacket: boolean;
  sec?: { submissionsStatus: string; companyfactsStatus: string };
  news?: NewsCollectionRecord;
  recommendation?: { action: string; confidence: number; requiresPmReview: boolean };
}

export interface IndicatorItem {
  name: string;
  score: number;
  weight: number;
  direction: string;
  evidenceRefs: string[];
  dataLimitations: string[];
}

export interface TickerScorecard {
  ticker: string;
  inPacket: boolean;
  aggregateScore?: number;
  confidenceScore?: number;
  recommendationBand?: string;
  pmApprovalRequired?: boolean;
  indicators?: IndicatorItem[];
}

export interface JuniorAnalystData {
  packetTickers: string[];
  fred: { status: string; note?: string; seriesRequested: string[]; rowsWritten?: number; errors?: string[] };
  market: {
    status: string;
    note?: string;
    symbolsRequested: string[];
    symbolsCollected?: string[];
    source?: string;
    rowsWritten?: number;
  };
  mandate: {
    benchmark: string;
    riskTolerance: string;
    horizonDays: number;
    pmApprovalRequired: boolean;
    maxSingleNameWeight: number;
  };
  portfolio: {
    asOfDate: string;
    positions: Array<{ ticker: string; weight: number; bucket: string }>;
    bucketWeights: Record<string, number>;
  };
  humanReview: { status: string; pmApprovalRequired: boolean };
  pmReviewRequired: boolean;
  runId: string;
  generatedAt: string;
  disclaimer: string;
}

export interface NewsArticle {
  rawId: string;
  ticker: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  rawPublishedAt: string;
  title: string;
}

// ── Internal raw types ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pkt = Record<string, any>;

type SecTicker = { submissions_status: string; companyfacts_status: string };
type NewsTicker = { status: string; articles_written: number; source_url: string };
type Recommendation = {
  action: string;
  confidence_score: number;
  requires_pm_review: boolean;
};
type ScorecardRaw = {
  ticker: string;
  aggregate_indicator_score: number;
  confidence_score: number;
  recommendation_band: string;
  pm_approval_required: boolean;
  indicators: Array<{
    name: string;
    score: number;
    weight: number;
    direction: string;
    evidence_refs: string[];
    data_limitations: string[];
  }>;
};

// ── Exports ───────────────────────────────────────────────────────────────────

// Statuses from the collection pipeline that mean "data is present and usable".
const FRED_OK   = new Set(['success', 'cached_file_used']);
const MARKET_OK = new Set(['success', 'cached_files_used']);

/** Portfolio-level data: mandate, positions, FRED/market status, human review. */
export function getJuniorAnalystData(pkt: Pkt = packet as Pkt): JuniorAnalystData {
  const secTickers = pkt.raw_data_sources.sec.tickers as Record<string, SecTicker>;
  const fred = pkt.raw_data_sources.fred as {
    status: string; message?: string; note?: string; series_requested: string[];
    rows_written?: number; errors?: string[];
  };
  const market = pkt.raw_data_sources.market as {
    status: string; message?: string; note?: string; symbols_requested?: string[];
    symbols_collected?: string[]; source?: string; rows_written?: number;
  };

  const fredStatus = FRED_OK.has(fred.status) ? 'success' : fred.status;
  const fredNote   = fred.message || fred.note ||
    (fred.status === 'cached_file_used' ? 'Cached FRED macro file used' : undefined);

  const marketStatus = MARKET_OK.has(market.status) ? 'success' : market.status;
  const marketNote   = market.message || market.note ||
    (market.status === 'cached_files_used' ? 'Cached market price files used' : undefined);

  return {
    packetTickers: Object.keys(secTickers),
    fred: {
      status: fredStatus,
      note: fredNote,
      seriesRequested: fred.series_requested,
      rowsWritten: fred.rows_written,
      errors: fred.errors,
    },
    market: {
      status: marketStatus,
      note: marketNote,
      symbolsRequested: market.symbols_requested ?? [],
      symbolsCollected: market.symbols_collected,
      source: market.source,
      rowsWritten: market.rows_written,
    },
    mandate: {
      benchmark: pkt.mandate.benchmark,
      riskTolerance: pkt.mandate.risk_tolerance,
      horizonDays: pkt.mandate.target_horizon_days,
      pmApprovalRequired: pkt.mandate.pm_approval_required,
      maxSingleNameWeight: pkt.mandate.max_single_name_weight,
    },
    portfolio: {
      asOfDate: pkt.portfolio.as_of_date,
      positions: pkt.portfolio.positions,
      bucketWeights: pkt.portfolio.bucket_weights,
    },
    humanReview: {
      status: pkt.human_review.status,
      pmApprovalRequired: pkt.human_review.pm_approval_required,
    },
    pmReviewRequired: pkt.human_review.pm_approval_required,
    runId: pkt.run_id,
    generatedAt: pkt.generated_at,
    disclaimer: pkt.disclaimer,
  };
}

/**
 * Ticker-specific packet data.
 * Returns inPacket: false if the ticker was not in the current run.
 */
export function getTickerFromPacket(ticker: string, pkt: Pkt = packet as Pkt): TickerPacketData {
  const secTickers = pkt.raw_data_sources.sec.tickers as Record<string, SecTicker>;
  const newsTickers = pkt.raw_data_sources.news.tickers as Record<string, NewsTicker>;
  const newsEvidence = pkt.news_evidence as Record<string, unknown[]> | undefined;
  const evidenceArticleCount = Array.isArray(newsEvidence?.[ticker]) ? newsEvidence[ticker].length : 0;
  const newsCollectedAt = pkt.raw_data_sources.news.collected_at;
  const recs = pkt.recommendations as Record<string, Recommendation>;

  if (!secTickers[ticker]) return { ticker, inPacket: false };

  const nt = newsTickers[ticker];

  return {
    ticker,
    inPacket: true,
    sec: {
      submissionsStatus: secTickers[ticker].submissions_status,
      companyfactsStatus: secTickers[ticker].companyfacts_status,
    },
    news: nt
      ? {
          status: evidenceArticleCount > 0 && nt.status !== 'success' ? 'cached_file_used' : nt.status,
          articles: nt.articles_written || evidenceArticleCount,
          sourceUrl: nt.source_url,
          collectedAt: newsCollectedAt,
        }
      : undefined,
    recommendation: recs[ticker]
      ? {
          action: recs[ticker].action,
          confidence: recs[ticker].confidence_score,
          requiresPmReview: recs[ticker].requires_pm_review,
        }
      : undefined,
  };
}

/**
 * Indicator scorecard for a single ticker.
 * Returns inPacket: false if the ticker has no scorecard in this run.
 */
export function getTickerScorecard(ticker: string, pkt: Pkt = packet as Pkt): TickerScorecard {
  const scorecards = pkt.indicator_scorecards.scorecards as ScorecardRaw[];
  const sc = scorecards.find((s) => s.ticker === ticker);

  if (!sc) return { ticker, inPacket: false };

  return {
    ticker,
    inPacket: true,
    aggregateScore: sc.aggregate_indicator_score,
    confidenceScore: sc.confidence_score,
    recommendationBand: sc.recommendation_band,
    pmApprovalRequired: sc.pm_approval_required,
    indicators: sc.indicators.map((i) => ({
      name: i.name,
      score: i.score,
      weight: i.weight,
      direction: i.direction,
      evidenceRefs: i.evidence_refs,
      dataLimitations: i.data_limitations,
    })),
  };
}

/**
 * Top news articles from news_evidence for a ticker (up to 5).
 * Returns empty array if ticker has no news_evidence in this run.
 */
export function getNewsEvidenceForTicker(ticker: string, pkt: Pkt = packet as Pkt): NewsArticle[] {
  const newsEvidence = pkt.news_evidence as
    | Record<string, Array<{
        raw_id: string; ticker: string; source_name: string;
        url: string; published_at: string; clean_text: string;
        evidence_chunks?: string[];
      }>>
    | undefined;
  if (!newsEvidence || !newsEvidence[ticker]) return [];

  return newsEvidence[ticker].map((a) => {
    const raw = (a.clean_text || a.evidence_chunks?.[0] || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const dashIdx = raw.indexOf(` - ${a.source_name}`);
    const title = dashIdx > 0 ? raw.slice(0, dashIdx) : raw.slice(0, 120);
    let publishedAt = a.published_at;
    try {
      publishedAt = new Date(a.published_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch {
      // keep raw string if parsing fails
    }
    return { rawId: a.raw_id, ticker: a.ticker, sourceName: a.source_name, url: a.url, publishedAt, rawPublishedAt: a.published_at, title };
  });
}

/**
 * Data source statuses for the selected ticker only.
 * FRED and Market rows always included — status and message come from the packet.
 */
export function getDataSourcesForTicker(ticker: string, pkt: Pkt = packet as Pkt): DataSourceItem[] {
  const { sec, fred, market, news } = pkt.raw_data_sources;
  const secTickers = sec.tickers as Record<string, SecTicker>;
  const newsTickers = news.tickers as Record<string, NewsTicker>;
  const fredTyped = fred as { status: string; message: string };
  const marketTyped = market as { status: string; message: string };

  const sources: DataSourceItem[] = [];

  if (secTickers[ticker]) {
    sources.push({
      name: `SEC EDGAR — ${ticker}`,
      type: 'Regulatory Filings',
      status: 'success',
      detail: 'Raw data collected',
    });
  }

  if (newsTickers[ticker]) {
    sources.push({
      name: `News RSS — ${ticker}`,
      type: 'RSS Feed',
      status: 'success',
      detail: `${newsTickers[ticker].articles_written} articles collected`,
    });
  }

  const fredOk   = FRED_OK.has(fredTyped.status);
  const marketOk = MARKET_OK.has(marketTyped.status);

  sources.push(
    {
      name: 'FRED Macro',
      type: 'Macro Indicators',
      status: fredOk ? 'success' : 'warning',
      detail: fredOk ? 'Loaded' : 'Not collected — API key missing',
    },
    {
      name: 'Market Data',
      type: 'Price & Returns',
      status: marketOk ? 'success' : 'warning',
      detail: marketOk ? 'Loaded' : 'Not collected — source unavailable',
    }
  );

  return sources;
}
