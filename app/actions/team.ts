"use server";

import { createClient } from "@supabase/supabase-js";
import { DAILY_QUEST_CONFIG } from "@/lib/constants";
import { logAdminAction } from "@/app/actions/admin";
import { SquadMemberStats } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseActionKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const ALL_QUEST_IDS = DAILY_QUEST_CONFIG.map(q => q.id).filter(id => id.startsWith('q'));

function getCurrentWeekMondayStr(): string {
    // Always compute relative to Taiwan time (UTC+8) so the stored value
    // matches what page.tsx compares against on the client side.
    const nowTaiwan = new Date(Date.now() + 8 * 3600 * 1000);
    const day = nowTaiwan.getUTCDay() || 7; // 1=Mon … 7=Sun
    const monday = new Date(nowTaiwan);
    monday.setUTCDate(monday.getUTCDate() - (day - 1));
    return monday.toISOString().slice(0, 10);
}

/**
 * 劇組長手動抽選本週推薦通告
 * - 同一週只能抽一次
 * - 已抽過的不重複，全部抽完後重置循環
 */
export async function drawWeeklyQuestForSquad(squadName: string, captainUserId: string) {
    const supabase = createClient(supabaseUrl, supabaseActionKey);
    const weekMondayStr = getCurrentWeekMondayStr();

    // Get or create TeamSettings row (may be missing if squad was set up via roster import)
    let { data: ts } = await supabase
        .from('TeamSettings')
        .select('mandatory_quest_id, mandatory_quest_week, quest_draw_history')
        .eq('team_name', squadName)
        .maybeSingle();

    if (!ts) {
        const { data: inserted, error: insertErr } = await supabase
            .from('TeamSettings')
            .insert({ team_name: squadName, team_coins: 0 })
            .select('mandatory_quest_id, mandatory_quest_week, quest_draw_history')
            .single();
        if (insertErr) return { success: false, error: '劇組設定建立失敗：' + insertErr.message };
        ts = inserted;
    }

    if (!ts) return { success: false, error: '無法取得劇組設定' };
    if (ts.mandatory_quest_week === weekMondayStr) {
        return { success: false, error: `本週已抽選：${ts.mandatory_quest_id}` };
    }

    const history: string[] = ts.quest_draw_history || [];
    const remaining = ALL_QUEST_IDS.filter(id => !history.includes(id));
    const pool = remaining.length > 0 ? remaining : ALL_QUEST_IDS;
    const drawn = pool[Math.floor(Math.random() * pool.length)];
    const updatedHistory = remaining.length > 0 ? [...history, drawn] : [drawn];

    const { error: updateErr } = await supabase
        .from('TeamSettings')
        .update({
            mandatory_quest_id: drawn,
            mandatory_quest_week: weekMondayStr,
            quest_draw_history: updatedHistory,
        })
        .eq('team_name', squadName);

    if (updateErr) return { success: false, error: '更新失敗：' + updateErr.message };

    const questName = DAILY_QUEST_CONFIG.find(q => q.id === drawn)?.title || drawn;
    return { success: true, questId: drawn, questName, weekLabel: weekMondayStr, drawnBy: captainUserId };
}

/**
 * 管理員觸發：為本週尚未抽籤的所有劇組自動抽選推薦通告
 */
export async function autoDrawAllSquads() {
    const supabase = createClient(supabaseUrl, supabaseActionKey);
    const weekMondayStr = getCurrentWeekMondayStr();

    // Collect all distinct squad names from CharacterStats and ensure TeamSettings rows exist
    const { data: squadsInStats } = await supabase
        .from('CharacterStats')
        .select('TeamName')
        .not('TeamName', 'is', null);
    if (squadsInStats) {
        const distinctNames = [...new Set(squadsInStats.map((r: any) => r.TeamName).filter(Boolean))];
        for (const name of distinctNames) {
            const { data: exists } = await supabase
                .from('TeamSettings').select('team_name').eq('team_name', name).maybeSingle();
            if (!exists) {
                await supabase.from('TeamSettings').insert({ team_name: name, team_coins: 0 });
            }
        }
    }

    const { data: allTeams, error } = await supabase.from('TeamSettings').select('*');
    if (error || !allTeams) return { success: false, error: error?.message || '無法讀取劇組列表' };

    const drawn: { squadName: string; questId: string; questName: string }[] = [];

    for (const ts of allTeams) {
        if (ts.mandatory_quest_week === weekMondayStr) continue;

        const history: string[] = ts.quest_draw_history || [];
        const remaining = ALL_QUEST_IDS.filter(id => !history.includes(id));
        const pool = remaining.length > 0 ? remaining : ALL_QUEST_IDS;
        const questId = pool[Math.floor(Math.random() * pool.length)];
        const updatedHistory = remaining.length > 0 ? [...history, questId] : [questId];

        await supabase.from('TeamSettings').update({
            mandatory_quest_id: questId,
            mandatory_quest_week: weekMondayStr,
            quest_draw_history: updatedHistory,
        }).eq('team_name', ts.team_name);

        const questName = DAILY_QUEST_CONFIG.find(q => q.id === questId)?.title || questId;
        drawn.push({ squadName: ts.team_name, questId, questName });
    }

    if (drawn.length > 0) {
        await logAdminAction('auto_draw_quests', 'admin', undefined, undefined, {
            drawnCount: drawn.length,
            skippedCount: allTeams.length - drawn.length,
            weekLabel: weekMondayStr,
        });
    }

    return {
        success: true,
        drawnCount: drawn.length,
        skippedCount: allTeams.length - drawn.length,
        drawn,
    };
}


