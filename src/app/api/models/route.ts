import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ponytail: keys are client-side only now, so this endpoint is just a static
// model catalog + a live ping for the local 9Router. Cloud-provider connection
// status is tracked in the browser (presence of a saved key = connected).
export async function GET() {
  const availableModels: Record<string, string[]> = {
    openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'o3-mini', 'o1', 'o1-mini', 'gpt-4o', 'gpt-4o-mini'],
    anthropic: ['claude-fable-5', 'claude-opus-4.8', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    google: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'deepseek-r1-distill-llama-70b', 'gemma2-9b-it'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    moonshot: ['kimi-k2.6'],
    alibaba: ['qwen3.6-flash', 'qwen3.6-plus'],
    '9router': [],
    '9router-public': [],
  };

  const labels: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google Gemini',
    groq: 'Groq',
    deepseek: 'DeepSeek',
    moonshot: 'Moonshot (Kimi)',
    alibaba: 'Alibaba (Qwen)',
    '9router': '9Router (Local)',
    '9router-public': '9Router (Public)',
  };

  // Live-ping local 9Router (only reachable in local dev)
  const status: Record<string, string> = {};
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('http://127.0.0.1:20128/v1/models', { signal: ctrl.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) availableModels['9router'] = data.data.map((m: any) => m.id);
      status['9router'] = 'connected';
    } else {
      status['9router'] = 'disconnected';
    }
  } catch {
    status['9router'] = 'disconnected';
  }

  const configured: Record<string, boolean> = { '9router': status['9router'] === 'connected' };

  return NextResponse.json({
    providers: availableModels,
    configured,
    status,
    labels,
    current_provider: '',
    current_model: '',
  });
}
