'use client';

import React from 'react';
import Link from 'next/link';

const STEPS = [
  { step: 1, title: 'Risk Intake',       path: '/risk-team' },
  { step: 2, title: 'Scenario Analysis',  path: '/risk-team/simulation' },
  { step: 3, title: 'PM Handoff',        path: '/risk-team/handoff' },
];

export default function RiskTeamStepper({ activeStep, ticker }) {
  const q = ticker ? `?ticker=${ticker}` : '';

  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex items-center justify-center gap-4 overflow-x-auto">
          {STEPS.map((item, idx) => {
            const isCompleted = item.step < activeStep;
            const isCurrent   = item.step === activeStep;
            const href        = `${item.path}${q}`;

            return (
              <div key={item.step} className="flex items-center gap-4">
                {isCompleted ? (
                  <Link
                    href={href}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm
                               bg-white border border-gray-200 text-gray-600
                               hover:border-gray-400 hover:text-gray-900 hover:shadow-sm
                               transition-all duration-200 select-none"
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                    <span>{item.title}</span>
                  </Link>
                ) : isCurrent ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm
                                  bg-slate-700 text-white cursor-default select-none">
                    <span className="font-bold">{item.step}</span>
                    <span>{item.title}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm
                                  bg-white border border-gray-200 text-gray-400 opacity-50
                                  cursor-not-allowed pointer-events-none select-none">
                    <span className="font-bold">{item.step}</span>
                    <span>{item.title}</span>
                  </div>
                )}

                {idx < STEPS.length - 1 && (
                  <div className="flex-shrink-0 w-4 h-0.5 bg-gray-300" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
