'use client';

import React from 'react';
import Link from 'next/link';

const PRINCIPLES = [
  {
    title: 'Source Packet as Ground Truth',
    body: 'The backend assembles a recommendation packet from SEC filings, news evidence, market price data, FRED macro observations, and portfolio context. Every frontend page reads from this shared packet — analysis is source-grounded, not generated from model priors alone.',
    badge: 'Data layer',
  },
  {
    title: 'RAG-Grounded Evidence',
    body: 'The backend /chat endpoint uses retrieval-augmented generation to ground responses in packet content. When an LLM is available, answers cite specific evidence chunks. When unavailable, the endpoint returns a deterministic summary from packet fields — no hallucinated data either way.',
    badge: 'Evidence layer',
  },
  {
    title: 'Model Comparison as Experimental Review',
    body: 'The workflow includes a transparent fallback check alongside RAG-grounded policy citations. These are review signals only — they surface divergence for human assessment in the Senior Analyst step and do not produce authoritative outputs or override human judgment.',
    badge: 'Model layer',
  },
  {
    title: 'Stress Testing and Local What-If Simulation',
    body: 'The Risk Team step shows scenario-level downside ranges from the source packet and lets the Risk Team record a local proposed weight change. The PM dashboard shows a what-if portfolio composition view using the packet\'s target_weight_change field. Both views are local simulations — no positions are modified.',
    badge: 'Risk layer',
  },
  {
    title: 'Human Review Guardrails',
    body: 'Each role hands off structured context to the next. The Risk Team records a conclusion before PM review. The PM sees cross-team handoffs, portfolio guardrails from the source packet, and a full review surface before recording any decision. No step auto-advances.',
    badge: 'Workflow guardrail',
  },
  {
    title: 'Local-Only PM Decision Records',
    body: 'PM approvals, deferrals, and rejections are stored in browser localStorage only. They are not submitted to any backend, routing system, or external platform. The confirmation modal and decision card make this explicit at every step.',
    badge: 'Decision guardrail',
  },
  {
    title: 'No Real Trade Execution',
    body: 'This workflow does not submit, route, execute, or simulate real trades. No brokerage API is connected. No order management system is called. Any reference to "proposed order ticket" describes a locally noted memo only — not an instruction to any execution venue.',
    badge: 'Safety guardrail',
  },
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-gray-50">

      <nav className="border-b border-gray-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Role Dashboard
          </Link>
          <Link href="/about" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            About →
          </Link>
        </div>
      </nav>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            Methodology
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mt-4 mb-3">Methodology & Guardrails</h1>
          <p className="text-base text-gray-500 max-w-2xl leading-relaxed">
            How this simulated, educational workflow grounds its analysis, limits model authority, and
            ensures no real trade execution occurs at any step.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-4">

        {PRINCIPLES.map(({ title, body, badge }) => (
          <div key={title} className="bg-white border border-gray-200 rounded-xl p-6 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">{title}</h2>
              <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-500 border border-gray-200 uppercase tracking-wider">
                {badge}
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
          </div>
        ))}

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-5 mt-6">
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            This workflow is for educational use only. It does not provide investment advice, manage real
            assets, or connect to any brokerage or execution system. All outputs are simulated demo artifacts.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <Link href="/" className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm">
            ← Back to Role Dashboard
          </Link>
          <Link href="/about" className="py-3 px-5 bg-white border border-gray-200 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-50 transition-colors text-sm">
            About This Workflow →
          </Link>
          <Link href="/backend-toolkit" className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm">
            Backend Toolkit →
          </Link>
        </div>

      </div>
    </div>
  );
}
