import { sanitizePromptForContentPolicy } from './webContext';

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

export function isNativeVisionModel(provider: string, model: string): boolean {
  const m = (model || '').toLowerCase();
  const p = (provider || '').toLowerCase().trim();

  if (p === 'openai') {
    if (/o1-mini|o3-mini/.test(m)) return false;
    return /gpt-5|gpt-4o|gpt-4-turbo|gpt-4-vision|gpt-4\.1|o[14]/.test(m);
  }
  if (p === 'anthropic' || p === 'google') return true;
  if (p === 'groq') return /llama-4|llama4|llama-3\.2|vision/.test(m);
  if (p === 'deepseek') return /v4|vl/.test(m);
  if (p === 'alibaba') return /vl|vision/.test(m) || (/qwen/.test(m) && /plus|vl|3\./.test(m));
  if (p === '9router' || p === '9router-public') {
    if (/o1-mini|o3-mini/.test(m)) return false;
    if (m.startsWith('cc/')) return true;
    if (m.startsWith('cx/')) return /gpt-5|gpt-4o|gpt-4-turbo|gpt-4-vision|gpt-4\.1|o[14]/.test(m);
    if (m.startsWith('qd/')) return false;
    return /gpt-4o|gpt-5|claude|gemini|vision|vl/.test(m);
  }
  return false;
}

export function supportsVision(provider?: string, model?: string): boolean {
  // All supported models can process images by default in SnapTest.
  // Models with native vision execute directly; text-only models automatically
  // leverage the universal vision bridge fallback so they can read and analyze images.
  if (!provider) return true;
  const p = provider.toLowerCase().trim();
  return SUPPORTED_PROVIDERS.has(p);
}

export interface ParsedImageData {
  mimeType: string;
  base64: string;
  dataUrl: string;
}

export function parseImageData(input: string): ParsedImageData {
  let str = (input || '').trim();
  let detectedMime = '';

  // Handle data URL prefix (and guard against duplicate/nested prefixes)
  while (/^data:[^;]+;base64,/i.test(str)) {
    const match = str.match(/^data:([^;]+);base64,(.*)$/is);
    if (!match) break;
    if (!detectedMime) {
      detectedMime = match[1].toLowerCase().trim();
    }
    str = match[2].trim();
  }

  const base64 = str.replace(/\s+/g, '');

  if (detectedMime === 'image/jpg') {
    detectedMime = 'image/jpeg';
  }

  // Detect mimeType from magic bytes or default to image/png
  let mimeType = detectedMime;
  if (base64.startsWith('iVBORw0K')) {
    mimeType = 'image/png';
  } else if (base64.startsWith('/9j/')) {
    mimeType = 'image/jpeg';
  } else if (base64.startsWith('R0lGOD')) {
    mimeType = 'image/gif';
  } else if (base64.startsWith('UklGR')) {
    mimeType = 'image/webp';
  } else if (!mimeType || !mimeType.startsWith('image/')) {
    mimeType = 'image/png';
  }

  const dataUrl = `data:${mimeType};base64,${base64}`;
  return { mimeType, base64, dataUrl };
}

