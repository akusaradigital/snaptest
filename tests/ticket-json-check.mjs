import assert from "node:assert/strict";
import { parseTicketJson } from "../src/lib/ticketJson.mjs";

assert.deepEqual(parseTicketJson('{"has_ticket_data":true,"description":"Complete"}'), {
  has_ticket_data: true,
  description: "Complete",
});

assert.deepEqual(parseTicketJson('```json\n{"has_ticket_data":false,"assistant_reply":"More details?"}\n```'), {
  has_ticket_data: false,
  assistant_reply: "More details?",
});

assert.deepEqual(parseTicketJson('Result: {"has_ticket_data":false} done'), {
  has_ticket_data: false,
});

// Trailing text that itself contains braces used to confuse the old lastIndexOf("}")
// approach — it would grab the wrong closing brace and fail to parse.
assert.deepEqual(
  parseTicketJson('{"has_ticket_data":true,"title":"Bug"} Catatan tambahan: lihat {referensi}'),
  { has_ticket_data: true, title: "Bug" },
);

assert.throws(
  () => parseTicketJson('{"has_ticket_data":true,"description":"cut off'),
  /incomplete ticket data/i,
);

assert.throws(
  () => parseTicketJson('{"has_ticket_data":false,}'),
  /invalid ticket data/i,
);
