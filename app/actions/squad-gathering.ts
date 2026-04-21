'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSelf, requireUser, authErrorResponse } from '@/lib/auth';
import { verifyAdminSession } from '@/app/actions/admin-auth';
import { processCheckInCore } from '@/lib/checkin-core';
import { getLogicalDateStr } from '@/lib/utils/time';
import { logAdminAction } from '@/app/actions/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export type GatheringCheckin = {
    userId: string;
    userName: string | null;
    checkedInAt: string;
};

export type GatheringStatus = {
    gatheringId: string;
    checkins: GatheringCheckin[];
    allMemberCount: number;
    isComplete: boolean;
};

// ── 成員掃碼報到 ──────────────────────────────────────────────────────────
export async function checkInToGathering(
    gatheringId: string,
    userId: string,
    userName: string
): Promise<{ success: boolean; error?: string; alreadyCheckedIn?: boolean }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
        .from('SquadGatheringCheckins')
        .upsert(
            { gathering_id: gatheringId, user_id: userId, user_name: userName },
            { onConflict: 'gathering_id,user_id', ignoreDuplicates: true }
        );

    if (error) {
        // 已報到（unique constraint）視為成功
        if (error.code === '23505') return { success: true, alreadyCheckedIn: true };
        return { success: false, error: '報到失敗：' + error.message };
    }
    return { success: true };
}

// ── 查詢某場定聚的到場狀況 ───────────────────────────────────────────────
export async function getGatheringStatus(
    gatheringId: string,
    allMemberCount: number
): Promise<{ success: boolean; status?: GatheringStatus; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .from('SquadGatheringCheckins')
        .select('user_id, user_name, checked_in_at')
        .eq('gathering_id', gatheringId)
        .order('checked_in_at', { ascending: true });

    if (error) return { success: false, error: error.message };

    const checkins: GatheringCheckin[] = (data || []).map(r => ({
        userId: r.user_id,
        userName: r.user_name,
        checkedInAt: r.checked_in_at,
    }));

    return {
        success: true,
        status: {
            gatheringId,
            checkins,
            allMemberCount,
            isComplete: checkins.length >= allMemberCount,
        },
    };
}

// ── 查詢用戶個人的報到紀錄（供掃碼落地頁確認）────────────────────────────
export async function getUserGatheringCheckin(
    gatheringId: string,
    userId: string
): Promise<{ checkedIn: boolean }> {
    try { await requireSelf(userId); } catch { return { checkedIn: false }; }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
        .from('SquadGatheringCheckins')
        .select('id')
        .eq('gathering_id', gatheringId)
        .eq('user_id', userId)
        .maybeSingle();
    return { checkedIn: !!data };
}

// =============================================================================
// wk3_offline 小組凝聚（實體）二級審核 + QR 掃碼流程
// DB: SquadGatheringSessions / SquadGatheringAttendances（202604210001 migration）
// =============================================================================

export type SquadGatheringSession = {
    id: string;
    teamName: string;
    gatheringDate: string;           // YYYY-MM-DD
    status: 'scheduled' | 'pending_review' | 'approved' | 'rejected' | 'cancelled';
    scheduledBy: string;
    captainSubmittedAt: string | null;
    captainSubmittedBy: string | null;
    commandantReviewedAt: string | null;
    approvedBy: string | null;
    approvedRewardPerPerson: number | null;
    approvedMemberCount: number | null;
    approvedAttendeeCount: number | null;
    approvedHasCommandant: boolean | null;
    notes: string | null;
    createdAt: string;
};

export type SquadGatheringAttendee = {
    userId: string;
    userName: string | null;
    isCommandant: boolean;
    scannedAt: string;
};

export type TeamGatheringContext = {
    session: SquadGatheringSession | null;
    attendees: SquadGatheringAttendee[];
    teamMemberCount: number;
    hasCheckedIn: boolean;
};

