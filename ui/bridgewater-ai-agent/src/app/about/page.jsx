'use client';

import React from 'react';
import Link from 'next/link';

export default function AboutPage() {
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
          <Link href="/methodology" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            Methodology →
          </Link>
        </div>
      </nav>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            About
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mt-4 mb-3">About the Research Workflow</h1>
          <p className="text-base text-gray-500 max-w-2xl leading-relaxed">
            This project is an educational AI-assisted investment research workflow that simulates how analysts,
            risk teams, and portfolio managers might collaborate around a source-grounded recommendation packet.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-10">

        <section className="bg-white border border-gray-200 rounded-xl p-7 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">What This Workflow Simulates</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            The workflow models a structured, multi-role investment research process. Starting from raw data
            ingestion and evidence retrieval, it walks through Junior Analyst research steps, Senior Analyst
            model review, Risk Team stress testing, and a Portfolio Manager decision gate — each role handing
            off structured context to the next.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            The backend assembles a <span className="font-semibold text-gray-800">recommendation packet</span> from
            SEC filings, news evidence, market data, and macro observations. Frontend role pages read from this
            shared packet, so all analysis is grounded in the same source rather than ad hoc notes.
          </p>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-7 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Role Handoff Concept</h2>
          <div className="space-y-3">
            {[
              { role: 'Junior Analyst', desc: 'Collects evidence, reviews indicators, and drafts a synthesis memo grounded in packet data.' },
              { role: 'Senior Analyst', desc: 'Reviews model quality, checks for divergence across experimental models, and prepares a trade proposal.' },
              { role: 'Risk Team',      desc: 'Runs stress scenario review, examines exposure shifts, and passes a risk summary to the PM.' },
              { role: 'Portfolio Manager', desc: 'Reviews cross-team handoffs, visualizes portfolio composition, and records a local approval, deferral, or rejection.' },
            ].map(({ role, desc }) => (
              <div key={role} className="flex gap-4 items-start">
                <span className="mt-0.5 px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                  {role}
                </span>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-7 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Class & Demo Context</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            This is an educational project built to explore how AI-assisted tooling might support a structured
            investment research process. It is not affiliated with or endorsed by Bridgewater Associates LP.
            The name reflects an inspiration from institutional investment research patterns, not any
            proprietary system or methodology.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            No real trades are executed. No real money is managed. All decisions recorded in this workflow
            are local-only demo artifacts stored in the browser and have no effect on any external system.
            This project does not provide investment advice.
          </p>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-7 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Contact</h2>
          <p className="text-sm text-gray-500 mb-1">Questions or feedback about this project:</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-12">Email</span>
              <a href="mailto:andyjjliu@gmail.com" className="text-slate-700 font-semibold hover:underline">andyjjliu@gmail.com</a>
            </div>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-200">
          <Link href="/" className="py-3 px-5 bg-gray-100 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-200 transition-colors text-sm">
            ← Back to Role Dashboard
          </Link>
          <Link href="/methodology" className="py-3 px-5 bg-white border border-gray-200 text-gray-700 rounded-lg font-bold text-center hover:bg-gray-50 transition-colors text-sm">
            Methodology & Guardrails →
          </Link>
          <Link href="/backend-toolkit" className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-bold text-center hover:bg-gray-800 transition-colors text-sm">
            Backend Toolkit →
          </Link>
        </div>

      </div>
    </div>
  );
}
