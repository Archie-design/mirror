'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getLogicalDateStr } from '@/lib/utils/time';
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
    if (getLogicalDateStr(log.Timestamp) !== logicalTodayStr)
        return { success: false, error: '因果已定，僅限回溯今日紀錄' };

    const rewardToDeduct: number = log.RewardPoints ?? 0;

    const { error: deleteError } = await supabase
        .from('DailyLogs').delete().eq('id', log.id);
    if (deleteError) return { success: false, error: deleteError.message };

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
