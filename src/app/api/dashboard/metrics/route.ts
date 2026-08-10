import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../../db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) {
      return NextResponse.json({ totalGenerations: 0, activeMonitors: 0, teamMembers: 1 });
    }

    await ensureSchema();
    const sql = getDB();

    // Parallelize all 3 queries
    const [historyResult, monitorsResult, teamResult] = await Promise.all([
      sql`SELECT count(*) as count FROM history WHERE user_id = ${userId}`,
      sql`SELECT count(*) as count FROM monitored_urls WHERE user_id = ${userId} AND status = 'active'`.catch(() => [{ count: '0' }]),
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

    return NextResponse.json({
      totalGenerations: parseInt(historyResult[0]?.count || '0', 10),
      activeMonitors: parseInt(monitorsResult[0]?.count || '0', 10),
      teamMembers: teamResult,
    });
  } catch (error) {
    console.error("Metrics API error:", error);
    return NextResponse.json({ totalGenerations: 0, activeMonitors: 0, teamMembers: 1 });
  }
}
