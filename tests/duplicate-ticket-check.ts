import assert from "node:assert/strict";
import { titlesAreSimilar } from "../src/lib/duplicateCheck";

assert.equal(titlesAreSimilar("Login button not working on Safari", "Safari login button does not work"), true);
assert.equal(titlesAreSimilar("**Login button broken**", "login button broken"), true); // markdown bold stripped
assert.equal(titlesAreSimilar("Checkout page crashes on submit", "Export CSV fails silently"), false);
assert.equal(titlesAreSimilar("a an the", "a an the is of"), false); // only short/common words, nothing significant
assert.equal(titlesAreSimilar("", "anything"), false);

console.log("PASS duplicate-ticket-check");
