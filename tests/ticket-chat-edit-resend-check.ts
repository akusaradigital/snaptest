import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── Test 1: Chat Branching & Truncation Logic (ChatGPT-style) ──────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_preview?: string;
  image_base64?: string;
  ticket_result?: Record<string, any>;
  timestamp: string;
}

const mockMessages: ChatMessage[] = [
  { id: "m1", role: "user", content: "Buatkan tiket bug checkout", timestamp: "10:00" },
  { id: "m2", role: "assistant", content: "Berikut tiket draft checkout", ticket_result: { title: "Checkout Bug" }, timestamp: "10:01" },
  { id: "m3", role: "user", content: "Hapus langkah reproduksi", image_preview: "data:image/png;base64,...", timestamp: "10:02" },
  { id: "m4", role: "assistant", content: "Tiket diperbarui tanpa langkah", ticket_result: { title: "Checkout Bug v2" }, timestamp: "10:03" },
  { id: "m5", role: "user", content: "Ubah prioritas jadi High", timestamp: "10:04" },
  { id: "m6", role: "assistant", content: "Prioritas diubah jadi High", ticket_result: { title: "Checkout Bug High" }, timestamp: "10:05" },
];

// Sub-test A: Resend message at index 2 ("m3")
{
  const targetId = "m3";
  const userIdx = mockMessages.findIndex(m => m.id === targetId);
  assert.equal(userIdx, 2, "Found target user message");
  const truncated = mockMessages.slice(0, userIdx + 1);
  assert.equal(truncated.length, 3, "Truncated to 3 messages (drops m4, m5, m6)");
  assert.equal(truncated[truncated.length - 1].id, "m3");
  assert.equal(truncated[truncated.length - 1].image_preview, "data:image/png;base64,...", "Preserves image attachment");
}

// Sub-test B: Edit message at index 0 ("m1")
{
  const targetId = "m1";
  const userIdx = mockMessages.findIndex(m => m.id === targetId);
  assert.equal(userIdx, 0, "Found first user message");
  const newContent = "Buatkan tiket bug payment gateway QRIS";
  const updatedUserMsg: ChatMessage = {
    ...mockMessages[userIdx],
    content: newContent,
    timestamp: "10:10",
  };
  const truncated = [...mockMessages.slice(0, userIdx), updatedUserMsg];
  assert.equal(truncated.length, 1, "Truncated to just the edited first turn (drops all subsequent turns)");
  assert.equal(truncated[0].content, newContent);
}

// Sub-test C: Edit message at index 2 ("m3")
{
  const targetId = "m3";
  const userIdx = mockMessages.findIndex(m => m.id === targetId);
  const newContent = "Format ringkas tanpa step sama sekali";
  const updatedUserMsg: ChatMessage = {
    ...mockMessages[userIdx],
    content: newContent,
    timestamp: "10:11",
  };
  const truncated = [...mockMessages.slice(0, userIdx), updatedUserMsg];
  assert.equal(truncated.length, 3, "Truncated to 3 messages");
  assert.equal(truncated[0].id, "m1");
  assert.equal(truncated[1].id, "m2", "Preserves active draft assistant turn preceding the edit");
  assert.equal(truncated[2].content, newContent);
  assert.equal(truncated[2].image_preview, "data:image/png;base64,...", "Preserves attachment on edit");
}

// ── Test 2: Verify TicketChatBubble.tsx Implementation ────────────────
const bubbleSrc = fs.readFileSync(path.join(__dirname, "../src/components/TicketChatBubble.tsx"), "utf-8");
assert.ok(bubbleSrc.includes("onEditUserMessage"), "TicketChatBubble must accept onEditUserMessage prop");
assert.ok(bubbleSrc.includes("onResendUserMessage"), "TicketChatBubble must accept onResendUserMessage prop");
assert.ok(bubbleSrc.includes("isEditingUserMsg"), "TicketChatBubble must have isEditingUserMsg state");
assert.ok(bubbleSrc.includes("Kirim Ulang"), "TicketChatBubble must render Kirim Ulang button");
assert.ok(bubbleSrc.includes("Simpan & Kirim"), "TicketChatBubble must render Simpan & Kirim button");
assert.ok(bubbleSrc.includes("Ctrl+Enter"), "TicketChatBubble must guide on Ctrl+Enter shortcut");
assert.ok(bubbleSrc.includes("Escape"), "TicketChatBubble must handle Escape key cancellation");
assert.ok(bubbleSrc.includes("min-w-[260px]"), "User bubble must have min-width for action bar");

// ── Test 3: Verify TicketPage.tsx Implementation ─────────────────────
const pageSrc = fs.readFileSync(path.join(__dirname, "../src/components/pages/TicketPage.tsx"), "utf-8");
assert.ok(pageSrc.includes("handleResendUserMessage"), "TicketPage must implement handleResendUserMessage");
assert.ok(pageSrc.includes("handleEditUserMessage"), "TicketPage must implement handleEditUserMessage");
assert.ok(pageSrc.includes("onEditUserMessage={handleEditUserMessage}"), "TicketPage must pass onEditUserMessage to TicketChatBubble");
assert.ok(pageSrc.includes("onResendUserMessage={handleResendUserMessage}"), "TicketPage must pass onResendUserMessage to TicketChatBubble");

console.log("PASS ticket-chat-edit-resend-check");
