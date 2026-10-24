'use client';

import React from 'react';
import Link from 'next/link';

const ST  = 'text-sm font-semibold text-gray-900 uppercase tracking-wide';
const LST = 'text-[10px] font-bold uppercase tracking-widest text-gray-400';

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function CardGrid({ items }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <div key={item.title} className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            {item.badge && (
              <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-500 border border-gray-200 uppercase tracking-wider">
                {item.badge}
              </span>
            )}
            <p className="text-sm font-bold text-gray-900">{item.title}</p>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function ArtifactList({ artifacts }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
      <p className={`${LST} mb-3`}>Generated Artifacts</p>
      <div className="flex flex-wrap gap-2">
        {artifacts.map((a) => (
          <span key={a} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-mono text-gray-700">
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function BackendToolkitPage() {
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Role Dashboard
          </Link>
          <Link
            href="/junior-analyst/step-1"
            className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-700 transition-colors"
          >
            Start Workflow
          </Link>
        </div>
      </nav>

      {/* Page header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-10">
          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            Technical Overview
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mt-4 mb-2">Backend Toolkit</h1>
          <p className="text-base text-gray-500 max-w-2xl">
            A reference overview of the data sources, model artifacts, and safety layer that power
            the AI-assisted investment research workflow. All outputs are demo artifacts grounded
            in the source packet — no live trading, no external execution.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-10 space-y-12">

        {/* A. Toolkit Overview */}
        <section>
          <SectionHeader
            title="Toolkit Overview"
            subtitle="The workflow is powered by a layered backend pipeline: raw data ingestion, RAG-grounded evidence retrieval, model-based recommendation checks, stress testing, and a drafting layer. Each frontend role page reads from the same source packet — Junior Analyst through Portfolio Manager — with structured handoffs at each stage."
          />
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
            <div className="grid sm:grid-cols-3 gap-6 text-sm">
              <div>
                <p className={`${LST} mb-1`}>Pipeline Entry</p>
                <p className="font-medium text-gray-800">Raw data ingestion → packet assembly</p>
              </div>
              <div>
                <p className={`${LST} mb-1`}>Grounding</p>
                <p className="font-medium text-gray-800">Source packet · RAG evidence · citations</p>
              </div>
              <div>
                <p className={`${LST} mb-1`}>Frontend Access</p>
                <p className="font-medium text-gray-800">Read-only via <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/api/backend/recommendation/latest</code></p>
              </div>
            </div>
            <div className="mt-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-800">Packet refresh: </span>
                The frontend requests the latest packet with <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">refresh=auto</code>; stale packets can regenerate through the backend pipeline, while failures return the stored packet with a warning.
              </p>
            </div>
          </div>
        </section>

        {/* B. Data Sources */}
        <section>
          <SectionHeader
            title="Data Sources"
            subtitle="Raw evidence ingested and assembled into the source packet. Displayed as read-only context across role pages."
          />
          <CardGrid items={[
            {
              title: 'SEC Filings',
              badge: 'Source packet',
              description: 'Parsed 10-K / 10-Q excerpts used for fundamental evidence. Surfaced in Junior Analyst research steps and Senior model review.',
            },
            {
              title: 'News / RSS Evidence',
              badge: 'Source packet',
              description: 'Recent news headlines and summaries with publication timestamps. Used as supporting evidence in RAG retrieval and indicator scoring.',
            },
            {
              title: 'FRED Macro Observations',
              badge: 'Source packet',
              description: 'Federal Reserve macro indicators (unemployment, rate data). Used in stress scenario construction and model features.',
            },
            {
              title: 'Market Price Data',
              badge: 'Source packet',
              description: 'Historical OHLCV and return data. Powers 20d/60d return features, volatility calculations, and benchmark comparisons.',
            },
            {
              title: 'Portfolio Context',
              badge: 'Source packet',
              description: 'Current position weights, bucket allocations, and mandate constraints. Drives portfolio visualization and exposure comparison in PM dashboard.',
            },
          ]} />
        </section>

        {/* C. Evidence & RAG Layer */}
        <section>
          <SectionHeader
            title="Evidence & RAG Layer"
            subtitle="Internal policy documents retrieved from rag/knowledge_base/*.md are attached alongside source packet evidence to ground AI outputs in project-specific review rules. Public source data tells the system what happened; internal RAG policies tell it how to interpret, escalate, and communicate that evidence."
          />
          <CardGrid items={[
            {
              title: 'Retrieval Context',
              badge: 'RAG',
              description: 'Retrieves relevant internal policy snippets from rag/knowledge_base/*.md and attaches them to the source packet so AI outputs are grounded in project-specific review rules.',
            },
            {
              title: 'Policy Citation Paths',
              badge: 'Citations',
              description: 'Returns source references for internal policy hits alongside generated answers, helping analysts trace whether a recommendation was shaped by filing policy, rating policy, escalation rules, or approval rules.',
            },
            {
              title: 'Packet Q&A',
              badge: 'Chat endpoint',
              description: 'The backend /chat endpoint answers natural-language questions over the generated packet and retrieved policy context. When the LLM is unavailable, it falls back to deterministic packet summaries.',
            },
            {
              title: 'Evidence Separation',
              badge: 'Governance',
              description: 'Keeps raw source data, processed evidence, retrieved policy guidance, and AI inference distinct. Supports auditability and avoids presenting AI-generated reasoning as market fact.',
            },
            {
              title: 'Human Review Grounding',
              badge: 'Review gate',
              description: 'RAG policies guide when outputs should be reviewed by Junior Analyst, Senior Analyst, Risk Team, or PM before becoming an investment-facing proposal.',
            },
          ]} />
        </section>

        {/* D. Internal Policy RAG Toolkit */}
        <section>
          <SectionHeader
            title="Internal Policy RAG Toolkit"
            subtitle="Simulated Bridgewater-style internal research policies used to ground AI outputs, enforce evidence separation, guide escalation, and require human review before any investment-facing proposal."
          />
          <CardGrid items={[
            {
              title: 'Investment Process Principles',
              badge: 'Process principles',
              description: 'Defines the AI system as a disciplined research assistant, not an autonomous investor. Separates raw data, processed evidence, model output, and proposal language throughout the workflow.',
            },
            {
              title: 'Evidence Display Policy',
              badge: 'Evidence governance',
              description: 'Controls how evidence is shown to users. Keeps public data, processed evidence, RAG policy hits, and AI inference separate so analysts can audit where each claim came from.',
            },
            {
              title: 'Filing Analysis Checklist',
              badge: 'Filing review',
              description: 'Guides how the Junior Analyst reviews 10-K and 10-Q filings, including revenue quality, margin drivers, risk factors, customer concentration, and commitments.',
            },
            {
              title: 'Macro Research Framework',
              badge: 'Macro framework',
              description: 'Translates macro indicators into company-specific thesis impact through explicit transmission channels instead of generic commentary.',
            },
            {
              title: 'Thesis Monitoring Guidelines',
              badge: 'Thesis monitoring',
              description: 'Classifies new evidence as supporting, neutral, weakening, or thesis-breaking. Used when new filings, news, or macro signals challenge the original thesis.',
            },
            {
              title: 'Recommendation Rating Policy',
              badge: 'Rating policy',
              description: 'Defines when labels such as accumulate, hold, reduce, avoid, review, or hold_review are appropriate. Prevents the AI from making overly strong recommendations when evidence is incomplete.',
            },
            {
              title: 'Conviction Scoring Framework',
              badge: 'Conviction',
              description: 'Separates indicator strength, recommendation confidence, and analyst conviction. High signal strength does not automatically imply high conviction.',
            },
            {
              title: 'Portfolio Sizing Rules',
              badge: 'Portfolio policy',
              description: 'Keeps proposal quality separate from position sizing. Low-confidence or incomplete evidence should lead to no sizing change unless reviewed by a human PM.',
            },
            {
              title: 'Trade / PM Approval Policy',
              badge: 'Approval gate',
              description: 'Requires human PM review before any investment-facing action. AI outputs are treated as draft proposals, not final approvals or trade instructions.',
            },
            {
              title: 'Scenario Stress Testing Policy',
              badge: 'Stress testing',
              description: 'Guides bear, base, and stress scenarios using explicit variable shocks. Used by the Risk Team to pressure-test downside cases and thesis fragility.',
            },
            {
              title: 'Risk Escalation Rules',
              badge: 'Escalation',
              description: 'Defines monitor, review soon, and immediate review triggers. Ensures conflicting or severe evidence is escalated instead of hidden inside a generated memo.',
            },
            {
              title: 'AI Investment Committee Protocol',
              badge: 'Committee review',
              description: 'Simulates structured disagreement across macro, fundamentals, risk, valuation, and portfolio perspectives before the PM makes a final local decision.',
            },
          ]} />
          <p className="mt-4 text-xs text-gray-400 leading-relaxed">
            All policy documents are simulated internal research policies for demo purposes. They are not real Bridgewater documents. All review signals are proposals only — not investment advice. Human review is required before any decision.
          </p>
        </section>

        {/* E. Risk & Portfolio Tools */}
        <section>
          <SectionHeader
            title="Risk & Portfolio Tools"
            subtitle="Stress test artifacts and portfolio overlays. All what-if views are local demo simulations — no positions are modified or submitted."
          />
          <CardGrid items={[
            {
              title: 'Portfolio Stress Test',
              badge: 'Source packet',
              description: 'Scenario-level impact analysis across multiple macro and market stress conditions. Drives the Risk Team intake page.',
            },
            {
              title: 'Scenario Downside Ranges',
              badge: 'Source packet',
              description: 'Per-ticker downside ranges under each stress scenario. Displayed in the stress simulation and PM collapsible detail.',
            },
            {
              title: 'Exposure Overlay',
              badge: 'Source packet',
              description: 'Bucket-level exposure breakdown (Technology, Defensive, Cash, Other) shown as before/after bars on the PM dashboard.',
            },
            {
              title: 'Risk Team Simulation',
              badge: 'Local what-if',
              description: 'Risk Team can adjust proposed weight change and view simulated portfolio impact. State is local-only; not written to backend.',
            },
            {
              title: 'PM Portfolio Visualization',
              badge: 'Local what-if',
              description: 'SVG donut chart comparing current vs after-proposal portfolio composition. After-view uses target_weight_change from source packet when available.',
            },
          ]} />
        </section>

        {/* F. Drafting & Safety Layer */}
        <section>
          <SectionHeader
            title="Drafting & Safety Layer"
            subtitle="Active backend skills and LLM-assisted drafting helpers with human-review guardrails. All decisions are local-only — no trade is routed or executed."
          />
          <CardGrid items={[
            {
              title: 'draft-synthesis-memo',
              badge: 'Active skill',
              description: 'Drafts the Junior Analyst synthesis memo from packet evidence and RAG context. Output is editable and reviewed by the Senior Analyst before any handoff.',
            },
            {
              title: 'explain-indicator-signal',
              badge: 'Active skill',
              description: 'Returns a plain-language explanation of a scored indicator — evidence references, direction, and data limitations. Used in Junior evidence review and Senior model review.',
            },
            {
              title: 'run-risk-scenario-analysis',
              badge: 'Active skill',
              description: 'Generates a scenario analysis output for a given ticker, stress case, and Senior proposal. Used by the Risk Team to populate the PM handoff package.',
            },
            {
              title: 'run-pm-decision-debate',
              badge: 'Active skill',
              description: "Runs a devil's advocate debate exchange with the Portfolio Manager. AI challenges PM responses to pressure-test decision confidence. Local only — no trade is routed.",
            },
            {
              title: 'Backend /chat Endpoint',
              badge: 'API',
              description: 'Accepts a question and context string. Returns a grounded answer with citations when LLM mode is available.',
            },
            {
              title: 'Grounded LLM Draft',
              badge: 'LLM mode',
              description: 'When the LLM is reachable, responses are grounded in retrieved packet evidence. Prevents hallucinated data.',
            },
            {
              title: 'Deterministic Packet Fallback',
              badge: 'Fallback',
              description: 'When LLM is unavailable, the endpoint returns a structured summary directly from packet fields. No degraded output.',
            },
            {
              title: 'Safe LLM Diagnostics',
              badge: 'Safety',
              description: 'Backend logs model type, fallback reason, and data limitation flags. Surfaced in the Model Prediction panel for transparency.',
            },
            {
              title: 'Local-Only Decisions',
              badge: 'Guardrail',
              description: 'PM approvals, deferrals, and rejections are stored in localStorage only. No decision is submitted, routed, or written to any external system.',
            },
          ]} />
        </section>

        {/* G. Generated Artifacts */}
        <section>
          <SectionHeader
            title="Generated Artifacts"
            subtitle="Demo artifacts assembled by the backend pipeline and served to the frontend via the recommendation endpoint."
          />
          <ArtifactList artifacts={[
            'recommendation_packet.json',
            'model_comparison.json',
            'filing_evidence.json',
            'news_evidence.json',
            'indicator_scorecards.json',
            'portfolio_stress_test.json',
            'model_predictions.json',
            'stock_features.csv',
          ]} />
          <p className="mt-3 text-xs text-gray-400">
            All artifacts are demo outputs. No secrets, credentials, or raw API keys are surfaced in frontend pages or API responses.
          </p>
        </section>

        {/* Bottom nav */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <Link
            href="/"
            className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm"
          >
            ← Back to Role Dashboard
          </Link>
          <Link
            href="/junior-analyst/step-1"
            className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm"
          >
            Start Workflow →
          </Link>
        </div>

      </div>
    </div>
  );
}
