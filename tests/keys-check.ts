import assert from 'node:assert/strict';
import { get9RouterPublicConfig, getAiRequestPayload, getApiKey, setApiKey } from '../src/lib/keys';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
};

(globalThis as any).window = { localStorage: localStorageMock };
(globalThis as any).localStorage = localStorageMock;

localStorage.setItem('9router_public', JSON.stringify({
  url: 'https://public.example/v1',
  key: 'sk-public',
  models: ['Antigravity', 'User Model'],
  selectedModel: 'User Model',
}));

assert.equal(getApiKey('9router-public'), 'sk-public');
assert.deepEqual(get9RouterPublicConfig().models, ['Antigravity', 'User Model']);
assert.deepEqual(getAiRequestPayload('9router-public', 'Antigravity'), {
  ai_provider: '9router-public',
  ai_model: 'User Model',
  api_key: 'sk-public',
  nine_router_public_url: 'https://public.example/v1',
  nine_router_public_key: 'sk-public',
});

store.clear();
setApiKey('9router-public', 'sk-legacy');
assert.equal(get9RouterPublicConfig().key, 'sk-legacy');
assert.equal(getApiKey('9router-public'), 'sk-legacy');

console.log('keys-check passed');
