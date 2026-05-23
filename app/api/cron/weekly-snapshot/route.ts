import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cron 執行時間：每週日 04:30 UTC = 台灣時間（Asia/Taipei, UTC+8）週日 12:30
// 賽季週採「週日 → 週六」7 天，cron 於週日中午 12:00 後執行可定格「上週日 12:00 → 這週日 12:00」完整資料。
// vercel.json schedule: "30 4 * * 0"（UTC）= 每週日 04:30 UTC = 台灣時間週日 12:30

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
    // 取得「上週日 12:00 Asia/Taipei」與「這週日 12:00 Asia/Taipei」
    // 賽季週採「週日 → 週六」，邊界取邏輯日中午 12:00 +08。
    // 註：回傳欄名 weekMonday 保留歷史名稱，實際存週日日期。
    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [y, m, d] = twDateStr.split('-').map(n => parseInt(n, 10));
    const twToday = new Date(Date.UTC(y, m - 1, d));
    const weekday = twToday.getUTCDay(); // 0 = Sun, 6 = Sat
    // 這週日（若 cron 於週日當天觸發，weekday=0，不退）
    const thisSunday = new Date(twToday);
    thisSunday.setUTCDate(twToday.getUTCDate() - weekday);
    // 上週日
    const lastSunday = new Date(thisSunday);
    lastSunday.setUTCDate(thisSunday.getUTCDate() - 7);

    const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return {
        weekMonday: fmt(lastSunday),
        start: `${fmt(lastSunday)}T12:00:00+08:00`,
        end:   `${fmt(thisSunday)}T12:00:00+08:00`,
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

    // 賽季週採「週日 → 週六」，W1 = 5/10–5/16 自然落在標準週上，無需特例。
    // 5/24 (週日) 為第一次新規則 cron，寫入 W2 (5/17–5/23)。
    // W1 (5/10–5/16) 由一次性腳本 scripts/backfill_w1_snapshot.ts 補寫。

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