/**
 * 小隊長指派／移除小隊角色職稱
 * @param captainUserId  操作的小隊長 UserID（需確認是小隊長才呼叫）
 * @param targetUserId   被指派的成員 UserID
 * @param role           角色職稱字串，null 代表移除
 */
/**
 * 小隊長查看本隊成員狀態（含最近打卡日）
 */
export async function getSquadMembersStats(captainUserId: string): Promise<{ success: boolean; members?: SquadMemberStats[]; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseActionKey);

    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('TeamName')
        .eq('UserID', captainUserId)
        .maybeSingle();

    if (!captain?.TeamName) return { success: false, error: '找不到劇組資訊' };

    const { data: members, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Level, Exp, Streak, TeamName, IsCaptain')
        .eq('TeamName', captain.TeamName)
        .order('Exp', { ascending: false });

    if (error || !members) return { success: false, error: error?.message };

    const userIds = members.map((m: any) => m.UserID);
    const { data: logs } = await supabase
        .from('DailyLogs')
        .select('UserID, Timestamp')
        .in('UserID', userIds)
        .order('Timestamp', { ascending: false });

    const latestCheckIn: Record<string, string> = {};
    if (logs) {
        for (const log of logs as any[]) {
            if (!latestCheckIn[log.UserID]) {
                latestCheckIn[log.UserID] = (log.Timestamp as string).slice(0, 10);
            }
        }
    }

    const result: SquadMemberStats[] = (members as any[]).map(m => ({
        UserID: m.UserID,
        Name: m.Name,
        Level: m.Level,
        Exp: m.Exp,
        Streak: m.Streak || 0,
        TeamName: m.TeamName,
        IsCaptain: m.IsCaptain || false,
        lastCheckIn: latestCheckIn[m.UserID],
    }));

    return { success: true, members: result };
}

/**
 * 大隊長查看全大隊各小隊成員狀態，以 TeamName 分組
 */
export async function getBattalionMembersStats(commandantUserId: string): Promise<{ success: boolean; members?: Record<string, SquadMemberStats[]>; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseActionKey);

    const { data: commandant } = await supabase
        .from('CharacterStats')
        .select('SquadName')
        .eq('UserID', commandantUserId)
        .maybeSingle();

    if (!commandant?.SquadName) return { success: false, error: '找不到大隊資訊' };

    const { data: members, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Level, Exp, Streak, TeamName, SquadName, IsCaptain')
        .eq('SquadName', commandant.SquadName)
        .order('Exp', { ascending: false });

    if (error || !members) return { success: false, error: error?.message };

    const userIds = (members as any[]).map(m => m.UserID);
    const { data: logs } = await supabase
        .from('DailyLogs')
        .select('UserID, Timestamp')
        .in('UserID', userIds)
        .order('Timestamp', { ascending: false });

    const latestCheckIn: Record<string, string> = {};
    if (logs) {
        for (const log of logs as any[]) {
            if (!latestCheckIn[log.UserID]) {
                latestCheckIn[log.UserID] = (log.Timestamp as string).slice(0, 10);
            }
        }
    }

    const grouped: Record<string, SquadMemberStats[]> = {};
    for (const m of members as any[]) {
        const teamName = m.TeamName || '未編組';
        if (!grouped[teamName]) grouped[teamName] = [];
        grouped[teamName].push({
            UserID: m.UserID,
            Name: m.Name,
            Level: m.Level,
            Exp: m.Exp,
            Streak: m.Streak || 0,
            TeamName: m.TeamName,
            IsCaptain: m.IsCaptain || false,
            lastCheckIn: latestCheckIn[m.UserID],
        });
    }

    return { success: true, members: grouped };
}

export async function setSquadRole(captainUserId: string, targetUserId: string, role: string | null) {
    const supabase = createClient(supabaseUrl, supabaseActionKey);

    const { error } = await supabase
        .from('CharacterStats')
        .update({ SquadRole: role })
        .eq('UserID', targetUserId);

    if (error) return { success: false, error: error.message };

    await logAdminAction('set_squad_role', captainUserId, targetUserId, undefined, { role: role ?? null });
    return { success: true };
}
