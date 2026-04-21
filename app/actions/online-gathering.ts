'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSelf, authErrorResponse } from '@/lib/auth';
import { processCheckInCore } from '@/lib/checkin-core';
import { getWeeklyMonday, getLogicalDateStr } from '@/lib/utils/time';
import { logAdminAction } from '@/app/actions/admin';

// wk3_online 小組凝聚（線上）一級審核流程
// DB: OnlineGatheringApplications（202604210002 migration）
// 規格：每週 1 次，+100 分，小隊長初審通過即直接入帳。

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const WK3_ONLINE_REWARD = 100;
const WK3_ONLINE_TITLE = '小組凝聚（線上）';

function getServiceClient() {
    return createClient(supabaseUrl, supabaseKey);
}

// 計算本週一的 YYYY-MM-DD（Asia/Taipei），用於 week_monday 欄位
function currentWeekMondayStr(): string {
    return getLogicalDateStr(getWeeklyMonday());
}

export type OnlineGatheringApp = {
    id: string;
    userId: string;
    userName: string | null;
    teamName: string;
    weekMonday: string;          // YYYY-MM-DD
    status: 'pending' | 'approved' | 'rejected';
    notes: string | null;
    squadReviewBy: string | null;
    squadReviewAt: string | null;
    squadReviewNotes: string | null;
    createdAt: string;
};

function mapRow(r: Record<string, unknown>): OnlineGatheringApp {
    const get = <T = unknown>(k: string) => r[k] as T;
    return {
        id: get<string>('id'),
        userId: get<string>('user_id'),
        userName: (get<string | null>('user_name')) ?? null,
        teamName: get<string>('team_name'),
        weekMonday: get<string>('week_monday'),
        status: get<'pending' | 'approved' | 'rejected'>('status'),
        notes: (get<string | null>('notes')) ?? null,
        squadReviewBy: (get<string | null>('squad_review_by')) ?? null,
        squadReviewAt: (get<string | null>('squad_review_at')) ?? null,
        squadReviewNotes: (get<string | null>('squad_review_notes')) ?? null,
        createdAt: get<string>('created_at'),
    };
}

// ── 學員：提交本週線上凝聚申請 ─────────────────────────────────────────────
export async function submitOnlineGathering(
    userId: string,
    notes?: string
): Promise<{ success: boolean; error?: string; app?: OnlineGatheringApp }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = getServiceClient();

    const { data: user } = await supabase
        .from('CharacterStats')
        .select('Name, TeamName')
        .eq('UserID', userId)
        .single();

    if (!user?.TeamName) return { success: false, error: '尚未設定小隊，無法提交申請' };

    const weekMonday = currentWeekMondayStr();

    // 檢查本週是否已有 pending / approved 記錄（unique index 會擋，但先給友善錯誤）
    const { data: existing } = await supabase
        .from('OnlineGatheringApplications')
        .select('id, status')
        .eq('user_id', userId)
        .eq('week_monday', weekMonday)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

    if (existing) {
        const label = existing.status === 'approved' ? '已核准' : '審核中';
        return { success: false, error: `本週已有申請（${label}）` };
    }

    const { data, error } = await supabase
        .from('OnlineGatheringApplications')
        .insert({
            user_id: userId,
            user_name: user.Name ?? null,
            team_name: user.TeamName,
            week_monday: weekMonday,
            status: 'pending',
            notes: notes?.trim() || null,
        })
        .select('*')
        .single();

    if (error) return { success: false, error: '提交失敗：' + error.message };
    return { success: true, app: mapRow(data) };
}

// ── 學員：查詢本週自己的申請狀態 ──────────────────────────────────────────
export async function getMyOnlineGatheringThisWeek(
    userId: string
): Promise<{ success: boolean; app?: OnlineGatheringApp | null; error?: string }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = getServiceClient();
    const weekMonday = currentWeekMondayStr();

    // 取本週最新一筆（可能是 rejected 後重送，所以取最新）
    const { data, error } = await supabase
        .from('OnlineGatheringApplications')
        .select('*')
        .eq('user_id', userId)
        .eq('week_monday', weekMonday)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, app: data ? mapRow(data) : null };
}

