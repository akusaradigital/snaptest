import assert from "node:assert/strict";

// Helper mirroring route.ts guard logic
function evaluateTicketGeneration(
  userContent: string,
  parsed: {
    has_ticket_data?: boolean;
    remember_rule?: string | null;
    title?: string | null;
    description?: string | null;
    expected_result?: string | null;
  },
  latestMessageHasImage: boolean = false,
  urlsInLastMsg: string[] = []
) {
  let cleanTitle = (parsed.title || "").replace(/\*\*/g, "").trim();
  let cleanDesc = (parsed.description || "").replace(/\*\*/g, "").trim();

  const isMemoryPrompt = Boolean(
    parsed.remember_rule ||
    /^\s*(ingat|remember|catat|mulai sekarang|jangan lupa)\b/i.test(userContent.trim())
  );

  const isInstructionEcho = Boolean(
    cleanTitle && (
      cleanTitle.toLowerCase().trim() === userContent.toLowerCase().trim() ||
      /^\s*(ingat|remember|catat|mulai sekarang)\b/i.test(cleanTitle) ||
      (parsed.remember_rule && cleanTitle.toLowerCase().includes(String(parsed.remember_rule).toLowerCase().slice(0, 15)))
    )
  );

  const isPureInstruction = isMemoryPrompt && (parsed.has_ticket_data === false || isInstructionEcho) && !latestMessageHasImage && urlsInLastMsg.length === 0;

  if (isPureInstruction) {
    cleanTitle = "";
    cleanDesc = "";
  }

  const hasTicketData = Boolean(
    !isPureInstruction &&
    (parsed.has_ticket_data === true || (urlsInLastMsg.length > 0 && cleanDesc.length > 10) || latestMessageHasImage) &&
    cleanTitle.length > 3 &&
    cleanDesc.length > 5
  );

  // Frontend check (TicketPage.tsx & TicketChatBubble.tsx)
  const isActualTicket = Boolean(
    hasTicketData === true &&
    cleanTitle &&
    cleanDesc
  );

  return { isPureInstruction, hasTicketData, isActualTicket, cleanTitle, cleanDesc };
}

// Case 1: User gives memory instruction "ingat tidak perlu langkah2 reproduksi" and model returned has_ticket_data: false
{
  const result = evaluateTicketGeneration(
    "ingat tidak perlu langkah2 reproduksi",
    {
      has_ticket_data: false,
      remember_rule: "Tidak perlu menyertakan langkah-langkah reproduksi di deskripsi",
      title: null,
      description: null,
    }
  );
  assert.equal(result.isPureInstruction, true);
  assert.equal(result.hasTicketData, false);
  assert.equal(result.isActualTicket, false);
  assert.equal(result.cleanTitle, "");
}

// Case 2: Model mistakenly echoed instruction as title and set has_ticket_data: true
{
  const result = evaluateTicketGeneration(
    "ingat tidak perlu langkah2 reproduksi",
    {
      has_ticket_data: true,
      remember_rule: "tidak perlu langkah2 reproduksi",
      title: "ingat tidak perlu langkah2 reproduksi",
      description: "ingat tidak perlu langkah2 reproduksi",
      expected_result: "ingat tidak perlu langkah2 reproduksi",
    }
  );
  assert.equal(result.isPureInstruction, true);
  assert.equal(result.hasTicketData, false, "Must override model hallucination on memory prompt");
  assert.equal(result.isActualTicket, false, "Must not render ticket card on UI");
  assert.equal(result.cleanTitle, "");
}

// Case 3: Real bug report with memory instruction in the same message
{
  const result = evaluateTicketGeneration(
    "Tombol bayar QRIS freeze saat checkout. Ingat ya format judul selalu [CHECKOUT]",
    {
      has_ticket_data: true,
      remember_rule: "Format judul selalu diawali [CHECKOUT]",
      title: "[CHECKOUT] - Tombol bayar QRIS freeze saat checkout",
      description: "Pengguna tidak dapat menyelesaikan pembayaran karena tombol freeze.",
    }
  );
  assert.equal(result.isPureInstruction, false);
  assert.equal(result.hasTicketData, true);
  assert.equal(result.isActualTicket, true);
  assert.equal(result.cleanTitle, "[CHECKOUT] - Tombol bayar QRIS freeze saat checkout");
}

console.log("PASS ticket-memory-guard-check");
