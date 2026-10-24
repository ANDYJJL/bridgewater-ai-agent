'use client';
import { useState, useRef, useCallback } from 'react';
import { researchQuestionSamples } from '@/data/workflowMockData';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.md')) return 'md';
  if (name.endsWith('.txt') || file.type === 'text/plain') return 'txt';
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  return null;
}

/**
 * Props:
 *   onSubmit          — called with { researchQuestion, uploadedFile }
 *   questionValue     — optional controlled value for the research question textarea
 *   onQuestionChange  — optional setter paired with questionValue
 *   sampleQuestions   — optional array of strings to replace the default sample dropdown
 */
export default function ResearchAssignmentForm({
  onSubmit,
  questionValue,
  onQuestionChange,
  sampleQuestions,
}) {
  // Support both controlled (from parent) and uncontrolled modes for the question field
  const isControlled = questionValue !== undefined && onQuestionChange !== undefined;
  const [internalQuestion, setInternalQuestion] = useState('');
  const researchQuestion = isControlled ? questionValue : internalQuestion;
  const setResearchQuestion = isControlled ? onQuestionChange : setInternalQuestion;

  // Use overridden samples when provided, otherwise fall back to mock data samples
  const effectiveSamples = sampleQuestions ?? researchQuestionSamples;

  const [showSamples, setShowSamples] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef(null);

  /* ── file handling ── */

  const processFile = useCallback((file) => {
    const type = resolveFileType(file);
    if (!type) {
      setFileError('Unsupported file type. Please upload a PDF, TXT, or MD file.');
      return;
    }
    setFileError('');
    const base = { name: file.name, size: file.size, type };
    if (type === 'txt' || type === 'md') {
      const reader = new FileReader();
      reader.onload = (e) => setUploadedFile({ ...base, content: e.target.result });
      reader.readAsText(file);
    } else {
      setUploadedFile({ ...base, content: null });
    }
  }, []);

  const removeFile = () => {
    setUploadedFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── drag events ── */

  const onDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  /* ── submit ── */

  const canSubmit = researchQuestion.trim().length > 0 || uploadedFile !== null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ researchQuestion, uploadedFile });
  };

  /* ── render ── */

  return (
    <div className="space-y-8">

      {/* Research Question */}
      <div>
        <label className="block text-base font-semibold text-gray-900 mb-4">
          Research Question
        </label>
        <div className="relative">
          <textarea
            rows={4}
            placeholder="Enter your research question or company of interest..."
            value={researchQuestion}
            onChange={(e) => setResearchQuestion(e.target.value)}
            onFocus={() => setShowSamples(true)}
            onBlur={() => setTimeout(() => setShowSamples(false), 150)}
            className="w-full px-5 py-4 text-base border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
          />

          {/* Sample suggestions */}
          {showSamples && effectiveSamples.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              <div className="p-3 border-b border-gray-200">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                  Suggested Questions
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {effectiveSamples.map((sample, idx) => (
                  <button
                    key={idx}
                    onMouseDown={() => {
                      setResearchQuestion(sample);
                      setShowSamples(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700
                               border-b border-gray-100 last:border-0 transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Area */}
      <div>
        <label className="block text-base font-semibold text-gray-900 mb-1">
          Upload Document
          <span className="ml-2 text-sm font-normal text-gray-400">optional</span>
        </label>
        <p className="text-xs text-gray-500 mb-1">PDF · TXT · MD</p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-4 inline-block">
          Demo UI only — current analysis uses the pre-generated backend recommendation packet.
        </p>

        {uploadedFile ? (
          /* ── Uploaded file card ── */
          <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 flex items-start gap-4">
            <div className="w-11 h-11 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold uppercase tracking-wide">
                {uploadedFile.type}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-snug">
                {uploadedFile.name}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{formatSize(uploadedFile.size)}</p>
              <div className="mt-2.5 flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold
                  ${uploadedFile.type === 'pdf'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                  }`}>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  {uploadedFile.type === 'pdf' ? 'Ready — metadata only' : 'Ready to extract'}
                </span>
              </div>
              {uploadedFile.type === 'pdf' && (
                <p className="text-xs text-gray-400 mt-2">
                  Full PDF parsing coming soon. Research question will be used for extraction.
                </p>
              )}
            </div>
            <button
              onClick={removeFile}
              className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
              aria-label="Remove file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

        ) : (
          /* ── Drop zone ── */
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
                        transition-all duration-300 select-none
                        ${isDragging
                          ? 'border-gray-900 bg-gray-50 scale-[1.01]'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                        }`}
          >
            <div className="flex flex-col items-center">
              <div className={`mb-4 transition-transform duration-300 ${isDragging ? 'scale-110' : ''}`}>
                <svg className="w-10 h-10 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              {isDragging ? (
                <p className="text-base font-semibold text-gray-900">Drop to upload</p>
              ) : (
                <>
                  <p className="text-base font-medium text-gray-700">
                    Drag and drop a document here
                  </p>
                  <p className="text-sm text-gray-500 mt-1">or click to browse</p>
                  <p className="text-xs text-gray-400 mt-3 font-mono tracking-wide">PDF · TXT · MD</p>
                </>
              )}
            </div>
          </div>
        )}

        {fileError && (
          <p className="mt-2 text-sm text-red-600">{fileError}</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
          }}
          className="hidden"
        />
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-4 bg-gray-900 text-white rounded-lg font-bold text-lg
                     hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Extract &amp; Continue
        </button>
        {!canSubmit && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Select a company or enter a research question to continue
          </p>
        )}
      </div>

    </div>
  );
}
