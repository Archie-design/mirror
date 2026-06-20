'use server';

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireSelf, requireUser, authErrorResponse } from '@/lib/auth';
import { verifyAdminSession } from '@/app/actions/admin-auth';
import { getCommandantTeamNames } from '@/lib/auth-scope';
import { processCheckInCore } from '@/lib/checkin-core';
import { getTaipeiDateStr, getLogicalDateStr, getSeasonWeekStart, getSeasonWeekEnd } from '@/lib/utils/time';
import { logAdminAction } from '@/app/actions/admin';
import {
    SYSTEM_HEAD_TEAM,
    SYSTEM_HEAD_GATHERING_REWARD,
    SYSTEM_HEAD_GATHERING_MIN_ATTENDEES,
} from '@/lib/constants';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 與本檔 createClient(supabaseUrl, supabaseKey) 一致的 client 型別（預設 public schema），供內部 helper 共用。
type SupabaseSrvClient = SupabaseClient;

// 凝聚獎勵計算（單一來源，避免三處重複）
//   一般小隊：base 3000 +（全到 +1000）+（大隊長到場 +1000）
//   體系長定聚：固定 4000（比照大隊長到場；不疊全到，多位大隊長/體系長仍只算一次）
//   ⚠️「全到」必須用「到場的小隊員數」(memberAttendeeCount，不含大隊長)比對在籍人數；
//      不可用總掃碼數，否則大隊長到場會把缺員的隊伍誤判為全到。
function computeGatheringReward(params: {
    teamName: string;
    memberAttendeeCount: number;
    memberCount: number;
    hasCommandant: boolean;
}): number {
    if (params.teamName === SYSTEM_HEAD_TEAM) return SYSTEM_HEAD_GATHERING_REWARD;
    let reward = 3000;
    if (params.memberCount > 0 && params.memberAttendeeCount >= params.memberCount) reward += 1000;
    if (params.hasCommandant) reward += 1000;
    return reward;
}

// 凝聚成立的最少出席人數：一般小隊 3 人；體系長定聚 5 人（含體系長本人）
function minAttendeesFor(teamName: string): number {
    return teamName === SYSTEM_HEAD_TEAM ? SYSTEM_HEAD_GATHERING_MIN_ATTENDEES : 3;
}

