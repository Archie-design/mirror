'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSelf } from '@/lib/auth';
import { verifyAdminSession } from '@/app/actions/admin-auth';
import { processCheckInCore } from '@/lib/checkin-core';
import { logAdminAction } from '@/app/actions/admin';
import { getSeasonWeekStart } from '@/lib/utils/time';
import { getCommandantTeamNames } from '@/lib/auth-scope';
import type { WeeklyPracticeApplication } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function db() {
    return createClient(supabaseUrl, supabaseKey);
}

// ── 學員：提交精進力申請 ──────────────────────────────────────────────────────
export async function submitWeeklyPractice(
    userId: string,
    questDate: string,          // YYYY-MM-DD
    screenshotUrl: string,
    note?: string,
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(userId); } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '請先登入';
        return { success: false, error: msg };
    }

    if (!screenshotUrl) return { success: false, error: '請上傳截圖佐證' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(questDate)) return { success: false, error: '日期格式錯誤' };

    const supabase = db();

    // 本人基本資料
    const { data: user } = await supabase
        .from('CharacterStats')
        .select('Name, TeamName')
        .eq('UserID', userId)
        .maybeSingle();
    if (!user) return { success: false, error: '找不到使用者' };

    // 週上限：同一使用者，本週（以 questDate 所在週）是否已有 pending/squad_approved/approved 申請
    const weekStart = getSeasonWeekStart(new Date(`${questDate}T12:00:00+08:00`));
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { data: existing } = await supabase
        .from('WeeklyPracticeApplications')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['pending', 'squad_approved', 'approved'])
        .gte('quest_date', weekStart.toISOString().slice(0, 10))
        .lt('quest_date', weekEnd.toISOString().slice(0, 10));
    if (existing && existing.length > 0) {
        return { success: false, error: '本週精進力已提交，每週限一次' };
    }

    // 也查 DailyLogs 防重複（已通過入帳的）
    const { count } = await supabase
        .from('DailyLogs')
        .select('id', { count: 'exact', head: true })
        .eq('UserID', userId)
        .like('QuestID', `wk5|%`)
        .gte('Timestamp', weekStart.toISOString())
        .lt('Timestamp', weekEnd.toISOString());
    if ((count ?? 0) > 0) return { success: false, error: '本週精進力已入帳，每週限一次' };

    const { error } = await supabase.from('WeeklyPracticeApplications').insert({
        quest_date: questDate,
        user_id: userId,
        user_name: user.Name,
        team_name: user.TeamName ?? null,
        screenshot_url: screenshotUrl,
        note: note?.trim() || null,
    });

    if (error) return { success: false, error: '提交失敗：' + error.message };
    return { success: true };
}

// ── 學員：取消自己的 pending 申請 ────────────────────────────────────────────
export async function cancelWeeklyPractice(
    userId: string,
    appId: string,
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(userId); } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : '請先登入' };
    }
    const supabase = db();
    const { error } = await supabase
        .from('WeeklyPracticeApplications')
        .delete()
        .eq('id', appId)
        .eq('user_id', userId)
        .eq('status', 'pending');
    if (error) return { success: false, error: '取消失敗：' + error.message };
    return { success: true };
}

// ── 學員：查自己的申請歷史 ────────────────────────────────────────────────────
export async function getMyWeeklyPracticeApps(
    userId: string,
): Promise<WeeklyPracticeApplication[]> {
    try { await requireSelf(userId); } catch { return []; }
    const supabase = db();
    const { data } = await supabase
        .from('WeeklyPracticeApplications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
    return (data ?? []) as WeeklyPracticeApplication[];
}

// ── 小隊長 / 大隊長：查待初審清單 ────────────────────────────────────────────
export async function listWeeklyPracticeForCaptain(
    captainId: string,
): Promise<{ success: boolean; apps?: WeeklyPracticeApplication[]; error?: string }> {
    try { await requireSelf(captainId); } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : '請先登入' };
    }
    const supabase = db();
    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('TeamName, IsCaptain, IsCommandant, Name')
        .eq('UserID', captainId)
        .maybeSingle();

    if (!captain?.IsCaptain && !captain?.IsCommandant) {
        return { success: false, error: '僅限小隊長或大隊長操作' };
    }

    let query = supabase
        .from('WeeklyPracticeApplications')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (captain.IsCommandant) {
        // 大隊長：自己送的申請（team_name = null，以 user_id 匹配）
        query = query.eq('user_id', captainId);
    } else {
        // 一般隊長：本小隊的申請
        if (!captain.TeamName) return { success: true, apps: [] };
        query = query.eq('team_name', captain.TeamName);
    }

    const { data } = await query;
    return { success: true, apps: (data ?? []) as WeeklyPracticeApplication[] };
}

