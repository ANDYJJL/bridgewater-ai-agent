'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    role: 'Senior Analyst',
    message: 'Returned the packet to Junior Analyst for evidence clarification.',
    time: 'Mock',
  },
  {
    id: 2,
    role: 'Risk Team',
    message: 'Requested scenario review before PM approval.',
    time: 'Mock',
  },
];

export default function TopNav() {
  const [open,      setOpen]      = useState(false);
  const [langNote,  setLangNote]  = useState(false);
  const [bellOpen,  setBellOpen]  = useState(false);
  const [bellRead,  setBellRead]  = useState(false);
  const ref     = useRef(null);
  const bellRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setLangNote(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex flex-col cursor-pointer">
          <h1 className="text-xl font-black text-gray-950 tracking-tight leading-none">BRIDGEWATER</h1>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">AI Agent</p>
        </Link>

        {/* Right controls */}
        <div className="flex items-center gap-2">

        {/* Notification bell */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => { setBellOpen(o => !o); setBellRead(true); }}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
            aria-label="Workflow notifications"
          >
            <svg className="w-4.5 h-4.5 text-gray-600" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {!bellRead && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-slate-700 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {MOCK_NOTIFICATIONS.length}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Workflow Notifications</p>
                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                  Mock
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {MOCK_NOTIFICATIONS.map(n => (
                  <div key={n.id} className="px-4 py-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{n.role}</p>
                    <p className="text-xs text-gray-700 leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                <p className="text-[10px] text-gray-400">Prototype only — notifications are simulated.</p>
              </div>
            </div>
          )}
        </div>

        {/* User pill */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-slate-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              AL
            </div>
            <span className="text-sm font-semibold text-gray-800 hidden sm:block">Andy Liu</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown */}
          {open && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">

              {/* Account header */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-700 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                    AL
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">Andy Liu</p>
                    <p className="text-xs text-gray-500 truncate">andyjjliu@gmail.com</p>
                  </div>
                  <span className="ml-auto flex-shrink-0 px-2 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    Demo
                  </span>
                </div>
              </div>

              {/* Team */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">Team</p>
                <div className="space-y-2">
                  {[
                    { initials: 'AL', name: 'Andy Liu',   role: 'Project Lead / Analyst',   bg: 'bg-slate-700' },
                    { initials: 'WZ', name: 'Will Zheng', role: 'Project Team Member',       bg: 'bg-slate-500' },
                  ].map(m => (
                    <div key={m.name} className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-full ${m.bg} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
                        {m.initials}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{m.name}</p>
                        <p className="text-[10px] text-gray-400">{m.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Language</p>
                <button
                  onClick={() => setLangNote(l => !l)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-sm text-gray-700">English</span>
                  <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {langNote && (
                  <p className="text-[11px] text-gray-400 px-3 pt-0.5 pb-1">
                    English only is available in this demo.
                  </p>
                )}
              </div>

              {/* Help & Support */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Help & Support</p>
                <p className="text-xs text-gray-500 px-1 mb-2 leading-relaxed">
                  For questions about this educational workflow, contact the project team.
                </p>
                <a
                  href="mailto:andyjjliu@gmail.com"
                  className="block px-3 py-2 rounded-lg text-sm text-slate-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  andyjjliu@gmail.com
                </a>
              </div>

              {/* Legal */}
              <div className="px-4 py-2 border-b border-gray-100">
                <Link
                  href="/legal"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-gray-700">Legal & Educational Disclaimer</span>
                  <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* Exit demo */}
              <div className="px-4 py-3">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Exit demo session
                </button>
                <p className="text-[10px] text-gray-400 px-3 pt-1">
                  Simulated demo account — no real authentication.
                </p>
              </div>

            </div>
          )}
        </div>

        </div>{/* end right controls flex */}

      </div>
    </nav>
  );
}