// 凝聚批次入帳（reviewGathering / adminBackfillGathering / retryGatheringPayout 共用）。
//   - 冪等（H3）：本場 wk3_offline|<sessionId> 已入帳的人自動跳過，故核准後可安全重跑補入 failedUsers。
//   - 週上限（M5）：以「凝聚日所屬賽季週」的 [weekStart, weekEnd) 雙界統計，避免只有下界把
//     後續週次入帳算進本週額度而誤 cap。
//   - process_checkin 對 wk3_offline 不去重不限額，故去重與封頂都在此呼叫端把關。
//   每人實得（封頂後）金額直接落在 DailyLogs.RewardPoints，作為日後回退的單一事實來源。
async function payoutGatheringAttendees(
    supabase: SupabaseSrvClient,
    sessionId: string,
    userIds: string[],
    reward: number,
    gatheringDateStr: string,
    gatheringTs: string,
): Promise<{ failedUsers: string[]; cappedUsers: { userId: string; granted: number }[] }> {
    const questId = `wk3_offline|${sessionId}`;
    const questTitle = '小組凝聚（實體）';
    const WEEKLY_CAP = 5000;
    const failedUsers: string[] = [];
    const cappedUsers: { userId: string; granted: number }[] = [];
    if (userIds.length === 0) return { failedUsers, cappedUsers };

    const gatheringAnchor = new Date(`${gatheringDateStr}T12:00:00+08:00`);
    const weekStart = getSeasonWeekStart(gatheringAnchor);
    const weekEnd = getSeasonWeekEnd(gatheringAnchor);

    // 本場已入帳者（H3 冪等）：重跑時跳過，只補沒入帳的人。
    const { data: alreadyPaid } = await supabase
        .from('DailyLogs')
        .select('UserID')
        .in('UserID', userIds)
        .eq('QuestID', questId);
    const paidSet = new Set((alreadyPaid ?? []).map((r: { UserID: string }) => r.UserID));

    // 本賽季週已累積（M5 雙界）。
    const { data: existingLogs } = await supabase
        .from('DailyLogs')
        .select('UserID, RewardPoints')
        .in('UserID', userIds)
        .like('QuestID', 'wk3_offline|%')
        .gte('Timestamp', weekStart.toISOString())
        .lt('Timestamp', weekEnd.toISOString());
    const weekTotalByUser = new Map<string, number>();
    for (const log of (existingLogs ?? []) as { UserID: string; RewardPoints: number | null }[]) {
        weekTotalByUser.set(log.UserID, (weekTotalByUser.get(log.UserID) ?? 0) + (log.RewardPoints ?? 0));
    }

    for (const uid of userIds) {
        if (paidSet.has(uid)) continue; // 本場已入帳，跳過（冪等）
        const already = weekTotalByUser.get(uid) ?? 0;
        const remaining = Math.max(0, WEEKLY_CAP - already);
        const grantReward = Math.min(reward, remaining);
        if (grantReward <= 0) {
            cappedUsers.push({ userId: uid, granted: 0 });
            continue;
        }
        const r = await processCheckInCore(uid, questId, questTitle, grantReward, gatheringTs);
        if (!r.success) failedUsers.push(uid);
        else if (grantReward < reward) cappedUsers.push({ userId: uid, granted: grantReward });
    }
    return { failedUsers, cappedUsers };
}

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
    gatheringTheme: string | null;
    createdAt: string;
    evidenceScreenshotUrl: string | null;
    backfilledByAdmin: string | null;
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
        gatheringTheme: (row.gathering_theme as string | null) ?? null,
        createdAt: row.created_at as string,
        evidenceScreenshotUrl: (row.evidence_screenshot_url as string | null) ?? null,
        backfilledByAdmin: (row.backfilled_by_admin as string | null) ?? null,
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
    theme?: string,
): Promise<{ success: boolean; error?: string; session?: SquadGatheringSession }> {
    if (!teamName || !/^\d{4}-\d{2}-\d{2}$/.test(gatheringDateISO)) {
        return { success: false, error: '輸入格式錯誤' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    let adminId: string;
    try { adminId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }

    // 允許大隊長（限本大隊）或管理員排定凝聚；體系長定聚由體系長本人或管理員排定
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        if (teamName === SYSTEM_HEAD_TEAM) {
            const { data: me } = await supabase
                .from('CharacterStats')
                .select('IsSystemHead')
                .eq('UserID', adminId)
                .maybeSingle();
            if (!me?.IsSystemHead) {
                return { success: false, error: '僅限體系長或管理員排定體系長定聚' };
            }
        } else {
            const scope = await getCommandantTeamNames(supabase, adminId);
            if (!scope) return { success: false, error: '僅限大隊長或管理員操作' };
            if (!scope.teamNames.includes(teamName)) {
                return { success: false, error: '無權限排定非本大隊小隊' };
            }
        }
    }

    // L1：同日同隊可能殘留已作廢場（cancelled/rejected）撞 UNIQUE(team_name, gathering_date)。
    // 排定前先查：若存在 active 場（scheduled/pending_review/approved）→ 報「已排定」；
    // 若僅存作廢場 → 先刪除它們，讓本次重排可成功。
    const { data: sameDay } = await supabase
        .from('SquadGatheringSessions')
        .select('id, status')
        .eq('team_name', teamName)
        .eq('gathering_date', gatheringDateISO);
    const ACTIVE = ['scheduled', 'pending_review', 'approved'];
    const sameDayRows = (sameDay ?? []) as { id: string; status: string }[];
    if (sameDayRows.some(s => ACTIVE.includes(s.status))) {
        return { success: false, error: '該小隊當日已排定凝聚' };
    }
    if (sameDayRows.length > 0) {
        // 僅作廢場（cancelled/rejected）：刪除以釋放 unique 名額
        await supabase
            .from('SquadGatheringSessions')
            .delete()
            .in('id', sameDayRows.map(s => s.id));
    }

    const { data, error } = await supabase
        .from('SquadGatheringSessions')
        .insert({
            team_name: teamName,
            gathering_date: gatheringDateISO,
            status: 'scheduled',
            scheduled_by: adminId,
            gathering_theme: theme || null,
        })
        .select('*')
        .single();

    if (error) {
        // 仍可能因併發撞 unique（極少數）：回報已排定
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
    const supabase = createClient(supabaseUrl, supabaseKey);
    let adminId: string;
    try { adminId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }

    // 允許大隊長（限本大隊）或管理員取消凝聚
    const isAdmin = await verifyAdminSession();
    let commandantScope: { squadName: string; teamNames: string[] } | null = null;
    if (!isAdmin) {
        commandantScope = await getCommandantTeamNames(supabase, adminId);
        if (!commandantScope) return { success: false, error: '僅限大隊長或管理員操作' };
    }

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('status, team_name, gathering_date')
        .eq('id', sessionId)
        .maybeSingle();

    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.status !== 'scheduled') return { success: false, error: '僅限尚未送審的凝聚可取消' };
    if (commandantScope && !commandantScope.teamNames.includes(session.team_name)) {
        return { success: false, error: '無權限取消非本大隊小隊的凝聚' };
    }

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

// ── 管理員 / 大隊長：取消「已核准」凝聚並回收已入帳分數（H1）────────────────
// approved 後若發現掃錯人/重複場/誤判，需乾淨回退：
//   以 DailyLogs（QuestID=wk3_offline|<sessionId>）每筆 RewardPoints 為「實得金額」單一事實來源，
//   逐人扣回 Score、刪該 logs，再把 session 設為 cancelled。
//   （不靠 approved_reward_per_person，因該值未反映週上限截斷，逐人實得才精確。）
export async function cancelApprovedGathering(
    sessionId: string,
): Promise<{ success: boolean; error?: string; reversedTotal?: number; affected?: number }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    let adminId: string;
    try { adminId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('status, team_name, gathering_date')
        .eq('id', sessionId)
        .maybeSingle();
    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.status !== 'approved') {
        return { success: false, error: '僅限已核准的凝聚可用此功能回退（未核准請用一般取消）' };
    }

    // 權限：管理員，或該小隊所屬大隊的大隊長
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        const scope = await getCommandantTeamNames(supabase, adminId);
        if (!scope) return { success: false, error: '僅限大隊長或管理員操作' };
        if (!scope.teamNames.includes(session.team_name)) {
            return { success: false, error: '無權限回退非本大隊小隊的凝聚' };
        }
    }

    // 反查本場實得金額（每人一筆，RewardPoints = 實得，已含週上限截斷）
    const questId = `wk3_offline|${sessionId}`;
    const { data: logs } = await supabase
        .from('DailyLogs')
        .select('id, UserID, RewardPoints')
        .eq('QuestID', questId);
    const payoutLogs = (logs ?? []) as { id: string; UserID: string; RewardPoints: number | null }[];

    // 逐人扣回 Score（max(0,…) 防負），再刪該 log
    let reversedTotal = 0;
    let affected = 0;
    for (const log of payoutLogs) {
        const pts = log.RewardPoints ?? 0;
        if (pts !== 0) {
            const { data: cur } = await supabase
                .from('CharacterStats').select('Score').eq('UserID', log.UserID).maybeSingle();
            const newScore = Math.max(0, ((cur as { Score: number } | null)?.Score ?? 0) - pts);
            await supabase.from('CharacterStats').update({ Score: newScore }).eq('UserID', log.UserID);
            reversedTotal += pts;
        }
        await supabase.from('DailyLogs').delete().eq('id', log.id);
        affected++;
    }

    // session 設為 cancelled
    const { error: upErr } = await supabase
        .from('SquadGatheringSessions')
        .update({ status: 'cancelled' })
        .eq('id', sessionId)
        .eq('status', 'approved');
    if (upErr) return { success: false, error: '回退分數已處理，但更新 session 狀態失敗：' + upErr.message };

    await logAdminAction('cancel_approved_gathering', adminId, sessionId, session.team_name, {
        gatheringDate: session.gathering_date, reversedTotal, affected,
    });

    return { success: true, reversedTotal, affected };
}