// ── 小隊長 / 大隊長（自審）：初審 ────────────────────────────────────────────
export async function reviewWeeklyPracticeByCaptain(
    captainId: string,
    appId: string,
    approve: boolean,
    notes?: string,
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(captainId); } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : '請先登入' };
    }
    const supabase = db();
    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('TeamName, IsCaptain, IsCommandant, Name')
        .eq('UserID', captainId)
        .maybeSingle();

    if (!captain?.IsCaptain && !captain?.IsCommandant) {
        return { success: false, error: '僅限小隊長或大隊長操作' };
    }

    const { data: app } = await supabase
        .from('WeeklyPracticeApplications')
        .select('id, status, team_name, user_id')
        .eq('id', appId)
        .maybeSingle();
    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'pending') return { success: false, error: '此申請狀態不可初審' };

    if (captain.IsCommandant) {
        // 大隊長只能初審自己送的申請
        if (app.user_id !== captainId) return { success: false, error: '大隊長僅可自審本人申請' };
    } else {
        // 一般隊長只能審本小隊成員
        if (app.team_name !== captain.TeamName) return { success: false, error: '無權限審核非本小隊成員' };
    }

    const { error } = await supabase
        .from('WeeklyPracticeApplications')
        .update({
            status: approve ? 'squad_approved' : 'rejected',
            squad_review_by: captain.Name,
            squad_review_at: new Date().toISOString(),
            squad_review_notes: notes?.trim() || null,
        })
        .eq('id', appId);
    if (error) return { success: false, error: '審核失敗：' + error.message };
    return { success: true };
}

// ── 管理員：查待終審清單（squad_approved） ────────────────────────────────────
export async function listWeeklyPracticeForAdmin(): Promise<{
    success: boolean;
    apps?: WeeklyPracticeApplication[];
}> {
    if (!(await verifyAdminSession())) return { success: false };
    const supabase = db();
    const { data } = await supabase
        .from('WeeklyPracticeApplications')
        .select('*')
        .eq('status', 'squad_approved')
        .order('squad_review_at', { ascending: true });
    return { success: true, apps: (data ?? []) as WeeklyPracticeApplication[] };
}

// ── 管理員：終審 ─────────────────────────────────────────────────────────────
export async function reviewWeeklyPracticeByAdmin(
    appId: string,
    approve: boolean,
    reviewerName: string,
    notes?: string,
): Promise<{ success: boolean; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限' };
    const supabase = db();

    const { data: app } = await supabase
        .from('WeeklyPracticeApplications')
        .select('*')
        .eq('id', appId)
        .maybeSingle();
    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status !== 'squad_approved') return { success: false, error: '此申請不在待終審狀態' };

    const { error } = await supabase
        .from('WeeklyPracticeApplications')
        .update({
            status: approve ? 'approved' : 'rejected',
            final_review_by: reviewerName,
            final_review_at: new Date().toISOString(),
            final_review_notes: notes?.trim() || null,
        })
        .eq('id', appId);
    if (error) return { success: false, error: '審核失敗：' + error.message };

    if (approve) {
        const questId = `wk5|${app.quest_date}`;
        const r = await processCheckInCore(app.user_id, questId, '精進力', 2000);
        if (!r.success) {
            await logAdminAction('weekly_practice_approve', reviewerName, appId, app.user_name, {
                questDate: app.quest_date, checkinError: r.error,
            }, 'error');
            return { success: false, error: '入帳失敗：' + r.error };
        }
        await logAdminAction('weekly_practice_approve', reviewerName, appId, app.user_name, {
            questDate: app.quest_date,
        });
    } else {
        await logAdminAction('weekly_practice_reject', reviewerName, appId, app.user_name, {
            questDate: app.quest_date, notes: notes?.trim(),
        });
    }
    return { success: true };
}

