'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import WorkflowProgressBar from '@/components/workflow/WorkflowProgressBar';
import ResearchAssignmentForm from '@/components/workflow/ResearchAssignmentForm';
import ExtractionResult from '@/components/workflow/ExtractionResult';
import { mockExtractionResult } from '@/data/workflowMockData';
import { runRecommendation } from '@/lib/backendApi';

const LOCALSTORAGE_KEY = 'bridgewater_latest_recommendation_packet';

// ── Backend packet companies ───────────────────────────────────────────────────

const PACKET_COMPANIES = {
  NVDA: {
    ticker: 'NVDA',
    company: 'Nvidia Corporation',
    theme: 'Semiconductors / AI Infrastructure',
    bg: '#76B900',
    fg: '#FFFFFF',
    initials: 'N',
  },
  KO: {
    ticker: 'KO',
    company: 'Coca-Cola Company',
    theme: 'Consumer Staples / Defensive',
    bg: '#F40009',
    fg: '#FFFFFF',
    initials: 'KO',
  },
};

const PACKET_QUESTIONS = {
  NVDA: [
    "Evaluate Nvidia's competitive moat in AI accelerators vs emerging competitors",
    "Assess Nvidia's downside risk under AI capex pullback and export controls",
  ],
  KO: [
    "Assess Coca-Cola's defensive quality under inflation and consumer slowdown risk",
    "Evaluate Coca-Cola's margin resilience and dividend stability",
  ],
};

const ALL_PACKET_QUESTIONS = [
  ...PACKET_QUESTIONS.NVDA,
  ...PACKET_QUESTIONS.KO,
];

// ── Simple rule-based extraction (fallback when no card is selected) ──────────

const TICKER_MAP = {
  TSLA: { name: 'Tesla, Inc.',               theme: 'Electric Vehicles / Clean Energy' },
  AAPL: { name: 'Apple Inc.',                theme: 'Consumer Technology / Hardware' },
  NVDA: { name: 'Nvidia Corporation',        theme: 'Semiconductors / AI Infrastructure' },
  MSFT: { name: 'Microsoft Corporation',     theme: 'Cloud Computing / Enterprise Software' },
  GOOGL:{ name: 'Alphabet Inc.',             theme: 'Digital Advertising / AI / Cloud' },
  GOOG: { name: 'Alphabet Inc.',             theme: 'Digital Advertising / AI / Cloud' },
  AMZN: { name: 'Amazon.com, Inc.',          theme: 'E-Commerce / Cloud (AWS)' },
  META: { name: 'Meta Platforms, Inc.',      theme: 'Social Media / Digital Advertising' },
  JPM:  { name: 'JPMorgan Chase & Co.',      theme: 'Financial Services / Investment Banking' },
  GS:   { name: 'Goldman Sachs Group, Inc.', theme: 'Investment Banking / Asset Management' },
  NFLX: { name: 'Netflix, Inc.',             theme: 'Streaming / Digital Entertainment' },
  UBER: { name: 'Uber Technologies, Inc.',   theme: 'Mobility / Logistics / Gig Economy' },
  PLTR: { name: 'Palantir Technologies Inc.',theme: 'Data Analytics / Government AI' },
  BAC:  { name: 'Bank of America Corp.',     theme: 'Retail Banking / Financial Services' },
  KO:   { name: 'Coca-Cola Company',         theme: 'Consumer Staples / Defensive' },
};

const NAME_TO_TICKER = {
  'tesla': 'TSLA', 'apple': 'AAPL', 'iphone': 'AAPL',
  'nvidia': 'NVDA', 'microsoft': 'MSFT', 'azure': 'MSFT',
  'alphabet': 'GOOGL', 'google': 'GOOGL', 'amazon': 'AMZN', 'aws': 'AMZN',
  'meta': 'META', 'facebook': 'META', 'instagram': 'META',
  'jpmorgan': 'JPM', 'jp morgan': 'JPM', 'goldman': 'GS', 'goldman sachs': 'GS',
  'netflix': 'NFLX', 'uber': 'UBER', 'palantir': 'PLTR',
  'bank of america': 'BAC', 'coca-cola': 'KO', 'coca cola': 'KO', 'coke': 'KO',
};

