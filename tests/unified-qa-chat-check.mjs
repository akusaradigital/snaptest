import assert from "node:assert/strict";
import {
  classifyUnifiedQaIntent,
  createSseParser,
  migrateUnifiedQaSessions,
  parseUnifiedQaSessionsJson,
  testCaseClientId,
  withTestCaseClientIds,
} from "../src/lib/unifiedQaChat.mjs";

const intents = new Map([
  ["generate login tests", "generate"], ["edit case 2", "edit"], ["remove case 3", "remove"],
  ["dedupe these cases", "dedupe"], ["prioritize by impact", "prioritize"],
  ["generate a Playwright spec", "generate_playwright"], ["create Gherkin scenarios", "generate_gherkin"],
  ["run all tests", "run"], ["retry failed tests", "retry"], ["analyze this failure", "analyze"],
  ["repair the selector", "repair"], ["apply the suggested repair", "apply_repair"],
  ["draft a Jira issue", "jira_draft"], ["create this in Jira", "jira_create"], ["open the Jira ticket", "jira_open"],
  ["export as xlsx", "export"], ["hello", "unknown"],
]);
for (const [input, expected] of intents) assert.equal(classifyUnifiedQaIntent(input), expected, input);

const testCase = { number: 1, name: "Login", test_steps: ["Open", "Submit"], priority: "HIGH" };
assert.equal(testCaseClientId(testCase), testCaseClientId({ priority: "HIGH", test_steps: ["Open", "Submit"], name: "Login", number: 1 }));
assert.notEqual(testCaseClientId(testCase), testCaseClientId({ ...testCase, name: "Logout" }));
const identified = withTestCaseClientIds([testCase, testCase]);
assert.match(identified[0].clientId, /^tc_[a-z0-9]+$/);
assert.equal(identified[1].clientId, `${identified[0].clientId}_2`);
assert.equal(testCaseClientId(identified[0]), identified[0].clientId);

const legacy = [{ id: "session-1", title: "Login", updatedAt: "2026-08-04T00:00:00.000Z", messages: [] }];
const migrated = migrateUnifiedQaSessions(legacy);
assert.deepEqual(migrated, { version: 2, sessions: legacy });
assert.deepEqual(migrateUnifiedQaSessions(migrated), migrated);
assert.deepEqual(parseUnifiedQaSessionsJson(JSON.stringify(legacy)), migrated);
assert.throws(() => migrateUnifiedQaSessions({ version: 1, sessions: legacy }), /Unsupported/);
assert.throws(() => migrateUnifiedQaSessions([{ id: 1 }]), /Invalid/);

const events = [];
const parser = createSseParser(event => events.push(event));
for (const chunk of [": keep-alive\r\nevent: pro", "gress\r\nid: 7\r\ndata: first\r", "\ndata: second\r\n\r", "\ndata: done\n\n"]) parser.push(chunk);
parser.end();
assert.deepEqual(events, [
  { event: "progress", id: "7", data: "first\nsecond" },
  { event: "message", data: "done" },
]);

const finalEvents = [];
const finalParser = createSseParser(event => finalEvents.push(event));
finalParser.push("data: final without boundary");
finalParser.end();
assert.deepEqual(finalEvents, [{ event: "message", data: "final without boundary" }]);
