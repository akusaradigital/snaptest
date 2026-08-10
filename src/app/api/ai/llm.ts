const PROVIDER_TIMEOUT_MS = 60_000;
const SUPPORTED_PROVIDERS = new Set(['openai', 'anthropic', 'google', '9router', '9router-public', 'groq', 'deepseek', 'moonshot', 'alibaba']);

function validateProvider(provider: string): string {
  const normalized = provider.toLowerCase().trim();
  if (!SUPPORTED_PROVIDERS.has(normalized)) throw new Error(`Unsupported provider: ${provider}`);
  return normalized;
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error('AI provider request timed out. Please try again.');
    }
    throw new Error('Unable to reach the AI provider. Please check its configuration and try again.');
  }
}

function providerError(provider: string, status: number): Error {
  return new Error(`${provider} API request failed (status ${status}). Check the provider configuration and try again.`);
}

export function supportsVision(provider: string, model: string): boolean {
  const m = model.toLowerCase();
  const p = provider.toLowerCase();
  // OpenAI: GPT-4o, GPT-4-turbo, GPT-4.1, o1/o3/o4 series
  if (p === 'openai') return /gpt-4o|gpt-4-turbo|gpt-4-vision|gpt-4\.1|o[134]/.test(m);
  // Anthropic: all current models (Opus 4.x, Sonnet 4.x, Haiku 4.x, Fable 5)
  if (p === 'anthropic') return true;
  // Google: all Gemini models
  if (p === 'google') return true;
  // Groq: Llama 4 and Llama 3.2 Vision
  if (p === 'groq') return /llama-4|llama4|llama-3\.2|vision/.test(m);
  // DeepSeek: V4 and VL (vision-language) variants
  if (p === 'deepseek') return /v4|vl/.test(m);
  // Alibaba Qwen: Qwen 3.x Plus and VL variants
  if (p === 'alibaba') return /qwen/.test(m) && /plus|vl|3\./.test(m);
  // 9Router: proxy - check model prefix to determine underlying model
  if (p === '9router' || p === '9router-public') {
    const m2 = model.toLowerCase();
    if (m2.startsWith('cc/')) return true;                          // cc/ = Claude (all support vision)
    if (m2.startsWith('cx/')) return /gpt-4o|gpt-4-turbo|gpt-4\.1|gpt-5|o[134]/.test(m2); // cx/ = OpenAI
    if (m2.startsWith('qd/')) return false;                         // qd/ = unknown, skip
    return false;
  }
  // Moonshot: vision not exposed via API input
  return false;
}