// ── 管理員 / 大隊長：重試已核准凝聚的入帳（H3）────────────────────────────────
// reviewGathering 入帳非交易，部分人失敗時 session 仍 approved、冪等鎖擋住重跑。
// 此 action 對 approved session 重跑 payout：本場已入帳者自動跳過，只補 failedUsers。
export async function retryGatheringPayout(
    sessionId: string,
): Promise<{ success: boolean; error?: string; failedUsers?: string[] }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    let adminId: string;
    try { adminId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('status, team_name, gathering_date, approved_reward_per_person')
        .eq('id', sessionId)
        .maybeSingle();
    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.status !== 'approved') {
        return { success: false, error: '僅限已核准的凝聚可重試入帳' };
    }

    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        const scope = await getCommandantTeamNames(supabase, adminId);
        if (!scope) return { success: false, error: '僅限大隊長或管理員操作' };
        if (!scope.teamNames.includes(session.team_name)) {
            return { success: false, error: '無權限操作非本大隊小隊的凝聚' };
        }
    }

    const { data: attRows } = await supabase
        .from('SquadGatheringAttendances')
        .select('user_id')
        .eq('session_id', sessionId);
    const userIds = (attRows ?? []).map((a: { user_id: string }) => a.user_id);
    const reward = (session.approved_reward_per_person as number | null) ?? 0;
    const gatheringDateStr = getTaipeiDateStr(new Date(session.gathering_date as string));
    const gatheringTs = `${gatheringDateStr}T12:00:00+08:00`;

    const { failedUsers, cappedUsers } = await payoutGatheringAttendees(
        supabase, sessionId, userIds, reward, gatheringDateStr, gatheringTs,
    );
    await logAdminAction('retry_squad_gathering_payout', adminId, sessionId, session.team_name, {
        gatheringDate: session.gathering_date, failedUsers, cappedUsers,
    }, failedUsers.length > 0 ? 'error' : 'success');

    return { success: true, failedUsers };
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

    if (!user?.TeamName) {
        // 大隊長可能沒有指定小隊，給空 context 讓 page 自行 fetch 特定 session
        if (!user?.IsCommandant) return { success: true, context: undefined };
        return { success: true, context: { session: null, attendees: [], teamMemberCount: 0, hasCheckedIn: false } };
    }

    // 取「該掃描/處理」的那一場。多筆排定時優先順序：
    //   1. 今天且 scheduled（學員今天要掃的）
    //   2. 今天的 pending_review（今天剛辦完、待審）
    //   3. 最接近今天的未來 scheduled（upcoming）
    //   4. 其他（舊）pending_review（過去卡著待審的，不可遮蔽未來場 → 降至此）
    //   5. 其他 scheduled（過去未完成，取最新）
    //   6. 最新一筆（approved/rejected/cancelled）
    // 註：M2 修法 — 舊版「任一 pending_review」無條件優先於未來 scheduled，
    //     會讓卡著的舊待審場遮蔽已排定的下一場。改為只有「今日」pending_review 優先。
    const { data: sessions } = await supabase
        .from('SquadGatheringSessions')
        .select('*')
        .eq('team_name', user.TeamName)
        .order('gathering_date', { ascending: false })
        .limit(30);

    const todayStr = getTaipeiDateStr();
    const list = sessions ?? [];
    // 正規化每場的台北日曆日（gathering_date 可能是純日期或時間戳）。
    const dateOf = (s: { gathering_date: string }) => getTaipeiDateStr(new Date(s.gathering_date as string));
    const upcoming = list
        .filter(s => s.status === 'scheduled' && dateOf(s) >= todayStr)
        .sort((a, b) => dateOf(a).localeCompare(dateOf(b)))[0];
    const sessionRow =
        list.find(s => s.status === 'scheduled' && dateOf(s) === todayStr)
        ?? list.find(s => s.status === 'pending_review' && dateOf(s) === todayStr)
        ?? upcoming
        ?? list.find(s => s.status === 'pending_review')
        ?? list.find(s => s.status === 'scheduled')
        ?? list[0]
        ?? null;

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

    const [{ data: attendeeRows }, { count: teamCount }] = await Promise.all([
        supabase
            .from('SquadGatheringAttendances')
            .select('user_id, user_name, is_commandant, scanned_at')
            .eq('session_id', sessionRow.id)
            .order('scanned_at', { ascending: true }),
        supabase
            .from('CharacterStats')
            .select('UserID', { count: 'exact', head: true })
            .eq('TeamName', user.TeamName),
    ]);

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
    // 報到開放狀態：scheduled（尚未送審）與 pending_review（送審後晚到者仍可補掃）。
    // approved / rejected / cancelled 一律不可再報到。
    if (session.status !== 'scheduled' && session.status !== 'pending_review') {
        return { success: false, error: '此凝聚已結束或被取消，無法再報到' };
    }

    // gathering_date 可能是純日期字串（'YYYY-MM-DD'）或完整時間戳（'...T16:00:00Z'，
    // production schema drift）。先正規化為台北日曆日。
    const sessionDateStr = getTaipeiDateStr(new Date(session.gathering_date as string));
    // M6：改用「邏輯日」（中午 12:00 切換）而非日曆日，讓跨午夜的凝聚到隔天中午前仍可補掃。
    // 凝聚日（純日期）的邏輯日即其自身；以「現在的邏輯日」比對。
    const logicalToday = getLogicalDateStr();
    if (sessionDateStr !== logicalToday) {
        return { success: false, error: `QR 僅限凝聚當日（${sessionDateStr}）有效` };
    }

    const { data: user } = await supabase
        .from('CharacterStats')
        .select('Name, TeamName, SquadName, IsCommandant, IsSystemHead')
        .eq('UserID', userId)
        .maybeSingle();

    if (!user) return { success: false, error: '找不到使用者' };

    const isMemberOfTeam = user.TeamName === session.team_name;
    const isCommandant = !!user.IsCommandant;
    const isSystemHead = !!user.IsSystemHead;
    const isSystemHeadSession = session.team_name === SYSTEM_HEAD_TEAM;

    // 權限放寬（僅限體系長情境，其餘維持嚴格小隊邊界）：
    //   - 體系長定聚（session 屬「體系長」隊）：任何已登入學員皆可掃（跨小隊集會）
    //   - 體系長本人：可掃任何 session（跨大隊）
    if (!isSystemHeadSession && !isSystemHead) {
        if (!isMemberOfTeam) {
            // 非本小隊成員：僅限大隊長，且必須與小隊隸屬同一大隊
            if (!isCommandant) {
                return { success: false, error: '僅限本小隊成員或大隊長可掃此 QR' };
            }
            const { data: teamMember } = await supabase
                .from('CharacterStats')
                .select('SquadName')
                .eq('TeamName', session.team_name)
                .not('SquadName', 'is', null)
                .limit(1)
                .maybeSingle();
            const teamBattalion = teamMember?.SquadName;
            if (!teamBattalion || teamBattalion !== user.SquadName) {
                return { success: false, error: '僅能掃本大隊所轄小隊的 QR' };
            }
        }
    }

    const { error } = await supabase
        .from('SquadGatheringAttendances')
        .upsert(
            {
                session_id: sessionId,
                user_id: userId,
                user_name: user.Name,
                // 體系長到場比照大隊長，觸發 +1000 加成（多位仍只算一次）
                is_commandant: isCommandant || isSystemHead,
            },
            { onConflict: 'session_id,user_id', ignoreDuplicates: true },
        );

    if (error) {
        if (error.code === '23505') return { success: true, alreadyCheckedIn: true };
        return { success: false, error: '報到失敗：' + error.message };
    }

    return { success: true };
}

