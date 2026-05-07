'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSelf, requireUser, authErrorResponse } from '@/lib/auth';
import { verifyAdminSession } from '@/app/actions/admin-auth';
import { processCheckInCore } from '@/lib/checkin-core';
import { logAdminAction } from '@/app/actions/admin';
import type { TempQuestApplication } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const ACTIVE_STATUSES = ['pending', 'squad_approved', 'approved'] as const;

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
        .select('IsCaptain, TeamName')
        .eq('UserID', captainId)
        .maybeSingle();

    if (!captain?.IsCaptain) return { success: false, apps: [], error: '僅限小隊長操作' };

    const { data, error } = await supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('team_name', captain.TeamName)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) return { success: false, apps: [], error: error.message };
    return { success: true, apps: (data ?? []) as TempQuestApplication[] };
}

// ── 小隊長：初審 ──────────────────────────────────────────────────────────────
export async function reviewTempQuestByCaptain(
    appId: string,
    captainId: string,
    approve: boolean,
    notes: string = '',
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(captainId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, Name')
        .eq('UserID', captainId)
        .maybeSingle();

    if (!captain?.IsCaptain) return { success: false, error: '僅限小隊長操作' };

    const { data: app } = await supabase
        .from('TempQuestApplications')
        .select('id, status, team_name')
        .eq('id', appId)
        .maybeSingle();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'pending') return { success: false, error: '此申請已不在待審狀態' };

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
    if (!isAdmin) {
        let callerId: string;
        try { callerId = await requireUser(); } catch { return { success: false, apps: [], error: '請先登入' }; }
        const { data: caller } = await supabase
            .from('CharacterStats').select('IsCommandant').eq('UserID', callerId).maybeSingle();
        if (!caller?.IsCommandant) return { success: false, apps: [], error: '無權限執行此操作' };
    }
    const { data, error } = await supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('status', 'squad_approved')
        .order('created_at', { ascending: true });

    if (error) return { success: false, apps: [], error: error.message };
    return { success: true, apps: (data ?? []) as TempQuestApplication[] };
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
    if (!isAdmin) {
        let callerId: string;
        try { callerId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }
        const { data: caller } = await supabase
            .from('CharacterStats').select('IsCommandant, Name').eq('UserID', callerId).maybeSingle();
        if (!caller?.IsCommandant) return { success: false, error: '無權限執行此操作' };
        if (reviewerName === 'admin') reviewerName = caller.Name ?? callerId;
    }

    const { data: app } = await supabase
        .from('TempQuestApplications')
        .select('*')
        .eq('id', appId)
        .maybeSingle();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'squad_approved') return { success: false, error: '此申請尚未通過小隊長初審' };

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