export interface UsageOut {
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface CompletionOut {
  finishReason?: string;
}

export async function callVisionLLM(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  textPrompt: string,
  imageBase64: string,
  maxTokens: number = 4096,
  usageOut?: UsageOut,
  publicBaseUrl?: string,
  completionOut?: CompletionOut
): Promise<string> {
  const p = validateProvider(provider);
  if (!supportsVision(p, model)) throw new Error(`Model "${model}" does not support vision for provider ${provider}.`);
  const effectiveKey = (p === '9router' && !apiKey) ? '9router-local-key' : apiKey;
  if (!effectiveKey && p !== '9router-public') throw new Error(`API key for provider ${p} is empty`);

  // Anthropic
  if (p === 'anthropic') {
    const payload = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          { type: 'text', text: textPrompt },
        ],
      }],
      temperature: 0.3,
    };
    const response = await providerFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': effectiveKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw providerError('Anthropic', response.status);
    if (usageOut && data.usage) usageOut.totalTokens = (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
    if (completionOut) completionOut.finishReason = data.stop_reason;
    return data.content?.[0]?.text?.trim() || '';
  }

  // Google Gemini
  if (p === 'google') {
    const resolvedModel = model; if (!resolvedModel) throw new Error('Model must be specified for Google Gemini');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${effectiveKey}`;
    const payload = {
      contents: [{ parts: [
        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        { text: `${systemPrompt}\n\n${textPrompt}` },
      ]}],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
    };
    const response = await providerFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw providerError('Gemini', response.status);
    if (usageOut && data.usageMetadata) usageOut.totalTokens = data.usageMetadata.totalTokenCount;
    if (completionOut) completionOut.finishReason = data.candidates?.[0]?.finishReason;
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // OpenAI compatible (openai, 9router, 9router-public)
  let baseURL = 'https://api.openai.com/v1/chat/completions';
  if (p === '9router') baseURL = 'http://127.0.0.1:20128/v1/chat/completions';
  if (p === '9router-public') baseURL = `${(publicBaseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v1/chat/completions`;

  const payload: any = {
    model,
    max_tokens: maxTokens,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' } },
        { type: 'text', text: textPrompt },
      ]},
    ],
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (effectiveKey) headers.Authorization = `Bearer ${effectiveKey}`;
  const response = await providerFetch(baseURL, { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw providerError(provider, response.status);
  if (usageOut && data.usage) usageOut.totalTokens = data.usage.total_tokens;
  if (completionOut) completionOut.finishReason = data.choices?.[0]?.finish_reason;
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function callLLM(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean = false,
  maxTokens: number = 2048,
  usageOut?: UsageOut,
  publicBaseUrl?: string,
  completionOut?: CompletionOut
): Promise<string> {
  const p = validateProvider(provider);
  const effectiveKey = (p === '9router' && !apiKey) ? '9router-local-key' : apiKey;
  if (!effectiveKey && p !== '9router-public') {
    throw new Error(`API key for provider ${p} is empty`);
  }

  // 1. Google Gemini
  if (p === 'google') {
    const resolvedModel = model; if (!resolvedModel) throw new Error('Model must be specified for Google Gemini');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${effectiveKey}`;
    const fullPrompt = `System Prompt:\n${systemPrompt}\n\nUser Prompt:\n${userPrompt}`;

    const payload: any = {
      contents: [
        {
          parts: [{ text: fullPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: maxTokens
      }
    };
    if (jsonMode) {
      payload.generationConfig.responseMimeType = 'application/json';
    }

    const response = await providerFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const respText = await response.text();
    if (!response.ok) {
      throw providerError('Gemini', response.status);
    }

    const data = JSON.parse(respText);
    if (usageOut && data.usageMetadata) {
      usageOut.totalTokens = data.usageMetadata.totalTokenCount;
    }
    if (completionOut) completionOut.finishReason = data.candidates?.[0]?.finishReason;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text.trim();
    throw new Error(`No text returned in Gemini response: ${respText}`);
  }

  // 2. Anthropic Claude
  if (p === 'anthropic') {
    const resolvedModel = model; if (!resolvedModel) throw new Error('Model must be specified for Claude');
    const url = 'https://api.anthropic.com/v1/messages';

    let sysPrompt = systemPrompt;
    if (jsonMode) {
      sysPrompt += ' You MUST output only valid JSON, no markdown, no commentary.';
    }

    const payload = {
      model: resolvedModel,
      max_tokens: maxTokens,
      // ponytail: cache_control on the static system prompt - it's identical every turn
      // in multi-turn agents (e.g. Ticket Agent), so Anthropic caches it and only bills
      // full price for the new user turn. Requires prompt >1024 tokens to actually cache.
      system: [{ type: 'text', text: sysPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3
    };

    const response = await providerFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': effectiveKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    const respText = await response.text();
    if (!response.ok) {
      throw providerError('Anthropic', response.status);
    }

    const data = JSON.parse(respText);
    if (usageOut && data.usage) {
      usageOut.totalTokens = (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
      usageOut.cacheReadTokens = data.usage.cache_read_input_tokens || 0;
      usageOut.cacheCreationTokens = data.usage.cache_creation_input_tokens || 0;
      if (data.usage.cache_read_input_tokens) {
        console.log(`[PromptCache] Anthropic cache hit: ${data.usage.cache_read_input_tokens} input tokens read from cache`);
      }
    }
    if (completionOut) completionOut.finishReason = data.stop_reason;
    const text = data.content?.[0]?.text;
    if (text) return text.trim();
    throw new Error(`No text returned in Claude response: ${respText}`);
  }

  // 3. OpenAI Compatible
  let baseURL = '';
  let resolvedModel = model;
  switch (p) {
    case 'openai':
      baseURL = 'https://api.openai.com/v1/chat/completions';
      if (!resolvedModel) throw new Error('Model must be specified for OpenAI');
      break;
    case '9router':
      baseURL = 'http://127.0.0.1:20128/v1/chat/completions';
      if (!resolvedModel) throw new Error('A specific model/combo must be provided for 9Router');
      break;
    case '9router-public':
      baseURL = `${(publicBaseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v1/chat/completions`;
      if (baseURL === '/v1/chat/completions') throw new Error('9Router public URL is not configured');
      if (!resolvedModel) throw new Error('A specific model must be provided for 9Router');
      break;
    case 'groq':
      baseURL = 'https://api.groq.com/openai/v1/chat/completions';
      if (!resolvedModel) throw new Error('Model must be specified for Groq');
      break;
    case 'deepseek':
      baseURL = 'https://api.deepseek.com/v1/chat/completions';
      if (!resolvedModel) throw new Error('Model must be specified for DeepSeek');
      break;
    case 'moonshot':
      baseURL = 'https://api.moonshot.cn/v1/chat/completions';
      if (!resolvedModel) throw new Error('Model must be specified for Moonshot');
      break;
    case 'alibaba':
      baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      if (!resolvedModel) throw new Error('Model must be specified for Alibaba');
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const payload: any = {
    model: resolvedModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: maxTokens,
    stream: false
  };
  if (jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (effectiveKey) headers.Authorization = `Bearer ${effectiveKey}`;

  const response = await providerFetch(baseURL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const respText = await response.text();
  if (!response.ok) {
    throw providerError(provider, response.status);
  }

  const data = JSON.parse(respText);
  if (usageOut && data.usage) {
    usageOut.totalTokens = data.usage.total_tokens;
  }
  if (completionOut) completionOut.finishReason = data.choices?.[0]?.finish_reason;
  const text = data.choices?.[0]?.message?.content;
  if (text) return text.trim();
  throw new Error(`No choices returned in ${provider} response: ${respText}`);
}
