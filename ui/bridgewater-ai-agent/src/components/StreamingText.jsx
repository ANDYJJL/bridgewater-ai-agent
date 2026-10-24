'use client';

import { useState, useEffect } from 'react';

// Inject debateBlink keyframe once into the document (shared across all streaming consumers)
let _blinkInjected = false;
export function ensureBlinkKeyframe() {
  if (_blinkInjected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = '@keyframes debateBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }';
  document.head.appendChild(s);
  _blinkInjected = true;
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function normalizeText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map(item => (item == null ? '' : typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    try {
      const pairs = Object.entries(value)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      return pairs.join('\n');
    } catch { return ''; }
  }
  return '';
}

// Hook: word-by-word reveal of `text` when `active` is true.
// Returns { displayedText, isDone }.
// speedMs: target ms per word (slight ±10ms variance added automatically).
export function useWordReveal(text, active, speedMs = 90) {
  const [words, setWords] = useState([]);
  const [revealCount, setRevealCount] = useState(0);

  // Reset words array and counter whenever text or active changes
  useEffect(() => {
    if (!active || !text) {
      setWords([]);
      setRevealCount(0);
      return;
    }
    const safeText = normalizeText(text);
    const ws = safeText.split(/\s+/).filter(Boolean);
    if (prefersReducedMotion()) {
      setWords(ws);
      setRevealCount(ws.length);
    } else {
      setWords(ws);
      setRevealCount(0);
    }
  }, [text, active]);

  // Drive reveal one word at a time
  useEffect(() => {
    if (!active || words.length === 0 || revealCount >= words.length) return;
    const delay = speedMs + (Math.random() * 20 - 10);
    const timer = setTimeout(() => setRevealCount(c => c + 1), delay);
    return () => clearTimeout(timer);
  }, [revealCount, words, active, speedMs]);

  const safeText = normalizeText(text);
  const isDone = !active || words.length === 0 || revealCount >= words.length;
  const displayedText = isDone ? safeText : words.slice(0, revealCount).join(' ');

  return { displayedText, isDone };
}

// Component: drop-in replacement for a <span> that reveals text word-by-word when active=true.
// When active=false, renders the full text instantly (no animation, no cursor).
export default function StreamingText({ text, active, speedMs = 90, className = '' }) {
  useEffect(() => { ensureBlinkKeyframe(); }, []);
  const { displayedText, isDone } = useWordReveal(text, active, speedMs);

  if (!active) return <span className={className}>{normalizeText(text)}</span>;

  return (
    <span className={className}>
      {displayedText}
      {!isDone && (
        <span
          className="inline-block w-px h-[1em] bg-gray-500 ml-0.5 align-text-bottom"
          style={{ animation: 'debateBlink 1s step-end infinite' }}
        />
      )}
    </span>
  );
}
