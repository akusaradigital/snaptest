import assert from 'node:assert/strict';
import { supportsVision, isNativeVisionModel } from '../src/app/api/ai/llm';
import { extractUrls } from '../src/app/api/ai/webContext';

// 1. Verify all models support vision by default across providers
const testProviders = [
  { provider: 'openai', models: ['gpt-5.5', 'gpt-4o', 'o1', 'o3-mini', 'o1-mini'] },
  { provider: 'anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-haiku-4-5'] },
  { provider: 'google', models: ['gemini-2.5-flash', 'gemini-1.5-pro'] },
  { provider: 'groq', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct'] },
  { provider: 'deepseek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { provider: 'moonshot', models: ['kimi-k2.6'] },
  { provider: 'alibaba', models: ['qwen3.6-flash', 'qwen3.6-plus', 'qwen-vl-max'] },
  { provider: '9router', models: ['Antigravity', 'custom-ollama-model', 'cc/claude', 'cx/gpt-4o'] },
  { provider: '9router-public', models: ['remote-model-xyz'] },
];

for (const { provider, models } of testProviders) {
  for (const model of models) {
    assert.equal(
      supportsVision(provider, model),
      true,
      `Model "${model}" for provider "${provider}" should support vision by default`
    );
  }
}

// Unknown provider should return false
assert.equal(supportsVision('unknown-unsupported-provider', 'model'), false);

// 2. Verify native vs bridged classification
assert.equal(isNativeVisionModel('openai', 'gpt-4o'), true);
assert.equal(isNativeVisionModel('openai', 'o3-mini'), false);
assert.equal(isNativeVisionModel('groq', 'llama-3.2-11b-vision-preview'), true);
assert.equal(isNativeVisionModel('groq', 'llama-3.3-70b-versatile'), false);
assert.equal(isNativeVisionModel('deepseek', 'deepseek-chat'), false);

// 3. Verify URL extraction from user messages with image attachments
const testMessage1 = 'Tolong cek bug tombol bayar di https://shop.example.com/checkout sesuai screenshot terlampir';
const urls1 = extractUrls(testMessage1);
assert.deepEqual(urls1, ['https://shop.example.com/checkout']);

const testMessage2 = 'Ada error di www.example.org/dashboard (lihat https://api.example.org/v1/status juga)';
const urls2 = extractUrls(testMessage2);
assert.deepEqual(urls2, [
  'https://www.example.org/dashboard',
  'https://api.example.org/v1/status',
]);

const testMessageNoUrl = 'Hanya teks deskripsi kendala tombol login tidak bisa diklik';
assert.deepEqual(extractUrls(testMessageNoUrl), []);

console.log('multimodal-link-check passed');
