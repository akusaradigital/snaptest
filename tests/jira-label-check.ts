import assert from 'node:assert/strict';

// Helper matching the normalization logic in src/app/api/jira/create/route.ts & update/route.ts
function normalizeJiraLabels(raw: { label?: any; labels?: any }): string[] | undefined {
  const rawLabels = raw.labels || raw.label;
  if (!rawLabels) return undefined;
  const labelArr = Array.isArray(rawLabels) ? rawLabels : [rawLabels];
  const cleanLabels = labelArr.map((l: any) => String(l).trim()).filter(Boolean);
  return cleanLabels.length > 0 ? cleanLabels : undefined;
}

// 1. Single string label
assert.deepEqual(normalizeJiraLabels({ label: 'Development' }), ['Development']);
assert.deepEqual(normalizeJiraLabels({ label: '  UAT  ' }), ['UAT']);

// 2. Array labels
assert.deepEqual(normalizeJiraLabels({ labels: ['Development', 'UAT'] }), ['Development', 'UAT']);
assert.deepEqual(normalizeJiraLabels({ labels: ['  Production ', '', '   '] }), ['Production']);

// 3. Fallback when neither provided
assert.equal(normalizeJiraLabels({}), undefined);
assert.equal(normalizeJiraLabels({ label: '' }), undefined);
assert.equal(normalizeJiraLabels({ labels: [] }), undefined);

// 4. labels takes precedence over label
assert.deepEqual(normalizeJiraLabels({ labels: ['UAT'], label: 'Development' }), ['UAT']);

console.log('PASS jira-label-check');
