// Mock data for Junior Analyst workflow

// ── Step 1: Receive Research Assignment ───────────────────────────────────────

export const mockExtractionResult = {
  companyName: 'Tesla, Inc.',
  ticker: 'TSLA',
  theme: 'Electric Vehicles / Clean Energy',
  researchQuestion: 'Assess the competitive positioning and market share risks for Tesla in the EV market over the next 3 years, given increasing competition from legacy automakers.',
  sentiment: 'analytical',
  priority: 'high',
  extractedAt: '2:34 PM'
};

export const researchQuestionSamples = [
  'What are the key risks to Apple\'s iPhone revenue given China market uncertainties?',
  'Evaluate Nvidia\'s competitive moat in AI accelerators vs emerging competitors',
  'Assess the impact of rising interest rates on commercial real estate valuations',
  'Analyze Amazon\'s AWS competitive position relative to Microsoft Azure and Google Cloud'
];

// ── Shared workflow steps helper ───────────────────────────────────────────────
// Returns the 5-step array with correct status for the given current step.
// steps < current → 'completed', step === current → 'current', rest → 'pending'

const STEP_TITLES = [
  'Receive Assignment',
  'Data Collection',
  'Analysis',
  'Valuation Models',
  'Synthesis Memo',
];

export function getWorkflowSteps(currentStep) {
  return STEP_TITLES.map((title, idx) => {
    const step = idx + 1;
    return {
      step,
      title,
      status: step < currentStep ? 'completed' : step === currentStep ? 'current' : 'pending',
    };
  });
}

// Legacy export for backwards compat (Step 1 used this before the helper existed)
export const workflowSteps = getWorkflowSteps(1);


// ── Step 2: Collect Macro & Company Data — mock data keyed by ticker ──────────

const MACRO_SHARED = [
  { label: 'Fed Funds Rate',     value: '5.25–5.50%', trend: 'stable', note: 'Held steady; rate cuts expected H1 2025' },
  { label: 'US GDP Growth',      value: '2.8%',        trend: 'up',     note: 'Q3 2024 annualized — above consensus' },
  { label: 'CPI Inflation',      value: '3.2%',        trend: 'down',   note: 'Trending toward 2% Fed target' },
  { label: 'Consumer Confidence',value: '102.0',       trend: 'up',     note: 'Conference Board index, Sept 2024' },
];

const SOURCES_SHARED = [
  { name: 'SEC 10-Q / 10-K',   type: 'Regulatory Filing', status: 'loaded' },
  { name: 'Bloomberg Terminal', type: 'Market Data',        status: 'loaded' },
  { name: 'FactSet',            type: 'Financial Analytics',status: 'loaded' },
  { name: 'FRED (St. Louis Fed)',type: 'Macro Indicators',  status: 'loaded' },
];

export const step2MockData = {

  TSLA: {
    macro: MACRO_SHARED,
    company: {
      sector:       'Consumer Discretionary',
      industry:     'Electric Vehicles / Clean Energy',
      marketCap:    '$780B',
      employees:    '127,855',
      headquarters: 'Austin, TX',
      founded:      '2003',
      ceo:          'Elon Musk',
    },
    financials: [
      { metric: 'Revenue (TTM)',    value: '$97.7B',  change: '+8.3%',   direction: 'up' },
      { metric: 'Gross Margin',     value: '17.1%',   change: '−4.2pp',  direction: 'down' },
      { metric: 'Operating Margin', value: '10.8%',   change: '−1.1pp',  direction: 'down' },
      { metric: 'Free Cash Flow',   value: '$2.7B',   change: '−24%',    direction: 'down' },
      { metric: 'P/E Ratio',        value: '68×',     change: '',        direction: 'neutral' },
      { metric: 'EV / EBITDA',      value: '42×',     change: '',        direction: 'neutral' },
    ],
    news: [
      { headline: 'Tesla Q3 deliveries beat consensus at 462,890 vehicles', source: 'Bloomberg',  date: 'Oct 2, 2024',  sentiment: 'positive' },
      { headline: 'BYD overtakes Tesla in quarterly EV sales for first time', source: 'Reuters',  date: 'Oct 4, 2024',  sentiment: 'negative' },
      { headline: 'Cybertruck recall issued for 27,000 units over wiper defect', source: 'WSJ',   date: 'Oct 8, 2024',  sentiment: 'negative' },
    ],
    sources: SOURCES_SHARED,
  },

  AAPL: {
    macro: MACRO_SHARED,
    company: {
      sector:       'Information Technology',
      industry:     'Consumer Electronics / Software',
      marketCap:    '$3.4T',
      employees:    '161,000',
      headquarters: 'Cupertino, CA',
      founded:      '1976',
      ceo:          'Tim Cook',
    },
    financials: [
      { metric: 'Revenue (TTM)',    value: '$391B',  change: '+6.1%',   direction: 'up' },
      { metric: 'Gross Margin',     value: '46.2%',  change: '+1.8pp',  direction: 'up' },
      { metric: 'Operating Margin', value: '31.5%',  change: '+0.9pp',  direction: 'up' },
      { metric: 'Free Cash Flow',   value: '$109B',  change: '+12%',    direction: 'up' },
      { metric: 'P/E Ratio',        value: '33×',    change: '',        direction: 'neutral' },
      { metric: 'EV / EBITDA',      value: '26×',    change: '',        direction: 'neutral' },
    ],
    news: [
      { headline: 'Apple Intelligence features roll out in iOS 18.1 update',      source: 'The Verge', date: 'Oct 28, 2024', sentiment: 'positive' },
      { headline: 'iPhone 16 demand in China softer than expected, analysts say', source: 'Reuters',   date: 'Oct 15, 2024', sentiment: 'negative' },
      { headline: 'Apple Services revenue hits record $25B in Q4 FY2024',         source: 'CNBC',      date: 'Oct 31, 2024', sentiment: 'positive' },
    ],
    sources: SOURCES_SHARED,
  },

  NVDA: {
    macro: MACRO_SHARED,
    company: {
      sector:       'Information Technology',
      industry:     'Semiconductors / AI Infrastructure',
      marketCap:    '$3.6T',
      employees:    '29,600',
      headquarters: 'Santa Clara, CA',
      founded:      '1993',
      ceo:          'Jensen Huang',
    },
    financials: [
      { metric: 'Revenue (TTM)',    value: '$96.3B',  change: '+194%',   direction: 'up' },
      { metric: 'Gross Margin',     value: '74.6%',   change: '+5.3pp',  direction: 'up' },
      { metric: 'Operating Margin', value: '61.9%',   change: '+22pp',   direction: 'up' },
      { metric: 'Free Cash Flow',   value: '$53.8B',  change: '+287%',   direction: 'up' },
      { metric: 'P/E Ratio',        value: '55×',     change: '',        direction: 'neutral' },
      { metric: 'EV / EBITDA',      value: '47×',     change: '',        direction: 'neutral' },
    ],
    news: [
      { headline: 'Nvidia Blackwell GPU shipments begin; demand far exceeds supply',       source: 'Bloomberg', date: 'Oct 22, 2024', sentiment: 'positive' },
      { headline: 'US expands AI chip export controls, targeting additional GPU tiers',    source: 'WSJ',       date: 'Oct 17, 2024', sentiment: 'negative' },
      { headline: 'Nvidia data center revenue up 112% YoY in Q3 FY2025',                 source: 'CNBC',      date: 'Nov 20, 2024', sentiment: 'positive' },
    ],
    sources: SOURCES_SHARED,
  },

  DEFAULT: {
    macro: MACRO_SHARED,
    company: {
      sector:       'To be determined',
      industry:     'To be determined',
      marketCap:    '—',
      employees:    '—',
      headquarters: '—',
      founded:      '—',
      ceo:          '—',
    },
    financials: [
      { metric: 'Revenue (TTM)',    value: '—', change: '', direction: 'neutral' },
      { metric: 'Gross Margin',     value: '—', change: '', direction: 'neutral' },
      { metric: 'Operating Margin', value: '—', change: '', direction: 'neutral' },
      { metric: 'Free Cash Flow',   value: '—', change: '', direction: 'neutral' },
      { metric: 'P/E Ratio',        value: '—', change: '', direction: 'neutral' },
      { metric: 'EV / EBITDA',      value: '—', change: '', direction: 'neutral' },
    ],
    news: [
      { headline: 'No company identified — financial news will appear once a ticker is resolved.', source: '—', date: '—', sentiment: 'neutral' },
    ],
    sources: SOURCES_SHARED,
  },
};


