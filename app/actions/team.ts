"use server";

import 'server-only';
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SquadMemberStats } from "@/types";
import { requireSelf, authErrorResponse } from "@/lib/auth";
import { getLogicalDateStr } from "@/lib/utils/time";
import { getCommandantTeamNames } from "@/lib/auth-scope";
import { formatCsvRows } from "@/lib/utils/csv";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseActionKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * 小隊長查看本隊成員狀態（含最近打卡日）
 */
export async function getSquadMembersStats(captainUserId: string): Promise<{ success: boolean; members?: SquadMemberStats[]; error?: string }> {
    try { await requireSelf(captainUserId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseActionKey);

    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('TeamName')
        .eq('UserID', captainUserId)
        .maybeSingle();

    if (!captain?.TeamName) return { success: false, error: '找不到劇組資訊' };

    const { data: members, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Score, Streak, TeamName, IsCaptain')
        .eq('TeamName', captain.TeamName)
        .order('Score', { ascending: false });

    if (error || !members) return { success: false, error: error?.message };

    type MemberRow = { UserID: string; Name: string; Score: number | null; Streak: number | null; TeamName: string | null; IsCaptain: boolean | null };
    type LogRow = { UserID: string; Timestamp: string };

    const memberRows = members as MemberRow[];
    const userIds = memberRows.map(m => m.UserID);
    // 僅查最近 30 天範圍即可取得「最後打卡日期」，避免小隊日誌全表掃描
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: logs } = await supabase
        .from('DailyLogs')
        .select('UserID, Timestamp')
        .in('UserID', userIds)
        .gte('Timestamp', cutoff)
        .order('Timestamp', { ascending: false });

    const latestCheckIn: Record<string, string> = {};
    for (const log of (logs as LogRow[] | null) ?? []) {
        if (!latestCheckIn[log.UserID]) {
            latestCheckIn[log.UserID] = getLogicalDateStr(log.Timestamp);
        }
    }

    const result: SquadMemberStats[] = memberRows.map(m => ({
        UserID: m.UserID,
        Name: m.Name,
        Score: m.Score || 0,
        Streak: m.Streak || 0,
        TeamName: m.TeamName ?? undefined,
        IsCaptain: m.IsCaptain || false,
        lastCheckIn: latestCheckIn[m.UserID],
    }));

    return { success: true, members: result };
}

/**
 * 大隊長查看全大隊各小隊成員狀態，以 TeamName 分組
 */
export async function getBattalionMembersStats(commandantUserId: string): Promise<{ success: boolean; members?: Record<string, SquadMemberStats[]>; error?: string }> {
    try { await requireSelf(commandantUserId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseActionKey);

    const { data: commandant } = await supabase
        .from('CharacterStats')
        .select('SquadName')
        .eq('UserID', commandantUserId)
        .maybeSingle();

    if (!commandant?.SquadName) return { success: false, error: '找不到大隊資訊' };

    const { data: members, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Score, Streak, TeamName, SquadName, IsCaptain')
        .eq('SquadName', commandant.SquadName)
        .order('Score', { ascending: false });

    if (error || !members) return { success: false, error: error?.message };

    type BattalionMemberRow = { UserID: string; Name: string; Score: number | null; Streak: number | null; TeamName: string | null; SquadName: string | null; IsCaptain: boolean | null };
    type LogRow = { UserID: string; Timestamp: string };

    const memberRows = members as BattalionMemberRow[];
    const userIds = memberRows.map(m => m.UserID);
    // 大隊成員可能 50+ 人，限制最近 30 天避免全表掃描
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: logs } = await supabase
        .from('DailyLogs')
        .select('UserID, Timestamp')
        .in('UserID', userIds)
        .gte('Timestamp', cutoff)
        .order('Timestamp', { ascending: false });

    const latestCheckIn: Record<string, string> = {};
    for (const log of (logs as LogRow[] | null) ?? []) {
        if (!latestCheckIn[log.UserID]) {
            latestCheckIn[log.UserID] = getLogicalDateStr(log.Timestamp);
        }
    }

    const grouped: Record<string, SquadMemberStats[]> = {};
    for (const m of memberRows) {
        const teamName = m.TeamName || '未編組';
        if (!grouped[teamName]) grouped[teamName] = [];
        grouped[teamName].push({
            UserID: m.UserID,
            Name: m.Name,
            Score: m.Score || 0,
            Streak: m.Streak || 0,
            TeamName: m.TeamName ?? undefined,
            IsCaptain: m.IsCaptain || false,
            lastCheckIn: latestCheckIn[m.UserID],
        });
    }

    return { success: true, members: grouped };
}

// ── 大隊長：每日定課明細（CSV 匯出 + JSON 個人查詢）共用型別與輔助 ─────────────
type DailyLogRow = { UserID: string; QuestID: string; QuestTitle: string | null; RewardPoints: number | null; Timestamp: string };
type MemberRow = { UserID: string; Name: string | null; TeamName: string | null };

const TITLES_D: Record<string, string> = {
    d1: '五感恩', d2: '餐前感恩', d3: '嗯啊吽', d4: '感恩冥想',
    d5: '抄經', d6: '光的冥想', d7: '欣賞', d8: '活在當下',
};
const TITLES_P: Record<string, string> = {
    p1: '打拳', p2: '觀心書', p3: '大悲咒', p4: '子時入睡', p5: '痛參',
};
const TITLES_DIET: Record<string, string> = {
    diet_veg: '三餐吃素', diet_seafood: '三餐海鮮素',
};
const TITLES_WK: Record<string, string> = {
    wk1: '破框練習', wk2: '天使通話',
    wk3_online: '線上凝聚', wk3_offline: '實體凝聚',
    wk4_small: '人生大戲(小群)', wk4_large: '人生大戲(大群)',
};

function questBase(questId: string): string {
    // wk1|YYYY-MM-DD → wk1；nine_grid_cell|3 → nine_grid_cell|3 (保留)
    const pipeIdx = questId.indexOf('|');
    if (pipeIdx < 0) return questId;
    if (questId.startsWith('nine_grid_')) return questId;
    return questId.slice(0, pipeIdx);
}

// 一人某邏輯日的分類彙總
export interface DailyBucket {
    daily: string[];      // 每日定課（d1-d8）
    boxing: string[];     // 打拳 + 破曉
    pOther: string[];     // p2-p5
    diet: string[];       // diet_*
    topicWeek: string[];  // wk1 + wk4_*
    angel: string[];      // wk2
    gather: string[];     // wk3_*
    nine: string[];       // nine_grid_*
    once: string[];       // o*
    temp: string[];       // temp_*
    total: number;
}

const emptyBucket = (): DailyBucket => ({
    daily: [], boxing: [], pOther: [], diet: [],
    topicWeek: [], angel: [], gather: [],
    nine: [], once: [], temp: [], total: 0,
});

// 把單筆 log 灌進對應分類；mutates bucket
function addLogToBucket(b: DailyBucket, log: DailyLogRow) {
    b.total += log.RewardPoints || 0;
    const base = questBase(log.QuestID);
    const title = log.QuestTitle || '';

    if (TITLES_D[base]) {
        b.daily.push(TITLES_D[base]);
    } else if (base === 'p1') {
        b.boxing.push(TITLES_P.p1);
    } else if (base === 'p1_dawn') {
        b.boxing.push('破曉打拳');
    } else if (TITLES_P[base]) {
        b.pOther.push(TITLES_P[base]);
    } else if (TITLES_DIET[base]) {
        b.diet.push(TITLES_DIET[base]);
    } else if (base === 'wk1' || base === 'wk4_small' || base === 'wk4_large') {
        const label = TITLES_WK[base] || base;
        b.topicWeek.push(title ? `${label}-${title}` : label);
    } else if (base === 'wk2') {
        b.angel.push(TITLES_WK.wk2);
    } else if (base === 'wk3_online' || base === 'wk3_offline') {
        b.gather.push(TITLES_WK[base]);
    } else if (log.QuestID.startsWith('nine_grid_')) {
        b.nine.push(title || log.QuestID);
    } else if (/^o[0-9]/.test(base)) {
        b.once.push(title || base);
    } else if (base.startsWith('temp_')) {
        b.temp.push(title || base);
    }
}

// 邏輯日範圍 → DailyLogs 時間戳邊界（邏輯日 X = X 12:00+08 ~ X+1 12:00+08）
function logicalRangeToIso(fromLogical: string, toLogical: string): { startISO: string; endISO: string } {
    const startISO = `${fromLogical}T12:00:00+08:00`;
    const toDate = new Date(`${toLogical}T00:00:00+08:00`);
    toDate.setDate(toDate.getDate() + 1);
    const toNextStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;
    return { startISO, endISO: `${toNextStr}T12:00:00+08:00` };
}

// 取得呼叫者（小隊長 / 大隊長）可看的小隊範圍
// 大隊長：本大隊內所有小隊；小隊長：僅本小隊
async function getLeaderTeamScope(
    supabase: SupabaseClient,
    callerId: string,
): Promise<{ role: 'commandant' | 'captain'; teamNames: string[]; squadName: string | null } | null> {
    const { data: caller } = await supabase
        .from('CharacterStats')
        .select('IsCommandant, IsCaptain, SquadName, TeamName')
        .eq('UserID', callerId)
        .maybeSingle();
    if (!caller) return null;
    if (caller.IsCommandant && caller.SquadName) {
        const { data: teams } = await supabase
            .from('CharacterStats')
            .select('TeamName')
            .eq('SquadName', caller.SquadName)
            .not('TeamName', 'is', null);
        const teamNames = Array.from(new Set((teams ?? []).map(t => t.TeamName).filter(Boolean) as string[]));
        return { role: 'commandant', teamNames, squadName: caller.SquadName };
    }
    if (caller.IsCaptain && caller.TeamName) {
        return { role: 'captain', teamNames: [caller.TeamName], squadName: caller.SquadName };
    }
    return null;
}

export async function exportTeamDailyLogsCsv(
    callerUserId: string,
    teamName?: string | null,    // 大隊長可指定特定小隊；小隊長忽略此參數（固定本小隊）
    startDate?: string | null,   // YYYY-MM-DD 邏輯日
    endDate?: string | null,     // YYYY-MM-DD 邏輯日（含當日）
): Promise<{ success: boolean; csv?: string; filename?: string; error?: string }> {
    try { await requireSelf(callerUserId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseActionKey);

    // 1. scope 驗證
    const scope = await getLeaderTeamScope(supabase, callerUserId);
    if (!scope) return { success: false, error: '僅限小隊長或大隊長使用' };
    // 小隊長：teamName 參數忽略
    const effectiveTeam = scope.role === 'captain' ? scope.teamNames[0] : (teamName || null);
    if (effectiveTeam && !scope.teamNames.includes(effectiveTeam)) {
        return { success: false, error: '無權匯出此小隊' };
    }

    // 2. 取得目標成員
    let memberQuery = supabase
        .from('CharacterStats')
        .select('UserID, Name, TeamName');
    if (scope.role === 'commandant' && scope.squadName) {
        memberQuery = memberQuery.eq('SquadName', scope.squadName);
        if (effectiveTeam) memberQuery = memberQuery.eq('TeamName', effectiveTeam);
    } else {
        // 小隊長：限本小隊
        memberQuery = memberQuery.eq('TeamName', scope.teamNames[0]);
    }
    const { data: members, error: memErr } = await memberQuery;
    if (memErr) return { success: false, error: memErr.message };
    const memberRows = (members ?? []) as MemberRow[];
    if (memberRows.length === 0) return { success: false, error: '找不到隊員' };

    const userIds = memberRows.map(m => m.UserID);
    const memberInfo = new Map<string, MemberRow>(memberRows.map(m => [m.UserID, m]));

    // 3. 邏輯日範圍
    const SEASON_START = '2026-05-10';
    const todayLogical = getLogicalDateStr();
    const fromLogical = startDate || SEASON_START;
    const toLogical   = endDate   || todayLogical;
    const { startISO, endISO } = logicalRangeToIso(fromLogical, toLogical);

    // 4. 撈 DailyLogs（分頁，避免 1000 row 限制）
    const allLogs = await fetchDailyLogsPaged(supabase, userIds, startISO, endISO);
    if ('error' in allLogs) return { success: false, error: allLogs.error };

    // 5. 按 (UserID, logicalDate) 分桶
    const groups = bucketizeLogs(allLogs.rows, fromLogical, toLogical);

    // 6. 組 CSV（寬表）
    const header: string[] = [
        '小隊', '姓名', '電話', '邏輯日',
        '每日定課', '打拳', '其他加權任務', '吃素',
        '週主題', '天使通話', '凝聚', '九宮格', '一次性', '臨時加碼',
        '當日總分',
    ];

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
        const [uidA, dateA] = a.split('|');
        const [uidB, dateB] = b.split('|');
        const tA = memberInfo.get(uidA)?.TeamName || '';
        const tB = memberInfo.get(uidB)?.TeamName || '';
        if (tA !== tB) return tA.localeCompare(tB);
        if (uidA !== uidB) return (memberInfo.get(uidA)?.Name || '').localeCompare(memberInfo.get(uidB)?.Name || '');
        return dateA.localeCompare(dateB);
    });

    const rows: Array<Array<string | number | null>> = [header];
    for (const key of sortedKeys) {
        const [uid, logicalDate] = key.split('|');
        const m = memberInfo.get(uid);
        const b = groups.get(key)!;
        rows.push([
            m?.TeamName || '', m?.Name || '', uid, logicalDate,
            b.daily.join('、'), b.boxing.join('、'), b.pOther.join('、'), b.diet.join('、'),
            b.topicWeek.join('、'), b.angel.join('、'), b.gather.join('、'),
            b.nine.join('、'), b.once.join('、'), b.temp.join('、'),
            b.total,
        ]);
    }

    const BOM = '﻿';
    const csv = BOM + formatCsvRows(rows);
    const labelSource = effectiveTeam || scope.squadName || scope.teamNames[0] || 'team';
    const scopeLabel = labelSource.replace(/\s/g, '');
    const filename = `daily_logs_${scopeLabel}_${fromLogical}_${toLogical}.csv`;
    return { success: true, csv, filename };
}

// 分頁撈取 DailyLogs（避免 Supabase 預設 1000 row 上限）
async function fetchDailyLogsPaged(
    supabase: SupabaseClient,
    userIds: string[],
    startISO: string,
    endISO: string,
): Promise<{ rows: DailyLogRow[] } | { error: string }> {
    const PAGE = 1000;
    const all: DailyLogRow[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('DailyLogs')
            .select('UserID, QuestID, QuestTitle, RewardPoints, Timestamp')
            .in('UserID', userIds)
            .gte('Timestamp', startISO)
            .lt('Timestamp', endISO)
            .order('Timestamp', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) return { error: error.message };
        const rows = (data ?? []) as DailyLogRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
    }
    return { rows: all };
}

// 按 (UserID, logicalDate) 分桶
function bucketizeLogs(logs: DailyLogRow[], fromLogical: string, toLogical: string): Map<string, DailyBucket> {
    const groups = new Map<string, DailyBucket>();
    for (const log of logs) {
        const logicalDate = getLogicalDateStr(log.Timestamp);
        if (logicalDate < fromLogical || logicalDate > toLogical) continue;
        const key = `${log.UserID}|${logicalDate}`;
        let b = groups.get(key);
        if (!b) { b = emptyBucket(); groups.set(key, b); }
        addLogToBucket(b, log);
    }
    return groups;
}

// ── 大隊長：查詢單一隊員的每日定課明細（JSON 給 UI）─────────────────────────────
export interface MemberDailyDetail {
    logicalDate: string;
    bucket: DailyBucket;
}

export async function getMemberDailyDetails(
    callerUserId: string,
    targetUserId: string,
    startDate?: string | null,
    endDate?: string | null,
): Promise<{ success: boolean; member?: { userId: string; name: string; teamName: string | null }; days?: MemberDailyDetail[]; error?: string }> {
    try { await requireSelf(callerUserId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseActionKey);

    const scope = await getLeaderTeamScope(supabase, callerUserId);
    if (!scope) return { success: false, error: '僅限小隊長或大隊長使用' };

    // 確認目標隊員在 scope 內
    const { data: target, error: tErr } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, TeamName, SquadName')
        .eq('UserID', targetUserId)
        .maybeSingle();
    if (tErr) return { success: false, error: tErr.message };
    if (!target) return { success: false, error: '找不到該隊員' };
    if (scope.role === 'commandant') {
        if (target.SquadName !== scope.squadName) return { success: false, error: '無權查詢此隊員（非本大隊）' };
    } else {
        if (!target.TeamName || !scope.teamNames.includes(target.TeamName)) {
            return { success: false, error: '無權查詢此隊員（非本小隊）' };
        }
    }

    const SEASON_START = '2026-05-10';
    const todayLogical = getLogicalDateStr();
    const fromLogical = startDate || SEASON_START;
    const toLogical   = endDate   || todayLogical;
    const { startISO, endISO } = logicalRangeToIso(fromLogical, toLogical);

    const fetched = await fetchDailyLogsPaged(supabase, [targetUserId], startISO, endISO);
    if ('error' in fetched) return { success: false, error: fetched.error };

    const groups = bucketizeLogs(fetched.rows, fromLogical, toLogical);
    const days: MemberDailyDetail[] = Array.from(groups.entries())
        .map(([key, bucket]) => ({ logicalDate: key.split('|')[1], bucket }))
        .sort((a, b) => b.logicalDate.localeCompare(a.logicalDate)); // 最新在前

    return {
        success: true,
        member: { userId: target.UserID, name: target.Name, teamName: target.TeamName },
        days,
    };
}
