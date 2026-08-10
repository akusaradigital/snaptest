import { NextResponse } from 'next/server';
import { getDB, ensureSchema } from '../db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.email;
    if (!userId) return NextResponse.json({ activities: [] });

    await ensureSchema();
    const sql = getDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const filter = searchParams.get('filter') || 'all';

    let activities: any[] = [];

    // 1. Fetch Test Case Generations (history table) - Uses updated_at
    if (filter === 'all' || filter === 'generate') {
      let tcQuery;
      if (search) {
        const s = `%${search}%`;
        tcQuery = await sql`
          SELECT id, url as subject, user_context as description, 'generate' as type, updated_at as timestamp
          FROM history 
          WHERE user_id = ${userId} AND (url ILIKE ${s} OR user_context ILIKE ${s} OR page_title ILIKE ${s})
        `;
      } else {
        tcQuery = await sql`
          SELECT id, url as subject, user_context as description, 'generate' as type, updated_at as timestamp
          FROM history 
          WHERE user_id = ${userId}
        `;
      }
      activities = [...activities, ...tcQuery];
    }

    // 2. Fetch Tickets (tickets table) - Uses updated_at
    if (filter === 'all' || filter === 'ticket') {
      let tq;
      if (search) {
        const s = `%${search}%`;
        tq = await sql`
          SELECT id, title as subject, '' as description, 'ticket' as type, updated_at as timestamp
          FROM tickets
          WHERE user_id = ${userId} AND title ILIKE ${s}
        `;
      } else {
        tq = await sql`
          SELECT id, title as subject, '' as description, 'ticket' as type, updated_at as timestamp
          FROM tickets
          WHERE user_id = ${userId}
        `;
      }
      activities = [...activities, ...tq];
    }

    // 3. Fetch Usage logs for other agents - Uses created_at as timestamp (they don't have updated_at)
    if (filter === 'all' || filter === 'data' || filter === 'repair' || filter === 'api_agent') {
      const allowedSources = filter === 'all' ? ['data_generation', 'script_repair', 'api_agent'] : 
                             filter === 'data' ? ['data_generation'] : 
                             filter === 'repair' ? ['script_repair'] : ['api_agent'];

      const uq = await sql`
        SELECT id, source as type, created_at as timestamp
        FROM usage_log
        WHERE user_id = ${userId} AND source = ANY(${allowedSources})
      `;
      
      const usageActivities = uq.map((u: any) => ({
        id: u.id,
        subject: u.type === 'data_generation' ? 'Generated Test Data' : u.type === 'script_repair' ? 'Repaired Automation Script' : 'Generated API Test Suite',
        description: 'Completed AI task in studio',
        type: u.type,
        timestamp: u.timestamp
      }));
      activities = [...activities, ...usageActivities];
    }

    // Sort globally by timestamp DESC (newest edits/creations first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ activities: activities.slice(0, 100) });
  } catch (error: any) {
    console.error('Activity API Error:', error);
    return NextResponse.json({ activities: [] }, { status: 500 });
  }
}
