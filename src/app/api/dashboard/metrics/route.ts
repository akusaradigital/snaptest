import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../../db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

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

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId || !process.env.DATABASE_URL?.trim()) {
      return NextResponse.json({ totalGenerations: 0, generationsGrowth: 0, activeMonitors: 0, teamMembers: 1 });
    }

    await ensureSchema();
    const sql = getDB();
    const userIds = await getTeamUserIds(sql, userId);

    // Query metrics in parallel
    const [historyResult, historyPrevResult, monitorsResult, teamResult] = await Promise.all([
      sql`SELECT count(*) as count FROM history WHERE user_id = ANY(${userIds})`,
      sql`
        SELECT count(*) as count FROM history
        WHERE user_id = ANY(${userIds})
          AND created_at::timestamp < NOW() - INTERVAL '30 days'
          AND created_at::timestamp >= NOW() - INTERVAL '60 days'
      `.catch(() => [{ count: '0' }]),
      sql`SELECT count(*) as count FROM monitored_urls WHERE user_id = ANY(${userIds}) AND status = 'active'`.catch(() => [{ count: '0' }]),
      (async () => {
        try {
          const teams = await sql`SELECT team_id FROM team_members WHERE user_id = ${userId}`;
          if (teams.length > 0) {
            const membersCount = await sql`SELECT count(DISTINCT user_id) as count FROM team_members WHERE team_id = ${teams[0].team_id}`;
            return parseInt(membersCount[0]?.count || '1', 10);
          }
          return 1;
        } catch { return 1; }
      })(),
    ]);

    const totalGenerations = parseInt(historyResult[0]?.count || '0', 10);
    const prevGenerations = parseInt(historyPrevResult[0]?.count || '0', 10);

    let generationsGrowth = 0;
    if (prevGenerations === 0 && totalGenerations > 0) {
      generationsGrowth = 100;
    } else if (prevGenerations > 0) {
      generationsGrowth = Math.round(((totalGenerations - prevGenerations) / prevGenerations) * 100);
    }

    return NextResponse.json({
      totalGenerations,
      generationsGrowth,
      activeMonitors: parseInt(monitorsResult[0]?.count || '0', 10),
      teamMembers: teamResult,
    });
  } catch (error) {
    console.error("Metrics API error:", error);
    return NextResponse.json({ totalGenerations: 0, generationsGrowth: 0, activeMonitors: 0, teamMembers: 1 });
  }
}
