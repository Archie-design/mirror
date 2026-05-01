import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cron 執行時間：每週一 04:30 UTC = 台灣時間（Asia/Taipei, UTC+8）週一 12:30
// 為什麼選週一 12:30 TW：本系統邏輯日以中午 12:00 TW 為邊界，
// 「上週日的邏輯日」延伸至週一 12:00 TW，需在此之後才能確保資料完整。
// vercel.json schedule: "30 4 * * 1"（UTC）= 每週一 04:30 UTC = 台灣時間週一 12:30

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

function getLastWeekRange(): { weekMonday: string; start: string; end: string } {
    // 取得「上週週一 00:00 Asia/Taipei」與「本週週一 00:00 Asia/Taipei」
    // 以台灣時區 anchor，避免伺服器時區誤判
    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [y, m, d] = twDateStr.split('-').map(n => parseInt(n, 10));
    const twToday = new Date(Date.UTC(y, m - 1, d));
    // ISO weekday: 1 = Mon, 7 = Sun
    const weekday = twToday.getUTCDay() || 7;
    // 本週週一日期（UTC anchor，但代表 TW 日曆日）
    const thisMonday = new Date(twToday);
    thisMonday.setUTCDate(twToday.getUTCDate() - (weekday - 1));
    // 上週週一
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);

    const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return {
        weekMonday: fmt(lastMonday),
        // TIMESTAMPTZ 邊界：以 +08:00 表示
        start: `${fmt(lastMonday)}T12:00:00+08:00`,
        end:   `${fmt(thisMonday)}T12:00:00+08:00`,
    };
}

export async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.error('[cron/weekly-snapshot] CRON_SECRET env var is not set.');
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { weekMonday, start, end } = getLastWeekRange();
    console.log('[cron/weekly-snapshot] taking snapshot for week_monday =', weekMonday, '(range:', start, '~', end, ')');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('aggregate_dailylogs_by_user', { p_start: start, p_end: end });
    if (error) {
        console.error('[cron/weekly-snapshot] aggregate RPC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data as AggregateRow[] | null) ?? [];
    if (rows.length === 0) {
        return NextResponse.json({ success: true, weekMonday, inserted: 0, note: 'no rows' });
    }

    const payload = rows.map(r => ({
        week_monday: weekMonday,
        user_id: r.user_id,
        user_name: r.user_name,
        team_name: r.team_name,
        squad_name: r.squad_name,
        week_score: Number(r.period_score) || 0,
        cumulative_score: r.cumulative_score || 0,
    }));

    // upsert 以 (week_monday, user_id) 為衝突鍵，ignoreDuplicates 確保重跑時不覆蓋歷史快照
    const { error: upsertErr } = await supabase
        .from('WeeklyRankSnapshot')
        .upsert(payload, { onConflict: 'week_monday,user_id', ignoreDuplicates: true });

    if (upsertErr) {
        console.error('[cron/weekly-snapshot] upsert error:', upsertErr);
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    console.log('[cron/weekly-snapshot] inserted', payload.length, 'rows for week', weekMonday);
    return NextResponse.json({ success: true, weekMonday, inserted: payload.length });
}