const IGNORE = new Set([
  'THE','AND','FOR','ARE','BUT','NOT','YOU','ALL','CAN','WAS','ONE','OUR',
  'OUT','DAY','GET','HAS','HOW','NEW','NOW','SEE','TWO','WHO','USE','PDF',
  'TXT','DOC','FILE','PAGE','DATA','AI','ML','US','UK','CEO','CFO','CTO',
  'IPO','ETF','GDP','EPS','EV','FCF','PE','OR','IN','OF','TO','AT','BY',
  'ITS','MAY','MAN','HER','HIM','DID','PUT','SAY','SHE','TOO','LET',
]);

function buildResult(ticker, question) {
  const { name, theme } = TICKER_MAP[ticker];
  return {
    companyName: name,
    ticker,
    theme,
    researchQuestion: question || `Analysis of ${name}`,
    sentiment: 'analytical',
    priority: 'high',
    extractedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

function simpleExtract(question, fileContent) {
  const combined = [question, fileContent].filter(Boolean).join(' ');
  const upperWords = combined.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const word of upperWords) {
    if (!IGNORE.has(word) && TICKER_MAP[word]) return buildResult(word, question);
  }
  const lower = combined.toLowerCase();
  for (const [keyword, ticker] of Object.entries(NAME_TO_TICKER)) {
    if (lower.includes(keyword)) return buildResult(ticker, question);
  }
  return {
    companyName: 'Not yet identified',
    ticker: 'Unknown',
    theme: 'To be determined',
    researchQuestion: question || 'No research question provided.',
    sentiment: 'neutral',
    priority: 'standard',
    extractedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ── Company logo with local asset + initials fallback ────────────────────────

function CompanyLogo({ ticker, size = 'md' }) {
  const [imgError, setImgError] = useState(false);
  const sizeMap = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs', lg: 'w-14 h-14 text-sm' };
  const cls = sizeMap[size] ?? sizeMap.md;
  if (!imgError) {
    return (
      <img
        src={`/logos/${ticker.toLowerCase()}.png`}
        alt={`${ticker} logo`}
        className={`${cls} object-contain rounded flex-shrink-0`}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JuniorAnalystStep1() {
  const router = useRouter();

  const [showResult, setShowResult] = useState(false);
  const [extractionResult, setExtractionResult] = useState(mockExtractionResult);

  // Lifted from form so company card clicks can pre-fill it
  const [researchQuestion, setResearchQuestion] = useState('');

  // Which company card is selected (null | 'NVDA' | 'KO')
  const [selectedCard, setSelectedCard] = useState(null);

  // Backend run state
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [showFallbackButton, setShowFallbackButton] = useState(false);

  // Refs for timers and pending nav params
  const fallbackTimerRef = useRef(null);
  const pendingParamsRef = useRef('');

  const cancelRun = () => {
    clearTimeout(fallbackTimerRef.current);
    setIsRunning(false);
    setShowFallbackButton(false);
  };

  const navigateWithFallback = () => {
    clearTimeout(fallbackTimerRef.current);
    setIsRunning(false);
    setShowFallbackButton(false);
    router.push(`/junior-analyst/step-2?${pendingParamsRef.current}`);
  };

  const handleCardClick = (ticker) => {
    setSelectedCard(ticker);
    setResearchQuestion(PACKET_QUESTIONS[ticker][0]);
    setShowResult(false);
    setRunError('');
  };

  const handleFormSubmit = async ({ researchQuestion: question, uploadedFile }) => {
    setRunError('');

    if (!selectedCard) {
      // No backend company selected — local extraction only
      const result = simpleExtract(question, uploadedFile?.content ?? '');
      setExtractionResult(result);
      setTimeout(() => setShowResult(true), 800);
      return;
    }

    const co = PACKET_COMPANIES[selectedCard];
    if (!co || !co.ticker) {
      setRunError('Please select NVDA or KO from the available backend packet companies.');
      return;
    }

    const resolvedQuestion = question || PACKET_QUESTIONS[selectedCard][0];
    const stepParams = `ticker=${encodeURIComponent(co.ticker)}&company=${encodeURIComponent(co.company)}&theme=${encodeURIComponent(co.theme)}&question=${encodeURIComponent(resolvedQuestion)}`;
    pendingParamsRef.current = stepParams;

    setIsRunning(true);
    setShowResult(false);
    setShowFallbackButton(false);

    // Show fallback button after 3s in case pipeline is slow
    fallbackTimerRef.current = setTimeout(() => setShowFallbackButton(true), 3000);

    // Race the run against an 8-second timeout
    const timeoutErr = Object.assign(new Error('Pipeline timed out'), { type: 'timeout' });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(timeoutErr), 8000)
    );

    try {
      const packet = await Promise.race([
        runRecommendation({
          ticker: co.ticker,
          company: co.company,
          theme: co.theme,
          question: resolvedQuestion,
        }),
        timeoutPromise,
      ]);

      clearTimeout(fallbackTimerRef.current);
      setShowFallbackButton(false);

      try {
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(packet));
      } catch {
        // localStorage unavailable — non-fatal
      }

      setExtractionResult({
        companyName: co.company,
        ticker: co.ticker,
        theme: co.theme,
        researchQuestion: resolvedQuestion,
        sentiment: 'analytical',
        priority: 'high',
        extractedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      });
      setIsRunning(false);
      setShowResult(true);
    } catch (err) {
      clearTimeout(fallbackTimerRef.current);
      setShowFallbackButton(false);
      setIsRunning(false);

      if (process.env.NODE_ENV !== 'production') {
        console.error('[step-1/run] caught error:', err);
      }

      // Validation errors block navigation — user must fix their input
      if (err.type === 'validation' || err.code === 'unsupported_ticker') {
        setRunError(err.message || 'Current live backend demo supports NVDA and KO.');
        return;
      }

      // All other failures (network, timeout, api, proxy) → navigate with cached packet
      router.push(`/junior-analyst/step-2?${stepParams}`);
    }
  };

  // Show only the selected company's questions when a card is active
  const activeSampleQuestions = selectedCard
    ? PACKET_QUESTIONS[selectedCard]
    : ALL_PACKET_QUESTIONS;

  return (
    <>
      <WorkflowNav />
      <WorkflowProgressBar currentStep={1} />

      <div className="bg-white">
        {/* Page Header */}
        <div className="max-w-4xl mx-auto px-8 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Receive Research Assignment
            </h1>
            <p className="text-base text-gray-600 leading-relaxed">
              Begin your institutional research workflow by submitting a research question or
              investment idea. Select a company below to load the pre-generated backend packet,
              or type your own question.
            </p>
          </div>
          <div className="w-24 h-1.5 bg-gray-900 rounded-full mb-10 opacity-40" />
        </div>

        {/* Two Column Layout */}
        <div className="max-w-7xl mx-auto px-8 pb-20">
          <div className="grid md:grid-cols-2 gap-12">

            {/* Left: Company selection + form */}
            <div>
              <div className="sticky top-32 space-y-8">

                {/* Available Backend Packet Companies */}
                <div>
                  <p className="text-xs text-gray-800 font-bold uppercase tracking-widest mb-3">
                    Available Backend Packet Companies
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(PACKET_COMPANIES).map((co) => {
                      const isSelected = selectedCard === co.ticker;
                      return (
                        <button
                          key={co.ticker}
                          onClick={() => handleCardClick(co.ticker)}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-150
                            ${isSelected
                              ? 'border-gray-900 bg-gray-50 shadow-sm'
                              : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                            }`}
                        >
                          <CompanyLogo ticker={co.ticker} size="md" />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 font-mono">{co.ticker}</p>
                            <p className="text-xs text-gray-500 leading-tight">{co.company}</p>
                          </div>
                          {isSelected && (
                            <svg
                              className="w-4 h-4 text-gray-900 flex-shrink-0 ml-auto"
                              fill="currentColor" viewBox="0 0 24 24"
                            >
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedCard ? (
                    <p className="text-xs text-gray-500 mt-2">
                      Theme:{' '}
                      <span className="font-medium">{PACKET_COMPANIES[selectedCard].theme}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">
                      Select a company to load its backend analysis packet.
                    </p>
                  )}
                </div>

                {/* Research question form */}
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-6">
                    Submit Your Research
                  </h2>
                  <ResearchAssignmentForm
                    onSubmit={handleFormSubmit}
                    questionValue={researchQuestion}
                    onQuestionChange={setResearchQuestion}
                    sampleQuestions={activeSampleQuestions}
                  />
                </div>

              </div>
            </div>

            {/* Right: Results / Loading / Error */}
            <div>
              {isRunning ? (
                /* ── Pipeline loading state ── */
                <div className="border border-gray-200 rounded-2xl p-10 text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 mb-2">
                    <svg className="w-7 h-7 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    Running source packet pipeline…
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                    Collecting SEC filings, RSS news, model signals, and review flags…
                  </p>

                  {showFallbackButton && (
                    <div className="pt-2 space-y-2">
                      <button
                        onClick={navigateWithFallback}
                        className="w-full py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 transition-colors text-sm"
                      >
                        Continue with cached source packet
                      </button>
                      <p className="text-xs text-gray-400">
                        Live pipeline unavailable. Continuing with cached source packet.
                      </p>
                      <button
                        onClick={cancelRun}
                        className="text-xs text-gray-400 underline hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : runError ? (
                /* ── Error state ── */
                <div className="border border-red-200 bg-red-50 rounded-2xl p-8 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                    </svg>
                    <p className="text-sm font-bold text-red-800">Pipeline Error</p>
                  </div>
                  {runError.split('\n').map((line, i) => (
                    <p key={i} className={i === 0 ? 'text-sm text-red-700' : 'text-xs font-mono bg-red-100 text-red-800 rounded px-3 py-2 mt-2'}>
                      {line}
                    </p>
                  ))}
                  <button
                    onClick={() => setRunError('')}
                    className="mt-2 text-xs text-red-600 underline hover:text-red-800"
                  >
                    Dismiss
                  </button>
                </div>
              ) : showResult ? (
                /* ── Success: extraction result + continue ── */
                <>
                  <ExtractionResult data={extractionResult} isVisible={true} />

                  <div className="mt-8 space-y-4">
                    <Link
                      href={`/junior-analyst/step-2?${pendingParamsRef.current || `ticker=${encodeURIComponent(extractionResult.ticker)}&company=${encodeURIComponent(extractionResult.companyName)}&theme=${encodeURIComponent(extractionResult.theme)}&question=${encodeURIComponent(extractionResult.researchQuestion)}`}`}
                      className="block w-full py-4 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors"
                    >
                      Continue to Step 2: Data Collection
                    </Link>
                    <button
                      onClick={() => { setShowResult(false); setSelectedCard(null); setResearchQuestion(''); setRunError(''); }}
                      className="w-full py-3 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                    >
                      Start New Research
                    </button>
                  </div>

                  <div className="mt-12 p-8 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-base text-blue-900 leading-relaxed">
                      <span className="font-semibold">Next Step:</span> In Step 2, you&apos;ll
                      review the raw data collection status and evidence from the backend
                      recommendation packet.
                    </p>
                  </div>
                </>
              ) : (
                /* ── Idle placeholder ── */
                <div className="text-center py-12">
                  <div className="inline-block p-4 bg-gray-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-lg text-gray-600 font-medium">
                    Choose a company packet or draft a research question
                  </p>
                  <p className="text-base text-gray-500 mt-2">
                    The system starts from source-grounded evidence and pre-generated analysis packets.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
