'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireUser, authErrorResponse } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ── 共用型別 ──────────────────────────────────────────────────────────────────

export interface PersonalRankEntry {
    userId: string;
    userName: string | null;
    teamName: string | null;
    squadName: string | null;
    periodScore: number;
    cumulativeScore: number;
    isCurrentUser?: boolean;
}

export interface SquadRankEntry {
    teamName: string;
    squadName: string | null;       // 大隊
    totalScore: number;             // 該期間小隊總分
    memberCount: number;
    avgScore: number;               // 平均（用於排序）
    topMember: { userName: string | null; score: number };
}

export interface BattalionRankEntry {
    squadName: string;              // 大隊名
    totalScore: number;
    memberCount: number;
    teamCount: number;              // 大隊內小隊數
    avgScore: number;
}

export interface SquadGrowthDatum {
    weekMonday: string;             // YYYY-MM-DD
    teamScores: Record<string, number>;  // teamName → 該週分數
}

// ── 時間區間工具 ─────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 以台灣時區回傳本週週一 YYYY-MM-DD（UTC anchor） */
function getCurrentWeekMondayDate(): Date {
    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [y, m, d] = twDateStr.split('-').map(n => parseInt(n, 10));
    const today = new Date(Date.UTC(y, m - 1, d));
    const weekday = today.getUTCDay() || 7;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - (weekday - 1));
    return monday;
}

function getCurrentMonthStartDate(): Date {
    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [y, m] = twDateStr.split('-').map(n => parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, 1));
}

// ── Live aggregate（本週 / 本月）────────────────────────────────────────────

interface AggregateRow {
    user_id: string;
    user_name: string | null;
    team_name: string | null;
    squad_name: string | null;
    period_score: number;
    cumulative_score: number;
}

async function aggregateRange(start: string, end: string): Promise<PersonalRankEntry[]> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('aggregate_dailylogs_by_user', { p_start: start, p_end: end });
    if (error) throw new Error(error.message);
    return ((data as AggregateRow[]) || []).map(r => ({
        userId: r.user_id,
        userName: r.user_name,
        teamName: r.team_name,
        squadName: r.squad_name,
        periodScore: Number(r.period_score) || 0,
        cumulativeScore: r.cumulative_score || 0,
    }));
}