// ── Step 2: Stock Price Chart — mock time-series data keyed by ticker ─────────
// Each data point: { v: Number (price), label: String (shown in header on hover) }
// prevClose: closing price of the previous session — drawn as a reference line in 1D view only.

export const step2ChartData = {

  TSLA: {
    currentPrice: 248.42,
    prevClose:    245.14,
    '1D': [
      { v: 245.20, label: '9:30 AM' },  { v: 244.10, label: '10:00 AM' },
      { v: 244.80, label: '10:30 AM' }, { v: 246.30, label: '11:00 AM' },
      { v: 247.80, label: '11:30 AM' }, { v: 246.90, label: '12:00 PM' },
      { v: 247.40, label: '12:30 PM' }, { v: 248.20, label: '1:00 PM' },
      { v: 247.60, label: '1:30 PM' },  { v: 248.80, label: '2:00 PM' },
      { v: 248.10, label: '2:30 PM' },  { v: 247.90, label: '3:00 PM' },
      { v: 248.60, label: '3:30 PM' },  { v: 248.42, label: '4:00 PM' },
    ],
    '1W': [
      { v: 238.60, label: 'Mon Sep 30' }, { v: 241.20, label: 'Tue Oct 1' },
      { v: 247.30, label: 'Wed Oct 2' },  { v: 245.14, label: 'Thu Oct 3' },
      { v: 248.42, label: 'Fri Oct 4' },
    ],
    '1M': [
      { v: 218.60, label: 'Sep 4' },  { v: 220.10, label: 'Sep 5' },
      { v: 216.30, label: 'Sep 6' },  { v: 219.80, label: 'Sep 9' },
      { v: 224.60, label: 'Sep 10' }, { v: 222.40, label: 'Sep 11' },
      { v: 228.90, label: 'Sep 12' }, { v: 231.20, label: 'Sep 13' },
      { v: 229.40, label: 'Sep 16' }, { v: 232.60, label: 'Sep 17' },
      { v: 228.80, label: 'Sep 18' }, { v: 235.40, label: 'Sep 19' },
      { v: 238.10, label: 'Sep 20' }, { v: 236.80, label: 'Sep 23' },
      { v: 239.20, label: 'Sep 24' }, { v: 241.60, label: 'Sep 25' },
      { v: 243.80, label: 'Sep 26' }, { v: 239.40, label: 'Sep 27' },
      { v: 238.60, label: 'Sep 30' }, { v: 241.20, label: 'Oct 1' },
      { v: 247.30, label: 'Oct 2' },  { v: 245.14, label: 'Oct 3' },
      { v: 248.42, label: 'Oct 4' },
    ],
    '3M': [
      { v: 251.40, label: 'Jul 8' },  { v: 248.60, label: 'Jul 15' },
      { v: 232.80, label: 'Jul 22' }, { v: 225.40, label: 'Jul 29' },
      { v: 198.30, label: 'Aug 5' },  { v: 211.60, label: 'Aug 12' },
      { v: 219.80, label: 'Aug 19' }, { v: 226.40, label: 'Aug 26' },
      { v: 218.60, label: 'Sep 2' },  { v: 224.60, label: 'Sep 9' },
      { v: 228.80, label: 'Sep 16' }, { v: 238.10, label: 'Sep 23' },
      { v: 238.60, label: 'Sep 30' }, { v: 248.42, label: 'Oct 4' },
    ],
    'YTD': [
      { v: 193.60, label: 'Jan 2024' }, { v: 182.40, label: 'Feb 2024' },
      { v: 178.20, label: 'Mar 2024' }, { v: 168.30, label: 'Apr 2024' },
      { v: 182.60, label: 'May 2024' }, { v: 197.40, label: 'Jun 2024' },
      { v: 232.80, label: 'Jul 2024' }, { v: 214.60, label: 'Aug 2024' },
      { v: 218.60, label: 'Sep 2024' }, { v: 248.42, label: 'Oct 2024' },
    ],
    '1Y': [
      { v: 220.80, label: 'Nov 2023' }, { v: 248.40, label: 'Dec 2023' },
      { v: 193.60, label: 'Jan 2024' }, { v: 182.40, label: 'Feb 2024' },
      { v: 178.20, label: 'Mar 2024' }, { v: 168.30, label: 'Apr 2024' },
      { v: 182.60, label: 'May 2024' }, { v: 197.40, label: 'Jun 2024' },
      { v: 232.80, label: 'Jul 2024' }, { v: 214.60, label: 'Aug 2024' },
      { v: 218.60, label: 'Sep 2024' }, { v: 248.42, label: 'Oct 2024' },
    ],
    '5Y': [
      { v:  85.20, label: 'Q1 2020' }, { v: 102.40, label: 'Q2 2020' },
      { v: 187.20, label: 'Q3 2020' }, { v: 219.40, label: 'Q4 2020' },
      { v: 578.60, label: 'Q1 2021' }, { v: 374.80, label: 'Q2 2021' },
      { v: 312.80, label: 'Q3 2021' }, { v: 352.80, label: 'Q4 2021' },
      { v: 367.40, label: 'Q1 2022' }, { v: 224.80, label: 'Q2 2022' },
      { v: 265.20, label: 'Q3 2022' }, { v: 123.40, label: 'Q4 2022' },
      { v: 207.20, label: 'Q1 2023' }, { v: 261.40, label: 'Q2 2023' },
      { v: 248.40, label: 'Q3 2023' }, { v: 248.40, label: 'Q4 2023' },
      { v: 178.20, label: 'Q1 2024' }, { v: 197.40, label: 'Q2 2024' },
      { v: 218.60, label: 'Q3 2024' }, { v: 248.42, label: 'Q4 2024' },
    ],
    'ALL': [
      { v:   5.20, label: '2012' }, { v:  18.40, label: '2013' },
      { v:  28.40, label: '2014' }, { v:  21.20, label: '2015' },
      { v:  32.60, label: '2016' }, { v:  68.40, label: '2017' },
      { v:  63.80, label: '2018' }, { v:  86.20, label: '2019' },
      { v: 219.40, label: '2020' }, { v: 352.80, label: '2021' },
      { v: 123.40, label: '2022' }, { v: 248.40, label: '2023' },
      { v: 248.42, label: '2024' },
    ],
  },

  AAPL: {
    currentPrice: 229.87,
    prevClose:    228.45,
    '1D': [
      { v: 227.20, label: '9:30 AM' },  { v: 226.40, label: '10:00 AM' },
      { v: 227.60, label: '10:30 AM' }, { v: 228.80, label: '11:00 AM' },
      { v: 229.40, label: '11:30 AM' }, { v: 228.60, label: '12:00 PM' },
      { v: 228.20, label: '12:30 PM' }, { v: 229.10, label: '1:00 PM' },
      { v: 229.60, label: '1:30 PM' },  { v: 230.20, label: '2:00 PM' },
      { v: 229.80, label: '2:30 PM' },  { v: 230.10, label: '3:00 PM' },
      { v: 229.40, label: '3:30 PM' },  { v: 229.87, label: '4:00 PM' },
    ],
    '1W': [
      { v: 225.40, label: 'Mon Oct 28' }, { v: 226.80, label: 'Tue Oct 29' },
      { v: 228.60, label: 'Wed Oct 30' }, { v: 228.45, label: 'Thu Oct 31' },
      { v: 229.87, label: 'Fri Nov 1' },
    ],
    '1M': [
      { v: 218.20, label: 'Oct 1' },  { v: 220.60, label: 'Oct 2' },
      { v: 219.80, label: 'Oct 3' },  { v: 221.40, label: 'Oct 4' },
      { v: 222.80, label: 'Oct 7' },  { v: 221.60, label: 'Oct 8' },
      { v: 223.40, label: 'Oct 9' },  { v: 224.60, label: 'Oct 10' },
      { v: 222.80, label: 'Oct 11' }, { v: 224.20, label: 'Oct 14' },
      { v: 225.80, label: 'Oct 15' }, { v: 224.40, label: 'Oct 16' },
      { v: 226.60, label: 'Oct 17' }, { v: 227.20, label: 'Oct 18' },
      { v: 226.40, label: 'Oct 21' }, { v: 228.00, label: 'Oct 22' },
      { v: 226.80, label: 'Oct 23' }, { v: 227.40, label: 'Oct 24' },
      { v: 225.40, label: 'Oct 28' }, { v: 226.80, label: 'Oct 29' },
      { v: 228.60, label: 'Oct 30' }, { v: 228.45, label: 'Oct 31' },
      { v: 229.87, label: 'Nov 1' },
    ],
    '3M': [
      { v: 210.40, label: 'Aug 5' },  { v: 218.60, label: 'Aug 12' },
      { v: 224.80, label: 'Aug 19' }, { v: 226.40, label: 'Aug 26' },
      { v: 222.40, label: 'Sep 2' },  { v: 224.60, label: 'Sep 9' },
      { v: 220.60, label: 'Sep 16' }, { v: 226.80, label: 'Sep 23' },
      { v: 225.40, label: 'Sep 30' }, { v: 221.40, label: 'Oct 7' },
      { v: 225.80, label: 'Oct 14' }, { v: 226.40, label: 'Oct 21' },
      { v: 225.40, label: 'Oct 28' }, { v: 229.87, label: 'Nov 1' },
    ],
    'YTD': [
      { v: 185.40, label: 'Jan 2024' }, { v: 182.60, label: 'Feb 2024' },
      { v: 171.20, label: 'Mar 2024' }, { v: 170.80, label: 'Apr 2024' },
      { v: 192.60, label: 'May 2024' }, { v: 210.40, label: 'Jun 2024' },
      { v: 218.80, label: 'Jul 2024' }, { v: 224.80, label: 'Aug 2024' },
      { v: 226.80, label: 'Sep 2024' }, { v: 229.87, label: 'Nov 2024' },
    ],
    '1Y': [
      { v: 189.40, label: 'Nov 2023' }, { v: 193.80, label: 'Dec 2023' },
      { v: 185.40, label: 'Jan 2024' }, { v: 182.60, label: 'Feb 2024' },
      { v: 171.20, label: 'Mar 2024' }, { v: 170.80, label: 'Apr 2024' },
      { v: 192.60, label: 'May 2024' }, { v: 210.40, label: 'Jun 2024' },
      { v: 218.80, label: 'Jul 2024' }, { v: 224.80, label: 'Aug 2024' },
      { v: 226.80, label: 'Sep 2024' }, { v: 229.87, label: 'Nov 2024' },
    ],
    '5Y': [
      { v:  65.40, label: 'Q1 2020' }, { v:  74.60, label: 'Q2 2020' },
      { v: 108.80, label: 'Q3 2020' }, { v: 130.40, label: 'Q4 2020' },
      { v: 122.20, label: 'Q1 2021' }, { v: 136.60, label: 'Q2 2021' },
      { v: 145.40, label: 'Q3 2021' }, { v: 177.80, label: 'Q4 2021' },
      { v: 178.40, label: 'Q1 2022' }, { v: 136.80, label: 'Q2 2022' },
      { v: 155.60, label: 'Q3 2022' }, { v: 129.60, label: 'Q4 2022' },
      { v: 160.80, label: 'Q1 2023' }, { v: 189.60, label: 'Q2 2023' },
      { v: 171.40, label: 'Q3 2023' }, { v: 193.80, label: 'Q4 2023' },
      { v: 171.20, label: 'Q1 2024' }, { v: 210.40, label: 'Q2 2024' },
      { v: 226.80, label: 'Q3 2024' }, { v: 229.87, label: 'Q4 2024' },
    ],
    'ALL': [
      { v:   4.20, label: '2007' }, { v:   5.60, label: '2008' },
      { v:   7.40, label: '2009' }, { v:  11.20, label: '2010' },
      { v:  14.80, label: '2011' }, { v:  19.40, label: '2012' },
      { v:  20.40, label: '2013' }, { v:  26.80, label: '2014' },
      { v:  26.20, label: '2015' }, { v:  28.40, label: '2016' },
      { v:  42.60, label: '2017' }, { v:  39.40, label: '2018' },
      { v:  73.40, label: '2019' }, { v: 130.40, label: '2020' },
      { v: 177.80, label: '2021' }, { v: 129.60, label: '2022' },
      { v: 193.80, label: '2023' }, { v: 229.87, label: '2024' },
    ],
  },

  NVDA: {
    currentPrice: 875.40,
    prevClose:    851.22,
    '1D': [
      { v: 851.20, label: '9:30 AM' },  { v: 848.60, label: '10:00 AM' },
      { v: 852.40, label: '10:30 AM' }, { v: 858.80, label: '11:00 AM' },
      { v: 862.40, label: '11:30 AM' }, { v: 860.20, label: '12:00 PM' },
      { v: 863.80, label: '12:30 PM' }, { v: 866.40, label: '1:00 PM' },
      { v: 864.60, label: '1:30 PM' },  { v: 869.20, label: '2:00 PM' },
      { v: 872.80, label: '2:30 PM' },  { v: 871.40, label: '3:00 PM' },
      { v: 874.60, label: '3:30 PM' },  { v: 875.40, label: '4:00 PM' },
    ],
    '1W': [
      { v: 840.60, label: 'Mon Oct 28' }, { v: 845.20, label: 'Tue Oct 29' },
      { v: 852.40, label: 'Wed Oct 30' }, { v: 851.22, label: 'Thu Oct 31' },
      { v: 875.40, label: 'Fri Nov 1' },
    ],
    '1M': [
      { v: 835.60, label: 'Oct 1' },  { v: 840.20, label: 'Oct 2' },
      { v: 838.80, label: 'Oct 3' },  { v: 842.40, label: 'Oct 4' },
      { v: 846.80, label: 'Oct 7' },  { v: 844.40, label: 'Oct 8' },
      { v: 848.20, label: 'Oct 9' },  { v: 851.60, label: 'Oct 10' },
      { v: 849.40, label: 'Oct 11' }, { v: 853.20, label: 'Oct 14' },
      { v: 856.80, label: 'Oct 15' }, { v: 854.60, label: 'Oct 16' },
      { v: 858.40, label: 'Oct 17' }, { v: 860.80, label: 'Oct 18' },
      { v: 858.20, label: 'Oct 21' }, { v: 862.40, label: 'Oct 22' },
      { v: 860.60, label: 'Oct 23' }, { v: 863.80, label: 'Oct 24' },
      { v: 840.60, label: 'Oct 28' }, { v: 845.20, label: 'Oct 29' },
      { v: 852.40, label: 'Oct 30' }, { v: 851.22, label: 'Oct 31' },
      { v: 875.40, label: 'Nov 1' },
    ],
    '3M': [
      { v: 748.20, label: 'Aug 5' },  { v: 782.40, label: 'Aug 12' },
      { v: 802.60, label: 'Aug 19' }, { v: 818.40, label: 'Aug 26' },
      { v: 822.80, label: 'Sep 2' },  { v: 834.60, label: 'Sep 9' },
      { v: 828.40, label: 'Sep 16' }, { v: 842.80, label: 'Sep 23' },
      { v: 840.60, label: 'Sep 30' }, { v: 848.20, label: 'Oct 7' },
      { v: 856.80, label: 'Oct 14' }, { v: 858.20, label: 'Oct 21' },
      { v: 840.60, label: 'Oct 28' }, { v: 875.40, label: 'Nov 1' },
    ],
    'YTD': [
      { v: 495.20, label: 'Jan 2024' }, { v: 613.80, label: 'Feb 2024' },
      { v: 762.40, label: 'Mar 2024' }, { v: 762.40, label: 'Apr 2024' },
      { v: 824.60, label: 'May 2024' }, { v: 784.40, label: 'Jun 2024' },
      { v: 812.60, label: 'Jul 2024' }, { v: 806.40, label: 'Aug 2024' },
      { v: 821.60, label: 'Sep 2024' }, { v: 875.40, label: 'Oct 2024' },
    ],
    '1Y': [
      { v: 465.20, label: 'Nov 2023' }, { v: 495.20, label: 'Dec 2023' },
      { v: 495.20, label: 'Jan 2024' }, { v: 613.80, label: 'Feb 2024' },
      { v: 762.40, label: 'Mar 2024' }, { v: 762.40, label: 'Apr 2024' },
      { v: 824.60, label: 'May 2024' }, { v: 784.40, label: 'Jun 2024' },
      { v: 812.60, label: 'Jul 2024' }, { v: 806.40, label: 'Aug 2024' },
      { v: 821.60, label: 'Sep 2024' }, { v: 875.40, label: 'Oct 2024' },
    ],
    '5Y': [
      { v: 122.40, label: 'Q1 2020' }, { v: 108.60, label: 'Q2 2020' },
      { v: 140.20, label: 'Q3 2020' }, { v: 132.80, label: 'Q4 2020' },
      { v: 148.60, label: 'Q1 2021' }, { v: 196.80, label: 'Q2 2021' },
      { v: 224.40, label: 'Q3 2021' }, { v: 294.60, label: 'Q4 2021' },
      { v: 268.80, label: 'Q1 2022' }, { v: 156.40, label: 'Q2 2022' },
      { v: 134.60, label: 'Q3 2022' }, { v: 146.20, label: 'Q4 2022' },
      { v: 231.40, label: 'Q1 2023' }, { v: 412.60, label: 'Q2 2023' },
      { v: 434.80, label: 'Q3 2023' }, { v: 465.20, label: 'Q4 2023' },
      { v: 762.40, label: 'Q1 2024' }, { v: 784.40, label: 'Q2 2024' },
      { v: 821.60, label: 'Q3 2024' }, { v: 875.40, label: 'Q4 2024' },
    ],
    'ALL': [
      { v:  12.40, label: '2015' }, { v:  14.80, label: '2016' },
      { v:  24.60, label: '2017' }, { v:  13.20, label: '2018' },
      { v:  58.80, label: '2019' }, { v: 132.80, label: '2020' },
      { v: 294.60, label: '2021' }, { v: 146.20, label: '2022' },
      { v: 465.20, label: '2023' }, { v: 875.40, label: '2024' },
    ],
  },

  DEFAULT: {
    currentPrice: 0,
    prevClose:    null,
    '1D':  [
      { v: 100, label: '9:30 AM' },  { v: 101, label: '10:00 AM' },
      { v: 100, label: '10:30 AM' }, { v: 102, label: '11:00 AM' },
      { v: 101, label: '11:30 AM' }, { v: 103, label: '12:00 PM' },
      { v: 102, label: '12:30 PM' }, { v: 104, label: '1:00 PM' },
      { v: 103, label: '1:30 PM' },  { v: 105, label: '2:00 PM' },
      { v: 104, label: '2:30 PM' },  { v: 105, label: '3:00 PM' },
      { v: 103, label: '3:30 PM' },  { v: 104, label: '4:00 PM' },
    ],
    '1W':  [
      { v:  95, label: 'Mon' }, { v:  98, label: 'Tue' },
      { v: 101, label: 'Wed' }, { v:  99, label: 'Thu' },
      { v: 102, label: 'Fri' },
    ],
    '1M':  [
      { v:  88, label: 'Week 1' }, { v:  92, label: 'Week 2' },
      { v:  96, label: 'Week 3' }, { v: 100, label: 'Week 4' },
    ],
    '3M':  [
      { v:  80, label: 'Month 1' }, { v:  90, label: 'Month 2' },
      { v: 100, label: 'Month 3' },
    ],
    'YTD': [
      { v:  70, label: 'Q1' }, { v:  85, label: 'Q2' },
      { v:  95, label: 'Q3' }, { v: 100, label: 'Q4' },
    ],
    '1Y':  [
      { v:  80, label: 'Jan' }, { v:  85, label: 'Feb' },
      { v:  90, label: 'Mar' }, { v:  88, label: 'Apr' },
      { v:  92, label: 'May' }, { v:  95, label: 'Jun' },
      { v:  93, label: 'Jul' }, { v:  97, label: 'Aug' },
      { v: 100, label: 'Sep' }, { v: 102, label: 'Oct' },
      { v: 103, label: 'Nov' }, { v: 105, label: 'Dec' },
    ],
    '5Y':  [
      { v:  50, label: '2020' }, { v:  65, label: '2021' },
      { v:  75, label: '2022' }, { v:  88, label: '2023' },
      { v: 100, label: '2024' },
    ],
    'ALL': [
      { v:  30, label: '2018' }, { v:  45, label: '2019' },
      { v:  50, label: '2020' }, { v:  65, label: '2021' },
      { v:  75, label: '2022' }, { v:  88, label: '2023' },
      { v: 100, label: '2024' },
    ],
  },
};


