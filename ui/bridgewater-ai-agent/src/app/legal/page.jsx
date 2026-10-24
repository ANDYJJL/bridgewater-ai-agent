'use client';

import React from 'react';
import Link from 'next/link';

const SECTIONS = [
  {
    title: 'Educational Project Notice',
    body: [
      'This application is an educational class project and simulated workflow built to demonstrate AI-assisted investment research concepts, including multi-role handoffs, source-grounded analysis, model comparison, stress testing, and local PM decision records.',
      'It is not a production investment platform, a commercial product, or a professional research service of any kind. All outputs, recommendations, and decisions within the application are demo artifacts produced for learning and demonstration purposes only.',
    ],
  },
  {
    title: 'No Affiliation or Endorsement',
    body: [
      'This project is not affiliated with, endorsed by, sponsored by, or approved by Bridgewater Associates LP or any other company, institution, or organization referenced within the application.',
      'Any company names, ticker symbols, market references, or logos appearing in this project are used solely for educational demonstration and contextual illustration. They do not imply any relationship with, or approval from, the companies or entities they represent.',
      'This project does not attempt to represent, reproduce, or reflect the actual internal systems, methodologies, strategies, investment views, or operational processes of Bridgewater Associates or any other referenced organization.',
    ],
  },
  {
    title: 'No Investment Advice',
    body: [
      'Nothing in this application constitutes financial, investment, legal, tax, trading, or professional advice of any kind.',
      'Any recommendations, confidence scores, model outputs, stress-test results, portfolio simulations, or PM decision records presented within this workflow are demo outputs generated from project data. They should not be relied upon for any real investment, financial, or business decisions.',
      'Users of this application are solely responsible for any decisions they make. The project authors make no representations about the accuracy, completeness, or suitability of any content displayed.',
    ],
  },
  {
    title: 'No Trade Execution',
    body: [
      'This application does not execute, submit, route, approve, settle, or otherwise process any real trades or financial transactions.',
      'PM approvals, deferrals, rejections, and any trade proposal records shown in this workflow are local demo records stored in browser localStorage only. They do not constitute real orders, instructions, or communications to any broker, exchange, clearing house, or financial counterparty.',
      'No brokerage API, order management system, or execution venue is connected to this application.',
    ],
  },
  {
    title: 'Data, Models, and Limitations',
    body: [
      'The system uses generated demo artifacts including recommendation packets, model comparison outputs, evidence summaries, indicator scorecards, and stress-test scenarios. These are assembled from project data sources for demonstration purposes.',
      'Review signals (transparent fallback check, RAG-grounded policy citations, indicator scorecards) are informational only. They do not override human review gates in the demo workflow and do not represent investment recommendations.',
      'LLM-assisted or deterministic drafting support may summarize packet content but should not be treated as independent verification, professional analysis, or investment research.',
    ],
  },
  {
    title: 'Intellectual Property and Original Work',
    body: [
      'The interface design, workflow structure, source code, and written materials in this project were created by the project team for educational demonstration. No proprietary system, software, or intellectual property of any third party is intentionally reproduced.',
      'External names, logos, and references appearing in this project remain the property of their respective owners. No infringement of trademark, copyright, or other intellectual property rights is intended.',
      'This project and its materials should not be interpreted as copying, reproducing, or disclosing any proprietary or confidential systems of any referenced organization.',
    ],
  },
];

export default function LegalPage() {
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
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/about" className="hover:text-gray-800 transition-colors">About</Link>
            <Link href="/methodology" className="hover:text-gray-800 transition-colors">Methodology</Link>
          </div>
        </div>
      </nav>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            Legal
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mt-4 mb-3">Legal & Educational Disclaimer</h1>
          <p className="text-base text-gray-500 max-w-2xl leading-relaxed">
            Please read the following before using this application. This page is a project disclaimer,
            not legal advice.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-4">

        {SECTIONS.map(({ title, body }) => (
          <section key={title} className="bg-white border border-gray-200 rounded-xl p-7 space-y-3">
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            {body.map((para, i) => (
              <p key={i} className="text-sm text-gray-600 leading-relaxed">{para}</p>
            ))}
          </section>
        ))}

        <section className="bg-white border border-gray-200 rounded-xl p-7 space-y-2">
          <h2 className="text-base font-bold text-gray-900">Contact</h2>
          <p className="text-sm text-gray-600">
            For questions about this educational project:
          </p>
          <p className="text-sm">
            <a href="mailto:andyjjliu@gmail.com" className="text-slate-700 font-semibold hover:underline">
              andyjjliu@gmail.com
            </a>
          </p>
        </section>

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-4">
          <p className="text-xs text-slate-500 leading-relaxed font-medium text-center">
            This page is a project disclaimer, not legal advice. This application is for educational use only
            and does not provide investment, financial, legal, or professional advice of any kind.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-200">
          <Link href="/" className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm">
            ← Back to Role Dashboard
          </Link>
          <Link href="/about" className="py-3 px-5 bg-white border border-gray-200 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-50 transition-colors text-sm">
            About This Workflow
          </Link>
          <Link href="/methodology" className="py-3 px-5 bg-white border border-gray-200 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-50 transition-colors text-sm">
            Methodology
          </Link>
        </div>

      </div>
    </div>
  );
}
