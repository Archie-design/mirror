"use server";

import 'server-only';
import { createClient } from "@supabase/supabase-js";
import { SquadMemberStats } from "@/types";
import { requireSelf, authErrorResponse } from "@/lib/auth";

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
            latestCheckIn[log.UserID] = log.Timestamp.slice(0, 10);
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
            latestCheckIn[log.UserID] = log.Timestamp.slice(0, 10);
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