// ── 依 sessionId 取單一凝聚 + 出席（service role 繞過 RLS）─────────────────────
// 用於 /squad-gathering/[sessionId] 頁面：大隊長/跨小隊掃碼時，client anon 受 RLS 擋，
// 改由此 server action 取資料。僅需登入即可檢視；實際報到權限由 scanGatheringQR 把關。
export async function getGatheringContextById(
    userId: string,
    sessionId: string,
): Promise<{ success: boolean; context?: TeamGatheringContext; error?: string }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: s } = await supabase
        .from('SquadGatheringSessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
    if (!s) return { success: false, error: '找不到此凝聚紀錄' };

    const { data: atRows } = await supabase
        .from('SquadGatheringAttendances')
        .select('user_id, user_name, is_commandant, scanned_at')
        .eq('session_id', sessionId)
        .order('scanned_at', { ascending: true });

    const attendees: SquadGatheringAttendee[] = (atRows ?? []).map(a => ({
        userId: a.user_id as string,
        userName: (a.user_name as string | null) ?? null,
        isCommandant: !!a.is_commandant,
        scannedAt: a.scanned_at as string,
    }));

    // 計算該小隊人數（全到加成顯示用）
    let teamMemberCount = 0;
    if (s.team_name) {
        const { count } = await supabase
            .from('CharacterStats')
            .select('UserID', { count: 'exact', head: true })
            .eq('TeamName', s.team_name);
        teamMemberCount = count ?? 0;
    }

    const context: TeamGatheringContext = {
        session: {
            id: s.id,
            teamName: s.team_name,
            gatheringDate: s.gathering_date,
            status: s.status,
            scheduledBy: s.scheduled_by ?? '',
            captainSubmittedAt: s.captain_submitted_at ?? null,
            captainSubmittedBy: s.captain_submitted_by ?? null,
            commandantReviewedAt: s.commandant_reviewed_at ?? null,
            approvedBy: s.approved_by ?? null,
            approvedRewardPerPerson: s.approved_reward_per_person ?? null,
            approvedMemberCount: s.approved_member_count ?? null,
            approvedAttendeeCount: s.approved_attendee_count ?? null,
            approvedHasCommandant: s.approved_has_commandant ?? null,
            notes: s.notes ?? null,
            gatheringTheme: s.gathering_theme ?? null,
            createdAt: s.created_at ?? '',
            evidenceScreenshotUrl: s.evidence_screenshot_url ?? null,
            backfilledByAdmin: s.backfilled_by_admin ?? null,
        },
        attendees,
        teamMemberCount,
        hasCheckedIn: attendees.some(a => a.userId === userId),
    };
    return { success: true, context };
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
        .select('TeamName, IsCaptain, IsSystemHead')
        .eq('UserID', captainId)
        .maybeSingle();

    if (!captain?.IsCaptain && !captain?.IsSystemHead) {
        return { success: false, error: '僅限小隊長或體系長送出審核' };
    }

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('id, team_name, status')
        .eq('id', sessionId)
        .maybeSingle();

    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    // 體系長只能送自己的體系長定聚；小隊長只能送本小隊
    const allowedTeam = captain.IsSystemHead && session.team_name === SYSTEM_HEAD_TEAM
        ? true
        : session.team_name === captain.TeamName;
    if (!allowedTeam) {
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

// ── 小隊長 / 體系長：列出本隊所有「排定中」場次（含出席人數）─────────────────
// 用於隊長端「待送審場次」清單：解決多場 scheduled 累積時、舊版 UI 只露一場、
// 且過了凝聚日就沒有送審鈕，導致掃完碼卻送不出去的問題。
export async function listTeamScheduledGatherings(
    callerId: string,
): Promise<{ success: boolean; sessions?: { id: string; gatheringDate: string; attendeeCount: number }[]; error?: string }> {
    try { await requireSelf(callerId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: caller } = await supabase
        .from('CharacterStats')
        .select('TeamName, IsCaptain, IsSystemHead')
        .eq('UserID', callerId)
        .maybeSingle();
    if (!caller?.IsCaptain && !caller?.IsSystemHead) {
        return { success: false, error: '僅限小隊長或體系長' };
    }
    if (!caller.TeamName) return { success: true, sessions: [] };

    const { data: rows } = await supabase
        .from('SquadGatheringSessions')
        .select('id, gathering_date')
        .eq('team_name', caller.TeamName)
        .eq('status', 'scheduled')
        .order('gathering_date', { ascending: true });
    const list = rows ?? [];
    if (list.length === 0) return { success: true, sessions: [] };

    const ids = list.map(s => s.id as string);
    const { data: atts } = await supabase
        .from('SquadGatheringAttendances')
        .select('session_id')
        .in('session_id', ids);
    const countBy = new Map<string, number>();
    for (const a of (atts ?? []) as { session_id: string }[]) {
        countBy.set(a.session_id, (countBy.get(a.session_id) ?? 0) + 1);
    }

    return {
        success: true,
        sessions: list.map(s => ({
            id: s.id as string,
            gatheringDate: s.gathering_date as string,
            attendeeCount: countBy.get(s.id as string) ?? 0,
        })),
    };
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
    const supabase = createClient(supabaseUrl, supabaseKey);
    const isAdmin = await verifyAdminSession();
    let teamScope: string[] | null = null;

    if (!isAdmin) {
        let callerId: string;
        try { callerId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }
        const scope = await getCommandantTeamNames(supabase, callerId);
        if (!scope) return { success: false, error: '無權限執行此操作' };
        teamScope = scope.teamNames;
    }

    let query = supabase
        .from('SquadGatheringSessions')
        .select('*')
        .eq('status', 'pending_review')
        .order('captain_submitted_at', { ascending: true });
    if (teamScope !== null) {
        if (teamScope.length === 0) return { success: true, items: [] };
        query = query.in('team_name', teamScope);
    }

    const { data: rows, error } = await query;

    if (error) return { success: false, error: error.message };

    const sessions = (rows ?? []).map(mapSession);
    if (sessions.length === 0) return { success: true, items: [] };

    const sessionIds = sessions.map(s => s.id);
    const teamNames = [...new Set(sessions.map(s => s.teamName))];

    // 一次抓所有 attendances + 所有相關隊員（避免逐筆 N+1）
    const [{ data: allAttRows }, { data: allMembers }] = await Promise.all([
        supabase
            .from('SquadGatheringAttendances')
            .select('session_id, user_id, user_name, is_commandant, scanned_at')
            .in('session_id', sessionIds)
            .order('scanned_at', { ascending: true }),
        supabase
            .from('CharacterStats')
            .select('UserID, TeamName')
            .in('TeamName', teamNames),
    ]);

    const attendeesBySession = new Map<string, SquadGatheringAttendee[]>();
    for (const row of allAttRows ?? []) {
        const sid = (row as { session_id: string }).session_id;
        const list = attendeesBySession.get(sid) ?? [];
        list.push(mapAttendee(row));
        attendeesBySession.set(sid, list);
    }

    const countByTeam = new Map<string, number>();
    for (const m of allMembers ?? []) {
        const tn = (m as { TeamName: string | null }).TeamName;
        if (!tn) continue;
        countByTeam.set(tn, (countByTeam.get(tn) ?? 0) + 1);
    }

    const items: PendingGatheringReview[] = sessions.map(session => {
        const attendees = attendeesBySession.get(session.id) ?? [];
        const teamCount = countByTeam.get(session.teamName) ?? 0;
        const hasCommandant = attendees.some(a => a.isCommandant);
        const reward = computeGatheringReward({
            teamName: session.teamName,
            memberAttendeeCount: attendees.filter(a => !a.isCommandant).length,
            memberCount: teamCount,
            hasCommandant,
        });
        return {
            session,
            attendees,
            teamMemberCount: teamCount,
            projectedReward: reward,
        };
    });

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

    const { data: session } = await supabase
        .from('SquadGatheringSessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

    if (!session) return { success: false, error: '找不到凝聚紀錄' };
    if (session.status !== 'pending_review') {
        return { success: false, error: '此凝聚不在待審狀態' };
    }

    // 授權：體系長定聚無所屬大隊長，改由管理員或體系長本人終審；
    //       一般小隊凝聚維持大隊長（限本大隊）終審。
    const isSystemHeadSession = session.team_name === SYSTEM_HEAD_TEAM;
    if (isSystemHeadSession) {
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            const { data: reviewer } = await supabase
                .from('CharacterStats')
                .select('IsSystemHead')
                .eq('UserID', reviewerId)
                .maybeSingle();
            if (!reviewer?.IsSystemHead) {
                return { success: false, error: '僅限管理員或體系長終審體系長定聚' };
            }
        }
    } else {
        const reviewerScope = await getCommandantTeamNames(supabase, reviewerId);
        if (!reviewerScope) return { success: false, error: '僅限大隊長終審' };
        if (!reviewerScope.teamNames.includes(session.team_name)) {
            return { success: false, error: '無權限審核非本大隊小隊的凝聚' };
        }
    }

    if (!approve) {
        // 退回 = 打回重來：狀態回到 scheduled，讓 QR 當日重新可掃、可重新送審
        //（清掉送審戳記）。notes 保留退回原因。避免舊版設 'rejected' 後 QR 永久失效、
        // 又無路徑復原的死鎖。
        const { error } = await supabase
            .from('SquadGatheringSessions')
            .update({
                status: 'scheduled',
                captain_submitted_at: null,
                captain_submitted_by: null,
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
    const minAttendees = minAttendeesFor(session.team_name);
    if (attendees.length < minAttendees) {
        const who = isSystemHeadSession ? '（含體系長本人）' : '（含大隊長）';
        return { success: false, error: `出席人數需至少 ${minAttendees} 人${who}，目前 ${attendees.length} 人` };
    }

    const { count: teamMemberCount } = await supabase
        .from('CharacterStats')
        .select('UserID', { count: 'exact', head: true })
        .eq('TeamName', session.team_name);

    const hasCommandant = attendees.some(a => a.is_commandant);
    const memberCount = teamMemberCount ?? 0;

    const reward = computeGatheringReward({
        teamName: session.team_name,
        memberAttendeeCount: attendees.filter(a => !a.is_commandant).length,
        memberCount,
        hasCommandant,
    });

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

    // 批次入帳（共用 helper：本場去重 + 週上限 cap + 落帳）。
    const gatheringDateStr = getTaipeiDateStr(new Date(session.gathering_date as string));
    const gatheringTs = `${gatheringDateStr}T12:00:00+08:00`;
    const userIds = attendees.map(a => a.user_id);
    const { failedUsers, cappedUsers } = await payoutGatheringAttendees(
        supabase, sessionId, userIds, reward, gatheringDateStr, gatheringTs,
    );

    await logAdminAction('approve_squad_gathering', reviewerId, sessionId, session.team_name, {
        gatheringDate: session.gathering_date,
        reward,
        memberCount,
        attendeeCount: attendees.length,
        hasCommandant,
        failedUsers,
        cappedUsers,  // 因每週 5000 上限被截分的學員（含被截為 0 的）
    }, failedUsers.length > 0 ? 'error' : 'success');

    return {
        success: true,
        rewardPerPerson: reward,
        attendeeCount: attendees.length,
    };
}

// ── 管理員 / 大隊長：列出所有已排定 / 進行中 sessions（給 CommandantTab 排期管理） ──
export async function listGatheringSessions(
    teamNameFilter?: string,
): Promise<{ success: boolean; error?: string; sessions?: SquadGatheringSession[] }> {
    let callerId: string;
    try { callerId = await requireUser(); } catch { return { success: false, error: '請先登入' }; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const isAdmin = await verifyAdminSession();
    let teamScope: string[] | null = null;
    if (!isAdmin) {
        const scope = await getCommandantTeamNames(supabase, callerId);
        if (!scope) return { success: false, error: '無權限執行此操作' };
        teamScope = scope.teamNames;
        if (teamNameFilter && !teamScope.includes(teamNameFilter)) {
            return { success: false, error: '無權限查詢該小隊' };
        }
    }

    let q = supabase
        .from('SquadGatheringSessions')
        .select('*')
        .order('gathering_date', { ascending: false })
        .limit(50);
    if (teamNameFilter) {
        q = q.eq('team_name', teamNameFilter);
    } else if (teamScope !== null) {
        if (teamScope.length === 0) return { success: true, sessions: [] };
        q = q.in('team_name', teamScope);
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    return { success: true, sessions: (data ?? []).map(mapSession) };
}

// =============================================================================
// 管理員補報實體凝聚（QR 沒成功 / 隊長忘了送審等補救路徑）
// 直接以 status=approved 入庫，需上傳截圖作佐證
// =============================================================================

const SEASON_START = '2026-05-10';  // 賽季開始日

export async function adminBackfillGathering(params: {
    teamName: string;
    gatheringDate: string;           // YYYY-MM-DD
    attendeeUserIds: string[];
    hasCommandant: boolean;
    evidenceScreenshotUrl: string;
    notes?: string;
}): Promise<{
    success: boolean;
    sessionId?: string;
    rewardPerPerson?: number;
    attendeeCount?: number;
    failedUsers?: string[];
    cappedUsers?: { userId: string; granted: number }[];
    error?: string;
}> {
    const { teamName, gatheringDate, attendeeUserIds, hasCommandant, evidenceScreenshotUrl, notes } = params;

    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    let adminId: string;
    try { adminId = await requireUser(); } catch { adminId = 'ADMIN'; }

    // 輸入驗證
    if (!teamName) return { success: false, error: '請選擇小隊' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gatheringDate)) return { success: false, error: '日期格式錯誤' };
    if (gatheringDate < SEASON_START) return { success: false, error: `日期不可早於賽季開始 ${SEASON_START}` };
    if (gatheringDate > getTaipeiDateStr()) return { success: false, error: '日期不可未來' };
    if (!attendeeUserIds || attendeeUserIds.length === 0) return { success: false, error: '至少需勾選一位出席隊員' };
    if (!evidenceScreenshotUrl) return { success: false, error: '請上傳截圖作為佐證' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 防止與既有 session 衝突（unique(team_name, gathering_date)）
    const { data: existing } = await supabase
        .from('SquadGatheringSessions')
        .select('id, status')
        .eq('team_name', teamName)
        .eq('gathering_date', gatheringDate)
        .maybeSingle();
    if (existing) {
        if (existing.status !== 'rejected') {
            return { success: false, error: `該小隊 ${gatheringDate} 已有凝聚紀錄（狀態：${existing.status}），請先刪除或選擇其他日期` };
        }
        // rejected 紀錄可以被補報覆蓋：先清除舊資料（不曾入帳，安全刪除）
        await supabase.from('SquadGatheringAttendances').delete().eq('session_id', (existing as { id: string }).id);
        await supabase.from('SquadGatheringSessions').delete().eq('id', (existing as { id: string }).id);
    }

    const isSystemHeadSession = teamName === SYSTEM_HEAD_TEAM;

    // 解析所有出席者資料（姓名 / 大隊長 / 體系長旗標）
    const { data: attendeeRows } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, IsCommandant, IsSystemHead')
        .in('UserID', attendeeUserIds);
    const attendeeInfo = new Map(
        (attendeeRows ?? []).map(r => [r.UserID as string, r as { UserID: string; Name: string | null; IsCommandant: boolean | null; IsSystemHead: boolean | null }])
    );

    // 驗證出席者歸屬：一般小隊限本隊成員或大隊長；體系長定聚跨小隊，不限成員
    if (!isSystemHeadSession) {
        const { data: teamMembers } = await supabase
            .from('CharacterStats')
            .select('UserID')
            .eq('TeamName', teamName);
        const memberIds = new Set((teamMembers ?? []).map(m => m.UserID as string));
        const outsideIds = attendeeUserIds.filter(id => !memberIds.has(id));
        if (outsideIds.length > 0) {
            const allCommandants = outsideIds.every(id => attendeeInfo.get(id)?.IsCommandant);
            if (!allCommandants) {
                return { success: false, error: '勾選了不屬於該小隊的成員' };
            }
        }
    }

    // 最少出席人數（體系長定聚需 5 人含本人）
    const minAttendees = minAttendeesFor(teamName);
    if (attendeeUserIds.length < minAttendees) {
        return { success: false, error: `出席人數需至少 ${minAttendees} 人` };
    }

    // 小隊人數（體系長定聚不適用全到，memberCount 取 0；helper 會固定回 4000）
    let memberCount = 0;
    if (!isSystemHeadSession) {
        const { count } = await supabase
            .from('CharacterStats')
            .select('UserID', { count: 'exact', head: true })
            .eq('TeamName', teamName);
        memberCount = count ?? 0;
    }

    // 全到只算「小隊員」(排除大隊長/體系長)
    const memberAttendeeCount = attendeeUserIds.filter(uid => {
        const info = attendeeInfo.get(uid);
        return !(info?.IsCommandant || info?.IsSystemHead);
    }).length;
    const reward = computeGatheringReward({
        teamName,
        memberAttendeeCount,
        memberCount,
        hasCommandant,
    });

    // 建立 session（status=approved）
    const nowIso = new Date().toISOString();
    const { data: sessionRow, error: sessErr } = await supabase
        .from('SquadGatheringSessions')
        .insert({
            team_name: teamName,
            gathering_date: gatheringDate,
            status: 'approved',
            scheduled_by: adminId,
            captain_submitted_by: adminId,
            captain_submitted_at: nowIso,
            commandant_reviewed_at: nowIso,
            approved_by: adminId,
            approved_reward_per_person: reward,
            approved_member_count: memberCount,
            approved_attendee_count: attendeeUserIds.length,
            approved_has_commandant: hasCommandant,
            notes: notes ?? null,
            evidence_screenshot_url: evidenceScreenshotUrl,
            backfilled_by_admin: adminId,
        })
        .select('id')
        .single();

    if (sessErr || !sessionRow) {
        return { success: false, error: '建立凝聚紀錄失敗：' + (sessErr?.message ?? 'unknown') };
    }
    const sessionId = sessionRow.id as string;

    // 寫入 attendances（大隊長 / 體系長依本人旗標標記，觸發 +1000 加成）
    const attendanceRows = attendeeUserIds.map(uid => {
        const info = attendeeInfo.get(uid);
        return {
            session_id: sessionId,
            user_id: uid,
            user_name: info?.Name ?? null,
            is_commandant: !!(info?.IsCommandant || info?.IsSystemHead),
            scanned_at: nowIso,
        };
    });
    const { error: attErr } = await supabase
        .from('SquadGatheringAttendances')
        .insert(attendanceRows);
    if (attErr) {
        // session 已建但 attendances 失敗 — 刪 session 回滾
        await supabase.from('SquadGatheringSessions').delete().eq('id', sessionId);
        return { success: false, error: '寫入出席紀錄失敗：' + attErr.message };
    }

    // 批次入帳（同 reviewGathering 規則，受每週 5000 cap）
    // 以「凝聚日」所在的賽季週為基準，補報不會佔錯週上限
    const gatheringTs = `${gatheringDate}T12:00:00+08:00`;
    const { failedUsers, cappedUsers } = await payoutGatheringAttendees(
        supabase, sessionId, attendeeUserIds, reward, gatheringDate, gatheringTs,
    );

    await logAdminAction(
        'backfill_squad_gathering',
        adminId,
        sessionId,
        teamName,
        {
            gatheringDate,
            attendeeCount: attendeeUserIds.length,
            memberCount,
            hasCommandant,
            reward,
            evidenceScreenshotUrl,
            notes: notes ?? null,
            failedUsers,
            cappedUsers,
        },
        failedUsers.length > 0 ? 'error' : 'success',
    );

    return {
        success: true,
        sessionId,
        rewardPerPerson: reward,
        attendeeCount: attendeeUserIds.length,
        failedUsers,
        cappedUsers,
    };
}

// ── 學員：撈自己參加過的所有實體凝聚（按日期降序）─────────────────────────
export type MyGatheringHistoryEntry = {
    sessionId: string;
    teamName: string;
    gatheringDate: string;
    rewardPerPerson: number | null;
    attendeeCount: number | null;
    memberCount: number | null;
    hasCommandant: boolean | null;
    evidenceScreenshotUrl: string | null;
    backfilled: boolean;   // 是否為 admin 補報
    notes: string | null;
};

export async function getMyGatheringHistory(
    userId: string,
): Promise<{ success: boolean; entries?: MyGatheringHistoryEntry[]; error?: string }> {
    try { await requireSelf(userId); } catch (e) {
        const r = authErrorResponse(e)!;
        return { success: false, error: r.error };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 取得這位學員所有出席的 session ids
    const { data: atts } = await supabase
        .from('SquadGatheringAttendances')
        .select('session_id')
        .eq('user_id', userId);
    const sessionIds = Array.from(new Set((atts ?? []).map(a => a.session_id as string)));
    if (sessionIds.length === 0) return { success: true, entries: [] };

    // 撈對應 sessions（僅 approved）
    const { data: sessions, error } = await supabase
        .from('SquadGatheringSessions')
        .select('*')
        .in('id', sessionIds)
        .eq('status', 'approved')
        .order('gathering_date', { ascending: false });
    if (error) return { success: false, error: error.message };

    const entries: MyGatheringHistoryEntry[] = (sessions ?? []).map(s => ({
        sessionId: s.id as string,
        teamName: s.team_name as string,
        gatheringDate: getTaipeiDateStr(new Date(s.gathering_date as string)),
        rewardPerPerson: (s.approved_reward_per_person as number | null) ?? null,
        attendeeCount: (s.approved_attendee_count as number | null) ?? null,
        memberCount: (s.approved_member_count as number | null) ?? null,
        hasCommandant: (s.approved_has_commandant as boolean | null) ?? null,
        evidenceScreenshotUrl: (s.evidence_screenshot_url as string | null) ?? null,
        backfilled: !!s.backfilled_by_admin,
        notes: (s.notes as string | null) ?? null,
    }));

    return { success: true, entries };
}
