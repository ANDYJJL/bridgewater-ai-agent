import React from 'react';

export default function ExtractionResult({ data, isVisible }) {
  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl p-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-semibold mb-4">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
            Extraction Complete
          </div>
          <h3 className="text-3xl font-bold text-gray-900">Research Assignment Parsed</h3>
          <p className="text-base text-gray-600 mt-2">AI extracted key information from your input</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Extracted</p>
          <p className="text-lg font-semibold text-gray-900">{data.extractedAt}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="w-16 h-1 bg-gray-900 rounded-full mb-10 opacity-30"></div>

      {/* Results Grid */}
      <div className="grid md:grid-cols-2 gap-10">
        {/* Company Name */}
        <div>
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-3">
            Company Name
          </p>
          <p className="text-3xl font-bold text-gray-900">
            {data.companyName}
          </p>
        </div>

        {/* Ticker */}
        <div>
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-3">
            Ticker
          </p>
          <p className="text-3xl font-bold text-gray-900 font-mono">
            {data.ticker}
          </p>
        </div>

        {/* Theme / Sector */}
        <div className="md:col-span-2">
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-3">
            Theme / Sector
          </p>
          <p className="text-xl text-gray-700">
            {data.theme}
          </p>
        </div>

        {/* Research Question */}
        <div className="md:col-span-2">
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-3">
            Research Question Summary
          </p>
          <p className="text-lg text-gray-700 leading-relaxed">
            {data.researchQuestion}
          </p>
        </div>
      </div>

      {/* Metadata Footer */}
      <div className="flex gap-8 mt-10 pt-10 border-t border-gray-200">
        <div>
          <p className="text-xs text-gray-600 font-medium uppercase tracking-wider mb-2">
            Priority
          </p>
          <div className="inline-flex px-4 py-2 bg-red-100 text-red-700 rounded text-sm font-semibold">
            {data.priority}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-600 font-medium uppercase tracking-wider mb-2">
            Analysis Type
          </p>
          <p className="text-base font-medium text-gray-900 capitalize">
            {data.sentiment}
          </p>
        </div>
      </div>
    </div>
  );
}
