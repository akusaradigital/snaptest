import { ensureSchema, getDB } from "@/app/api/db";

export interface SimilarTicket {
  sessionId: string;
  title: string;
  jiraKey?: string;
  aksoraPushed?: boolean;
}

export interface TicketContent {
  title: string;
  description?: string;
  stepsToReproduce?: string[] | string;
  currentBehavior?: string;
}

// Adjust here to make the match looser (fewer warnings) or stricter (more warnings).
const SIMILARITY_THRESHOLD = 0.5;

function significantWords(text: string): string[] {
  return text.replace(/\*\*/g, "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
}

function contentText(t: { title?: string; description?: string; stepsToReproduce?: string[] | string; currentBehavior?: string }): string {
  const steps = Array.isArray(t.stepsToReproduce) ? t.stepsToReproduce.join(" ") : t.stepsToReproduce || "";
  return [t.title, t.description, steps, t.currentBehavior].filter(Boolean).join(" ");
}

// Same word-overlap heuristic as the ticket chat UI (TicketChatBubble "Feature 9"):
// ≥ SIMILARITY_THRESHOLD of the candidate text's significant words (len > 3) appear in the other text.
export function titlesAreSimilar(title: string, otherTitle: string): boolean {
  const words = significantWords(title);
  if (!words.length) return false;
  const normalized = otherTitle.replace(/\*\*/g, "").toLowerCase();
  const matchCount = words.filter((w) => normalized.includes(w)).length;
  return matchCount / words.length >= SIMILARITY_THRESHOLD;
}

// Reuses the same team-lookup pattern as history/route.ts (no shared export there to import from).
async function getTeamUserIds(sql: any, userId: string): Promise<string[]> {
  try {
    const teams = await sql`SELECT team_id FROM team_members WHERE user_id = ${userId}`;
    if (!teams.length) return [userId];
    const teamIds = teams.map((t: any) => t.team_id);
    const members = await sql`SELECT DISTINCT user_id FROM team_members WHERE team_id = ANY(${teamIds})`;
    return members.map((m: any) => m.user_id);
  } catch {
    return [userId];
  }
}

// Runs server-side against the user's (and teammates') stored ticket sessions in the DB,
// instead of only the browser-loaded sessions the client-side "Feature 9" banner compares against.
export async function findSimilarTicket(userId: string, content: string | TicketContent): Promise<SimilarTicket | null> {
  const ticket: TicketContent = typeof content === "string" ? { title: content } : content;
  if (!significantWords(ticket.title).length) return null;

  await ensureSchema();
  const sql = getDB();
  const userIds = await getTeamUserIds(sql, userId);
  const rows = await sql`
    SELECT id, title, messages_json FROM tickets
    WHERE user_id = ANY(${userIds})
    ORDER BY updated_at DESC
    LIMIT 50
  `;

  const needle = contentText(ticket);

  for (const row of rows as any[]) {
    let messages: any[];
    try {
      messages = JSON.parse(row.messages_json || "[]");
    } catch {
      continue;
    }
    for (const m of messages) {
      const other = m?.ticket_result;
      if (m?.role !== "assistant" || !other?.title) continue;
      const haystack = contentText({
        title: other.title,
        description: other.description,
        stepsToReproduce: other.steps_to_reproduce,
        currentBehavior: other.current_behavior,
      });
      if (titlesAreSimilar(needle, haystack)) {
        return {
          sessionId: row.id,
          title: other.title,
          jiraKey: other.jira_key,
          aksoraPushed: other.aksora_pushed,
        };
      }
    }
  }
  return null;
}
