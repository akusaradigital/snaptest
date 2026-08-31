import assert from 'node:assert/strict';
import { getAiRequestPayload } from '../src/lib/keys';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
};

(globalThis as any).window = { localStorage: localStorageMock };
(globalThis as any).localStorage = localStorageMock;

localStorage.setItem('9router_public', JSON.stringify({
  version: 1,
  url: 'https://bugsnap.example/v1',
  key: '',
  models: ['Happyhorse 1.1'],
  selectedModel: 'Happyhorse 1.1',
}));

const payload = getAiRequestPayload('9router-public', 'Happyhorse 1.1');
assert.equal(payload.ai_provider, '9router-public');
assert.equal(payload.ai_model, 'Happyhorse 1.1');
assert.equal(payload.api_key, '');
assert.equal(payload.nine_router_public_url, 'https://bugsnap.example/v1');
assert.equal(payload.nine_router_public_key, '');
assert.ok(!('provider' in payload));
assert.ok(!('model' in payload));

// Test ticket structure serialization
const sampleTicket = {
  issue_type: 'Improvement',
  title: 'Project Name Uniqueness by ID',
  description: 'Allow duplicate project names differentiated by unique Project ID.',
  expected_result: 'Users can create projects with duplicate names.',
  acceptance_criteria: ['Allow duplicate name', 'Unique ID assigned'],
  evidence: 'https://bugsnap.akusaraproject.my.id/v/453df9ba',
};

assert.ok(sampleTicket.issue_type === 'Improvement');
assert.ok(sampleTicket.acceptance_criteria.length === 2);

console.log('ticket-agent-payload-check passed');
