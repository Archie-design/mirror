import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SEASON_MONTHS, seasonMonthRangeIso, type SeasonMonth } from '@/lib/utils/time';

// Cron 執行時間：每日 04:30 UTC = 台灣時間（Asia/Taipei, UTC+8）12:30
// 本系統邏輯日以中午 12:00 TW 為邊界；賽季月（5/10–6/14、6/15–7/11）結束邊界
// 為「endExclusive 當日 12:00 TW」。route 每日自我把關：找出已結束、且尚未快照的
// 最後一個賽季月才寫入 → 自癒、不漏（即使某天 cron 漏跑，隔天會補）。
// vercel.json schedule: "30 4 * * *"（UTC）= 每日 04:30 UTC = 台灣時間 12:30

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

// 找出「結束邊界已過（≤ 現在）」的最後一個賽季月；都還沒結束則回 null。
function getEndedSeasonMonthToSnapshot(): SeasonMonth | null {
    const now = Date.now();
    let ended: SeasonMonth | null = null;
    for (const m of SEASON_MONTHS) {
        const endMs = new Date(seasonMonthRangeIso(m).end).getTime();
        if (endMs <= now) ended = m; // SEASON_MONTHS 已按時間排序，取最後一個已結束者
    }
    return ended;
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

    const target = getEndedSeasonMonthToSnapshot();
    if (!target) {
        return NextResponse.json({ success: true, inserted: 0, note: 'no season month ended yet' });
    }
    const monthStart = target.key;
    const { start, end } = seasonMonthRangeIso(target);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 已有此賽季月快照 → 略過（避免每日重跑 aggregate）
    const { count: existing } = await supabase
        .from('MonthlyRankSnapshot')
        .select('id', { count: 'exact', head: true })
        .eq('month_start', monthStart);
    if (existing && existing > 0) {
        return NextResponse.json({ success: true, monthStart, inserted: 0, note: 'already snapshotted' });
    }

    console.log('[cron/monthly-snapshot] taking snapshot for month_start =', monthStart, '(range:', start, '~', end, ')');
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