// ── Step 3: Analysis — mock data keyed by ticker ──────────────────────────────
// severity: 'high' | 'medium' | 'low'
// impact:   'high' | 'medium' | 'low'
// stance:   'bullish' | 'bearish' | 'neutral'

export const step3MockData = {

  TSLA: {
    risks: [
      {
        title: 'Margin Compression',
        description: 'Aggressive price cuts to defend volume share have reduced automotive gross margin from ~25% to ~17%, with further pressure likely if BYD competition intensifies in key markets.',
        severity: 'high',
      },
      {
        title: 'China Market Competition',
        description: 'BYD has overtaken Tesla in quarterly EV sales. Local competitors benefit from lower cost structures and government subsidies, limiting Tesla\'s pricing power in the world\'s largest EV market.',
        severity: 'high',
      },
      {
        title: 'FSD Regulatory Risk',
        description: 'Full Self-Driving commercialization depends on regulatory approval across key markets. Delays or adverse incidents could materially impair the high-margin FSD revenue thesis.',
        severity: 'medium',
      },
      {
        title: 'Key Person Dependency',
        description: 'CEO Elon Musk\'s significant commitments across multiple ventures and associated reputational factors create governance and operational execution risk.',
        severity: 'medium',
      },
    ],
    drivers: [
      {
        title: 'FSD Monetization',
        description: 'Full Self-Driving subscriptions and licensing represent a potentially transformational high-margin software revenue stream that could significantly re-rate the stock.',
        impact: 'high',
      },
      {
        title: 'Energy Storage Growth',
        description: 'Megapack and Powerwall deployments hit a record 6.9 GWh in Q3 2024. Rapid energy storage growth diversifies revenue meaningfully beyond automotive.',
        impact: 'high',
      },
      {
        title: 'Model 2 / Affordable EV',
        description: 'A sub-$30,000 vehicle targeting mass-market adoption could expand the total addressable market and restore volume growth momentum heading into 2025.',
        impact: 'medium',
      },
      {
        title: 'Robotaxi & Optimus Optionality',
        description: 'Long-dated upside in autonomous ride-hailing and humanoid robotics could represent transformational value creation, though execution risk remains high.',
        impact: 'medium',
      },
    ],
    competitive: {
      summary: 'Tesla maintains a first-mover advantage in premium EVs and operates the most widely adopted public charging network in North America. However, its competitive moat is narrowing as legacy OEMs and Chinese manufacturers rapidly close the technology and cost gap.',
      moat: 'Moderate — Supercharger network, brand equity, FSD data lead',
      peers: ['BYD', 'GM', 'Rivian', 'Lucid', 'Ford (EV)'],
      bullets: [
        'Supercharger network now a licensed industry standard — durable infrastructure moat',
        'FSD dataset (~1B+ miles driven) is difficult for new entrants to replicate quickly',
        'BYD has achieved lower cost-per-vehicle; margin pressure is structural, not cyclical',
        'Software-defined vehicle architecture remains ahead of most legacy OEM peers',
      ],
    },
    analystNotes: [
      {
        note: 'Energy storage and FSD optionality justify a premium multiple, but near-term automotive margin recovery is the critical gating factor for meaningful re-rating.',
        stance: 'neutral',
      },
      {
        note: 'Model 2 launch in H1 2025 is the key near-term catalyst. A successful production ramp could restore the volume growth narrative and significantly improve operating leverage.',
        stance: 'bullish',
      },
      {
        note: 'China market share loss to BYD increasingly appears structural rather than cyclical. International execution requires close monitoring over the next two to three quarters.',
        stance: 'bearish',
      },
    ],
  },

  AAPL: {
    risks: [
      {
        title: 'China Revenue Exposure',
        description: 'Greater China represents ~17% of Apple\'s total revenue. Regulatory tensions, resurgent Huawei competition, and consumer sentiment risk create meaningful downside to iPhone volumes in the region.',
        severity: 'high',
      },
      {
        title: 'App Store Regulatory Pressure',
        description: 'EU Digital Markets Act and US DOJ antitrust scrutiny threaten the App Store\'s high-margin commission structure, with compliance costs and revenue sharing requirements expanding.',
        severity: 'medium',
      },
      {
        title: 'AI Competitive Positioning',
        description: 'Apple Intelligence launched later than Google and Microsoft offerings. If on-device AI capabilities lag meaningfully, it could reduce the perceived differentiation of new iPhone models.',
        severity: 'medium',
      },
      {
        title: 'Upgrade Cycle Elongation',
        description: 'Incremental hardware improvements may not sustain upgrade velocity in developed markets with high device penetration and lengthening replacement cycles.',
        severity: 'low',
      },
    ],
    drivers: [
      {
        title: 'Services Revenue Expansion',
        description: 'Apple Services hit a record $25B in Q4 FY2024 with 1B+ paying subscribers. High-margin, recurring revenue continues to improve overall business quality and mix.',
        impact: 'high',
      },
      {
        title: 'Apple Intelligence Ecosystem',
        description: 'On-device AI capabilities in iOS 18 and beyond could accelerate the upgrade cycle and deepen ecosystem stickiness, particularly among enterprise and productivity-focused users.',
        impact: 'high',
      },
      {
        title: 'India Market Expansion',
        description: 'India is emerging as both a key growth market and a manufacturing hub. Rising middle class, improving carrier infrastructure, and local production capacity create a durable multi-year tailwind.',
        impact: 'medium',
      },
      {
        title: 'Vision Pro Platform',
        description: 'Apple Vision Pro establishes a new spatial computing category. Accelerating developer adoption and a more accessible v2 price point could meaningfully expand the platform.',
        impact: 'medium',
      },
    ],
    competitive: {
      summary: 'Apple operates one of the most defensible consumer technology ecosystems globally. High switching costs, a tightly integrated hardware-software-services stack, and a powerful services flywheel provide durable competitive advantages that peers have struggled to replicate.',
      moat: 'Strong — Ecosystem lock-in, brand premium, services flywheel',
      peers: ['Samsung', 'Google (Pixel)', 'Microsoft', 'Spotify', 'Netflix'],
      bullets: [
        'iOS ecosystem creates high switching costs — estimated ~92% iPhone retention rate',
        'App Store and Services segment gross margin ~70%+ vs hardware ~36%',
        'Manufacturing diversification into India reduces China concentration risk over time',
        'Apple Intelligence differentiation vs Android AI offerings still being established by market',
      ],
    },
    analystNotes: [
      {
        note: 'Services mix-shift remains the primary long-term re-rating catalyst. At current growth trajectory, Services could represent over 30% of total revenue within three years.',
        stance: 'bullish',
      },
      {
        note: 'China softness is real but manageable given India as an offsetting growth vector. Net iPhone unit trajectory should stabilize in FY2025 as comparisons ease.',
        stance: 'neutral',
      },
      {
        note: 'App Store regulatory risk is underappreciated by consensus. EU DMA precedent has a real probability of propagating to additional jurisdictions over the next 12–18 months.',
        stance: 'bearish',
      },
    ],
  },

  NVDA: {
    risks: [
      {
        title: 'US Export Control Expansion',
        description: 'Escalating AI chip restrictions limit Nvidia\'s access to China, historically representing 20–25% of data center revenue. Further tightening on lower-tier products (H20) would compound the impact.',
        severity: 'high',
      },
      {
        title: 'Hyperscaler Customer Concentration',
        description: 'Microsoft, Google, Meta, and Amazon collectively represent a large share of data center GPU demand. Any coordinated slowdown in hyperscaler AI capex would materially impact near-term revenue.',
        severity: 'high',
      },
      {
        title: 'Competitive Entry — AMD & Custom Silicon',
        description: 'AMD MI300X is gaining share in inference workloads. More critically, hyperscalers building custom AI chips (Google TPU, Amazon Trainium, Microsoft Maia) represent a long-term structural risk.',
        severity: 'medium',
      },
      {
        title: 'Supply Chain Constraints',
        description: 'Blackwell GPU production is constrained by TSMC\'s CoWoS advanced packaging capacity. Supply limitations prevent Nvidia from fully capturing available demand in the near term.',
        severity: 'medium',
      },
    ],
    drivers: [
      {
        title: 'AI Infrastructure Buildout',
        description: 'Hyperscaler AI capex is accelerating across the board. Microsoft, Google, Meta, and Amazon have each guided for materially higher capital spending in 2025, with GPUs remaining the primary recipient.',
        impact: 'high',
      },
      {
        title: 'Blackwell GPU Ramp',
        description: 'Blackwell architecture delivers 2.5× training throughput and 5× inference efficiency versus Hopper. Customer feedback and backlog data suggest robust demand extending well into 2025.',
        impact: 'high',
      },
      {
        title: 'CUDA Ecosystem Moat',
        description: 'With 4M+ developers and deep integration across PyTorch, TensorFlow, and major ML frameworks, the CUDA ecosystem creates compounding switching costs that competitors cannot replicate quickly.',
        impact: 'high',
      },
      {
        title: 'Sovereign AI Demand',
        description: 'Governments in the Middle East, Europe, and Asia-Pacific are investing in national AI infrastructure, creating a new demand vector less sensitive to hyperscaler capex cycles.',
        impact: 'medium',
      },
    ],
    competitive: {
      summary: 'Nvidia holds a near-monopoly in AI training infrastructure with estimated 80–85% market share. Its competitive advantage is not purely hardware — the CUDA software ecosystem and full-stack AI platform create compounding switching costs that make displacement difficult even as hardware alternatives improve.',
      moat: 'Very Strong — CUDA ecosystem, developer tooling, full-stack AI platform',
      peers: ['AMD', 'Intel (Gaudi)', 'Google (TPU)', 'Amazon (Trainium)', 'Cerebras'],
      bullets: [
        'CUDA developer ecosystem: 4M+ developers, dominant deep learning framework compatibility',
        'Blackwell demand backlog extends into 2025 — market is supply-constrained, not demand-constrained',
        'AMD MI300X credible for inference use cases; AI training remains overwhelmingly Nvidia-dominated',
        'Custom silicon from hyperscalers is a long-term structural threat, not near-term displacement risk',
      ],
    },
    analystNotes: [
      {
        note: 'The CUDA ecosystem moat is the most durable element of the bull thesis. Even as AMD narrows the hardware gap, developer inertia and tooling depth strongly favor continued Nvidia dominance.',
        stance: 'bullish',
      },
      {
        note: 'Blackwell ramp combined with sovereign AI demand represents upside not fully captured in consensus estimates. The primary constraint is supply, not demand — a high-quality problem.',
        stance: 'bullish',
      },
      {
        note: 'Export control risk remains binary and unhedgeable at the portfolio level. Escalation affecting H20 or lower-tier products could materially impair international revenue without warning.',
        stance: 'bearish',
      },
    ],
  },

  DEFAULT: {
    risks: [
      {
        title: 'Market & Macro Risk',
        description: 'Broad macroeconomic headwinds including elevated interest rates and softening consumer demand may weigh on revenue growth and margin expansion in the near term.',
        severity: 'medium',
      },
      {
        title: 'Competitive Pressure',
        description: 'Increasing competition from both established players and new entrants could compress market share and pricing power over the medium term.',
        severity: 'medium',
      },
    ],
    drivers: [
      {
        title: 'Core Business Fundamentals',
        description: 'Strong core business metrics provide a stable foundation for long-term value creation and support continued investment in growth initiatives.',
        impact: 'medium',
      },
      {
        title: 'Market Expansion Opportunity',
        description: 'New geographic and product markets offer meaningful opportunities to diversify revenue streams and reduce dependence on any single segment.',
        impact: 'medium',
      },
    ],
    competitive: {
      summary: 'Competitive positioning analysis will populate automatically once a company is identified. Submit a research question in Step 1 to unlock the full analysis workspace.',
      moat: 'To be determined',
      peers: ['—'],
      bullets: [
        'Complete Step 1 to identify your target company and unlock sector-specific analysis',
        'Competitive data and peer comparisons will load automatically based on your selection',
      ],
    },
    analystNotes: [
      {
        note: 'Submit a research question with a specific company or ticker in Step 1 to generate targeted analyst notes for your research assignment.',
        stance: 'neutral',
      },
    ],
  },
};