function mapSession(row: Record<string, unknown>): SquadGatheringSession {
    return {
        id: row.id as string,
        teamName: row.team_name as string,
        gatheringDate: row.gathering_date as string,
        status: row.status as SquadGatheringSession['status'],
        scheduledBy: row.scheduled_by as string,
        captainSubmittedAt: (row.captain_submitted_at as string | null) ?? null,
        captainSubmittedBy: (row.captain_submitted_by as string | null) ?? null,
        commandantReviewedAt: (row.commandant_reviewed_at as string | null) ?? null,
        approvedBy: (row.approved_by as string | null) ?? null,
        approvedRewardPerPerson: (row.approved_reward_per_person as number | null) ?? null,
        approvedMemberCount: (row.approved_member_count as number | null) ?? null,
        approvedAttendeeCount: (row.approved_attendee_count as number | null) ?? null,
        approvedHasCommandant: (row.approved_has_commandant as boolean | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        createdAt: row.created_at as string,
    };
}

function mapAttendee(row: Record<string, unknown>): SquadGatheringAttendee {
    return {
        userId: row.user_id as string,
        userName: (row.user_name as string | null) ?? null,
        isCommandant: !!row.is_commandant,
        scannedAt: row.scanned_at as string,
    };
}

// ── 管理員：安排某小隊某日為實體凝聚日 ────────────────────────────────────
export async function scheduleSquadGathering(
    teamName: string,
    gatheringDateISO: string,  // YYYY-MM-DD
): Promise<{ success: boolean; error?: string; session?: SquadGatheringSession }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    if (!teamName || !/^\d{4}-\d{2}-\d{2}$/.test(gatheringDateISO)) {
        return { success: false, error: '輸入格式錯誤' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const adminId = await requireUser();

    const { data, error } = await supabase
        .from('SquadGatheringSessions')
        .insert({
            team_name: teamName,
            gathering_date: gatheringDateISO,
            status: 'scheduled',
            scheduled_by: adminId,
        })
        .select('*')
        .single();

    if (error) {
        if (error.code === '23505') return { success: false, error: '該小隊當日已排定凝聚' };
        return { success: false, error: '排定失敗：' + error.message };
    }

    await logAdminAction('schedule_squad_gathering', adminId, teamName, teamName, {
        gatheringDate: gatheringDateISO,
        sessionId: data.id,
    });

    return { success: true, session: mapSession(data) };
}

// ── 管理員：取消尚未進入審核的凝聚 ────────────────────────────────────────
export async function cancelSquadGathering(
    sessionId: string,
): Promise<{ success: boolean; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(supabaseUrl, supabaseKey);
    const adminId = await requireUser();

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('status, team_name, gathering_date')
        .eq('id', sessionId)
        .maybeSingle();

    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.status !== 'scheduled') return { success: false, error: '僅限尚未送審的凝聚可取消' };

    const { error } = await supabase
        .from('SquadGatheringSessions')
        .update({ status: 'cancelled' })
        .eq('id', sessionId);

    if (error) return { success: false, error: '取消失敗：' + error.message };

    await logAdminAction('cancel_squad_gathering', adminId, sessionId, session.team_name, {
        gatheringDate: session.gathering_date,
    });

    return { success: true };
}

// ── 成員 / 小隊長 / 大隊長共用：取得本隊本週最近一筆凝聚情境 ───────────────
export async function getTeamGatheringContext(
    userId: string,
): Promise<{ success: boolean; context?: TeamGatheringContext; error?: string }> {
    try { await requireSelf(userId); } catch (e) {
        const r = authErrorResponse(e)!;
        return { success: false, error: r.error };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: user } = await supabase
        .from('CharacterStats')
        .select('TeamName, IsCommandant')
        .eq('UserID', userId)
        .maybeSingle();

    if (!user?.TeamName) return { success: true, context: undefined };

    // 取最近一場（尚未 approved/rejected/cancelled 優先；其次最新一筆）
    const { data: sessions } = await supabase
        .from('SquadGatheringSessions')
        .select('*')
        .eq('team_name', user.TeamName)
        .order('gathering_date', { ascending: false })
        .limit(5);

    const active = (sessions ?? []).find(s => s.status === 'scheduled' || s.status === 'pending_review');
    const sessionRow = active ?? (sessions && sessions[0]) ?? null;

    if (!sessionRow) {
        const { count: teamCount } = await supabase
            .from('CharacterStats')
            .select('UserID', { count: 'exact', head: true })
            .eq('TeamName', user.TeamName);
        return {
            success: true,
            context: { session: null, attendees: [], teamMemberCount: teamCount ?? 0, hasCheckedIn: false },
        };
    }

    const { data: attendeeRows } = await supabase
        .from('SquadGatheringAttendances')
        .select('user_id, user_name, is_commandant, scanned_at')
        .eq('session_id', sessionRow.id)
        .order('scanned_at', { ascending: true });

    const { count: teamCount } = await supabase
        .from('CharacterStats')
        .select('UserID', { count: 'exact', head: true })
        .eq('TeamName', user.TeamName);

    const attendees = (attendeeRows ?? []).map(mapAttendee);

    return {
        success: true,
        context: {
            session: mapSession(sessionRow),
            attendees,
            teamMemberCount: teamCount ?? 0,
            hasCheckedIn: attendees.some(a => a.userId === userId),
        },
    };
}

// ── 隊員 / 大隊長：掃 QR 報到 ─────────────────────────────────────────────
export async function scanGatheringQR(
    userId: string,
    sessionId: string,
): Promise<{ success: boolean; error?: string; alreadyCheckedIn?: boolean }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('id, team_name, gathering_date, status')
        .eq('id', sessionId)
        .maybeSingle();

    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.status !== 'scheduled') {
        return { success: false, error: '此凝聚已結束或被取消，無法再報到' };
    }

    const logicalToday = getLogicalDateStr();
    if (session.gathering_date !== logicalToday) {
        return { success: false, error: `QR 僅限凝聚當日（${session.gathering_date}）有效` };
    }

    const { data: user } = await supabase
        .from('CharacterStats')
        .select('Name, TeamName, IsCommandant')
        .eq('UserID', userId)
        .maybeSingle();

    if (!user) return { success: false, error: '找不到使用者' };

    const isCommandant = !!user.IsCommandant;
    if (!isCommandant && user.TeamName !== session.team_name) {
        return { success: false, error: '僅限本小隊成員或大隊長可掃此 QR' };
    }

    const { error } = await supabase
        .from('SquadGatheringAttendances')
        .upsert(
            {
                session_id: sessionId,
                user_id: userId,
                user_name: user.Name,
                is_commandant: isCommandant,
            },
            { onConflict: 'session_id,user_id', ignoreDuplicates: true },
        );

    if (error) {
        if (error.code === '23505') return { success: true, alreadyCheckedIn: true };
        return { success: false, error: '報到失敗：' + error.message };
    }

    return { success: true };
}

