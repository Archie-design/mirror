'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { BonusApplication } from '@/types';
import { processCheckInCore } from '@/lib/checkin-core';
import { logAdminAction } from '@/app/actions/admin';
import { requireSelf, authErrorResponse } from '@/lib/auth';
import { verifyAdminSession } from '@/app/actions/admin-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ── 一次性任務獎勵對照表（o1–o7）────────────────────────────────────────────
const BONUS_QUEST_CONFIG: Record<string, { reward: number; title: string }> = {
    o1:   { reward: 1000, title: '超越巔峰' },
    o2_1: { reward: 300,  title: '戲劇進修－生命數字' },
    o2_2: { reward: 300,  title: '戲劇進修－生命蛻變' },
    o2_3: { reward: 300,  title: '戲劇進修－複訓大堂課' },
    o2_4: { reward: 300,  title: '戲劇進修－告別負債&貧窮' },
    o3:   { reward: 500,  title: '聯誼會（1年）' },
    o4:   { reward: 1000, title: '聯誼會（2年）' },
    o5:   { reward: 500,  title: '報高階（訂金）' },
    o6:   { reward: 1000, title: '報高階（完款）' },
    o7:   { reward: 1000, title: '傳愛' },
};

// 戲劇進修類：一級審核（小隊長核准即最終，直接入帳）
const DRAMA_TRAINING_QUEST_IDS = new Set(['o2_1', 'o2_2', 'o2_3', 'o2_4']);

// ── 小隊長：初審────────────────────────────────────────────────────────────
// o2_1–o2_4 戲劇進修（一級審核）：初審通過直接入帳
// o1 / o3–o7（二級審核）：初審通過後進入大隊長終審佇列
export async function reviewBonusBySquadLeader(
    appId: string,
    reviewerId: string,
    approve: boolean,
    notes: string = ''
) {
    try { await requireSelf(reviewerId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: reviewer } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, TeamName, Name')
        .eq('UserID', reviewerId)
        .single();

    if (!reviewer?.IsCaptain) return { success: false, error: '僅限小隊長進行初審' };

    const { data: app } = await supabase
        .from('BonusApplications')
        .select('*')
        .eq('id', appId)
        .single();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'pending') return { success: false, error: '此申請已被審核，無法重複操作' };
    if (app.squad_name !== reviewer.TeamName) return { success: false, error: '只能審核本小隊的申請' };

    if (!approve) {
        const { error } = await supabase
            .from('BonusApplications')
            .update({
                status: 'rejected',
                squad_review_by: reviewerId,
                squad_review_at: new Date().toISOString(),
                squad_review_notes: notes,
            })
            .eq('id', appId);

        if (error) return { success: false, error: '審核更新失敗：' + error.message };
        return { success: true, newStatus: 'rejected' };
    }

    // 一級審核任務（戲劇進修）：小隊長核准即最終，直接入帳
    if (DRAMA_TRAINING_QUEST_IDS.has(app.quest_id)) {
        const bonusInfo = BONUS_QUEST_CONFIG[app.quest_id];

        const { error: updateErr } = await supabase
            .from('BonusApplications')
            .update({
                status: 'approved',
                squad_review_by: reviewerId,
                squad_review_at: new Date().toISOString(),
                squad_review_notes: notes,
                final_review_by: reviewer.Name,
                final_review_at: new Date().toISOString(),
            })
            .eq('id', appId);

        if (updateErr) return { success: false, error: '審核更新失敗：' + updateErr.message };

        const checkInRes = await processCheckInCore(
            app.user_id,
            app.quest_id,
            bonusInfo.title,
            bonusInfo.reward
        );

        if (!checkInRes.success) {
            await logAdminAction('drama_training_squad_approve', reviewer.Name, appId, app.user_name, {
                questId: app.quest_id,
                checkInError: checkInRes.error,
            }, 'error');
            return { success: true, warning: '審核已核准，但入帳失敗：' + checkInRes.error };
        }

        await logAdminAction('drama_training_squad_approve', reviewer.Name, appId, app.user_name, {
            questId: app.quest_id,
            reward: bonusInfo.reward,
        });

        return { success: true, newStatus: 'approved' };
    }

    // 二級審核任務（o1 / o3–o7）：進入大隊長終審佇列
    const { error } = await supabase
        .from('BonusApplications')
        .update({
            status: 'squad_approved',
            squad_review_by: reviewerId,
            squad_review_at: new Date().toISOString(),
            squad_review_notes: notes,
        })
        .eq('id', appId);

    if (error) return { success: false, error: '審核更新失敗：' + error.message };
    return { success: true, newStatus: 'squad_approved' };
}

