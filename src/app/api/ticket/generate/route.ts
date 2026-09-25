import { NextResponse } from 'next/server';
import { callLLM, callVisionLLM, CompletionOut, supportsVision } from '../../ai/llm';
import { extractUrls, fetchWebPageContext } from '../../ai/webContext';
import { parseTicketJson } from '@/lib/ticketJson.mjs';
import { logUsage } from '../../db';
import { auth } from '@/auth';

const ALL_FIELDS = [
  'issue_type',
  'title',
  'description',
  'current_behavior',
  'expected_result',
  'actual_result',
  'acceptance_criteria',
  'evidence',
] as const;

type Field = typeof ALL_FIELDS[number];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  image_base64?: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const currentUserId = session.user.email;
    const {
      messages,
      prompt,
      fields,
      image_base64,
      custom_rules,
      ai_provider,
      ai_model,
      api_key,
      nine_router_public_url,
      nine_router_public_key,
    } = await request.json();

    const chatHistory: ChatMessage[] = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt || '', image_base64 }];

    const lastMsg = chatHistory[chatHistory.length - 1];
    if (!lastMsg || (!lastMsg.content?.trim() && !lastMsg.image_base64)) {
      return NextResponse.json({ detail: 'Message content or screenshot is required' }, { status: 400 });
    }

    // Cheap heuristic (no LLM call) to pick the language for hardcoded fallback strings —
    // matches common Indonesian function/stopwords not used in English QA chat.
    const looksIndonesian = (text: string) => /\b(yang|dengan|tidak|adalah|saya|kami|bisa|akan|dari|pada|nya|tolong|mohon|gagal|rusak|error nya)\b/i.test(text || '');

    // Always include all fields for the smart agent
    const selectedFields: Field[] = (Array.isArray(fields) && fields.length > 0)
      ? fields.filter((f: string) => (ALL_FIELDS as readonly string[]).includes(f)) as Field[]
      : Array.from(ALL_FIELDS);

    // ponytail: skip the LLM round-trip entirely for bare greetings on the first turn —
    // this is the actual "hi feels slow" fix, no LLM call is faster than any amount of streaming.
    const GREETING_RE = /^(hi|hello|hey|halo|hai|p|pagi|test|tes|thanks|thank you|makasih|terima kasih)[.!?]*$/i;
    const ID_GREETING_RE = /^(halo|hai|pagi|tes|makasih|terima kasih)[.!?]*$/i;
    if (chatHistory.length === 1 && !lastMsg.image_base64 && GREETING_RE.test(lastMsg.content.trim())) {
      const greetingReply = ID_GREETING_RE.test(lastMsg.content.trim())
        ? "Halo! Ceritakan bug, improvement, atau fitur yang ingin didokumentasikan — screenshot atau link Drive juga membantu."
        : "Hi! Tell me about the bug, improvement, or feature you'd like to document — a screenshot or Drive link helps too.";
      return NextResponse.json({
        has_ticket_data: false,
        chat_title: 'New Ticket Chat',
        assistant_reply: greetingReply,
        fields: selectedFields,
        issue_type: 'Bug',
        title: null, description: null, current_behavior: null,
        expected_result: null, actual_result: null, acceptance_criteria: null, evidence: null,
        markdown: '',
        tokens_used: 0,
      });
    }

    const p = (ai_provider || 'openai').toLowerCase().trim();
    const publicBaseUrl = p === '9router-public'
      ? String(nine_router_public_url || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')
      : '';
    const apiKey = p === '9router'
      ? (api_key || '9router-local-key')
      : p === '9router-public' ? (nine_router_public_key || '')
      : (api_key || '');
    if (!ai_model) return NextResponse.json({ detail: 'AI Model is required. Please select a model in AI Settings.' }, { status: 400 });
    const model = ai_model;

    const systemPrompt = `You are a Senior QA Manager and Technical Product Manager acting as an autonomous Jira Ticket Agent.
Your role is to converse naturally with the QA/Dev engineer to gather information, auto-detect the issue type, ask targeted clarification questions when info is incomplete, and assemble a flawless, professional Jira ticket.

RULES FOR "has_ticket_data":
1. Set "has_ticket_data": false if:
   - The user message is just a bare greeting (e.g. "hi", "hello", "halo", "test", "thanks", "p").
   - The user provided extremely vague input without specific bug/feature details (e.g. just "error", "rusak", "tolong").
   - The user is ONLY giving instructions, rules, or preferences to remember (e.g. "ingat tidak perlu langkah2 reproduksi", "ingat format ini...", "mulai sekarang jangan sertakan..."), asking a general question, or chatting, WITHOUT reporting or describing an actual software bug, improvement, or feature request, AND no [ACTIVE TICKET DRAFT] exists to edit.
   - CRITICAL: In all these non-ticket cases, you MUST set "has_ticket_data": false AND set ALL ticket fields (title, description, current_behavior, expected_result, actual_result, acceptance_criteria, evidence) to null! NEVER copy the user's rule, instruction, or prompt text into the ticket fields!
2. Set "has_ticket_data": true ONLY when:
   - The user is genuinely reporting, describing, or editing an actual software bug, improvement, feature, or providing bug evidence/error logs.
   - TICKET ITERATION / EDIT TURNS: If the conversation contains an [ACTIVE TICKET DRAFT] and the user asks to modify, update, remove, or reformat any part of it (e.g. "hapus langkah-langkahnya", "hilangkan steps", "ubah judulnya", "perjelas expected result", "cukup ringkasan masalah"):
     * Set "has_ticket_data": true.
     * MODIFY and return the updated ticket based on the existing draft and user's instruction. Keep existing valid fields (title, issue_type, evidence, expected/actual results) unless specifically requested to change.
   - If the user provides BOTH a bug report/edit AND a memory instruction in the same message, set "has_ticket_data": true for the ticket, and also extract "remember_rule".

CONVERSATIONAL INTELLIGENCE & AGENT PERSONALITY (CHATBASE-STYLE CONTEXTUAL QA AGENT):
- You are not just a form filler; you are an intelligent, senior QA Lead and Jira Triage Specialist who engages in natural, deeply knowledgeable technical conversation.
- When "has_ticket_data" is false:
  1. Technical / QA Question: If the user asks a question about QA practices, Jira workflows, bug triage, severity vs priority, acceptance criteria, or software testing (e.g. "gimana cara buat bug report yang baik?", "apa bedanya severity critical vs high?", "kapan pakai issue type improvement?"): Provide a clear, insightful, well-structured answer with concrete examples in "assistant_reply" using clean Markdown. Then politely offer to help triage or draft a ticket whenever they have one.
  2. Memory & Rules Instruction: If the user gives a rule/format/guideline to remember (e.g. "ingat tidak perlu langkah2 reproduksi", "ingat format judul selalu [MODULE]"): Acknowledge it warmly in "assistant_reply", confirm that the rule is securely saved to memory, and briefly illustrate how you will apply it to future tickets.
  3. Greetings & Capability Inquiries: If the user says hello or asks what you can do (e.g. "halo", "kamu bisa bantu apa?"): Warmly introduce your capabilities in TestGen Studio (turning unstructured bug reports, logs, BugSnap/Loom URLs, and screenshots into developer-ready Jira tickets, classifying bugs vs improvements vs features, and remembering custom team rules).
  4. Vague Hints: If the user gives an extremely brief, vague hint (e.g. "error", "rusak", "tolong"): Ask 2-3 focused clarification questions to help them describe the issue (which page/feature, what action triggered it, what was expected vs observed, error message).
- When "has_ticket_data" is true:
  Provide a concise, helpful summary in "assistant_reply" (1-2 sentences) confirming the ticket has been drafted according to all active QA guidelines, and ask if any adjustments are needed before pushing to Jira/Aksora.

- Tone: Professional, articulate, helpful, QA-focused.

TEMPLATE FORMAT RULES (You MUST populate all required fields for the detected type):
CONCISENESS & QUALITY RULES (apply to ALL ticket types, HIGHEST priority after user veto):
- Title formula: "[ModuleName] - [Specific concise issue summary naming trigger and failure or goal]"
  * Examples (Bug): "[Checkout] - Pay Now button becomes unresponsive after selecting QRIS"
  * Examples (Improvement): "[Talent Search] - Add multi-skill filter to candidate search results"
  * Examples (New Feature): "[Auth] - Enable biometric WebAuthn login for mobile devices"
  * CRITICAL TITLE RULE: Determine and use the real, detected feature or module name (e.g. [Checkout], [Talent Pool], [Cart], [Auth]). NEVER output literal meta-strings like "[Feature/Module Name]", "[Module Name]", "[Feature Name]", or "[TBD]".
- Description guidelines:
  * For Bug:
    - Problem Summary: 1-2 concise sentences explaining the issue and impact.
    - Steps to Reproduce:
      1. Navigate to ...
      2. Perform action ...
      3. Observe the failure.
      (CRITICAL: Omit Steps to Reproduce if user or rule requests compact or no-steps format).
    - Technical Notes (optional if relevant): affected endpoint, request payload, browser/device, or console error message.
  * For Improvement:
    - Problem statement and reason for improvement.
  * For New Feature:
    - Overview of the new feature requirement and target user workflow.
- Reproduction Steps Quality:
  * Each step must be an explicit, deterministic user action with concrete inputs and navigation.
  * Never write vague steps like "Try using the feature", "Reproduce bug", or "Do normal steps".
- Expected Result: Always titled clean "Expected Result" (never "Expected / Proposed Result"). Keep strictly to 1-2 sentences stating the correct or target outcome only (do NOT repeat steps from description).
- Actual Result: Strictly 1-2 sentences stating the exact failure or error observed (do NOT repeat steps from description).
- Acceptance Criteria Quality:
  * Generate strictly 2-3 high-impact, distinct checklist items (Definition of Done).
  * Every criterion must be an objective, testable assertion with clear conditions and observable outcomes.
  * NEVER generate tautological or vague criteria like "Bug is fixed", "System works properly", "Fitur berfungsi normal", or "Tidak terjadi error".
- Every field must add unique information. No field may restate content already covered in another field.

- BUG:
  - issue_type: "Bug"
  - title: "[ModuleName] - [Specific concise issue summary]"
  - description: Problem summary, numbered steps to reproduce, and technical notes if relevant.
  - expected_result: 1-2 sentences — the correct system behavior.
  - actual_result: 1-2 sentences — the exact failure observed.
  - acceptance_criteria: 2-3 concrete verification items only.
  - evidence: Exact URL from input or screenshot note.

- IMPROVEMENT:
  - issue_type: "Improvement"
  - title: "[ModuleName] - [Specific improvement summary]"
  - description: Problem statement and reason for improvement.
  - current_behavior: How it currently works or current limitation (1-2 sentences).
  - expected_result: How it should work after the improvement (1-2 sentences).
  - acceptance_criteria: 2-3 concrete verification items only.
  - evidence: Exact URL from input.

- NEW FEATURE:
  - issue_type: "New Feature"
  - title: "[ModuleName] - [Feature summary/goal]"
  - description: Overview of the new feature requirement.
  - expected_result: Target workflow and expected outcome (1-2 sentences).
  - acceptance_criteria: 2-3 concrete DoD items only.
  - evidence: Exact URL or reference.

STRICT CONTEXT RULES:
- USER INSTRUCTIONS & CUSTOM RULES VETO OVERRIDE (HIGHEST PRIORITY):
  * ANY instruction given by the user in chat (e.g. "hapus langkah-langkahnya", "tanpa step", "hilangkan langkah reproduksi", "format ringkas", "hanya ringkasan masalah") or in USER CUSTOM TICKET RULES & GUIDELINES has ABSOLUTE VETO POWER over any default formatting rule below.
  * If the user or custom rules specify omitting steps to reproduce or using Format Ringkas / Compact preset:
    - You MUST NOT include "Langkah-langkah Reproduksi" or numbered action steps in "description". Provide ONLY the problem summary and technical notes.
    - Keep the entire ticket punchy and minimal: expected_result and actual_result strictly 1-2 sentences, and acceptance_criteria strictly 2-3 items.
  * If an [ACTIVE TICKET DRAFT] is present in history and the user asks to remove steps (e.g. "hapus langkah-langkahnya"): Immediately strip the steps from the existing description, preserve the rest of the ticket (title, issue_type, evidence, expected/actual results), and output the updated ticket.
  * Never force or defend default template sections when the user or custom rules requested to omit or format them differently.

- LANGUAGE & DEVELOPER-FRIENDLY INDONESIAN BUG REPORT RULES:
  Write all generated field contents (title, description, current_behavior, expected_result, actual_result, acceptance_criteria) AND "assistant_reply" in clear, professional language, matching the language the user is writing in (e.g. reply in Indonesian if the user writes in Indonesian). If the user explicitly asks you to use a specific language going forward (e.g. "use English from now on", "pakai bahasa Indonesia ya"), follow that instruction for the rest of this conversation.
  WHEN WRITING IN INDONESIAN (STANDARD SOFTWARE ENGINEERING & QA IN INDONESIA):
  1. Gaya Bahasa: Lugas, objektif, dan to the point agar developer langsung paham tanpa kebingungan.
  2. Istilah Teknis: JANGAN terjemahkan istilah teknis baku software engineering menjadi terjemahan harfiah kaku (tetap gunakan istilah: endpoint, API, payload, response, UI/UX, crash, timeout, query, token, session, console error, network log, status code 4xx/500, dsb).
  3. Format Judul (title):
     - Pola: "[NamaModul] - [Aksi/kondisi pemicu] menyebabkan [kegagalan spesifik/hasil teramati]"
     - Contoh (Bug): "[Checkout] - Tombol Bayar Sekarang tidak merespons setelah memilih metode QRIS"
     - Contoh (Improvement): "[Pencarian Talenta] - Tambahkan filter multi-keahlian pada hasil pencarian kandidat"
     - Contoh (New Feature): "[Autentikasi] - Terapkan opsi login biometrik WebAuthn pada web mobile"
  4. Format Deskripsi (description):
     - Format default bila tidak ada instruksi sebaliknya:
       * Ringkasan Masalah: 1-2 kalimat ringkas menjelaskan kendala dan dampaknya.
       * Langkah-langkah Reproduksi (Steps to Reproduce):
         1. Buka halaman / URL ...
         2. Lakukan aksi ...
         3. Amati kendala yang muncul.
         (PENTING: JANGAN cantumkan bagian Langkah-langkah Reproduksi ini jika user atau aturan meminta 'tanpa langkah', 'tidak perlu steps', atau meminta menghapusnya!)
       * Catatan Teknis (opsional jika relevan): endpoint terkait, tipe request, browser/device, atau log/pesan error console/network.
  5. Hasil yang Diharapkan (expected_result):
     - Maksimal 1-2 kalimat: nyatakan perilaku sistem yang benar. JANGAN ulangi langkah-langkah dari deskripsi.
  6. Hasil Aktual (actual_result):
     - Maksimal 1-2 kalimat: nyatakan kegagalan/error yang terjadi (misal: tombol tidak merespons, muncul toast error 500). JANGAN ulangi langkah-langkah dari deskripsi.
  7. Kriteria Penerimaan (acceptance_criteria):
     - Buat TEPAT 2-3 checklist verifikasi konkret (Definition of Done). Setiap item harus unik, bernilai tinggi, dan testable — JANGAN buat 4-6 item yang redundan atau kriteria samar seperti "Sistem bekerja dengan baik".
- DO NOT invent generic tools or fake placeholders (e.g. NEVER use "[Module Name]" or "[TBD]").
- PRESERVE exact feature names, model names (e.g. "Google - Nano Banana Pro"), terms (e.g. "inpainting"), links, and error details provided by the user.
- If any message contains a URL (e.g. BugSnap, Loom, Google Drive, screenshot link, or live site link), you MUST extract and put that EXACT URL under "evidence". NEVER leave "evidence" null, omitted, or placeholder when a URL is provided by the user.
- MULTIMODAL (IMAGE / SCREENSHOT) & WEB URL SYNTHESIS:
  * All AI models can read and understand images in SnapTest by default.
  * When the user attaches an image (screenshot, UI defect, design mockup) AND provides a website link:
    1. Connect the visual defects or elements visible in the screenshot directly with the live web page and URL provided.
    2. Explicitly name the relevant module or UI component in the "title" and "description".
    3. Include reproduction steps starting from the provided URL.
    4. Set "evidence" to the provided URL (and mention the attached screenshot).
- REMEMBER & MEMORY INSTRUCTIONS:
  If the user explicitly asks you to remember, save, or retain a rule, format, template preference, or guideline for future sessions (e.g. phrases like "ingat format ini", "ingat aturan ini", "remember this rule/format", "ingat ya formatnya...", "mulai sekarang formatnya...", "ingat seterusnya...", "ingat tidak perlu..."):
  * Extract the core rule or preference clearly, concisely, and imperatively (e.g. "Jangan menyertakan langkah-langkah reproduksi di deskripsi tiket").
  * Put this extracted instruction into the "remember_rule" field of the JSON output.
  * In "assistant_reply", warmly confirm that you have saved and remembered this rule for future sessions.
  * CRITICAL: If the user is ONLY providing a rule/instruction/preference (and NOT reporting a new bug or asking to edit an existing ticket), set "has_ticket_data": false, and leave title, description, current_behavior, expected_result, actual_result, acceptance_criteria, and evidence as null! DO NOT generate a ticket from the memory instruction itself!
  * If the user does not request to remember anything, set "remember_rule": null.
${custom_rules ? `\nUSER CUSTOM TICKET RULES & GUIDELINES:\n${custom_rules}\n` : ''}

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown blocks like \`\`\`json), with text values in the language determined by the LANGUAGE rule above:
{
  "has_ticket_data": boolean,
  "chat_title": "Short 3-5 word session title summarizing the topic (or 'New Ticket Chat' if just greeting)",
  "assistant_reply": "Your conversational response to the user, in the language determined by the LANGUAGE rule above",
  "remember_rule": "Extracted rule to remember for future sessions, or null",
  "issue_type": "Bug" | "Improvement" | "New Feature",
  "priority": "P0" | "P1" | "P2" | "P3",
  "title": "Clean title without ** stars",
  "description": "Clean description text without ** stars",
  "current_behavior": "Current behavior text if Improvement",
  "expected_result": "Expected result text without ** stars",
  "actual_result": "Actual result text without ** stars",
  "acceptance_criteria": ["Criteria 1", "Criteria 2"],
  "evidence": "Exact URL from user input if provided, or null"
}`;


    // Compact history to keep prompts fast, token-lean (~1,500-2,000 tokens), and below provider content-filter thresholds.
    // Always keep the first turn (for user language/formatting instructions) plus the most recent turns.
    const recentHistory = chatHistory.length > 6
      ? [chatHistory[0], ...chatHistory.slice(-5)]
      : chatHistory;

    const formattedConversation = recentHistory.map((m, i, arr) => {
      const isLastAssistant = m.role === 'assistant' && i === arr.map(x => x.role).lastIndexOf('assistant');
      let content = m.content || '';
      // Condense historical intermediate assistant drafts older than the current one
      if (m.role === 'assistant' && !isLastAssistant && content.length > 500) {
        content = `${content.substring(0, 350)}... [Prior draft condensed for context]`;
      }
      const imgNote = m.image_base64 ? ' [Attached Screenshot]' : '';
      return `${m.role.toUpperCase()} (Turn ${i + 1}):\n${content}${imgNote}`;
    }).join('\n\n');

    const latestMessageHasImage = !!lastMsg?.image_base64;
    const userContent = lastMsg?.content || '';

    // Pre-extract URLs and fetch live web context before constructing prompt
    const urlsInLastMsg = extractUrls(userContent);
    const allUrlsInConv = extractUrls(formattedConversation);
    const promptUrls = urlsInLastMsg.length > 0
      ? Array.from(new Set(urlsInLastMsg))
      : allUrlsInConv.length > 0
      ? Array.from(new Set(allUrlsInConv))
      : [];
    const urlInPrompt = promptUrls.length > 0 ? promptUrls.join('\n') : null;

    let webContextSection = '';
    if (promptUrls.length > 0) {
      try {
        const webCtx = await fetchWebPageContext(promptUrls[0], 5000);
        if (webCtx.fullSummary) {
          webContextSection = `\n\n${webCtx.fullSummary}`;
        }
      } catch {}
    }

    let synthesisInstruction = '';
    if (latestMessageHasImage && promptUrls.length > 0) {
      synthesisInstruction = `\n\n[MULTIMODAL & WEB SYNTHESIS INSTRUCTION]:
The user provided BOTH an attached screenshot/image AND a target website URL (${promptUrls[0]}).
Synthesize both inputs:
1. Examine the visual error, disabled button, broken layout, or form fields in the attached screenshot.
2. Relate it directly to the live page context from "${promptUrls[0]}".
3. In the Jira ticket:
   - Formulate a clean, specific title naming the affected module/feature on this URL.
   - Include reproduction steps starting by navigating to "${promptUrls[0]}".
   - Accurately describe expected vs actual behavior as shown in the screenshot.
   - Set "evidence" to include "${promptUrls[0]}".`;
    } else if (latestMessageHasImage && !userContent.trim()) {
      synthesisInstruction = '\n\n[Please analyze the attached screenshot, identify any bugs, issues, or UI states depicted, and create a complete Jira ticket.]';
    }

    const fullPrompt = `Conversation History & Latest Request:\n${formattedConversation}${webContextSection}${synthesisInstruction}`;

    const usage: any = { totalTokens: 0 };
    const completion: CompletionOut = {};
    let rawResponse = '';

    if (latestMessageHasImage && lastMsg.image_base64) {
      rawResponse = await callVisionLLM(p, model, apiKey, systemPrompt, fullPrompt, lastMsg.image_base64, 4096, usage, publicBaseUrl, completion);
    } else {
      rawResponse = await callLLM(p, model, apiKey, systemPrompt, fullPrompt, true, 4096, usage, publicBaseUrl, completion);
    }

    if (currentUserId) {
      await logUsage({
        user_id: currentUserId,
        source: 'ticket_agent',
        provider: p,
        model,
        total_tokens: usage.totalTokens,
        cache_read_tokens: usage.cacheReadTokens,
        cache_creation_tokens: usage.cacheCreationTokens,
      });
    }

    if (["length", "max_tokens", "MAX_TOKENS"].includes(completion.finishReason || "")) {
      throw new Error("AI response was truncated. Please retry.");
    }
    const parsed = parseTicketJson(rawResponse);
    const type = parsed.issue_type || 'Bug';

    // Strict server-side verification: title and description must be real, non-placeholder text
    let cleanTitle = (parsed.title || '').replace(/\*\*/g, '').trim();
    let cleanDesc = (parsed.description || '').replace(/\*\*/g, '').trim();

    const isPlaceholder = (str: string) => str.includes('[Module') || str.includes('[Feature Name]') || str.includes('TBD') || str.includes('to be determined');

    const isPlaceholderOrEmptyEvidence = (str?: string | null): boolean => {
      if (!str) return true;
      const clean = str.trim().toLowerCase();
      return (
        clean === '' ||
        clean === 'none' ||
        clean === 'n/a' ||
        clean === 'null' ||
        clean === 'undefined' ||
        clean === '-' ||
        clean === 'placeholder' ||
        clean.includes('exact url') ||
        clean.includes('example.com/evidence')
      );
    };

    // Detect if this turn is primarily a memory instruction, rule, or preference setting
    const isMemoryPrompt = Boolean(
      parsed.remember_rule ||
      /^\s*(ingat|remember|catat|mulai sekarang|jangan lupa)\b/i.test(userContent.trim())
    );

    // Detect if the generated title or description is merely echoing the user's memory instruction
    const isInstructionEcho = cleanTitle && (
      cleanTitle.toLowerCase().trim() === userContent.toLowerCase().trim() ||
      /^\s*(ingat|remember|catat|mulai sekarang)\b/i.test(cleanTitle) ||
      (parsed.remember_rule && cleanTitle.toLowerCase().includes(String(parsed.remember_rule).toLowerCase().slice(0, 15)))
    );

    const isPureInstruction = isMemoryPrompt && (parsed.has_ticket_data === false || isInstructionEcho) && !latestMessageHasImage && urlsInLastMsg.length === 0;

    if (isPureInstruction) {
      cleanTitle = '';
      cleanDesc = '';
    } else {
      // Only fallback if the LLM flagged ticket data or user provided fresh evidence in THIS message
      if (!cleanTitle && (parsed.has_ticket_data === true || urlsInLastMsg.length > 0 || latestMessageHasImage)) {
        const firstLine = userContent.split('\n').filter((l: string) => !l.startsWith('http'))[0] || userContent;
        if (firstLine.length > 3 && !/^\s*(ingat|remember|catat)\b/i.test(firstLine)) {
          cleanTitle = firstLine.substring(0, 60).trim();
        }
      }
      if (!cleanDesc && (parsed.has_ticket_data === true || urlsInLastMsg.length > 0 || latestMessageHasImage)) {
        if (!/^\s*(ingat|remember|catat)\b/i.test(userContent)) {
          cleanDesc = userContent.trim();
        }
      }
    }

    const hasTicketData = Boolean(
      !isPureInstruction &&
      (parsed.has_ticket_data === true || (urlsInLastMsg.length > 0 && cleanDesc.length > 10) || latestMessageHasImage) &&
      cleanTitle.length > 3 &&
      !isPlaceholder(cleanTitle) &&
      cleanDesc.length > 5 &&
      !isPlaceholder(cleanDesc)
    );

    // Resolve evidence accurately: prefer extracted URL(s) from prompt if LLM returned placeholder/omitted
    let resolvedEvidence: string | null = null;
    if (!isPlaceholderOrEmptyEvidence(parsed.evidence)) {
      const cleanEv = String(parsed.evidence).replace(/\*\*/g, '').trim();
      const extracted = extractUrls(cleanEv);
      resolvedEvidence = extracted.length > 0 ? extracted.join('\n') : cleanEv;
    }
    if ((!resolvedEvidence || !/^https?:\/\//i.test(resolvedEvidence)) && urlInPrompt) {
      resolvedEvidence = urlInPrompt;
    }
    // Merge and deduplicate any URLs (normalizing trailing slashes and case) to prevent duplicate evidence
    if (resolvedEvidence) {
      const normalize = (u: string) => u.replace(/\/+$/, '').toLowerCase();
      const evUrls = extractUrls(resolvedEvidence);
      if (evUrls.length > 0 || promptUrls.length > 0) {
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const u of [...evUrls, ...promptUrls]) {
          const norm = normalize(u);
          if (!seen.has(norm)) {
            seen.add(norm);
            deduped.push(u);
          }
        }
        if (deduped.length > 0) {
          resolvedEvidence = deduped.join('\n');
        }
      }
    }

    // Build markdown ticket only if ticket data is genuinely ready
    const markdownLines: string[] = [];
    if (hasTicketData) {
      if (selectedFields.includes('issue_type')) markdownLines.push(`**Issue Type:** ${type}`);
      markdownLines.push(`**Priority:** ${parsed.priority || (type === 'Bug' ? 'P1' : 'P2')}`);
      if (selectedFields.includes('title') && cleanTitle) markdownLines.push(`**Title:** ${cleanTitle}`);
      if (selectedFields.includes('description') && cleanDesc) markdownLines.push(`\n**Description:**\n${cleanDesc}`);

      const currentBehavior = parsed.current_behavior ? String(parsed.current_behavior).replace(/\*\*/g, '').trim() : null;
      const expectedResult = parsed.expected_result ? String(parsed.expected_result).replace(/\*\*/g, '').trim() : null;

      if (selectedFields.includes('current_behavior') && currentBehavior && type === 'Improvement') {
        markdownLines.push(`\n**Current Behavior:**\n${currentBehavior}`);
      }
      if (selectedFields.includes('expected_result') && expectedResult) {
        markdownLines.push(`\n**Expected Result:**\n${expectedResult}`);
      }
      if (selectedFields.includes('actual_result') && parsed.actual_result && type === 'Bug') {
        markdownLines.push(`\n**Actual Result:**\n${String(parsed.actual_result).replace(/\*\*/g, '').trim()}`);
      }
      if (selectedFields.includes('acceptance_criteria') && parsed.acceptance_criteria?.length) {
        const cleanAC = parsed.acceptance_criteria.map((c: string) => String(c).replace(/\*\*/g, '').trim());
        markdownLines.push(`\n**Acceptance Criteria:**\n${cleanAC.map((c: string) => `- [ ] ${c}`).join('\n')}`);
      }
      if (selectedFields.includes('evidence') && resolvedEvidence) {
        markdownLines.push(`\n**Evidence:**\n${resolvedEvidence}`);
      }
    }

    return NextResponse.json({
      has_ticket_data: hasTicketData,
      chat_title: parsed.chat_title || null,
      assistant_reply: parsed.assistant_reply || (looksIndonesian(formattedConversation)
        ? 'Halo! Silakan jelaskan bug, improvement, atau fitur baru yang ingin didokumentasikan.'
        : 'Hello! Please describe the issue, improvement, or new feature you would like to document.'),
      fields: selectedFields,
      issue_type: type,
      priority: parsed.priority || (type === 'Bug' ? 'P1' : 'P2'),
      title: hasTicketData ? cleanTitle : null,
      description: hasTicketData ? cleanDesc : null,
      current_behavior: hasTicketData ? (parsed.current_behavior ? String(parsed.current_behavior).replace(/\*\*/g, '').trim() : null) : null,
      expected_result: hasTicketData ? (parsed.expected_result ? String(parsed.expected_result).replace(/\*\*/g, '').trim() : null) : null,
      actual_result: hasTicketData ? (parsed.actual_result ? String(parsed.actual_result).replace(/\*\*/g, '').trim() : null) : null,
      acceptance_criteria: hasTicketData ? (parsed.acceptance_criteria || null) : null,
      evidence: hasTicketData ? resolvedEvidence : null,
      markdown: hasTicketData ? markdownLines.join('\n') : '',
      remember_rule: parsed.remember_rule ? String(parsed.remember_rule).trim() : null,
      tokens_used: usage.totalTokens,
    });
  } catch (err: any) {
    const message = err instanceof Error && err.message
      ? err.message
      : 'Failed to generate ticket. Please check your AI provider and try again.';
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
