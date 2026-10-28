import React from 'react';
import Link from 'next/link';

const BridgewaterLogo = ({ size = 'sm' }) => {
  const sizeClasses = { sm: 'w-6 h-6', md: 'w-8 h-8' };
  return (
    <svg viewBox="0 0 100 100" className={sizeClasses[size]}>
      <path d="M 20 80 Q 50 15 95 5" stroke="#8B3A3A" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
};

const COLUMNS = [
  {
    heading: 'Project',
    links: [
      { label: 'About This Workflow', href: '/about' },
      { label: 'Methodology',         href: '/methodology' },
      { label: 'Backend Toolkit',     href: '/backend-toolkit' },
      { label: 'Contact',             href: '/about' },
    ],
  },
  {
    heading: 'Research System',
    links: [
      { label: 'Source Packet',    href: '/backend-toolkit' },
      { label: 'RAG & Evidence',   href: '/backend-toolkit' },
      { label: 'Model Review Tools', href: '/backend-toolkit' },
      { label: 'Stress Testing',   href: '/backend-toolkit' },
    ],
  },
  {
    heading: 'Demo Artifacts',
    links: [
      { label: 'Recommendation Packet', href: '/backend-toolkit' },
      { label: 'Model Comparison',      href: '/backend-toolkit' },
      { label: 'Risk Handoff',          href: '/backend-toolkit' },
      { label: 'PM Decision Record',    href: '/backend-toolkit' },
    ],
  },
  {
    heading: 'Notes',
    links: [
      { label: 'Legal Disclaimer',      href: '/legal' },
      { label: 'Local-only Demo',       href: '/methodology' },
      { label: 'No Trade Execution',    href: '/methodology' },
      { label: 'Educational Use Only',  href: '/methodology' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-16 px-8 border-t border-gray-800">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-white font-bold text-lg mb-5">{col.heading}</h4>
              <ul className="space-y-3 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('mailto') ? (
                      <a href={link.href} className="hover:text-white transition-colors">{link.label}</a>
                    ) : (
                      <Link href={link.href} className="hover:text-white transition-colors">{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 my-12"></div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BridgewaterLogo size="md" />
            <p className="text-sm">© 2026 Bridgewater-Style AI Agent · Educational demo workflow</p>
          </div>
          <p className="text-xs text-gray-600 text-center md:text-right">
            For educational use only. Does not provide investment advice. No real trades are executed.
          </p>
        </div>
      </div>
    </footer>
  );
}
