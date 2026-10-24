'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getWorkflowSteps } from '@/data/workflowMockData';

const PATHS = {
  1: '/junior-analyst/step-1',
  2: '/junior-analyst/step-2',
  3: '/junior-analyst/step-3',
  4: '/junior-analyst/step-4',
  5: '/junior-analyst/step-5',
};

export default function WorkflowProgressBar({ currentStep, params = '' }) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [pendingStep, setPendingStep] = useState(null);

  const steps = getWorkflowSteps(currentStep);

  const navigateTo = (step) => {
    const base = PATHS[step];
    // Step 1 resets the session — never append params
    router.push(step === 1 || !params ? base : `${base}?${params}`);
  };

  const handleStepClick = (step, status) => {
    if (status === 'current' || status === 'pending') return;
    // Going back to Step 1 from Step 3+ warns about losing progress
    if (currentStep >= 3 && step === 1) {
      setPendingStep(step);
      setShowWarning(true);
      return;
    }
    navigateTo(step);
  };

  const handleConfirm = () => {
    setShowWarning(false);
    navigateTo(pendingStep);
    setPendingStep(null);
  };

  const handleCancel = () => {
    setShowWarning(false);
    setPendingStep(null);
  };

  return (
    <>
      {/* ── Progress bar strip ─────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-center gap-4 overflow-x-auto">
            {steps.map((item, idx) => {
              const isCompleted = item.status === 'completed';
              const isCurrent   = item.status === 'current';
              const isPending   = item.status === 'pending';

              return (
                <div key={item.step} className="flex items-center gap-4">
                  <div
                    role={isCompleted ? 'button' : undefined}
                    tabIndex={isCompleted ? 0 : undefined}
                    onClick={() => handleStepClick(item.step, item.status)}
                    onKeyDown={(e) => {
                      if (isCompleted && (e.key === 'Enter' || e.key === ' ')) {
                        handleStepClick(item.step, item.status);
                      }
                    }}
                    className={[
                      'flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm select-none',
                      'transition-all duration-200',
                      isCompleted
                        ? 'bg-white border border-gray-200 text-gray-600 cursor-pointer hover:border-gray-400 hover:text-gray-900 hover:shadow-sm'
                        : isCurrent
                        ? 'bg-slate-700 text-white cursor-default'
                        : 'bg-white border border-gray-200 text-gray-400 opacity-50 cursor-not-allowed pointer-events-none',
                    ].join(' ')}
                  >
                    {isCompleted ? (
                      <svg
                        className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    ) : (
                      <span className="font-bold">{item.step}</span>
                    )}
                    <span>{item.title}</span>
                  </div>

                  {idx < steps.length - 1 && (
                    <div className="flex-shrink-0 w-4 h-0.5 bg-gray-300" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Warning modal ──────────────────────────────────────────────── */}
      {showWarning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in">

            {/* Icon */}
            <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-5">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Return to Step 1?</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-7">
              Going back to <span className="font-semibold text-gray-800">Receive Assignment</span> will
              reset your research session. Your current analysis and data collection progress
              will not be saved.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 bg-gray-100 text-gray-900 rounded-lg font-semibold text-sm
                           hover:bg-gray-200 transition-colors"
              >
                Stay here
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-semibold text-sm
                           hover:bg-gray-800 transition-colors"
              >
                Go to Step 1
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