// ── 小隊長：送出初審 ─────────────────────────────────────────────────────
export async function submitGatheringForReview(
    captainId: string,
    sessionId: string,
): Promise<{ success: boolean; error?: string }> {
    try { await requireSelf(captainId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('TeamName, IsCaptain')
        .eq('UserID', captainId)
        .maybeSingle();

    if (!captain?.IsCaptain) return { success: false, error: '僅限小隊長送出審核' };

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('id, team_name, status')
        .eq('id', sessionId)
        .maybeSingle();

    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.team_name !== captain.TeamName) {
        return { success: false, error: '只能送出本小隊的凝聚審核' };
    }
    if (session.status !== 'scheduled') {
        return { success: false, error: '僅限排定中的凝聚可送審' };
    }

    const { count: attendeeCount } = await supabase
        .from('SquadGatheringAttendances')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId);

    if (!attendeeCount || attendeeCount === 0) {
        return { success: false, error: '尚無人掃碼，無法送審' };
    }

    const { error } = await supabase
        .from('SquadGatheringSessions')
        .update({
            status: 'pending_review',
            captain_submitted_at: new Date().toISOString(),
            captain_submitted_by: captainId,
        })
        .eq('id', sessionId)
        .eq('status', 'scheduled');

    if (error) return { success: false, error: '送審失敗：' + error.message };

    return { success: true };
}

// ── 大隊長：列出待審凝聚（含出席資訊） ────────────────────────────────────
export type PendingGatheringReview = {
    session: SquadGatheringSession;
    attendees: SquadGatheringAttendee[];
    teamMemberCount: number;
    projectedReward: number;
};

export async function listPendingGatherings(): Promise<{
    success: boolean; error?: string; items?: PendingGatheringReview[];
}> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: rows, error } = await supabase
        .from('SquadGatheringSessions')
        .select('*')
        .eq('status', 'pending_review')
        .order('captain_submitted_at', { ascending: true });

    if (error) return { success: false, error: error.message };

    const items: PendingGatheringReview[] = [];
    for (const r of rows ?? []) {
        const session = mapSession(r);
        const { data: attRows } = await supabase
            .from('SquadGatheringAttendances')
            .select('user_id, user_name, is_commandant, scanned_at')
            .eq('session_id', session.id)
            .order('scanned_at', { ascending: true });
        const { count: teamCount } = await supabase
            .from('CharacterStats')
            .select('UserID', { count: 'exact', head: true })
            .eq('TeamName', session.teamName);
        const attendees = (attRows ?? []).map(mapAttendee);
        const hasCommandant = attendees.some(a => a.isCommandant);
        let reward = 300;
        if (teamCount && attendees.length >= teamCount) reward += 100;
        if (hasCommandant) reward += 100;
        items.push({
            session,
            attendees,
            teamMemberCount: teamCount ?? 0,
            projectedReward: reward,
        });
    }
    return { success: true, items };
}