// ── Step 2: Extended news list for expandable News & Catalysts card ───────────
// First 3 items per ticker intentionally match step2MockData[ticker].news.

export const step2ExtendedNews = {
  TSLA: [
    { headline: 'Tesla Q3 deliveries beat consensus at 462,890 vehicles',              source: 'Bloomberg',  date: 'Oct 2, 2024',  sentiment: 'positive' },
    { headline: 'BYD overtakes Tesla in quarterly EV sales for first time',            source: 'Reuters',    date: 'Oct 4, 2024',  sentiment: 'negative' },
    { headline: 'Cybertruck recall issued for 27,000 units over wiper defect',         source: 'WSJ',        date: 'Oct 8, 2024',  sentiment: 'negative' },
    { headline: 'Tesla Full Self-Driving v12.5 rolls out to North America fleet',      source: 'TechCrunch', date: 'Oct 12, 2024', sentiment: 'positive' },
    { headline: 'Elon Musk confirms affordable Model 2 production on track for H1 2025', source: 'FT',      date: 'Oct 16, 2024', sentiment: 'positive' },
    { headline: 'Tesla energy storage deployments hit record 6.9 GWh in Q3 2024',     source: 'CNBC',       date: 'Oct 22, 2024', sentiment: 'positive' },
    { headline: 'Gross margin pressure persists amid ongoing vehicle price reductions', source: "Barron's",  date: 'Oct 28, 2024', sentiment: 'negative' },
  ],
  AAPL: [
    { headline: 'Apple Intelligence features roll out in iOS 18.1 update',                     source: 'The Verge', date: 'Oct 28, 2024', sentiment: 'positive' },
    { headline: 'iPhone 16 demand in China softer than expected, analysts say',                source: 'Reuters',   date: 'Oct 15, 2024', sentiment: 'negative' },
    { headline: 'Apple Services revenue hits record $25B in Q4 FY2024',                        source: 'CNBC',      date: 'Oct 31, 2024', sentiment: 'positive' },
    { headline: 'Apple Vision Pro developer adoption accelerating ahead of v2 launch',         source: 'Bloomberg', date: 'Nov 2, 2024',  sentiment: 'positive' },
    { headline: 'EU Digital Markets Act compliance changes coming to App Store policies',       source: 'FT',        date: 'Nov 5, 2024',  sentiment: 'neutral'  },
    { headline: 'Apple Watch Series 10 blood pressure feature cleared by FDA',                 source: 'WSJ',       date: 'Nov 8, 2024',  sentiment: 'positive' },
    { headline: 'Supplier checks suggest iPhone 17 production ramp ahead of schedule',         source: "Barron's",  date: 'Nov 12, 2024', sentiment: 'positive' },
  ],
  NVDA: [
    { headline: 'Nvidia Blackwell GPU shipments begin; demand far exceeds supply',             source: 'Bloomberg',  date: 'Oct 22, 2024', sentiment: 'positive' },
    { headline: 'US expands AI chip export controls, targeting additional GPU tiers',          source: 'WSJ',        date: 'Oct 17, 2024', sentiment: 'negative' },
    { headline: 'Nvidia data center revenue up 112% YoY in Q3 FY2025',                        source: 'CNBC',       date: 'Nov 20, 2024', sentiment: 'positive' },
    { headline: 'Microsoft and Google expand Nvidia H200 GPU cluster deployments',             source: 'Bloomberg',  date: 'Nov 25, 2024', sentiment: 'positive' },
    { headline: 'AMD MI300X gaining share in inference — Nvidia accelerates roadmap',          source: "Barron's",   date: 'Nov 28, 2024', sentiment: 'negative' },
    { headline: 'Nvidia CUDA ecosystem moat reinforced by new developer tooling',              source: 'TechCrunch', date: 'Dec 1, 2024',  sentiment: 'positive' },
    { headline: 'Sovereign AI investment driving Nvidia international revenue surge',           source: 'FT',         date: 'Dec 5, 2024',  sentiment: 'positive' },
  ],
  DEFAULT: [
    { headline: 'No company identified — financial news will appear once a ticker is resolved.', source: '—', date: '—', sentiment: 'neutral' },
  ],
};


