'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getLogicalDateStr, getSeasonWeekStart, getLogicalNowAnchor } from '@/lib/utils/time';
import { requireSelf, authErrorResponse } from '@/lib/auth';
import { processCheckInCore } from '@/lib/checkin-core';

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// 用戶本人直接打卡（UI→server action）：以 session cookie 驗證呼叫者即 userId
// server-to-server 場景（審核者替他人入帳）請改用 `processCheckInCore`，
// 並在呼叫端自行驗證審核者身分（例如 requireSelf(reviewerId) + IsCaptain 檢查）。
export async function processCheckInTransaction(
    userId: string,
    questId: string,
    questTitle: string,
    questReward: number
) {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }
    return processCheckInCore(userId, questId, questTitle, questReward);
}

export async function undoCheckIn(userId: string, questId: string): Promise<{
    success: boolean;
    error?: string;
    rewardDeducted?: number;
    newScore?: number;
}> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = getServiceClient();
    const logicalTodayStr = getLogicalDateStr();

    const { data: targetLogs, error: fetchError } = await supabase
        .from('DailyLogs')
        .select('*')
        .eq('UserID', userId)
        .eq('QuestID', questId)
        .order('Timestamp', { ascending: false })
        .limit(1);

    if (fetchError || !targetLogs || targetLogs.length === 0)
        return { success: false, error: '找不到打卡記錄' };

    const log = targetLogs[0];

    // 週任務（wk 前綴）：允許回溯本賽季週內的記錄
    // 以邏輯日錨點計算賽季週起（中午前算前一天 + W1 8 天特例），與九宮格/客戶端一致
    const isWeeklyQuest = questId.startsWith('wk');
    if (isWeeklyQuest) {
        const weekStart = getSeasonWeekStart(getLogicalNowAnchor());
        if (new Date(log.Timestamp) < weekStart) {
            return { success: false, error: '因果已定，僅限回溯本週紀錄' };
        }
    } else {
        if (getLogicalDateStr(log.Timestamp) !== logicalTodayStr)
            return { success: false, error: '因果已定，僅限回溯今日紀錄' };
    }

    let rewardToDeduct: number = log.RewardPoints ?? 0;

    const { error: deleteError } = await supabase
        .from('DailyLogs').delete().eq('id', log.id);
    if (deleteError) return { success: false, error: deleteError.message };

    // 連動：撤銷 p1 時，同邏輯日的 p1_dawn 加成也要撤銷（前置不再成立）
    if (questId === 'p1') {
        const { data: dawnLogs } = await supabase
            .from('DailyLogs')
            .select('*')
            .eq('UserID', userId)
            .eq('QuestID', 'p1_dawn');
        const sameDayDawn = (dawnLogs ?? []).find(l => getLogicalDateStr(l.Timestamp) === logicalTodayStr);
        if (sameDayDawn) {
            await supabase.from('DailyLogs').delete().eq('id', sameDayDawn.id);
            rewardToDeduct += sameDayDawn.RewardPoints ?? 0;
        }
    }

    const { data: user, error: userError } = await supabase
        .from('CharacterStats').select('Score').eq('UserID', userId).single();
    if (userError || !user) return { success: false, error: '找不到用戶資料' };

    const newScore = Math.max(0, (user.Score ?? 0) - rewardToDeduct);
    const { error: updateError } = await supabase
        .from('CharacterStats').update({ Score: newScore }).eq('UserID', userId);
    if (updateError) return { success: false, error: updateError.message };

    return { success: true, rewardDeducted: rewardToDeduct, newScore };
}

export async function clearTodayLogs(userId: string) {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = getServiceClient();
    const logicalTodayStr = getLogicalDateStr();

    const { data, error } = await supabase.rpc('clear_today_logs', {
        p_user_id:       userId,
        p_logical_today: logicalTodayStr,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
}
