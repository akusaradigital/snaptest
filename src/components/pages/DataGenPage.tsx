"use client";

import { useState } from 'react';
import { Database, Copy, Download, Loader2 } from 'lucide-react';
import { getApiKey } from '@/lib/keys';
import toast from 'react-hot-toast';

interface DataGenPageProps {
  aiProvider: string;
  aiModel: string;
}

const EXAMPLE_PROMPT = "Generate user payload with valid email, age between 18-60, and strong password";

export default function DataGenPage({ aiProvider, aiModel }: DataGenPageProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[] | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) {
      toast.error('Please provide a schema or field description');
      return;
    }
    if (!aiProvider || !aiModel) {
      toast.error('Please select an AI provider and model in settings first');
      return;
    }

    setLoading(true);
    try {
      const apiKey = getApiKey(aiProvider);
      const res = await fetch('/api/data/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          ai_provider: aiProvider,
          ai_model: aiModel,
          api_key: apiKey
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.detail || 'Failed to generate data');

      setData(resData.data);
      toast.success('Test Data generated successfully!');
      setPrompt('');
    } catch (err: any) {
      toast.error(err.message || 'Error generating test data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    toast.success('Copied JSON to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(fieldName => {
          const val = row[fieldName];
          const stringified = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
          return `"${stringified.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'test-data.csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded CSV!');
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-4 max-w-6xl mx-auto w-full">
      {/* ── LEFT: Configuration panel ── */}
      <div className="w-[360px] shrink-0 h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
            <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Test Data Generator</span>
        </div>

        <form onSubmit={handleGenerate} className="flex-1 flex flex-col min-h-0 p-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Fields / Schema</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe fields or paste JSON schema (e.g. email, age, role)..."
            disabled={loading}
            className="flex-1 min-h-[120px] w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none p-2.5"
          />
          <button type="button" onClick={() => setPrompt(EXAMPLE_PROMPT)} disabled={loading} className="self-start mt-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            Load example
          </button>

          <button type="submit" disabled={loading || !prompt.trim()} className="mt-4 w-full py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm font-semibold">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Generate Test Data
          </button>
          <p className="text-center text-[10px] text-slate-400 mt-2">AI Agent can make mistakes. Check important info.</p>
        </form>
      </div>

      {/* ── RIGHT: Results panel ── */}
      <div className="flex-1 min-w-0 h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>AI Agent is constructing mock &amp; boundary test data...</span>
            </div>
          )}

          {!data && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <Database className="w-8 h-8 text-indigo-300 dark:text-indigo-700 mb-4" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Start Data Generation</h3>
              <p className="text-xs text-slate-500 mb-4">Paste a JSON schema, API payload, or describe fields (e.g., email, age, password) to generate mock, boundary, and negative payloads.</p>
            </div>
          )}

          {data && (
            <div className="h-full flex flex-col animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 shrink-0">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Generated Mock Data <span className="font-normal text-slate-400">· {data.length} records</span></span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={copyToClipboard} className="btn-secondary text-xs px-2.5 py-1.5 flex gap-1 items-center"><Copy className="w-3.5 h-3.5" /> {copied ? "Copied!" : "Copy JSON"}</button>
                  <button onClick={downloadCsv} className="btn-primary text-xs px-2.5 py-1.5 flex gap-1 items-center"><Download className="w-3.5 h-3.5" /> CSV</button>
                </div>
              </div>
              <div className="flex-1 min-h-0 rounded-lg bg-slate-950 border border-slate-800 overflow-auto">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap p-4">{JSON.stringify(data, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}