import assert from 'node:assert/strict';
import { getEffectiveAiRules, rememberAiRule, getStoredAiMemory } from '../src/lib/aiMemory';

// Mock localStorage
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
};

(globalThis as any).window = { localStorage: localStorageMock };
(globalThis as any).localStorage = localStorageMock;

// 1. Initial state is empty
assert.equal(getEffectiveAiRules('ticket'), '');

// 2. Remember a ticket-specific rule
const saved1 = rememberAiRule('Gunakan format [Modul] - Masalah pada judul bug', 'ticket');
assert.equal(saved1, true);

const mem1 = getStoredAiMemory();
assert.ok(mem1.ticketCustomPrompt?.includes('Gunakan format [Modul] - Masalah pada judul bug'));

const ticketRules = getEffectiveAiRules('ticket');
assert.ok(ticketRules.includes('[Ticket Agent Specific Rules]'));
assert.ok(ticketRules.includes('Gunakan format [Modul] - Masalah'));

// 3. Remember a global rule (should apply to ticket and generator)
rememberAiRule('Selalu gunakan Bahasa Indonesia yang profesional', 'global');

const ticketWithGlobal = getEffectiveAiRules('ticket');
assert.ok(ticketWithGlobal.includes('[Global Preference - All Features]'));
assert.ok(ticketWithGlobal.includes('Selalu gunakan Bahasa Indonesia yang profesional'));
assert.ok(ticketWithGlobal.includes('[Ticket Agent Specific Rules]'));

const generatorWithGlobal = getEffectiveAiRules('generator');
assert.ok(generatorWithGlobal.includes('[Global Preference - All Features]'));
assert.ok(!generatorWithGlobal.includes('[Ticket Agent Specific Rules]'));

// 4. Duplicate prevention
rememberAiRule('Gunakan format [Modul] - Masalah pada judul bug', 'ticket');
const mem2 = getStoredAiMemory();
const count = (mem2.ticketCustomPrompt?.match(/Gunakan format \[Modul\]/g) || []).length;
assert.equal(count, 1, 'Duplicate rule should not be appended again');

console.log('PASS ai-memory-check');
