'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/app/actions/admin-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface SnapshotPeriodInfo {
    latestDate: string | null;
    latestCount: number;
    history: { date: string; count: number }[];
    isMissing: boolean;
    expectedDate: string;
}

export interface SnapshotStatus {
    weekly: SnapshotPeriodInfo;
    monthly: SnapshotPeriodInfo;
}

function getTaiwanDateStr(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

function getExpectedLastWeekMonday(): string {
    const twStr = getTaiwanDateStr();
    const [y, m, d] = twStr.split('-').map(n => parseInt(n, 10));
    const today = new Date(Date.UTC(y, m - 1, d));
    const weekday = today.getUTCDay() || 7;
    const thisMonday = new Date(today);
    thisMonday.setUTCDate(today.getUTCDate() - (weekday - 1));
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
    return `${lastMonday.getUTCFullYear()}-${String(lastMonday.getUTCMonth() + 1).padStart(2, '0')}-${String(lastMonday.getUTCDate()).padStart(2, '0')}`;
}

function getExpectedLastMonthStart(): string {
    const twStr = getTaiwanDateStr();
    const [y, m] = twStr.split('-').map(n => parseInt(n, 10));
    const thisMonth = new Date(Date.UTC(y, m - 1, 1));
    const lastMonth = new Date(thisMonth);
    lastMonth.setUTCMonth(thisMonth.getUTCMonth() - 1);
    return `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export async function getSnapshotStatus(): Promise<{ success: boolean; data?: SnapshotStatus; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 週快照：按 week_monday 分組，取最近 4 筆
    const { data: weekRows, error: wErr } = await supabase
        .from('WeeklyRankSnapshot')
        .select('week_monday')
        .order('week_monday', { ascending: false });
    if (wErr) return { success: false, error: wErr.message };

    const weekCounts = new Map<string, number>();
    for (const r of (weekRows as { week_monday: string }[] | null) ?? []) {
        weekCounts.set(r.week_monday, (weekCounts.get(r.week_monday) ?? 0) + 1);
    }
    const weekHistory = [...weekCounts.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 4)
        .map(([date, count]) => ({ date, count }));
    const weekLatest = weekHistory[0] ?? null;
    const expectedWeek = getExpectedLastWeekMonday();

    // 月快照：按 month_start 分組，取最近 4 筆
    const { data: monthRows, error: mErr } = await supabase
        .from('MonthlyRankSnapshot')
        .select('month_start')
        .order('month_start', { ascending: false });
    if (mErr) return { success: false, error: mErr.message };

    const monthCounts = new Map<string, number>();
    for (const r of (monthRows as { month_start: string }[] | null) ?? []) {
        monthCounts.set(r.month_start, (monthCounts.get(r.month_start) ?? 0) + 1);
    }
    const monthHistory = [...monthCounts.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 4)
        .map(([date, count]) => ({ date, count }));
    const monthLatest = monthHistory[0] ?? null;
    const expectedMonth = getExpectedLastMonthStart();

    return {
        success: true,
        data: {
            weekly: {
                latestDate: weekLatest?.date ?? null,
                latestCount: weekLatest?.count ?? 0,
                history: weekHistory,
                isMissing: !weekLatest || weekLatest.date < expectedWeek,
                expectedDate: expectedWeek,
            },
            monthly: {
                latestDate: monthLatest?.date ?? null,
                latestCount: monthLatest?.count ?? 0,
                history: monthHistory,
                isMissing: !monthLatest || monthLatest.date < expectedMonth,
                expectedDate: expectedMonth,
            },
        },
    };
}

interface AggregateRow {
    user_id: string;
    user_name: string | null;
    team_name: string | null;
    squad_name: string | null;
    period_score: number;
    cumulative_score: number;
}

function fmtDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getLastWeekRange(): { weekMonday: string; start: string; end: string } {
    const twStr = getTaiwanDateStr();
    const [y, m, d] = twStr.split('-').map(n => parseInt(n, 10));
    const twToday = new Date(Date.UTC(y, m - 1, d));
    const weekday = twToday.getUTCDay() || 7;
    const thisMonday = new Date(twToday);
    thisMonday.setUTCDate(twToday.getUTCDate() - (weekday - 1));
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
    return {
        weekMonday: fmtDate(lastMonday),
        start: `${fmtDate(lastMonday)}T12:00:00+08:00`,
        end:   `${fmtDate(thisMonday)}T12:00:00+08:00`,
    };
}

function getLastMonthRange(): { monthStart: string; start: string; end: string } {
    const twStr = getTaiwanDateStr();
    const [y, m] = twStr.split('-').map(n => parseInt(n, 10));
    const thisMonthStart = new Date(Date.UTC(y, m - 1, 1));
    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setUTCMonth(thisMonthStart.getUTCMonth() - 1);
    return {
        monthStart: fmtDate(lastMonthStart),
        start: `${fmtDate(lastMonthStart)}T12:00:00+08:00`,
        end:   `${fmtDate(thisMonthStart)}T12:00:00+08:00`,
    };
}

export async function triggerWeeklySnapshot(): Promise<{ success: boolean; inserted?: number; weekMonday?: string; note?: string; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    try {
        const { weekMonday, start, end } = getLastWeekRange();
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabase.rpc('aggregate_dailylogs_by_user', { p_start: start, p_end: end });
        if (error) return { success: false, error: error.message };
        const rows = (data as AggregateRow[] | null) ?? [];
        if (rows.length === 0) return { success: true, weekMonday, inserted: 0, note: 'no rows' };
        const payload = rows.map(r => ({
            week_monday: weekMonday,
            user_id: r.user_id,
            user_name: r.user_name,
            team_name: r.team_name,
            squad_name: r.squad_name,
            week_score: Number(r.period_score) || 0,
            cumulative_score: r.cumulative_score || 0,
        }));
        const { error: upsertErr } = await supabase
            .from('WeeklyRankSnapshot')
            .upsert(payload, { onConflict: 'week_monday,user_id', ignoreDuplicates: true });
        if (upsertErr) return { success: false, error: upsertErr.message };
        return { success: true, weekMonday, inserted: payload.length };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function triggerMonthlySnapshot(): Promise<{ success: boolean; inserted?: number; monthStart?: string; note?: string; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    try {
        const { monthStart, start, end } = getLastMonthRange();
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabase.rpc('aggregate_dailylogs_by_user', { p_start: start, p_end: end });
        if (error) return { success: false, error: error.message };
        const rows = (data as AggregateRow[] | null) ?? [];
        if (rows.length === 0) return { success: true, monthStart, inserted: 0, note: 'no rows' };
        const payload = rows.map(r => ({
            month_start: monthStart,
            user_id: r.user_id,
            user_name: r.user_name,
            team_name: r.team_name,
            squad_name: r.squad_name,
            month_score: Number(r.period_score) || 0,
            cumulative_score: r.cumulative_score || 0,
        }));
        const { error: upsertErr } = await supabase
            .from('MonthlyRankSnapshot')
            .upsert(payload, { onConflict: 'month_start,user_id', ignoreDuplicates: true });
        if (upsertErr) return { success: false, error: upsertErr.message };
        return { success: true, monthStart, inserted: payload.length };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}
