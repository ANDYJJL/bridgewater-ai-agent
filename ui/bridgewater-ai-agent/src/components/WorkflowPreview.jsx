import React from 'react';
import Link from 'next/link';

const TOOLKIT_CARDS = [
  {
    title: 'Source Packet',
    description: 'SEC filings, news evidence, market prices, macro data, and portfolio context',
    accent: '#334155',
  },
  {
    title: 'RAG & Evidence',
    description: 'Retrieval context, citation paths, packet Q&A, and indicator explanations',
    accent: '#0f766e',
  },
  {
    title: 'Model Review',
    description: 'Internal policy RAG, indicator scorecards, valuation review, and transparent fallback checks',
    accent: '#1d4ed8',
  },
  {
    title: 'Stress & Portfolio Tools',
    description: 'Scenario stress tests, exposure overlays, and local what-if portfolio views',
    accent: '#7c3aed',
  },
  {
    title: 'Drafting Layer',
    description: 'Backend /chat support with grounded LLM mode or deterministic packet fallback',
    accent: '#b45309',
  },
];

export default function WorkflowPreview() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-7xl mx-auto">

        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold text-gray-900 mb-5">
            Backend Intelligence Layer
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Source-grounded tools powering evidence review, model checks, stress testing, and decision support.
          </p>
        </div>

        <div className="w-24 h-1.5 bg-gray-900 mx-auto mb-12"></div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {TOOLKIT_CARDS.map((card) => (
            <div key={card.title} className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: card.accent }} />
                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{card.title}</h4>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
            </div>
          ))}

          {/* CTA card */}
          <div className="bg-gray-900 rounded-2xl p-6 flex flex-col justify-between gap-4 sm:col-span-2 lg:col-span-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Deep Dive</p>
              <p className="text-white font-bold text-base leading-snug">
                Explore the full artifact inventory, model stack, and safety layer.
              </p>
            </div>
            <Link
              href="/backend-toolkit"
              className="inline-block px-5 py-2.5 bg-white text-gray-900 text-sm font-bold rounded-xl hover:bg-gray-100 transition-colors text-center"
            >
              Explore Backend Toolkit →
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
