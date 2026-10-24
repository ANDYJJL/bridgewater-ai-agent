'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import RiskTeamStepper from '@/components/workflow/RiskTeamStepper';
import { useRecommendationPacket } from '@/lib/useRecommendationPacket';
import { useWordReveal, ensureBlinkKeyframe } from '@/components/StreamingText';

const ST  = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';
const LST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';

// ── Ticker brand theme ────────────────────────────────────────────────────────
const TICKER_THEMES = {
  NVDA: { headerBg: 'bg-emerald-50', headerBorder: 'border-emerald-100', stripe: 'bg-emerald-400', btn: 'bg-emerald-700 text-white border-emerald-700' },
  KO:   { headerBg: 'bg-red-50',     headerBorder: 'border-red-100',     stripe: 'bg-red-400',     btn: 'bg-red-700 text-white border-red-700' },
};
const DEFAULT_THEME = { headerBg: 'bg-slate-50', headerBorder: 'border-slate-200', stripe: 'bg-slate-400', btn: 'bg-slate-700 text-white border-slate-700' };
function getTheme(ticker) { return TICKER_THEMES[ticker] ?? DEFAULT_THEME; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function humanize(str) {
  if (!str) return '—';
  return str.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
function stanceLabel(v) {
  const map = { no_action: 'No action', review_only: 'Review only', watchlist: 'Watchlist', accumulate_candidate: 'Accumulate candidate', reduce_exposure: 'Reduce exposure' };
  return map[v] ?? humanize(v);
}
function judgmentLabel(v) {
  const map = { proceed_with_controls: 'Proceed to PM review with controls', reduce_sizing: 'Reduce proposed sizing', require_review: 'Require additional review', block_escalation: 'Block escalation' };
  return map[v] ?? humanize(v);
}

const pmHandoffKey   = ticker => `bridgewater_risk_pm_handoff_${ticker}`;
const scenarioKey    = ticker => `bridgewater_risk_scenario_analysis_${ticker}`;
const legacyRiskKey  = ticker => `bridgewater_risk_team_review_${ticker}`; // kept for PM page compatibility

// ── Streaming-aware handoff field ────────────────────────────────────────────
function HandoffField({ label, value, onValueChange, placeholder, rows, isStreaming, onStreamComplete }) {
  const { displayedText, isDone } = useWordReveal(value ?? '', isStreaming, 90);

  useEffect(() => { if (isStreaming) ensureBlinkKeyframe(); }, [isStreaming]);
  useEffect(() => {
    if (isStreaming && isDone) onStreamComplete?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, isDone]);

  return (
    <div>
      <label className={`${LST} mb-1.5 block`}>{label}</label>
      {isStreaming && !isDone ? (
        <div
          className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-line leading-relaxed"
          style={{ minHeight: `${rows * 1.6 + 1.5}rem` }}
        >
          {displayedText}
          <span
            className="inline-block w-px h-[1em] bg-gray-500 ml-0.5 align-text-bottom"
            style={{ animation: 'debateBlink 1s step-end infinite' }}
          />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={onValueChange}
          placeholder={placeholder}
          rows={rows}
          className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:border-slate-400 focus:bg-white transition-colors"
        />
      )}
    </div>
  );
}

function buildDraftFromScenario(ticker, scenario) {
  if (!scenario) return null;
  // Support new flat structure (top-level fields) and legacy (.output wrapper)
  const hasNewStructure = !!(scenario.scenario_summary || scenario.risk_team_judgment);
  const settings = scenario.scenario_settings ?? scenario.settings;
  const proposal = scenario.proposalSnapshot;

  let riskJudgment, scenarioSummary, valuationImpact, portfolioImpact, controlsList, questionsForPMText, pmHandoffSummary;

  if (hasNewStructure) {
    riskJudgment      = scenario.risk_team_judgment ?? '';
    scenarioSummary   = scenario.scenario_summary   ?? '';
    valuationImpact   = scenario.valuation_impact   ?? '';
    portfolioImpact   = scenario.portfolio_impact   ?? '';
    controlsList      = scenario.risk_controls      ?? [];
    questionsForPMText = scenario.questions_for_pm  ?? '';
    pmHandoffSummary  = scenario.pm_handoff_summary ?? '';
  } else if (scenario.output) {
    const out = scenario.output;
    riskJudgment      = out.riskJudgment    ?? out.risk_team_judgment ?? '';
    scenarioSummary   = out.scenarioSummary ?? out.scenario_summary   ?? '';
    valuationImpact   = out.valuationImpact ?? out.valuation_impact   ?? '';
    portfolioImpact   = out.proposalImpact  ?? out.portfolio_impact   ?? '';
    controlsList      = out.requiredControls ?? out.risk_controls     ?? [];
    questionsForPMText = '';
    pmHandoffSummary  = '';
  } else {
    return null;
  }

  const judgmentText = settings?.judgment ? judgmentLabel(settings.judgment) : 'Proceed to PM review with controls';
  const scenarioCase = settings?.scenario ? (settings.scenario.charAt(0).toUpperCase() + settings.scenario.slice(1)) + ' Case' : 'Scenario';

  const riskReviewSummary =
    `${scenarioCase} analysis completed for ${ticker}. ${riskJudgment}`.trim();

  const scenarioTakeaway =
    (valuationImpact ? valuationImpact + '\n\n' : '') +
    (portfolioImpact ? portfolioImpact          : '');

  const controlsArr = Array.isArray(controlsList) ? controlsList : [];
  const requiredControls = controlsArr.length > 0 ? '• ' + controlsArr.join('\n• ') : '';

  const generatedQuestions = [
    proposal?.stance && `Senior proposed stance: ${stanceLabel(proposal.stance)} — does this align with current portfolio objectives?`,
    proposal?.referenceEntry && `Entry reference at $${parseFloat(proposal.referenceEntry).toFixed(2)} — is this within acceptable range given scenario analysis?`,
    settings?.exportControl && settings.exportControl !== 'Low' && `Export control risk assessed at ${settings.exportControl} severity — what is the PM's current view on this risk?`,
    settings?.capexShock && settings.capexShock !== 'Mild' && `AI capex shock scenario set to ${settings.capexShock} — how does the PM weigh this against the investment case?`,
  ].filter(Boolean).join('\n\n');

  const questionsForPM = questionsForPMText || generatedQuestions;

  const recommendationToPM = pmHandoffSummary ||
    `Risk Team ${judgmentText.toLowerCase()} for ${ticker}. ${scenarioSummary} All escalation gates apply. No trade execution has been performed.`.trim();

  return { riskReviewSummary, scenarioTakeaway, requiredControls, questionsForPM, recommendationToPM };
}

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

function HandoffContent() {
  const searchParams = useSearchParams();
  const { isStaticFallback, isLoading } = useRecommendationPacket();
  const allTickers = ['NVDA', 'KO'];
  const [selectedTicker, setSelectedTicker] = useState(searchParams.get('ticker') || 'NVDA');

  const [riskReviewSummary,   setRiskReviewSummary]   = useState('');
  const [scenarioTakeaway,    setScenarioTakeaway]    = useState('');
  const [requiredControls,    setRequiredControls]    = useState('');
  const [questionsForPM,      setQuestionsForPM]      = useState('');
  const [recommendationToPM,  setRecommendationToPM]  = useState('');
  const [readyState,          setReadyState]          = useState(false);
  const [savedAt,             setSavedAt]             = useState(null);
  const [readyAt,             setReadyAt]             = useState(null);
  const [loaded,              setLoaded]              = useState(false);
  const [scenario,            setScenario]            = useState(null);
  const [proposal,            setProposal]            = useState(null);
  const [draftApplied,        setDraftApplied]        = useState(false);
  const [streamingFieldIdx,   setStreamingFieldIdx]   = useState(null); // null or 0–4

  const lsKey = pmHandoffKey(selectedTicker);

  useEffect(() => {
    setLoaded(false);
    setDraftApplied(false);
    const load = k => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
    const sc  = load(scenarioKey(selectedTicker));
    const sp  = load(`bridgewater_senior_action_proposal_${selectedTicker}`);
    setScenario(sc);
    setProposal(sp);

    const saved = load(lsKey);
    if (saved) {
      setRiskReviewSummary(saved.riskReviewSummary  ?? '');
      setScenarioTakeaway( saved.scenarioTakeaway   ?? '');
      setRequiredControls( saved.requiredControls   ?? '');
      setQuestionsForPM(   saved.questionsForPM     ?? '');
      setRecommendationToPM(saved.recommendationToPM ?? '');
      setReadyState(saved.readyState ?? false);
      setSavedAt(saved.savedAt ?? null);
      setReadyAt(saved.readyAt ?? null);
    } else {
      setRiskReviewSummary('');
      setScenarioTakeaway('');
      setRequiredControls('');
      setQuestionsForPM('');
      setRecommendationToPM('');
      setReadyState(false);
      setSavedAt(null);
      setReadyAt(null);
    }
    setLoaded(true);
  }, [selectedTicker, lsKey]);

  // Auto-apply draft if fields are empty and scenario exists
  useEffect(() => {
    if (!loaded || draftApplied) return;
    if (riskReviewSummary || scenarioTakeaway || recommendationToPM) return;
    if (!scenario) return;
    const draft = buildDraftFromScenario(selectedTicker, scenario);
    if (!draft) return;
    setRiskReviewSummary(draft.riskReviewSummary);
    setScenarioTakeaway(draft.scenarioTakeaway);
    setRequiredControls(draft.requiredControls);
    setQuestionsForPM(draft.questionsForPM);
    setRecommendationToPM(draft.recommendationToPM);
    setDraftApplied(true);
  }, [loaded, scenario, draftApplied, selectedTicker, riskReviewSummary, scenarioTakeaway, recommendationToPM]);

  function persist(overrides = {}) {
    const ts = new Date().toISOString();
    const payload = {
      riskReviewSummary, scenarioTakeaway, requiredControls, questionsForPM, recommendationToPM,
      readyState, readyAt, savedAt: ts, ...overrides,
    };
    try {
      localStorage.setItem(lsKey, JSON.stringify(payload));
      // Also write to legacy key so PM page can read it
      localStorage.setItem(legacyRiskKey(selectedTicker), JSON.stringify({
        riskConclusion:    riskReviewSummary,
        scenarioComment:   scenarioTakeaway,
        recommendationToPM,
        readyState, readyAt, savedAt: ts,
        ...overrides,
      }));
      setSavedAt(ts);
    } catch { /* ignore */ }
  }

  function handleMarkReady() {
    const ts = new Date().toISOString();
    setReadyState(true); setReadyAt(ts);
    persist({ readyState: true, readyAt: ts });
  }

  function handleDraftFromScenario() {
    if (!scenario) return;
    const draft = buildDraftFromScenario(selectedTicker, scenario);
    if (!draft) return;
    setRiskReviewSummary(draft.riskReviewSummary);
    setScenarioTakeaway(draft.scenarioTakeaway);
    setRequiredControls(draft.requiredControls);
    setQuestionsForPM(draft.questionsForPM);
    setRecommendationToPM(draft.recommendationToPM);
    setReadyState(false);
    setStreamingFieldIdx(0); // start word-by-word reveal from first field
  }

  function handleFieldStreamComplete(idx) {
    setStreamingFieldIdx(prev => {
      if (prev !== idx) return prev; // stale, ignore
      const next = idx + 1;
      return next < 5 ? next : null; // 5 fields total
    });
  }

  const theme = getTheme(selectedTicker);
  const pmQ   = new URLSearchParams({ ticker: selectedTicker }).toString();

  return (
    <>
      <WorkflowNav role="Risk Team" subtitle="Scenario analysis and PM escalation review" />
      <RiskTeamStepper activeStep={3} ticker={selectedTicker} />
      {isStaticFallback && <StaticFallbackBanner />}

      <div className="max-w-4xl mx-auto px-8 pt-6 pb-3">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">PM Handoff</h1>
        <p className="text-sm text-gray-500">
          Prepare the Risk Team summary for Portfolio Manager review. Drafted from scenario analysis — fully editable.
        </p>
        <div className={`w-16 h-1 ${theme.stripe} rounded-full mt-4 opacity-70`} />
      </div>

      {/* Ticker selector */}
      <div className="max-w-4xl mx-auto px-8 py-3">
        <div className="flex items-center gap-3">
          <p className={`${LST} mr-1`}>Ticker</p>
          {allTickers.map(t => {
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
          {[...Array(2)].map((_, i) => <div key={i} className="h-48 bg-gray-100 rounded-xl" />)}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-8 pb-24 space-y-5">

          {/* Scenario source banner */}
          {!scenario && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-amber-600 font-bold text-sm flex-shrink-0 mt-px">!</span>
              <div>
                <p className="text-sm text-amber-900 font-semibold">No scenario analysis saved for {selectedTicker}</p>
                <p className="text-xs text-amber-800 mt-0.5">Return to Scenario Analysis to run and save a scenario before drafting the PM handoff.</p>
                <Link href={`/risk-team/simulation?ticker=${selectedTicker}`}
                  className="inline-block mt-1.5 text-xs text-amber-700 font-bold hover:underline">
                  Go to Scenario Analysis →
                </Link>
              </div>
            </div>
          )}

          {/* Proposal Snapshot (read-only) */}
          {proposal?.stance && (
            <section className={`bg-white border border-gray-200 rounded-xl overflow-hidden`}>
              <div className={`${theme.headerBg} border-b ${theme.headerBorder} px-5 py-3 flex items-center gap-2`}>
                <p className={ST}>Proposal Snapshot</p>
                <span className="ml-auto text-[10px] text-gray-400">From Senior Step 2 · read-only</span>
              </div>
              <div className="px-5 py-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className={`${LST} mb-0.5`}>Stance</p>
                    <p className="text-sm font-bold text-gray-900">{stanceLabel(proposal.stance)}</p>
                  </div>
                  {proposal.referenceEntry && (
                    <div>
                      <p className={`${LST} mb-0.5`}>Entry Ref</p>
                      <p className="text-sm font-bold text-gray-900">${parseFloat(proposal.referenceEntry).toFixed(2)}</p>
                    </div>
                  )}
                  {proposal.proposedShares && (
                    <div>
                      <p className={`${LST} mb-0.5`}>Shares</p>
                      <p className="text-sm font-bold text-gray-900">{parseInt(proposal.proposedShares).toLocaleString()}</p>
                    </div>
                  )}
                  {proposal.illustrativeNotional && (
                    <div>
                      <p className={`${LST} mb-0.5`}>Notional</p>
                      <p className="text-sm font-bold text-gray-900">${parseInt(proposal.illustrativeNotional).toLocaleString()}</p>
                      <p className="text-[9px] text-amber-600">Proposal only</p>
                    </div>
                  )}
                </div>
                {(scenario?.scenario_settings?.judgment ?? scenario?.settings?.judgment) && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className={`${LST} mb-1`}>Risk Team Judgment</p>
                    {(() => {
                      const j = scenario?.scenario_settings?.judgment ?? scenario?.settings?.judgment;
                      return (
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded border ${
                          j === 'block_escalation' ? 'bg-red-50 text-red-700 border-red-200' :
                          j === 'require_review'   ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          j === 'reduce_sizing'    ? 'bg-slate-50 text-slate-700 border-slate-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {judgmentLabel(j)}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* PM Handoff Editable Fields */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3.5 flex items-center gap-2 flex-wrap">
              <p className={ST}>Risk Team Review</p>
              <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Editable by Risk Team
              </span>
              <span className="ml-auto text-[10px] text-gray-400">Local only · not sent to backend</span>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Draft button */}
              {scenario && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-xs text-gray-600 flex-1">
                    {scenario.savedAt
                      ? `Scenario analysis saved ${new Date(scenario.savedAt).toLocaleTimeString()} — use as draft source`
                      : 'Scenario analysis available'}
                  </p>
                  <button onClick={handleDraftFromScenario}
                    className="px-3 py-1.5 bg-gray-900 text-white rounded-lg font-bold text-xs hover:bg-gray-800 transition-colors flex-shrink-0">
                    Draft PM Handoff from Scenario Analysis
                  </button>
                </div>
              )}

              {[
                ['Risk Team Review Summary',  riskReviewSummary,   setRiskReviewSummary,   'Summarize the risk assessment for this position…', 4],
                ['Scenario Takeaway',          scenarioTakeaway,    setScenarioTakeaway,    'Key scenario risks, valuation impact, and proposal stress observations…', 4],
                ['Required Risk Controls',     requiredControls,    setRequiredControls,    '• List each required control\n• PM review before any action\n• Human override required…', 4],
                ['Questions for PM',           questionsForPM,      setQuestionsForPM,      'Key questions the PM should consider before deciding…', 3],
                ['Recommendation to PM',       recommendationToPM,  setRecommendationToPM,  'Risk Team recommendation for the Portfolio Manager…', 3],
              ].map(([label, val, setter, ph, rows], idx) => (
                <HandoffField
                  key={label}
                  label={label}
                  value={val}
                  onValueChange={e => setter(e.target.value)}
                  placeholder={ph}
                  rows={rows}
                  isStreaming={streamingFieldIdx === idx}
                  onStreamComplete={() => handleFieldStreamComplete(idx)}
                />
              ))}

              {readyState && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-emerald-600 text-xs font-bold">✓</span>
                  <p className="text-xs text-emerald-800 font-medium">
                    Marked ready for PM review.{readyAt && ` Marked: ${new Date(readyAt).toLocaleString()}`}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => persist()}
                  className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-sm hover:bg-gray-800 transition-colors">
                  Save Risk Review Locally
                </button>
                <button onClick={handleMarkReady} disabled={readyState}
                  className={`py-3 px-5 rounded-lg font-bold text-sm transition-colors border ${
                    readyState
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>
                  {readyState ? '✓ Marked Ready' : 'Mark Ready for PM Review'}
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-400">
                  Local only. No backend send. No trade execution. PM approval required before any action.
                </p>
                {savedAt && (
                  <p className="text-[10px] text-gray-300">Last saved {new Date(savedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
          </section>

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link href={`/risk-team/simulation?${pmQ}`}
              className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm">
              ← Scenario Analysis
            </Link>
            <Link href="/"
              className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm">
              Return to Role Dashboard
            </Link>
            <Link href={`/portfolio-manager?${pmQ}`}
              className="py-3 px-5 bg-white text-gray-700 border border-gray-300 rounded-lg font-bold text-center hover:bg-gray-50 transition-colors text-sm">
              Open Portfolio Manager Review
            </Link>
          </div>
          <p className="text-[10px] text-gray-400 text-center">
            Local handoff complete. Risk Team review done. No trade execution. PM approval required before any action.
          </p>
        </div>
      )}
    </>
  );
}

export default function HandoffPage() {
  return (
    <Suspense>
      <HandoffContent />
    </Suspense>
  );
}
