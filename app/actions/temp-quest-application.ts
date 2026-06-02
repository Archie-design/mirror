'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSelf, requireUser, authErrorResponse } from '@/lib/auth';
import { verifyAdminSession } from '@/app/actions/admin-auth';
import { getCommandantTeamNames } from '@/lib/auth-scope';
import { processCheckInCore } from '@/lib/checkin-core';
import { logAdminAction } from '@/app/actions/admin';
import type { TempQuestApplication } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const ACTIVE_STATUSES = ['pending', 'squad_approved', 'approved'] as const;

// 從 temporaryquests 批次取得 title，填入 apps 的 quest_title 欄位
async function attachQuestTitles(
    apps: TempQuestApplication[],
): Promise<TempQuestApplication[]> {
    if (apps.length === 0) return apps;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const ids = Array.from(new Set(apps.map(a => a.quest_id)));
    const { data } = await supabase.from('temporaryquests').select('id, title').in('id', ids);
    const titleMap = new Map<string, string>();
    for (const row of (data ?? []) as { id: string; title: string }[]) {
        titleMap.set(row.id, row.title);
    }
    return apps.map(a => ({ ...a, quest_title: titleMap.get(a.quest_id) ?? undefined }));
}

// ── 學員：提交申請 ────────────────────────────────────────────────────────────
export async function submitTempQuestApplication(
    userId: string,
    questId: string,
    questDate: string,
    screenshotUrl?: string,
    note?: string,
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 驗證任務存在、啟用中，且送出日期在有效範圍內
    const { data: quest } = await supabase
        .from('temporaryquests')
        .select('id, active, start_date, end_date')
        .eq('id', questId)
        .maybeSingle();
    if (!quest || !quest.active) return { success: false, error: '找不到此任務或任務已停用' };
    if (quest.start_date && questDate < (quest.start_date as string))
        return { success: false, error: `任務開放日期為 ${quest.start_date} 起` };
    if (quest.end_date && questDate > (quest.end_date as string))
        return { success: false, error: `任務已於 ${quest.end_date} 截止` };

    // 已有活躍申請（非 rejected）則不允許重複提交
    const { data: existing } = await supabase
        .from('TempQuestApplications')
        .select('id, status')
        .eq('user_id', userId)
        .eq('quest_id', questId)
        .in('status', ACTIVE_STATUSES)
        .maybeSingle();

    if (existing) {
        const labels: Record<string, string> = {
            pending: '審核中',
            squad_approved: '初審通過',
            approved: '已核准',
        };
        return { success: false, error: `此任務已有申請（${labels[existing.status] ?? existing.status}），請等待審核結果` };
    }

    // 取小隊名
    const { data: stats } = await supabase
        .from('CharacterStats')
        .select('TeamName, Name')
        .eq('UserID', userId)
        .maybeSingle();

    const { error } = await supabase.from('TempQuestApplications').insert({
        quest_id: questId,
        quest_date: questDate,
        user_id: userId,
        user_name: stats?.Name ?? userId,
        team_name: stats?.TeamName ?? null,
        screenshot_url: screenshotUrl ?? null,
        note: note?.trim() || null,
        status: 'pending',
    });

    if (error) return { success: false, error: '提交失敗：' + error.message };
    return { success: true };
}

// ── 學員：取消申請（僅限 pending）────────────────────────────────────────────
export async function cancelTempQuestApplication(
    userId: string,
    appId: string,
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: app } = await supabase
        .from('TempQuestApplications')
        .select('id, status, user_id')
        .eq('id', appId)
        .maybeSingle();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.user_id !== userId) return { success: false, error: '無權限操作此申請' };
    if (app.status !== 'pending') return { success: false, error: '僅限取消「審核中」的申請' };

    const { error } = await supabase
        .from('TempQuestApplications')
        .delete()
        .eq('id', appId);

    if (error) return { success: false, error: '取消失敗：' + error.message };
    return { success: true };
}

// ── 學員：取得本人所有申請 ────────────────────────────────────────────────────
export async function getMyTempQuestApplications(
    userId: string,
): Promise<TempQuestApplication[]> {
    try { await requireSelf(userId); } catch { return []; }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    return (data ?? []) as TempQuestApplication[];
}