// ── 大隊長：終審（o1 / o3–o7 二級審核任務）────────────────────────────────
export async function reviewBonusByAdmin(
    appId: string,
    action: 'approve' | 'reject',
    notes: string = '',
    reviewerName: string = 'admin'
) {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: app } = await supabase
        .from('BonusApplications')
        .select('*')
        .eq('id', appId)
        .single();

    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'squad_approved') return { success: false, error: '此申請尚未通過小隊長初審' };

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const { error: updateErr } = await supabase
        .from('BonusApplications')
        .update({
            status: newStatus,
            final_review_by: reviewerName,
            final_review_at: new Date().toISOString(),
            final_review_notes: notes,
        })
        .eq('id', appId);

    if (updateErr) return { success: false, error: '終審更新失敗：' + updateErr.message };

    if (action === 'approve') {
        const bonusInfo = BONUS_QUEST_CONFIG[app.quest_id];
        const reward = bonusInfo ? bonusInfo.reward : 1000;
        const rewardTitle = bonusInfo ? bonusInfo.title : '一次性任務獎勵';

        const checkInRes = await processCheckInCore(
            app.user_id,
            app.quest_id,
            rewardTitle,
            reward
        );
        if (!checkInRes.success) {
            await logAdminAction('bonus_final_approve', reviewerName, appId, app.user_name, {
                questId: app.quest_id,
                checkInError: checkInRes.error,
            }, 'error');
            return { success: true, warning: '審核已核准，但入帳失敗：' + checkInRes.error };
        }
        await logAdminAction('bonus_final_approve', reviewerName, appId, app.user_name, {
            questId: app.quest_id,
            reward,
        });
    } else {
        await logAdminAction('bonus_final_reject', reviewerName, appId, app.user_name, { notes });
    }

    return { success: true, newStatus };
}

// ── 學員：提交一次性任務申請 ──────────────────────────────────────────────────
const MULTI_SUBMIT_QUEST_IDS = new Set(['o5', 'o6', 'o7']);

export async function submitBonusApplication(
    userId: string,
    userName: string,
    squadName: string,
    battalionName: string,
    questId: string,
    interviewTarget: string,
    interviewDate: string,
    description?: string
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    if (new Date() > new Date('2026-07-02T00:00:00+08:00')) {
        return { success: false, error: '一次性任務已截止（2026-07-01）' };
    }
    if (!interviewTarget.trim()) return { success: false, error: '申請說明不可為空' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(interviewDate)) return { success: false, error: '日期格式錯誤，請填寫 YYYY-MM-DD' };
    if (!BONUS_QUEST_CONFIG[questId]) return { success: false, error: '無效的任務 ID' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!MULTI_SUBMIT_QUEST_IDS.has(questId)) {
        const { data: existing } = await supabase
            .from('BonusApplications')
            .select('id, status')
            .eq('user_id', userId)
            .eq('quest_id', questId)
            .in('status', ['pending', 'squad_approved', 'approved'])
            .maybeSingle();

        if (existing) {
            const statusLabel: Record<string, string> = {
                pending: '審核中',
                squad_approved: '初審通過',
                approved: '已核准',
            };
            return { success: false, error: `此任務已有申請記錄（${statusLabel[existing.status] ?? existing.status}）` };
        }
    }

    const { error } = await supabase.from('BonusApplications').insert({
        user_id: userId,
        user_name: userName,
        squad_name: squadName,
        battalion_name: battalionName,
        quest_id: questId,
        interview_target: interviewTarget.trim(),
        interview_date: interviewDate,
        description: description?.trim() || null,
        status: 'pending',
    });

    if (error) return { success: false, error: '提交失敗：' + error.message };
    return { success: true };
}

// ── 查詢申請列表 ─────────────────────────────────────────────────────────────
export async function getBonusApplications(filter: {
    userId?: string;
    squadName?: string;
    status?: string;
    questIdPrefix?: string; // e.g. 'o' to filter o-series only
} = {}) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    let query = supabase.from('BonusApplications').select('*').order('created_at', { ascending: false });

    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.squadName) query = query.eq('squad_name', filter.squadName);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.questIdPrefix) query = query.like('quest_id', `${filter.questIdPrefix}%`);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, applications: [] };
    return { success: true, applications: (data || []) as BonusApplication[] };
}

// ── 查詢管理操作日誌 ─────────────────────────────────────────────────────────
export async function getAdminActivityLog(limit = 50) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('AdminActivityLog')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) return { success: false, error: error.message, logs: [] };
    return { success: true, logs: data || [] };
}
