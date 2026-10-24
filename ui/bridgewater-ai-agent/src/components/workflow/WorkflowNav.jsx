import React from 'react';
import Link from 'next/link';

export default function WorkflowNav({
  role     = 'Junior Analyst',
  subtitle = 'Institutional investment research workflow',
}) {
  return (
    <nav className="border-b border-gray-200 bg-white sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Roles
        </Link>

        <div className="mt-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{role}</h2>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
      </div>
    </nav>
  );
}