// ── 小隊長：取得本隊待審申請 ─────────────────────────────────────────────────
export async function listTempQuestAppsForCaptain(
    captainId: string,
): Promise<{ success: boolean; apps: TempQuestApplication[]; error?: string }> {
    try { await requireSelf(captainId); } catch (e) {
        const r = authErrorResponse(e)!;
        return { success: false, apps: [], error: r.error };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, IsCommandant, TeamName')
        .eq('UserID', captainId)
        .maybeSingle();

    if (!captain?.IsCaptain && !captain?.IsCommandant) {
        return { success: false, apps: [], error: '僅限小隊長或大隊長操作' };
    }

    let query = supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (captain.IsCommandant) {
        // 大隊長：兜底初審該大隊所轄所有小隊 + 自己的申請（即使無 team_name）
        const scope = await getCommandantTeamNames(supabase, captainId);
        if (!scope) return { success: false, apps: [], error: '大隊長範圍不明（缺 SquadName）' };
        if (scope.teamNames.length === 0) {
            query = query.eq('user_id', captainId);  // 沒有所轄小隊也至少看自己的
        } else {
            // PostgREST or filter: team_name in (...) OR user_id = self
            const teamList = scope.teamNames.map(n => `"${n.replace(/"/g, '""')}"`).join(',');
            query = query.or(`team_name.in.(${teamList}),user_id.eq.${captainId}`);
        }
    } else {
        // 小隊長：限本小隊
        query = query.eq('team_name', captain.TeamName);
    }

    const { data, error } = await query;
    if (error) return { success: false, apps: [], error: error.message };
    const apps = await attachQuestTitles((data ?? []) as TempQuestApplication[]);
    return { success: true, apps };
}

// ── 小隊長：初審 ──────────────────────────────────────────────────────────────
export async function reviewTempQuestByCaptain(
    appId: string,
    captainId: string,
    approve: boolean,
    notes: string = '',
): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const isAdmin = await verifyAdminSession();

    let captain: { IsCaptain: boolean | null; IsCommandant: boolean | null; TeamName: string | null; Name: string | null } | null = null;
    if (!isAdmin) {
        try { await requireSelf(captainId); } catch (e) { return authErrorResponse(e)!; }

        const { data } = await supabase
            .from('CharacterStats')
            .select('IsCaptain, IsCommandant, TeamName, Name')
            .eq('UserID', captainId)
            .maybeSingle();
        captain = data;

        if (!captain?.IsCaptain && !captain?.IsCommandant) {
            return { success: false, error: '僅限小隊長或大隊長操作' };
        }
    }

    const { data: app } = await supabase
        .from('TempQuestApplications')
        .select('id, status, team_name, user_id')
        .eq('id', appId)
        .maybeSingle();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'pending') return { success: false, error: '此申請已不在待審狀態' };

    // 範圍驗證（admin 不受限；大隊長可審自己的申請）
    if (!isAdmin) {
        const isCommandantSelfReview = captain!.IsCommandant && app.user_id === captainId;
        if (!isCommandantSelfReview) {
            if (captain!.IsCommandant && !captain!.IsCaptain) {
                const scope = await getCommandantTeamNames(supabase, captainId);
                if (!scope || !scope.teamNames.includes(app.team_name ?? '')) {
                    return { success: false, error: '無權限審核非本大隊申請' };
                }
            } else if (captain!.IsCaptain && app.team_name !== captain!.TeamName) {
                return { success: false, error: '無權限審核非本小隊申請' };
            }
        }
    }

    const newStatus = approve ? 'squad_approved' : 'rejected';
    const { error } = await supabase
        .from('TempQuestApplications')
        .update({
            status: newStatus,
            squad_review_by: captainId,
            squad_review_at: new Date().toISOString(),
            squad_review_notes: notes.trim() || null,
        })
        .eq('id', appId);

    if (error) return { success: false, error: '審核更新失敗：' + error.message };
    return { success: true };
}

// ── 管理員 / 大隊長：取得所有初審通過待終審的申請 ────────────────────────────
export async function listTempQuestAppsForAdmin(): Promise<{
    success: boolean; apps: TempQuestApplication[]; error?: string;
}> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const isAdmin = await verifyAdminSession();
    let teamScope: string[] | null = null;
    let callerId: string | null = null;

    if (!isAdmin) {
        try { callerId = await requireUser(); } catch { return { success: false, apps: [], error: '請先登入' }; }
        const scope = await getCommandantTeamNames(supabase, callerId);
        if (!scope) return { success: false, apps: [], error: '無權限執行此操作' };
        teamScope = scope.teamNames;
    }

    let query = supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('status', 'squad_approved')
        .order('created_at', { ascending: true });
    if (teamScope !== null && callerId !== null) {
        // 大隊長：本大隊所轄小隊 + 自己送的（大隊長多數 TeamName=null，否則自送 squad_approved 會被 in() 排除）
        if (teamScope.length === 0) {
            query = query.eq('user_id', callerId);
        } else {
            const teamList = teamScope.map(n => `"${n.replace(/"/g, '""')}"`).join(',');
            query = query.or(`team_name.in.(${teamList}),user_id.eq.${callerId}`);
        }
    }

    const { data, error } = await query;
    if (error) return { success: false, apps: [], error: error.message };
    const apps = await attachQuestTitles((data ?? []) as TempQuestApplication[]);
    return { success: true, apps };
}

