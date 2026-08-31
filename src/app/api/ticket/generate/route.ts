import { NextResponse } from 'next/server';
import { callLLM, callVisionLLM, CompletionOut, supportsVision } from '../../ai/llm';
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
1. Set "has_ticket_data": false ONLY if:
   - The user message is just a bare greeting (e.g. "hi", "hello", "halo", "test", "thanks", "p").
   - The user provided extremely vague input (e.g. just "error", "rusak", "tolong").
2. Set "has_ticket_data": true whenever the user describes a problem, expected behavior, improvement, or provides a URL/evidence. You MUST extract and fill ALL relevant fields (title, description, issue_type, expected_result, actual_result or current_behavior, acceptance_criteria, evidence). NEVER leave them null when has_ticket_data is true.

PROACTIVE QUESTIONING & AGENT PERSONALITY:
- If "has_ticket_data" is false: Provide a warm, concise "assistant_reply" (1-2 sentences) asking for details.
- If "has_ticket_data" is true: Provide a 1-sentence confirmation in "assistant_reply", and populate the complete structured ticket fields.

- Tone: Professional, helpful, QA-focused.

TEMPLATE FORMAT RULES (when ticket data is ready):
- BUG:
  - Title: "[Feature/Model Name] - [Specific concise issue summary]"
  - Expected Result: Normal expected behavior.
  - Actual Result: Exact failure/error reported.
- IMPROVEMENT:
  - Title: "[Feature Name] - [Specific improvement summary]"
  - Current Behavior: Current state or pain point.
  - Expected Result: Proposed/improved state.
- NEW FEATURE:
  - Title: "[Feature Name] - [Primary purpose]"
  - Acceptance Criteria: Array of DoD checklist items.

