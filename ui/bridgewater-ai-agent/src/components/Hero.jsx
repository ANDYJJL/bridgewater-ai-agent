import React from 'react';
import { heroContent } from '@/data/mockData';

export default function Hero() {
  return (
    <section className="pt-32 pb-20 px-8">
      <div className="max-w-5xl mx-auto text-center">
        {/* Headline Badge */}
        <div className="inline-block mb-8">
          <span className="px-5 py-2 rounded-full bg-gray-100 text-xs font-bold text-gray-700 border border-gray-300 uppercase tracking-wider">
            Institutional Research Reimagined
          </span>
        </div>

        {/* Main Headline */}
        <h1 className="text-8xl md:text-8xl font-black text-gray-900 leading-tight mb-8 tracking-tight">
          {heroContent.headline}
        </h1>

        {/* Subheadline */}
        <p className="text-2xl text-gray-700 mb-12 max-w-3xl mx-auto leading-relaxed font-semibold">
          A multi-role research workflow from junior analysis to PM decision.
        </p>

        {/* Primary CTA */}
        <button
          onClick={() => {
            document.getElementById('role-selection')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }}
          className="px-10 py-5 bg-gray-900 text-white rounded-2xl font-bold text-lg hover:bg-gray-800 transition-all duration-200 shadow-2xl hover:shadow-3xl transform hover:-translate-y-1"
        >
          {heroContent.cta}
        </button>

        {/* Workflow preview row */}
        <div className="mt-10 flex items-center justify-center gap-2 flex-wrap">
          {['Junior Analyst', 'Senior Analyst', 'Risk Team', 'Portfolio Manager'].map((role, i, arr) => (
            <React.Fragment key={role}>
              <span className="px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-500 border border-gray-200">
                {role}
              </span>
              {i < arr.length - 1 && (
                <span className="text-gray-300 text-xs select-none">→</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Visual Hint: Divider Line */}
        <div className="mt-16">
          <div className="w-24 h-1.5 bg-gray-900 mx-auto"></div>
        </div>
      </div>
    </section>
  );
}