// ── Step 3: AI Insights — confidence scores, thesis, modeling, matrix ─────────
// matrix items: impact 0‒1 (Y-axis), certainty 0‒1 (X-axis)
// type: 'risk' | 'driver'

export const step3AiInsights = {

  TSLA: {
    confidence: {
      overall: 68,
      subScores: [
        { label: 'Growth Strength',        value: 72 },
        { label: 'Risk Level',             value: 38, inverted: true },
        { label: 'Competitive Strength',   value: 78 },
        { label: 'Valuation Attractiveness', value: 44 },
        { label: 'Thesis Clarity',         value: 80 },
      ],
    },
    thesis: {
      stance:       'cautiously bullish',
      coreDebate:   'Can Tesla sustain margin expansion while defending EV market share against BYD and legacy OEMs executing on their electrification roadmaps?',
      keyVariable:  'Q3–Q4 gross margin trajectory following vehicle price reductions and Cybertruck ramp costs',
      thesisBreaker: 'Accelerated BYD penetration in Europe and North America eroding Tesla\'s premium positioning faster than FSD/energy storage can compensate',
    },
    modeling: {
      primary:   'DCF',
      secondary: 'EV/Revenue Comps',
      rationale: 'Long-dated cash flow optionality from FSD licensing and energy storage justifies a DCF framework; revenue comps anchor the valuation floor against pure-play EV peers.',
      analyses:  ['Gross margin sensitivity', 'EV market share scenarios', 'FSD revenue optionality', 'China exposure stress test', 'Competitor benchmarking vs BYD / Rivian'],
    },
    matrix: [
      { label: 'BYD Competition',   type: 'risk',   impact: 0.85, certainty: 0.80 },
      { label: 'Margin Pressure',   type: 'risk',   impact: 0.70, certainty: 0.68 },
      { label: 'Elon Distraction',  type: 'risk',   impact: 0.52, certainty: 0.55 },
      { label: 'Regulatory Risk',   type: 'risk',   impact: 0.58, certainty: 0.38 },
      { label: 'FSD Revenue',       type: 'driver', impact: 0.90, certainty: 0.42 },
      { label: 'Energy Storage',    type: 'driver', impact: 0.75, certainty: 0.72 },
      { label: 'Robotaxi',          type: 'driver', impact: 0.95, certainty: 0.28 },
      { label: 'Model 2 Launch',    type: 'driver', impact: 0.80, certainty: 0.62 },
    ],
  },

  AAPL: {
    confidence: {
      overall: 81,
      subScores: [
        { label: 'Growth Strength',          value: 74 },
        { label: 'Risk Level',               value: 72, inverted: true },
        { label: 'Competitive Strength',     value: 92 },
        { label: 'Valuation Attractiveness', value: 58 },
        { label: 'Thesis Clarity',           value: 88 },
      ],
    },
    thesis: {
      stance:       'bullish',
      coreDebate:   'Will Apple Intelligence monetise fast enough to sustain premium P/E multiples as iPhone unit growth plateaus in a saturated flagship market?',
      keyVariable:  'Apple Intelligence adoption rate and its conversion to Services ARPU uplift over the next two upgrade cycles',
      thesisBreaker: 'Regulatory forced unbundling of the App Store that structurally compresses Services margins below 70%',
    },
    modeling: {
      primary:   'EV/EBITDA Comps',
      secondary: 'Sum-of-the-Parts (SOTP)',
      rationale: 'Mature FCF profile fits peer multiples; SOTP separately values the Services platform at a software multiple vs hardware at consumer-electronics peers.',
      analyses:  ['Services margin waterfall', 'iPhone ASP sensitivity', 'China market share scenarios', 'AI monetisation optionality', 'Regulatory impact on App Store revenue'],
    },
    matrix: [
      { label: 'China Demand Risk',    type: 'risk',   impact: 0.78, certainty: 0.72 },
      { label: 'Regulatory Pressure',  type: 'risk',   impact: 0.65, certainty: 0.80 },
      { label: 'Innovation Plateau',   type: 'risk',   impact: 0.55, certainty: 0.42 },
      { label: 'Supply Concentration', type: 'risk',   impact: 0.48, certainty: 0.60 },
      { label: 'Apple Intelligence',   type: 'driver', impact: 0.88, certainty: 0.52 },
      { label: 'Services Ecosystem',   type: 'driver', impact: 0.82, certainty: 0.85 },
      { label: 'Vision Pro Platform',  type: 'driver', impact: 0.70, certainty: 0.35 },
      { label: 'Healthcare Expansion', type: 'driver', impact: 0.62, certainty: 0.40 },
    ],
  },

  NVDA: {
    confidence: {
      overall: 88,
      subScores: [
        { label: 'Growth Strength',          value: 96 },
        { label: 'Risk Level',               value: 52, inverted: true },
        { label: 'Competitive Strength',     value: 90 },
        { label: 'Valuation Attractiveness', value: 38 },
        { label: 'Thesis Clarity',           value: 92 },
      ],
    },
    thesis: {
      stance:       'strongly bullish',
      coreDebate:   'Is Nvidia\'s AI infrastructure dominance durable enough to justify elevated multiples as hyperscalers build custom silicon and AMD closes the performance gap?',
      keyVariable:  'Blackwell GPU supply ramp cadence and whether hyperscaler capex sustains above $200B annually into 2026',
      thesisBreaker: 'A faster-than-expected hyperscaler shift to custom ASICs (TPU, Trainium) reducing Nvidia\'s data centre revenue share below 70%',
    },
    modeling: {
      primary:   'DCF',
      secondary: 'P/E Growth (PEG)',
      rationale: 'Hypergrowth with strong FCF conversion supports a DCF; PEG ratio contextualises the premium multiple against exceptional earnings growth.',
      analyses:  ['Data centre revenue scenarios', 'CUDA ecosystem switching-cost analysis', 'Export control impact modelling', 'Competitor GPU performance benchmarking', 'Sovereign AI demand sizing'],
    },
    matrix: [
      { label: 'Export Controls',      type: 'risk',   impact: 0.80, certainty: 0.78 },
      { label: 'Custom ASIC Shift',    type: 'risk',   impact: 0.75, certainty: 0.45 },
      { label: 'AMD Competition',      type: 'risk',   impact: 0.55, certainty: 0.65 },
      { label: 'Supply Constraints',   type: 'risk',   impact: 0.60, certainty: 0.50 },
      { label: 'Blackwell Ramp',       type: 'driver', impact: 0.95, certainty: 0.78 },
      { label: 'Sovereign AI',         type: 'driver', impact: 0.80, certainty: 0.60 },
      { label: 'CUDA Ecosystem',       type: 'driver', impact: 0.88, certainty: 0.90 },
      { label: 'Inference Scale-out',  type: 'driver', impact: 0.85, certainty: 0.68 },
    ],
  },

  DEFAULT: {
    confidence: {
      overall: 40,
      subScores: [
        { label: 'Growth Strength',          value: 40 },
        { label: 'Risk Level',               value: 50, inverted: true },
        { label: 'Competitive Strength',     value: 40 },
        { label: 'Valuation Attractiveness', value: 40 },
        { label: 'Thesis Clarity',           value: 30 },
      ],
    },
    thesis: {
      stance:       'neutral',
      coreDebate:   'Submit a specific company in Step 1 to generate a targeted thesis analysis.',
      keyVariable:  'Company identification required',
      thesisBreaker: 'Company identification required',
    },
    modeling: {
      primary:   'TBD',
      secondary: 'TBD',
      rationale: 'Modeling path will be determined once a company is identified and sector context is established.',
      analyses:  ['Identify company in Step 1 to unlock recommended analyses'],
    },
    matrix: [
      { label: 'Unknown Risk',    type: 'risk',   impact: 0.50, certainty: 0.50 },
      { label: 'Unknown Driver',  type: 'driver', impact: 0.50, certainty: 0.50 },
    ],
  },
};
