"use server";

import { createClient } from "@supabase/supabase-js";
import { DAILY_QUEST_CONFIG } from "@/lib/constants";
import { logAdminAction } from "@/app/actions/admin";

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
 * 小隊長手動抽選本週推薦定課
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
        if (insertErr) return { success: false, error: '小隊設定建立失敗：' + insertErr.message };
        ts = inserted;
    }

    if (!ts) return { success: false, error: '無法取得小隊設定' };
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
 * 管理員觸發：為本週尚未抽籤的所有小隊自動抽選推薦定課
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
    if (error || !allTeams) return { success: false, error: error?.message || '無法讀取小隊列表' };

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
 * 實現「骰子捐贈」功能
 * 允許同團隊或同小隊成員互相贈送能源骰子
 */
export async function donateDice(fromUserId: string, toUserId: string, amount: number) {
    const supabase = createClient(supabaseUrl, supabaseActionKey);

    if (amount <= 0) throw new Error("無效的捐贈數量");

    // 1. 讀取捐贈者與受贈者資料
    const { data: donor, error: donorErr } = await supabase
        .from('CharacterStats')
        .select('*')
        .eq('UserID', fromUserId)
        .single();
    if (donorErr || !donor) throw new Error("捐贈者資料讀取失敗");

    const { data: recipient, error: recErr } = await supabase
        .from('CharacterStats')
        .select('*')
        .eq('UserID', toUserId)
        .single();
    if (recErr || !recipient) throw new Error("受贈者資料讀取失敗");

    // 2. 驗證條件
    if ((donor.EnergyDice || 0) < amount) throw new Error("能源骰子不足，無法完成捐贈。");
    if (donor.TeamName !== recipient.TeamName) throw new Error("只能捐贈給同單位的夥伴。");
    if (fromUserId === toUserId) throw new Error("不能捐贈給自己。");

    // 3. 執行捐贈 (透過 RPC 確保原子性)
    // SQL 應包含: 
    // UPDATE "CharacterStats" SET "EnergyDice" = "EnergyDice" - p_amount WHERE "UserID" = p_from_user;
    // UPDATE "CharacterStats" SET "EnergyDice" = "EnergyDice" + p_amount WHERE "UserID" = p_to_user;
    const { error: rpcErr } = await supabase.rpc('transfer_dice', {
        p_from_user: fromUserId,
        p_to_user: toUserId,
        p_amount: amount
    });

    if (rpcErr) throw new Error("捐贈過程發生錯誤：" + rpcErr.message);

    return { 
        success: true, 
        message: `成功捐贈 ${amount} 個能源骰子給 ${recipient.Nickname || recipient.UserID}！` 
    };
}

/**
 * 實現「金骰子捐贈」功能
 */
export async function donateGoldenDice(fromUserId: string, toUserId: string, amount: number) {
    const supabase = createClient(supabaseUrl, supabaseActionKey);

    if (amount <= 0) throw new Error("無效的捐贈數量");

    const { data: donor, error: donorErr } = await supabase
        .from('CharacterStats')
        .select('*')
        .eq('UserID', fromUserId)
        .single();
    if (donorErr || !donor) throw new Error("捐贈者資料讀取失敗");

    const { data: recipient, error: recErr } = await supabase
        .from('CharacterStats')
        .select('*')
        .eq('UserID', toUserId)
        .single();
    if (recErr || !recipient) throw new Error("受贈者資料讀取失敗");

    if ((donor.GoldenDice || 0) < amount) throw new Error("黃金骰子不足，無法完成捐贈。");
    if (donor.TeamName !== recipient.TeamName) throw new Error("只能捐贈給同單位的夥伴。");
    if (fromUserId === toUserId) throw new Error("不能捐贈給自己。");

    // 執行捐贈
    const { error: rpcErr } = await supabase.rpc('transfer_golden_dice', {
        p_from_user: fromUserId,
        p_to_user: toUserId,
        p_amount: amount
    });

    if (rpcErr) throw new Error("捐贈過程發生錯誤：" + rpcErr.message);

    return { 
        success: true, 
        message: `成功將 ${amount} 枚黃金骰子贈與 ${recipient.Nickname || recipient.UserID}！` 
    };
}
