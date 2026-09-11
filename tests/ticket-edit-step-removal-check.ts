import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Test 1: removeStepsFromText logic
const removeStepsFromText = (text?: string | null): string => {
  if (!text) return "";
  const pattern = /(?:\n\s*)?(?:\*?\s*(?:Langkah-langkah\s+Reproduksi|Steps?\s+to\s+Reproduce)[^:\n]*:?)(?:[\s\S]*?)(?=(?:\n\s*\*?\s*(?:Catatan\s+Teknis|Technical\s+Notes|Environment|Catatan|Hasil|Expected|Actual)[\s\S]*:)|$)/i;
  const replaced = text.replace(pattern, "").trim();
  return replaced.replace(/\n{3,}/g, "\n\n");
};

const sampleWithSteps = `Ringkasan Masalah:
Tombol Bayar Sekarang tidak merespons setelah memilih metode pembayaran QRIS.

Langkah-langkah Reproduksi (Steps to Reproduce):
1. Buka halaman /checkout
2. Pilih metode pembayaran QRIS
3. Klik tombol "Bayar Sekarang"
4. Amati bahwa tidak ada respons apa pun

Catatan Teknis:
Console error: Uncaught TypeError: Cannot read properties of undefined (reading 'qr_code')`;

const cleaned = removeStepsFromText(sampleWithSteps);
assert.ok(!cleaned.includes("Langkah-langkah Reproduksi"), "Must remove Langkah-langkah Reproduksi header");
assert.ok(!cleaned.includes("Pilih metode pembayaran QRIS"), "Must remove step items");
assert.ok(cleaned.includes("Ringkasan Masalah:"), "Must keep Ringkasan Masalah");
assert.ok(cleaned.includes("Catatan Teknis:"), "Must keep Catatan Teknis");
assert.ok(cleaned.includes("Console error: Uncaught TypeError"), "Must keep technical notes content");

// Test 2: Verify route.ts prompt has Veto Override & Edit Turn rules
const routeSrc = fs.readFileSync(path.join(__dirname, "../src/app/api/ticket/generate/route.ts"), "utf-8");
assert.ok(routeSrc.includes("USER INSTRUCTIONS & CUSTOM RULES VETO OVERRIDE"), "route.ts must include VETO OVERRIDE rule");
assert.ok(routeSrc.includes("TICKET ITERATION / EDIT TURNS"), "route.ts must include TICKET ITERATION / EDIT TURNS rule");
assert.ok(routeSrc.includes("[ACTIVE TICKET DRAFT]"), "route.ts must reference ACTIVE TICKET DRAFT context");
assert.ok(routeSrc.includes("JANGAN cantumkan bagian Langkah-langkah Reproduksi ini jika user atau aturan meminta 'tanpa langkah'"), "route.ts must instruct skipping steps when requested");

// Test 3: Verify TicketPage.tsx includes ACTIVE TICKET DRAFT in formattedHistory and presets
const ticketPageSrc = fs.readFileSync(path.join(__dirname, "../src/components/pages/TicketPage.tsx"), "utf-8");
assert.ok(ticketPageSrc.includes("[ACTIVE TICKET DRAFT]"), "TicketPage.tsx must serialize ACTIVE TICKET DRAFT to chat history");
assert.ok(ticketPageSrc.includes("ticketPreset"), "TicketPage.tsx must include ticketPreset state");
assert.ok(ticketPageSrc.includes("Format Ringkas (Tanpa Steps)"), "TicketPage.tsx must support compact format without steps");
assert.ok(ticketPageSrc.includes("Format:"), "TicketPage.tsx must render format preset pills");

// Test 4: Verify TicketChatBubble.tsx has Hapus Steps action
const bubbleSrc = fs.readFileSync(path.join(__dirname, "../src/components/TicketChatBubble.tsx"), "utf-8");
assert.ok(bubbleSrc.includes("✕ Hapus Steps"), "TicketChatBubble.tsx must include ✕ Hapus Steps button");
assert.ok(bubbleSrc.includes("removeStepsFromText"), "TicketChatBubble.tsx must implement removeStepsFromText");

console.log("PASS ticket-edit-step-removal-check");
