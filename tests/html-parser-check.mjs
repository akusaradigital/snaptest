import assert from 'node:assert/strict';
import { selectAll } from 'css-select';
import { parseDocument } from 'htmlparser2';
import { textContent } from 'domutils';

const root = parseDocument(`
  <label for="email">Email</label>
  <input id="email" name="email" />
  <button data-testid="save">Save</button>
`);

const controls = selectAll('input, button, label[for]', root.children);
assert.equal(controls.length, 3);
assert.equal(textContent(selectAll('button[data-testid="save"]', root.children)[0]).trim(), 'Save');