// ── 大隊長：終審凝聚並批次入帳 ────────────────────────────────────────────
export async function reviewGathering(
    reviewerId: string,
    sessionId: string,
    approve: boolean,
    notes?: string,
): Promise<{
    success: boolean;
    error?: string;
    rewardPerPerson?: number;
    attendeeCount?: number;
}> {
    try { await requireSelf(reviewerId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: reviewer } = await supabase
        .from('CharacterStats')
        .select('IsCommandant')
        .eq('UserID', reviewerId)
        .maybeSingle();
    if (!reviewer?.IsCommandant) return { success: false, error: '僅限大隊長終審' };

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.status !== 'pending_review') {
        return { success: false, error: '此凝聚不在待審狀態' };
    }

    if (!approve) {
        const { error } = await supabase
            .from('SquadGatheringSessions')
            .update({
                status: 'rejected',
                commandant_reviewed_at: new Date().toISOString(),
                approved_by: reviewerId,
                notes: notes ?? null,
            })
            .eq('id', sessionId)
            .eq('status', 'pending_review');
        if (error) return { success: false, error: '退回失敗：' + error.message };
        await logAdminAction('reject_squad_gathering', reviewerId, sessionId, session.team_name, {
            gatheringDate: session.gathering_date, notes,
        });
        return { success: true };
    }

    const { data: attRows } = await supabase
        .from('SquadGatheringAttendances')
        .select('user_id, user_name, is_commandant')
        .eq('session_id', sessionId);

    const attendees = (attRows ?? []);
    if (attendees.length === 0) return { success: false, error: '此凝聚無出席紀錄，無法核准' };

    const { count: teamMemberCount } = await supabase
        .from('CharacterStats')
        .select('UserID', { count: 'exact', head: true })
        .eq('TeamName', session.team_name);

    const hasCommandant = attendees.some(a => a.is_commandant);
    const memberCount = teamMemberCount ?? 0;

    let reward = 300;
    if (memberCount > 0 && attendees.length >= memberCount) reward += 100;
    if (hasCommandant) reward += 100;

    // 先鎖定 session 狀態為 approved（冪等保護：若 update 0 rows 代表已被他人處理）
    const { data: locked, error: lockErr } = await supabase
        .from('SquadGatheringSessions')
        .update({
            status: 'approved',
            commandant_reviewed_at: new Date().toISOString(),
            approved_by: reviewerId,
            approved_reward_per_person: reward,
            approved_member_count: memberCount,
            approved_attendee_count: attendees.length,
            approved_has_commandant: hasCommandant,
            notes: notes ?? null,
        })
        .eq('id', sessionId)
        .eq('status', 'pending_review')
        .select('id')
        .maybeSingle();

    if (lockErr || !locked) {
        return { success: false, error: '核准失敗（此凝聚可能已被處理）' };
    }

    // 批次入帳：QuestID = wk3_offline|<sessionId>
    const questId = `wk3_offline|${sessionId}`;
    const questTitle = '小組凝聚（實體）';
    const failedUsers: string[] = [];
    for (const a of attendees) {
        const r = await processCheckInCore(a.user_id, questId, questTitle, reward);
        if (!r.success) failedUsers.push(a.user_id);
    }

    await logAdminAction('approve_squad_gathering', reviewerId, sessionId, session.team_name, {
        gatheringDate: session.gathering_date,
        reward,
        memberCount,
        attendeeCount: attendees.length,
        hasCommandant,
        failedUsers,
    }, failedUsers.length > 0 ? 'error' : 'success');

    return {
        success: true,
        rewardPerPerson: reward,
        attendeeCount: attendees.length,
    };
}

// ── 管理員：列出所有已排定 / 進行中 sessions（給 CommandantTab 排期管理） ──
export async function listGatheringSessions(
    teamNameFilter?: string,
): Promise<{ success: boolean; error?: string; sessions?: SquadGatheringSession[] }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    let q = supabase
        .from('SquadGatheringSessions')
        .select('*')
        .order('gathering_date', { ascending: false })
        .limit(50);
    if (teamNameFilter) q = q.eq('team_name', teamNameFilter);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    return { success: true, sessions: (data ?? []).map(mapSession) };
}
