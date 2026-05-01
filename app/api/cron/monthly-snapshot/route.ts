import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cron 執行時間：每月 1 號 16:30 UTC = 台灣時間（Asia/Taipei, UTC+8）1 號 00:30
// 1 號 00:30 時上個月的所有活動已完整結算，snapshot 資料正確。
// vercel.json schedule: "30 16 1 * *"（UTC）= 每月 1 號 16:30 UTC

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface AggregateRow {
    user_id: string;
    user_name: string | null;
    team_name: string | null;
    squad_name: string | null;
    period_score: number;
    cumulative_score: number;
}

function getLastMonthRange(): { monthStart: string; start: string; end: string } {
    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [y, m] = twDateStr.split('-').map(n => parseInt(n, 10));
    // 本月 1 號（即「上個月結束」邊界）
    const thisMonthStart = new Date(Date.UTC(y, m - 1, 1));
    // 上個月 1 號
    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setUTCMonth(thisMonthStart.getUTCMonth() - 1);

    const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return {
        monthStart: fmt(lastMonthStart),
        start: `${fmt(lastMonthStart)}T00:00:00+08:00`,
        end:   `${fmt(thisMonthStart)}T00:00:00+08:00`,
    };
}

export async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.error('[cron/monthly-snapshot] CRON_SECRET env var is not set.');
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { monthStart, start, end } = getLastMonthRange();
    console.log('[cron/monthly-snapshot] taking snapshot for month_start =', monthStart, '(range:', start, '~', end, ')');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('aggregate_dailylogs_by_user', { p_start: start, p_end: end });
    if (error) {
        console.error('[cron/monthly-snapshot] aggregate RPC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data as AggregateRow[] | null) ?? [];
    if (rows.length === 0) {
        return NextResponse.json({ success: true, monthStart, inserted: 0, note: 'no rows' });
    }

    const payload = rows.map(r => ({
        month_start: monthStart,
        user_id: r.user_id,
        user_name: r.user_name,
        team_name: r.team_name,
        squad_name: r.squad_name,
        month_score: Number(r.period_score) || 0,
        cumulative_score: r.cumulative_score || 0,
    }));

    // ignoreDuplicates 確保重跑時不覆蓋歷史快照
    const { error: upsertErr } = await supabase
        .from('MonthlyRankSnapshot')
        .upsert(payload, { onConflict: 'month_start,user_id', ignoreDuplicates: true });

    if (upsertErr) {
        console.error('[cron/monthly-snapshot] upsert error:', upsertErr);
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    console.log('[cron/monthly-snapshot] inserted', payload.length, 'rows for month', monthStart);
    return NextResponse.json({ success: true, monthStart, inserted: payload.length });
}