// ── 大隊長：查待終審清單（所轄大隊 squad_approved + 本人 pending/squad_approved）─
export async function listWeeklyPracticeForCommandant(
    commandantId: string,
): Promise<{ success: boolean; apps?: WeeklyPracticeApplication[]; error?: string }> {
    try { await requireSelf(commandantId); } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : '請先登入' };
    }
    const supabase = db();

    const { data: commandant } = await supabase
        .from('CharacterStats')
        .select('IsCommandant')
        .eq('UserID', commandantId)
        .maybeSingle();
    if (!commandant?.IsCommandant) return { success: false, error: '僅限大隊長操作' };

    const scope = await getCommandantTeamNames(supabase, commandantId);
    if (!scope) return { success: false, error: '大隊長範圍不明（缺 SquadName）' };

    let query = supabase
        .from('WeeklyPracticeApplications')
        .select('*')
        .in('status', ['pending', 'squad_approved'])
        .order('squad_review_at', { ascending: true });

    if (scope.teamNames.length === 0) {
        // 大隊長沒有所轄小隊，只看自己送的
        query = query.eq('user_id', commandantId);
    } else {
        // 所轄小隊 + 自己送的（大隊長 team_name 多為 null）
        const teamList = scope.teamNames.map(n => `"${n.replace(/"/g, '""')}"`).join(',');
        query = query.or(`team_name.in.(${teamList}),user_id.eq.${commandantId}`);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    // pending 只保留大隊長本人（隊員的 pending 須由小隊長初審，不在此終審）
    const apps = ((data ?? []) as WeeklyPracticeApplication[])
        .filter(a => a.status === 'squad_approved' || a.user_id === commandantId);
    return { success: true, apps };
}

// ── 大隊長：終審所轄大隊（含自己）的精進力申請（不需 admin session） ──────────
export async function reviewWeeklyPracticeByCommandant(
    commandantId: string,
    appId: string,
    approve: boolean,
    notes?: string,
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(commandantId); } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : '請先登入' };
    }
    const supabase = db();

    const { data: commandant } = await supabase
        .from('CharacterStats')
        .select('IsCommandant, Name')
        .eq('UserID', commandantId)
        .maybeSingle();
    if (!commandant?.IsCommandant) return { success: false, error: '僅限大隊長操作' };

    const { data: app } = await supabase
        .from('WeeklyPracticeApplications')
        .select('*')
        .eq('id', appId)
        .maybeSingle();
    if (!app) return { success: false, error: '找不到申請記錄' };
    if (app.status === 'approved' || app.status === 'rejected') {
        return { success: false, error: '此申請已完成審核' };
    }

    // 範圍驗證：本人送的，或所轄大隊小隊成員
    const isSelf = app.user_id === commandantId;
    if (!isSelf) {
        const scope = await getCommandantTeamNames(supabase, commandantId);
        if (!scope || !scope.teamNames.includes(app.team_name ?? '')) {
            return { success: false, error: '無權限終審非本大隊申請' };
        }
    }

    const reviewerName = commandant.Name ?? commandantId;
    const { error } = await supabase
        .from('WeeklyPracticeApplications')
        .update({
            status: approve ? 'approved' : 'rejected',
            squad_review_by: app.squad_review_by ?? reviewerName,
            squad_review_at: app.squad_review_at ?? new Date().toISOString(),
            final_review_by: reviewerName,
            final_review_at: new Date().toISOString(),
            final_review_notes: notes?.trim() || null,
        })
        .eq('id', appId);
    if (error) return { success: false, error: '審核失敗：' + error.message };

    if (approve) {
        const questId = `wk5|${app.quest_date}`;
        const r = await processCheckInCore(app.user_id, questId, '精進力', 2000);
        if (!r.success) {
            await logAdminAction('weekly_practice_commandant_approve', reviewerName, appId, app.user_name, {
                questDate: app.quest_date, checkinError: r.error,
            }, 'error');
            return { success: false, error: '入帳失敗：' + r.error };
        }
        await logAdminAction('weekly_practice_commandant_approve', reviewerName, appId, app.user_name, {
            questDate: app.quest_date,
        });
    } else {
        await logAdminAction('weekly_practice_commandant_reject', reviewerName, appId, app.user_name, {
            questDate: app.quest_date, notes: notes?.trim(),
        });
    }
    return { success: true };
}