export interface UsageOut {
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface CompletionOut {
  finishReason?: string;
}

async function callWithVisionBridge(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  textPrompt: string,
  imageBase64: string,
  maxTokens: number,
  usageOut?: UsageOut,
  publicBaseUrl?: string,
  completionOut?: CompletionOut
): Promise<string> {
  const { mimeType, base64 } = parseImageData(imageBase64);
  const sizeKb = Math.round((base64.length * 0.75) / 1024);

  let visualDescription: string | null = null;

  // Attempt 1: Try local 9Router vision model (free & low-latency)
  try {
    const localRes = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer 9router-local-key' },
      body: JSON.stringify({
        model: 'Antigravity',
        messages: [
          {
            role: 'system',
            content: 'You are an expert QA visual analyst. Describe this screenshot / UI image in detail: list page title, headers, buttons, inputs, error messages, and UI layout components.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
              { type: 'text', text: 'Extract and describe all UI components, buttons, error messages, and text from this screenshot for QA test case / issue documentation.' },
            ],
          },
        ],
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (localRes.ok) {
      const data = await localRes.json();
      const desc = data.choices?.[0]?.message?.content?.trim();
      if (desc) visualDescription = desc;
    }
  } catch {}

  // Attempt 2: Try public 9Router if configured
  if (!visualDescription && publicBaseUrl) {
    try {
      const pubUrl = `${publicBaseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v1/chat/completions`;
      const pubRes = await fetch(pubUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Antigravity',
          messages: [
            { role: 'system', content: 'You are an expert QA visual analyst. Describe the screenshot or UI design in detail.' },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
                { type: 'text', text: 'Extract and describe all UI components, buttons, error messages, and text from this screenshot.' },
              ],
            },
          ],
          max_tokens: 1200,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (pubRes.ok) {
        const data = await pubRes.json();
        const desc = data.choices?.[0]?.message?.content?.trim();
        if (desc) visualDescription = desc;
      }
    } catch {}
  }

  const enrichedPrompt = visualDescription
    ? `${textPrompt}\n\n[Visual Image Analysis of Attached Screenshot / Mockup]:\n${visualDescription}`
    : `${textPrompt}\n\n[Attached Visual Evidence]:\nThe user attached an image (${mimeType}, ~${sizeKb} KB) representing the application UI state or defect. Analyze the issue and fulfill the request based on all available context.`;

  return await callLLM(
    provider,
    model,
    apiKey,
    systemPrompt,
    enrichedPrompt,
    false,
    maxTokens,
    usageOut,
    publicBaseUrl,
    completionOut
  );
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
  completionOut?: CompletionOut,
  isFallbackRetry: boolean = false
): Promise<string> {
  const p = validateProvider(provider);
  const effectiveKey = (p === '9router' && !apiKey) ? '9router-local-key' : apiKey;
  if (!effectiveKey && p !== '9router-public') throw new Error(`API key for provider ${p} is empty`);

  const { mimeType, base64, dataUrl } = parseImageData(imageBase64);

  // Anthropic
  if (p === 'anthropic') {
    const mediaType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
      ? mimeType
      : 'image/png') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    const payload = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
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
        { inlineData: { mimeType, data: base64 } },
        { text: `${systemPrompt}\n\n${textPrompt}` },
      ]}],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    };
    const response = await providerFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw providerError('Gemini', response.status);
    if (usageOut && data.usageMetadata) usageOut.totalTokens = data.usageMetadata.totalTokenCount;
    if (completionOut) completionOut.finishReason = data.candidates?.[0]?.finishReason;
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // OpenAI compatible (openai, groq, alibaba, 9router, 9router-public, deepseek, moonshot)
  let baseURL = 'https://api.openai.com/v1/chat/completions';
  switch (p) {
    case 'openai':
      baseURL = 'https://api.openai.com/v1/chat/completions';
      break;
    case 'groq':
      baseURL = 'https://api.groq.com/openai/v1/chat/completions';
      break;
    case 'alibaba':
      baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      break;
    case '9router':
      baseURL = 'http://127.0.0.1:20128/v1/chat/completions';
      break;
    case '9router-public':
      baseURL = `${(publicBaseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v1/chat/completions`;
      if (baseURL === '/v1/chat/completions') throw new Error('9Router public URL is not configured');
      break;
    case 'deepseek':
      baseURL = 'https://api.deepseek.com/v1/chat/completions';
      break;
    case 'moonshot':
      baseURL = 'https://api.moonshot.cn/v1/chat/completions';
      break;
    default:
      throw new Error(`Unsupported provider for vision: ${provider}`);
  }

  const isReasoning = p === 'openai' && /^o[14]/.test(model.toLowerCase());
  const payload: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        { type: 'text', text: textPrompt },
      ]},
    ],
  };
  if (isReasoning) {
    payload.max_completion_tokens = maxTokens;
  } else {
    payload.max_tokens = maxTokens;
    payload.temperature = 0.3;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (effectiveKey) headers.Authorization = `Bearer ${effectiveKey}`;
  const response = await providerFetch(baseURL, { method: 'POST', headers, body: JSON.stringify(payload) });
  const respText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(respText);
  } catch {}

  if (!response.ok) {
    const isImageUnsupported = response.status === 400 || response.status === 422 ||
      /image_url|vision|multimodal|unsupported.*type|content_type|does not support|invalid type/i.test(respText);

    if (isImageUnsupported) {
      console.warn(`[UniversalVision] Model "${model}" on ${provider} does not accept image_url directly. Activating universal vision bridge.`);
      return await callWithVisionBridge(
        provider,
        model,
        effectiveKey,
        systemPrompt,
        textPrompt,
        imageBase64,
        maxTokens,
        usageOut,
        publicBaseUrl,
        completionOut
      );
    }

    throw providerError(provider, response.status);
  }

  const promptFeedback = data?.response?.promptFeedback || data?.promptFeedback;
  const isBlocked = Boolean(
    promptFeedback?.blockReason ||
    data?.candidates?.[0]?.finishReason === 'SAFETY' ||
    data?.choices?.[0]?.finish_reason === 'content_filter'
  );

  if (isBlocked) {
    const reasonMsg = promptFeedback?.blockReasonMessage || `Blocked due to ${promptFeedback?.blockReason || 'content safety policy'}`;

    if (!isFallbackRetry) {
      console.warn(`[SelfHealing] Vision call on "${model}" (${provider}) was blocked (${reasonMsg}). Initiating self-healing...`);

      // Attempt 1: Re-try with sanitized QA terms if prompt contained sensitive keywords
      const sanitized = sanitizePromptForContentPolicy(textPrompt);
      if (sanitized !== textPrompt) {
        try {
          return await callVisionLLM(
            provider,
            model,
            effectiveKey,
            systemPrompt,
            sanitized,
            imageBase64,
            maxTokens,
            usageOut,
            publicBaseUrl,
            completionOut,
            true
          );
        } catch {}
      }

      // Attempt 2: If 9Router or 9Router-Public, auto-fallback to high-tolerance coding model
      if (provider === '9router' || provider === '9router-public') {
        const fallbacks = ['cc/claude-3-5-sonnet', 'cx/gpt-4o', 'Antigravity'].filter(
          (f) => f.toLowerCase() !== model.toLowerCase()
        );
        for (const candidate of fallbacks) {
          try {
            console.log(`[SelfHealing] Switching to fallback model "${candidate}" for vision task...`);
            return await callVisionLLM(
              provider,
              candidate,
              effectiveKey,
              systemPrompt,
              sanitizePromptForContentPolicy(textPrompt),
              imageBase64,
              maxTokens,
              usageOut,
              publicBaseUrl,
              completionOut,
              true
            );
          } catch (err: any) {
            console.warn(`[SelfHealing] Fallback model "${candidate}" failed:`, err?.message);
          }
        }
      }
    }

    throw new Error(`AI model (${data?.response?.modelVersion || model}) blocked the prompt: ${reasonMsg}. Please rephrase the input or switch to another model (e.g. Claude 3.5 Sonnet, GPT-4o, or DeepSeek).`);
  }

  if (usageOut && data?.usage) usageOut.totalTokens = data.usage.total_tokens;
  if (completionOut) completionOut.finishReason = data?.choices?.[0]?.finish_reason;
  const content = data?.choices?.[0]?.message?.content;
  if (content) return content.trim();
  throw new Error(`No choices returned in ${provider} response: ${respText}`);
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
  completionOut?: CompletionOut,
  isFallbackRetry: boolean = false
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
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
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
    const promptFeedback = data.promptFeedback;
    if (promptFeedback?.blockReason) {
      if (!isFallbackRetry) {
        const sanitized = sanitizePromptForContentPolicy(userPrompt);
        if (sanitized !== userPrompt) {
          try {
            console.warn(`[SelfHealing] Google Gemini blocked content. Retrying with sanitized QA prompt...`);
            return await callLLM(
              provider,
              model,
              apiKey,
              systemPrompt,
              sanitized,
              jsonMode,
              maxTokens,
              usageOut,
              publicBaseUrl,
              completionOut,
              true
            );
          } catch {}
        }
      }
      throw new Error(`Google Gemini blocked the prompt: ${promptFeedback.blockReasonMessage || promptFeedback.blockReason}. Please rephrase the input or switch to another model.`);
    }

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
  const promptFeedback = data.response?.promptFeedback || data.promptFeedback;
  const isBlocked = Boolean(
    promptFeedback?.blockReason ||
    data.candidates?.[0]?.finishReason === 'SAFETY' ||
    data.choices?.[0]?.finish_reason === 'content_filter'
  );

  if (isBlocked) {
    const reasonMsg = promptFeedback?.blockReasonMessage || `Blocked due to ${promptFeedback?.blockReason || 'content safety policy'}`;

    if (!isFallbackRetry) {
      console.warn(`[SelfHealing] LLM call on "${model}" (${provider}) was blocked (${reasonMsg}). Initiating self-healing...`);

      // Attempt 1: Re-try with sanitized QA terms if prompt contained sensitive keywords
      const sanitized = sanitizePromptForContentPolicy(userPrompt);
      if (sanitized !== userPrompt) {
        try {
          return await callLLM(
            provider,
            model,
            effectiveKey,
            systemPrompt,
            sanitized,
            jsonMode,
            maxTokens,
            usageOut,
            publicBaseUrl,
            completionOut,
            true
          );
        } catch {}
      }

      // Attempt 2: If 9Router or 9Router-Public, auto-fallback to high-tolerance coding model
      if (provider === '9router' || provider === '9router-public') {
        const fallbacks = ['cc/claude-3-5-sonnet', 'cx/gpt-4o', 'Antigravity'].filter(
          (f) => f.toLowerCase() !== model.toLowerCase()
        );
        for (const candidate of fallbacks) {
          try {
            console.log(`[SelfHealing] Switching to fallback model "${candidate}" for LLM task...`);
            return await callLLM(
              provider,
              candidate,
              effectiveKey,
              systemPrompt,
              sanitizePromptForContentPolicy(userPrompt),
              jsonMode,
              maxTokens,
              usageOut,
              publicBaseUrl,
              completionOut,
              true
            );
          } catch (err: any) {
            console.warn(`[SelfHealing] Fallback model "${candidate}" failed:`, err?.message);
          }
        }
      }
    }

    throw new Error(`AI model (${data.response?.modelVersion || model}) blocked the prompt: ${reasonMsg}. Please rephrase the input or switch to another model (e.g. Claude 3.5 Sonnet, GPT-4o, or DeepSeek).`);
  }

  if (usageOut && data.usage) {
    usageOut.totalTokens = data.usage.total_tokens;
  }
  if (completionOut) completionOut.finishReason = data.choices?.[0]?.finish_reason;
  const text = data.choices?.[0]?.message?.content;
  if (text) return text.trim();
  throw new Error(`No choices returned in ${provider} response: ${respText}`);
}
