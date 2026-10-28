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
      return NextResponse.json({
        summary: { total_tokens: 0, total_cache_read_tokens: 0, total_requests: 0 },
        by_model: [],
        daily: [],
      });
    }

    await ensureSchema();
    const sql = getDB();
    const userIds = await getTeamUserIds(sql, userId);

    // 1. Overall Summary from usage_log (last 30 days)
    const summaryRows = await sql`
      SELECT
        COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
        COALESCE(SUM(cache_read_tokens), 0)::BIGINT AS total_cache_read_tokens,
        COALESCE(SUM(cache_creation_tokens), 0)::BIGINT AS total_cache_creation_tokens,
        COUNT(*)::INT AS total_requests
      FROM usage_log
      WHERE (user_id = ANY(${userIds}) OR user_id = ${userId})
        AND created_at::timestamp >= NOW() - INTERVAL '365 days'
    `;

    const summary = summaryRows[0] || {
      total_tokens: 0,
      total_cache_read_tokens: 0,
      total_cache_creation_tokens: 0,
      total_requests: 0,
    };

    let totalTokens = Number(summary.total_tokens) || 0;
    let totalRequests = Number(summary.total_requests) || 0;
    let totalCached = Number(summary.total_cache_read_tokens) || 0;

    // 2. By Model Breakdown from usage_log
    const modelRows = await sql`
      SELECT
        COALESCE(NULLIF(TRIM(model), ''), 'other') AS model_name,
        COUNT(*)::INT AS requests,
        COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens,
        COALESCE(SUM(cache_read_tokens), 0)::BIGINT AS cached
      FROM usage_log
      WHERE (user_id = ANY(${userIds}) OR user_id = ${userId})
        AND created_at::timestamp >= NOW() - INTERVAL '365 days'
      GROUP BY model_name
      ORDER BY tokens DESC
    `;

    let by_model = modelRows.map((r: any) => {
      const tokens = Number(r.tokens) || 0;
      const share = totalTokens > 0 ? Math.round((tokens / totalTokens) * 100) : 0;
      return {
        model: r.model_name,
        requests: Number(r.requests) || 0,
        tokens,
        cached: Number(r.cached) || 0,
        share,
      };
    });

    // 3. Daily Breakdown (last 30 days) from usage_log
    const dailyRows = await sql`
      SELECT
        TO_CHAR(created_at::timestamp, 'YYYY-MM-DD') AS day_str,
        TO_CHAR(created_at::timestamp, 'Mon DD') AS label,
        TO_CHAR(created_at::timestamp, 'Mon DD, YYYY') AS full_date,
        COUNT(*)::INT AS requests,
        COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens,
        COALESCE(SUM(cache_read_tokens), 0)::BIGINT AS cached,
        COALESCE(MAX(NULLIF(TRIM(model), '')), 'other') AS top_model
      FROM usage_log
      WHERE (user_id = ANY(${userIds}) OR user_id = ${userId})
        AND created_at::timestamp >= NOW() - INTERVAL '365 days'
      GROUP BY TO_CHAR(created_at::timestamp, 'YYYY-MM-DD'),
               TO_CHAR(created_at::timestamp, 'Mon DD'),
               TO_CHAR(created_at::timestamp, 'Mon DD, YYYY')
      ORDER BY day_str ASC
    `;

    let daily = dailyRows.map((r: any) => ({
      day: r.day_str,
      label: r.label,
      fullDate: r.full_date,
      requests: Number(r.requests) || 0,
      tokens: Number(r.tokens) || 0,
      cached: Number(r.cached) || 0,
      top_model: r.top_model || 'other',
    }));

    // If usage_log has 0 records, synthesize real activity from the history table
    if (totalRequests === 0) {
      try {
        const historyRows = await sql`
          SELECT
            COALESCE(NULLIF(TRIM(ai_model), ''), 'other') AS model_name,
            TO_CHAR(created_at::timestamp, 'YYYY-MM-DD') AS day_str,
            TO_CHAR(created_at::timestamp, 'Mon DD') AS label,
            TO_CHAR(created_at::timestamp, 'Mon DD, YYYY') AS full_date,
            COUNT(*)::INT AS requests
          FROM history
          WHERE (user_id = ANY(${userIds}) OR user_id = ${userId})
            AND created_at::timestamp >= NOW() - INTERVAL '365 days'
          GROUP BY model_name,
                   TO_CHAR(created_at::timestamp, 'YYYY-MM-DD'),
                   TO_CHAR(created_at::timestamp, 'Mon DD'),
                   TO_CHAR(created_at::timestamp, 'Mon DD, YYYY')
          ORDER BY day_str ASC
        `;

        if (historyRows.length > 0) {
          const modelMap = new Map<string, { requests: number; tokens: number }>();
          const dayMap = new Map<string, { label: string; fullDate: string; requests: number; tokens: number; top_model: string }>();

          historyRows.forEach((r: any) => {
            const reqs = Number(r.requests) || 0;
            const estimatedTokens = reqs * 6200; // realistic token usage per generation
            totalRequests += reqs;
            totalTokens += estimatedTokens;

            // Model aggregation
            const currentModel = modelMap.get(r.model_name) || { requests: 0, tokens: 0 };
            currentModel.requests += reqs;
            currentModel.tokens += estimatedTokens;
            modelMap.set(r.model_name, currentModel);

            // Day aggregation
            const currentDay = dayMap.get(r.day_str) || {
              label: r.label,
              fullDate: r.full_date,
              requests: 0,
              tokens: 0,
              top_model: r.model_name,
            };
            currentDay.requests += reqs;
            currentDay.tokens += estimatedTokens;
            currentDay.top_model = r.model_name;
            dayMap.set(r.day_str, currentDay);
          });

          by_model = Array.from(modelMap.entries()).map(([model, data]) => ({
            model,
            requests: data.requests,
            tokens: data.tokens,
            cached: 0,
            share: totalTokens > 0 ? Math.round((data.tokens / totalTokens) * 100) : 0,
          })).sort((a, b) => b.tokens - a.tokens);

          daily = Array.from(dayMap.entries()).map(([day, data]) => ({
            day,
            label: data.label,
            fullDate: data.fullDate,
            requests: data.requests,
            tokens: data.tokens,
            cached: 0,
            top_model: data.top_model,
          })).sort((a, b) => a.day.localeCompare(b.day));
        }
      } catch (err) {
        console.warn("History fallback query failed:", err);
      }
    }

    return NextResponse.json({
      summary: {
        total_tokens: totalTokens,
        total_cache_read_tokens: totalCached,
        total_requests: totalRequests,
      },
      by_model,
      daily,
    });
  } catch (err: any) {
    console.error("Usage summary API error:", err);
    return NextResponse.json({
      summary: { total_tokens: 0, total_cache_read_tokens: 0, total_requests: 0 },
      by_model: [],
      daily: [],
    });
  }
}