// ── 小隊長：查詢本隊待審申請 ──────────────────────────────────────────────
export async function listPendingOnlineGatheringsForCaptain(
    captainId: string
): Promise<{ success: boolean; apps?: OnlineGatheringApp[]; error?: string }> {
    try { await requireSelf(captainId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = getServiceClient();

    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, TeamName')
        .eq('UserID', captainId)
        .single();

    if (!captain?.IsCaptain) return { success: false, error: '僅限小隊長查看' };
    if (!captain.TeamName) return { success: true, apps: [] };

    const { data, error } = await supabase
        .from('OnlineGatheringApplications')
        .select('*')
        .eq('team_name', captain.TeamName)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, apps: (data || []).map(mapRow) };
}

// ── 小隊長：審核（通過 → 直接入帳；退回 → rejected）───────────────────────
export async function reviewOnlineGathering(
    reviewerId: string,
    appId: string,
    approve: boolean,
    notes: string = ''
): Promise<{ success: boolean; error?: string; warning?: string; newStatus?: string }> {
    try { await requireSelf(reviewerId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = getServiceClient();

    const { data: reviewer } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, TeamName, Name')
        .eq('UserID', reviewerId)
        .single();

    if (!reviewer?.IsCaptain) return { success: false, error: '僅限小隊長進行審核' };

    const { data: app } = await supabase
        .from('OnlineGatheringApplications')
        .select('*')
        .eq('id', appId)
        .single();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'pending') return { success: false, error: '此申請已被審核，無法重複操作' };
    if (app.team_name !== reviewer.TeamName) return { success: false, error: '只能審核本小隊的申請' };

    const reviewerName = reviewer.Name ?? reviewerId;
    const nowIso = new Date().toISOString();

    if (!approve) {
        const { error } = await supabase
            .from('OnlineGatheringApplications')
            .update({
                status: 'rejected',
                squad_review_by: reviewerId,
                squad_review_at: nowIso,
                squad_review_notes: notes || null,
            })
            .eq('id', appId)
            .eq('status', 'pending');

        if (error) return { success: false, error: '審核更新失敗：' + error.message };

        await logAdminAction('wk3_online_reject', reviewerName, appId, app.user_name, {
            weekMonday: app.week_monday,
            notes,
        });
        return { success: true, newStatus: 'rejected' };
    }

    // 核准：先更新狀態，再 processCheckInCore 入帳 +100
    const { error: updateErr } = await supabase
        .from('OnlineGatheringApplications')
        .update({
            status: 'approved',
            squad_review_by: reviewerId,
            squad_review_at: nowIso,
            squad_review_notes: notes || null,
        })
        .eq('id', appId)
        .eq('status', 'pending');

    if (updateErr) return { success: false, error: '審核更新失敗：' + updateErr.message };

    // QuestID 以 week_monday 綁定，避免同週重複入帳（配合 DailyLogs 天然 dedup）
    const questId = `wk3_online|${app.week_monday}`;
    const checkInRes = await processCheckInCore(
        app.user_id,
        questId,
        WK3_ONLINE_TITLE,
        WK3_ONLINE_REWARD
    );

    if (!checkInRes.success) {
        await logAdminAction('wk3_online_approve', reviewerName, appId, app.user_name, {
            weekMonday: app.week_monday,
            checkInError: checkInRes.error,
        }, 'error');
        return { success: true, warning: '審核已核准，但入帳失敗：' + checkInRes.error };
    }

    await logAdminAction('wk3_online_approve', reviewerName, appId, app.user_name, {
        weekMonday: app.week_monday,
        reward: WK3_ONLINE_REWARD,
    });

    return { success: true, newStatus: 'approved' };
}
