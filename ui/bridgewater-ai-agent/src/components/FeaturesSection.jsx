import React from 'react';
import { features } from '@/data/mockData';

const featureIcons = [
  <svg key="ai" className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>,
  <svg key="collab" className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 19H9a6 6 0 0112 0v1H3v-1a6 6 0 0112 0h3z" />
  </svg>,
  <svg key="workflow" className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>,
  <svg key="security" className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
];

export default function FeaturesSection() {
  return (
    <section className="py-20 px-8 bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-5xl font-bold text-white mb-6">
            Institutional Capabilities
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Built for the most demanding investment research teams
          </p>
        </div>

        {/* Divider */}
        <div className="w-24 h-1.5 bg-white mx-auto mb-16 opacity-30"></div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-4 gap-8">
          {features.map((feature, idx) => (
            <div key={idx} className="text-center group">
              {/* Icon with hover effect */}
              <div className="flex justify-center mb-6 transform group-hover:scale-110 transition-transform duration-300">
                <div className="p-4 rounded-2xl bg-white/10 group-hover:bg-white/20 transition-colors">
                  {featureIcons[idx]}
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-white mb-3">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-gray-300 leading-relaxed">
                {feature.description}
              </p>

              {/* Accent line */}
              <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mt-6 group-hover:bg-white/40 transition-colors"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