// ── 管理員 / 大隊長：終審（通過 → 入帳；駁回 → rejected）──────────────────
export async function reviewTempQuestByAdmin(
    appId: string,
    action: 'approve' | 'reject',
    notes: string = '',
    reviewerName: string = 'admin',
): Promise<{ success: boolean; warning?: string; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const isAdmin = await verifyAdminSession();
    let commandantId: string | null = null;
    if (!isAdmin) {
        try { commandantId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }
        const { data: caller } = await supabase
            .from('CharacterStats').select('IsCommandant, Name').eq('UserID', commandantId).maybeSingle();
        if (!caller?.IsCommandant) return { success: false, error: '無權限執行此操作' };
        if (reviewerName === 'admin') reviewerName = caller.Name ?? commandantId;
    }

    const { data: app } = await supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('id', appId)
        .maybeSingle();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'squad_approved') return { success: false, error: '此申請尚未通過小隊長初審' };

    // 大隊長範圍驗證：app.team_name 必須屬於該大隊長所轄大隊
    // 自送 bypass：大隊長 TeamName 多為 null，自送紀錄 team_name 也 null，特例放行
    if (!isAdmin && commandantId) {
        const isSelfReview = app.user_id === commandantId;
        if (!isSelfReview) {
            const scope = await getCommandantTeamNames(supabase, commandantId);
            if (!scope || !scope.teamNames.includes(app.team_name ?? '')) {
                return { success: false, error: '無權限審核非本大隊申請' };
            }
        }
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { error: updateErr } = await supabase
        .from('TempQuestApplications')
        .update({
            status: newStatus,
            final_review_by: reviewerName,
            final_review_at: new Date().toISOString(),
            final_review_notes: notes.trim() || null,
        })
        .eq('id', appId);

    if (updateErr) return { success: false, error: '終審更新失敗：' + updateErr.message };

    if (action === 'approve') {
        // 取得任務標題與分數
        const { data: quest } = await supabase
            .from('temporaryquests')
            .select('title, reward')
            .eq('id', app.quest_id)
            .maybeSingle();

        const title = quest?.title ?? '臨時加碼任務';
        const reward = quest?.reward ?? 0;

        // QuestID 格式與舊的打卡紀錄一致
        const checkInRes = await processCheckInCore(
            app.user_id,
            `${app.quest_id}|${app.quest_date}`,
            title,
            reward,
        );

        if (!checkInRes.success) {
            await logAdminAction('temp_quest_final_approve', reviewerName, appId, app.user_name, {
                questId: app.quest_id,
                checkInError: checkInRes.error,
            }, 'error');
            return { success: true, warning: '審核已核准，但入帳失敗：' + checkInRes.error };
        }

        await logAdminAction('temp_quest_final_approve', reviewerName, appId, app.user_name, {
            questId: app.quest_id,
            reward,
        });
    } else {
        await logAdminAction('temp_quest_final_reject', reviewerName, appId, app.user_name, { notes });
    }

    return { success: true };
}

// ── 管理員：列出秘密任務1全部申請 + 小隊統計 ──────────────────────────────────
export async function listAllAppsForMission1(): Promise<{
    success: boolean;
    apps: TempQuestApplication[];
    squadStats: { teamName: string; total: number; approved: number }[];
    error?: string;
}> {
    if (!(await verifyAdminSession())) {
        return { success: false, apps: [], squadStats: [], error: '無權限執行此操作' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('quest_id', 'temp_1779076958469')
        .order('created_at', { ascending: true });

    if (error) return { success: false, apps: [], squadStats: [], error: error.message };
    const apps = (data ?? []) as TempQuestApplication[];

    // 各小隊人數（排除大隊長）
    const { data: members } = await supabase
        .from('CharacterStats')
        .select('TeamName')
        .not('TeamName', 'is', null)
        .eq('IsCommandant', false);

    const totalByTeam = new Map<string, number>();
    for (const m of (members ?? []) as { TeamName: string }[]) {
        if (!m.TeamName) continue;
        totalByTeam.set(m.TeamName, (totalByTeam.get(m.TeamName) ?? 0) + 1);
    }

    const approvedByTeam = new Map<string, number>();
    for (const a of apps) {
        if (a.status === 'approved' && a.team_name) {
            approvedByTeam.set(a.team_name, (approvedByTeam.get(a.team_name) ?? 0) + 1);
        }
    }

    const squadStats = Array.from(totalByTeam.entries())
        .map(([teamName, total]) => ({
            teamName,
            total,
            approved: approvedByTeam.get(teamName) ?? 0,
        }))
        .sort((a, b) => b.approved / b.total - a.approved / a.total || a.teamName.localeCompare(b.teamName, 'zh-TW'));

    return { success: true, apps, squadStats };
}

// ── 管理員：列出全系統 pending 申請（admin 兜底初審用） ────────────────────────
export async function listPendingTempQuestsForAdmin(): Promise<{
    success: boolean; apps: TempQuestApplication[]; error?: string;
}> {
    if (!(await verifyAdminSession())) {
        return { success: false, apps: [], error: '無權限執行此操作' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) return { success: false, apps: [], error: error.message };
    const apps = await attachQuestTitles((data ?? []) as TempQuestApplication[]);
    return { success: true, apps };
}