// ── 個人排行：本週 ────────────────────────────────────────────────────────────
export async function getCurrentWeekLeaderboard(): Promise<{ success: boolean; entries?: PersonalRankEntry[]; weekMonday?: string; error?: string }> {
    let sessionUid: string | undefined;
    try { sessionUid = await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    try {
        const monday = getCurrentWeekMondayDate();
        const nextMonday = new Date(monday);
        nextMonday.setUTCDate(monday.getUTCDate() + 7);
        const start = `${fmtDate(monday)}T12:00:00+08:00`;
        const end = `${fmtDate(nextMonday)}T12:00:00+08:00`;
        const entries = await aggregateRange(start, end);
        return {
            success: true,
            weekMonday: fmtDate(monday),
            entries: entries.map(e => ({ ...e, isCurrentUser: e.userId === sessionUid })),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// ── 個人排行：上週（live aggregate，快照尚未建立前使用）──────────────────────
export async function getPreviousWeekLeaderboard(): Promise<{ success: boolean; entries?: PersonalRankEntry[]; weekMonday?: string; error?: string }> {
    let sessionUid: string | undefined;
    try { sessionUid = await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    try {
        const monday = getCurrentWeekMondayDate();
        const prevMonday = new Date(monday);
        prevMonday.setUTCDate(monday.getUTCDate() - 7);
        const start = `${fmtDate(prevMonday)}T12:00:00+08:00`;
        const end   = `${fmtDate(monday)}T12:00:00+08:00`;
        const entries = await aggregateRange(start, end);
        return {
            success: true,
            weekMonday: fmtDate(prevMonday),
            entries: entries.map(e => ({ ...e, isCurrentUser: e.userId === sessionUid })),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// ── 個人排行：歷史週（從 snapshot）─────────────────────────────────────────
export async function getPastWeekLeaderboard(weekMonday: string): Promise<{ success: boolean; entries?: PersonalRankEntry[]; error?: string }> {
    let sessionUid: string | undefined;
    try { sessionUid = await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('WeeklyRankSnapshot')
        .select('user_id, user_name, team_name, squad_name, week_score, cumulative_score')
        .eq('week_monday', weekMonday)
        .order('week_score', { ascending: false });
    if (error) return { success: false, error: error.message };

    type SnapshotRow = { user_id: string; user_name: string | null; team_name: string | null; squad_name: string | null; week_score: number; cumulative_score: number };
    const entries = ((data as SnapshotRow[]) || []).map(r => ({
        userId: r.user_id,
        userName: r.user_name,
        teamName: r.team_name,
        squadName: r.squad_name,
        periodScore: r.week_score,
        cumulativeScore: r.cumulative_score,
        isCurrentUser: r.user_id === sessionUid,
    }));
    return { success: true, entries };
}

// ── 個人排行：上月（live aggregate，快照尚未建立前使用）──────────────────────
export async function getPreviousMonthLeaderboard(): Promise<{ success: boolean; entries?: PersonalRankEntry[]; monthStart?: string; error?: string }> {
    let sessionUid: string | undefined;
    try { sessionUid = await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    try {
        const monthStart = getCurrentMonthStartDate();
        const prevMonthStart = new Date(monthStart);
        prevMonthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
        const start = `${fmtDate(prevMonthStart)}T12:00:00+08:00`;
        const end   = `${fmtDate(monthStart)}T12:00:00+08:00`;
        const entries = await aggregateRange(start, end);
        return {
            success: true,
            monthStart: fmtDate(prevMonthStart),
            entries: entries.map(e => ({ ...e, isCurrentUser: e.userId === sessionUid })),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// ── 個人排行：本月 ────────────────────────────────────────────────────────────
export async function getCurrentMonthLeaderboard(): Promise<{ success: boolean; entries?: PersonalRankEntry[]; monthStart?: string; error?: string }> {
    let sessionUid: string | undefined;
    try { sessionUid = await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    try {
        const monthStart = getCurrentMonthStartDate();
        const nextMonth = new Date(monthStart);
        nextMonth.setUTCMonth(monthStart.getUTCMonth() + 1);
        const start = `${fmtDate(monthStart)}T12:00:00+08:00`;
        const end = `${fmtDate(nextMonth)}T12:00:00+08:00`;
        const entries = await aggregateRange(start, end);
        return {
            success: true,
            monthStart: fmtDate(monthStart),
            entries: entries.map(e => ({ ...e, isCurrentUser: e.userId === sessionUid })),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// ── 個人排行：歷史月 ──────────────────────────────────────────────────────────
export async function getPastMonthLeaderboard(monthStart: string): Promise<{ success: boolean; entries?: PersonalRankEntry[]; error?: string }> {
    let sessionUid: string | undefined;
    try { sessionUid = await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('MonthlyRankSnapshot')
        .select('user_id, user_name, team_name, squad_name, month_score, cumulative_score')
        .eq('month_start', monthStart)
        .order('month_score', { ascending: false });
    if (error) return { success: false, error: error.message };

    type SnapshotRow = { user_id: string; user_name: string | null; team_name: string | null; squad_name: string | null; month_score: number; cumulative_score: number };
    const entries = ((data as SnapshotRow[]) || []).map(r => ({
        userId: r.user_id,
        userName: r.user_name,
        teamName: r.team_name,
        squadName: r.squad_name,
        periodScore: r.month_score,
        cumulativeScore: r.cumulative_score,
        isCurrentUser: r.user_id === sessionUid,
    }));
    return { success: true, entries };
}

// ── 過去 N 週 weekMonday 列表（給期間選單用）────────────────────────────────
export async function listAvailableWeeks(limit: number = 12): Promise<{ success: boolean; weeks?: string[]; error?: string }> {
    try { await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    // DB 層 DISTINCT + ORDER + LIMIT，避免應用層 Set 去重的全表掃描問題
    const { data, error } = await supabase.rpc('get_distinct_week_mondays', { p_limit: limit });
    if (error) return { success: false, error: error.message };
    const weeks = ((data as { week_monday: string }[]) || []).map(r => r.week_monday);
    return { success: true, weeks };
}

export async function listAvailableMonths(limit: number = 12): Promise<{ success: boolean; months?: string[]; error?: string }> {
    try { await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('get_distinct_month_starts', { p_limit: limit });
    if (error) return { success: false, error: error.message };
    const months = ((data as { month_start: string }[]) || []).map(r => r.month_start);
    return { success: true, months };
}

// ── 小組成長曲線（過去 N 週每隊每週分數）──────────────────────────────────
export async function getSquadGrowthChart(weeks: number = 8): Promise<{ success: boolean; data?: SquadGrowthDatum[]; teamNames?: string[]; error?: string }> {
    let sessionUid: string | undefined;
    try { sessionUid = await requireUser(); } catch (e) {
        const r = authErrorResponse(e); if (r) return r; throw e;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 取得使用者角色，決定可見小隊範圍
    const { data: viewer } = await supabase
        .from('CharacterStats')
        .select('TeamName, SquadName, IsCaptain, IsCommandant, IsGM')
        .eq('UserID', sessionUid!)
        .maybeSingle();

    type ViewerRow = { TeamName: string | null; SquadName: string | null; IsCaptain: boolean | null; IsCommandant: boolean | null; IsGM: boolean | null };
    const v = viewer as ViewerRow | null;

    // 取最近 N 週的 distinct week_monday（DB 層 DISTINCT，避免全表掃描）
    const { data: weekRows, error: wkErr } = await supabase.rpc('get_distinct_week_mondays', { p_limit: weeks });
    if (wkErr) return { success: false, error: wkErr.message };
    const distinctWeeks = ((weekRows as { week_monday: string }[]) || [])
        .map(r => r.week_monday)
        .reverse();  // RPC 回傳 DESC，反轉為由舊到新

    if (distinctWeeks.length === 0) return { success: true, data: [], teamNames: [] };

    // 拉這 N 週的所有 snapshot
    const { data: rows, error } = await supabase
        .from('WeeklyRankSnapshot')
        .select('week_monday, team_name, squad_name, week_score')
        .in('week_monday', distinctWeeks);
    if (error) return { success: false, error: error.message };

    type Row = { week_monday: string; team_name: string | null; squad_name: string | null; week_score: number };
    const allRows = (rows as Row[]) || [];

    // 角色篩選：學員/隊長 → 本小隊；大隊長 → 本大隊全部小隊；GM → 全部
    let filtered: Row[];
    if (v?.IsGM) {
        filtered = allRows;
    } else if (v?.IsCommandant && v.SquadName) {
        filtered = allRows.filter(r => r.squad_name === v.SquadName);
    } else if (v?.TeamName) {
        filtered = allRows.filter(r => r.team_name === v.TeamName);
    } else {
        filtered = [];
    }

    // 聚合：weekMonday × teamName → SUM(week_score)
    const matrix = new Map<string, Map<string, number>>();  // weekMonday → (teamName → score)
    const teamSet = new Set<string>();
    for (const r of filtered) {
        if (!r.team_name) continue;
        teamSet.add(r.team_name);
        if (!matrix.has(r.week_monday)) matrix.set(r.week_monday, new Map());
        const teamMap = matrix.get(r.week_monday)!;
        teamMap.set(r.team_name, (teamMap.get(r.team_name) ?? 0) + r.week_score);
    }

    const data: SquadGrowthDatum[] = distinctWeeks.map(wm => {
        const teamMap = matrix.get(wm) ?? new Map<string, number>();
        const teamScores: Record<string, number> = {};
        for (const t of teamSet) teamScores[t] = teamMap.get(t) ?? 0;
        return { weekMonday: wm, teamScores };
    });

    return { success: true, data, teamNames: [...teamSet].sort() };
}