STRICT CONTEXT RULES:
- LANGUAGE: Write all generated field contents (title, description, current_behavior, expected_result, actual_result, acceptance_criteria) AND "assistant_reply" in clear, professional language, matching the language the user is writing in (e.g. reply in Indonesian if the user writes in Indonesian). If the user explicitly asks you to use a specific language going forward (e.g. "use English from now on", "pakai bahasa Indonesia ya"), follow that instruction for the rest of this conversation, even in later turns and even if the user then switches back to a different language for a message — their explicit instruction always overrides the default of matching the latest message.
- DO NOT invent generic tools or fake placeholders (e.g. NEVER use "[Module Name]" or "[TBD]").
- PRESERVE exact feature names, model names (e.g. "Google - Nano Banana Pro"), terms (e.g. "inpainting"), links, and error details provided by the user.
- If any message contains a URL, put that EXACT URL under "evidence".

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown blocks like \`\`\`json), with text values in the language determined by the LANGUAGE rule above:
{
  "has_ticket_data": boolean,
  "chat_title": "Short 3-5 word session title summarizing the topic (or 'New Ticket Chat' if just greeting)",
  "assistant_reply": "Your conversational response to the user, in the language determined by the LANGUAGE rule above",
  "issue_type": "Bug" | "Improvement" | "New Feature",
  "title": "Clean title without ** stars",
  "description": "Clean description text without ** stars",
  "current_behavior": "Current behavior text if Improvement",
  "expected_result": "Expected result text without ** stars",
  "actual_result": "Actual result text without ** stars",
  "acceptance_criteria": ["Criteria 1", "Criteria 2"],
  "evidence": "Exact URL from input or placeholder"
}`;

    // ponytail: cap history sent to the LLM — the whole conversation is resent (uncached) every
    // turn, so a long chat makes every reply slower and pricier. Last 10 turns is plenty of context.
    // Always keep the first turn too, since that's where a user-set instruction (e.g. "reply in
    // English from now on") is most likely to live and would otherwise age out of the window.
    const recentHistory = chatHistory.length > 10
      ? [chatHistory[0], ...chatHistory.slice(-9)]
      : chatHistory;
    const formattedConversation = recentHistory.map((m, i) => {
      const imgNote = m.image_base64 ? ' [Attached Screenshot]' : '';
      return `${m.role.toUpperCase()} (Turn ${i + 1}):\n${m.content}${imgNote}`;
    }).join('\n\n');

    const fullPrompt = `Conversation History & Latest Request:\n${formattedConversation}`;

    const usage: any = { totalTokens: 0 };
    const completion: CompletionOut = {};
    let rawResponse = '';

    const latestMessageHasImage = !!lastMsg?.image_base64;

    if (latestMessageHasImage && lastMsg.image_base64) {
      if (!supportsVision(p, model)) {
        return NextResponse.json({ detail: `Model "${model}" does not support image analysis. Please select a Vision-capable model.` }, { status: 400 });
      }
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

    // Fallback if LLM placed all content in assistant_reply or omitted title/desc
    const urlInPrompt = formattedConversation.match(/https?:\/\/\S+/)?.[0];
    const userContent = lastMsg?.content || '';
    if (!cleanTitle && (urlInPrompt || userContent.length > 20)) {
      const firstLine = userContent.split('\n').filter((l: string) => !l.startsWith('http'))[0] || userContent;
      cleanTitle = firstLine.substring(0, 60).trim();
    }
    if (!cleanDesc && userContent.length > 10) {
      cleanDesc = userContent.trim();
    }

    const hasTicketData = Boolean(
      (parsed.has_ticket_data === true || !!urlInPrompt || userContent.length > 30) &&
      cleanTitle.length > 3 &&
      !isPlaceholder(cleanTitle) &&
      cleanDesc.length > 5 &&
      !isPlaceholder(cleanDesc)
    );

    // Build markdown ticket only if ticket data is genuinely ready
    const markdownLines: string[] = [];
    if (hasTicketData) {
      if (selectedFields.includes('issue_type')) markdownLines.push(`**Issue Type:** ${type}`);
      if (selectedFields.includes('title') && cleanTitle) markdownLines.push(`**Title:** ${cleanTitle}`);
      if (selectedFields.includes('description') && cleanDesc) markdownLines.push(`\n**Description:**\n${cleanDesc}`);

      const currentBehavior = parsed.current_behavior || (type === 'Improvement' ? cleanDesc : null);
      const expectedResult = parsed.expected_result || (type === 'Improvement' || type === 'Bug' ? userContent : null);

      if (selectedFields.includes('current_behavior') && currentBehavior && type === 'Improvement') {
        markdownLines.push(`\n**Current Behavior:**\n${String(currentBehavior).replace(/\*\*/g, '')}`);
      }
      if (selectedFields.includes('expected_result') && expectedResult) {
        const label = type === 'Improvement' ? 'Expected / Proposed Result' : 'Expected Result';
        markdownLines.push(`\n**${label}:**\n${String(expectedResult).replace(/\*\*/g, '')}`);
      }
      if (selectedFields.includes('actual_result') && parsed.actual_result && type === 'Bug') {
        markdownLines.push(`\n**Actual Result:**\n${String(parsed.actual_result).replace(/\*\*/g, '')}`);
      }
      if (selectedFields.includes('acceptance_criteria') && parsed.acceptance_criteria?.length && type === 'New Feature') {
        const cleanAC = parsed.acceptance_criteria.map((c: string) => String(c).replace(/\*\*/g, '').trim());
        markdownLines.push(`\n**Acceptance Criteria:**\n${cleanAC.map((c: string) => `- [ ] ${c}`).join('\n')}`);
      }
      if (selectedFields.includes('evidence')) {
        const finalEvidence = (parsed.evidence || urlInPrompt || 'https://example.com/evidence').replace(/\*\*/g, '');
        markdownLines.push(`\n**Evidence:**\n${finalEvidence}`);
        parsed.evidence = finalEvidence;
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
      title: hasTicketData ? cleanTitle : null,
      description: hasTicketData ? cleanDesc : null,
      current_behavior: hasTicketData ? (parsed.current_behavior || (type === 'Improvement' ? cleanDesc : null)) : null,
      expected_result: hasTicketData ? (parsed.expected_result || (type === 'Improvement' || type === 'Bug' ? userContent : null)) : null,
      actual_result: hasTicketData ? (parsed.actual_result || null) : null,
      acceptance_criteria: hasTicketData ? (parsed.acceptance_criteria || null) : null,
      evidence: hasTicketData ? (parsed.evidence || urlInPrompt || null) : null,
      markdown: hasTicketData ? markdownLines.join('\n') : '',
      tokens_used: usage.totalTokens,
    });
  } catch (err: any) {
    const message = err instanceof Error && /AI (response was truncated|returned (incomplete|invalid) ticket data)/.test(err.message)
      ? err.message
      : 'Failed to generate ticket. Please check your AI provider and try again.';
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
