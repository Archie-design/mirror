'use server';

import { connectDb } from '@/lib/db';
import { getLogicalDateStr } from '@/lib/utils/time';
import { ROLE_CURE_MAP, ROLE_GROWTH_RATES, calculateLevelFromExp } from '@/lib/constants';

// We import ROLE_CURE_MAP directly from constants now
export async function processCheckInTransaction(
    userId: string,
    questId: string,
    questTitle: string,
    questReward: number,
    questDice: number = 0
) {
    const client = await connectDb();

    try {
        await client.query('BEGIN');

        // 1. Lock the user's CharacterStats row (排他鎖)
        const statsRes = await client.query(
            `SELECT * FROM "CharacterStats" WHERE "UserID" = $1 FOR UPDATE`,
            [userId]
        );

        if (statsRes.rowCount === 0) {
            throw new Error(`查無此用戶: ${userId}`);
        }

        const userData = statsRes.rows[0];
        const logicalTodayStr = getLogicalDateStr();

        // 2. Fetch daily logs to verify daily cap (only for 'q' quests)
        if (questId.startsWith('q')) {
            const logsRes = await client.query(
                `SELECT COUNT(*) as count FROM "DailyLogs"
         WHERE "UserID" = $1 AND "QuestID" LIKE 'q%' AND "Timestamp"::text LIKE $2`,
                [userId, `${logicalTodayStr}%`]
            );
            const dailyCount = parseInt(logsRes.rows[0].count, 10);
            if (dailyCount >= 3) {
                throw new Error("今日修為已達 3 項定課上限。");
            }
        }

        // 3. Prevent duplicate check-in for the same quest today/week
        if (questId.startsWith('q')) {
            // q1 與 q1_dawn 互斥：同一天只能有其一
            const q1Variants = (questId === 'q1' || questId === 'q1_dawn')
                ? ['q1', 'q1_dawn']
                : [questId];

            const placeholders = q1Variants.map((_, i) => `$${i + 2}`).join(', ');
            const dupCheck = await client.query(
                `SELECT COUNT(*) as count FROM "DailyLogs" WHERE "UserID" = $1 AND "QuestID" IN (${placeholders}) AND "Timestamp"::text LIKE $${q1Variants.length + 2}`,
                [userId, ...q1Variants, `${logicalTodayStr}%`]
            );
            if (parseInt(dupCheck.rows[0].count, 10) > 0) {
                throw new Error(
                    questId === 'q1_dawn'
                        ? "今日已完成打拳，無法重複記錄。"
                        : "此定課今日已完成。"
                );
            }
        }

        // 4. Determine bonus properties based on character role
        const roleInfo = ROLE_CURE_MAP[userData.Role];
        const isCure = roleInfo?.cureTaskId === questId;
        const finalQuestTitle = isCure ? `${questTitle} (天命對治)` : questTitle;

        const baseReward = questReward;
        let expMultiplier = 1;

        const myInventory = typeof userData.Inventory === 'string' ? JSON.parse(userData.Inventory) : (userData.Inventory || []);
        let teamInventory: string[] = [];

        if (userData.TeamName) {
            const tsRes = await client.query(`SELECT inventory FROM "TeamSettings" WHERE "team_name" = $1`, [userData.TeamName]);
            if (tsRes.rowCount && tsRes.rowCount > 0) {
                const tsData = tsRes.rows[0];
                teamInventory = typeof tsData.inventory === 'string' ? JSON.parse(tsData.inventory) : (tsData.inventory || []);
            }
        }

        // a1: 如意金箍棒 — 個人總經驗 ×1.2
        if (myInventory.includes('a1')) expMultiplier *= 1.2;

        // a5: 金剛杖 — 個人總經驗 ×1.2（不可與 a1 疊加）
        if (myInventory.includes('a5') && !myInventory.includes('a1')) expMultiplier *= 1.2;

        // a3: 七彩袈裟 — 全隊打拳（q1 / q1_dawn）×1.5
        if (teamInventory.includes('a3') && (questId === 'q1' || questId === 'q1_dawn')) expMultiplier *= 1.5;

        // a4: 幌金繩 — 體系活動（t 開頭）×1.5
        if (teamInventory.includes('a4') && questId.startsWith('t')) expMultiplier *= 1.5;

        let finalQuestReward = Math.ceil(baseReward * expMultiplier);

        // a2: 照妖鏡 — 破曉打拳額外 +150 修為（個人持有，q1_dawn 專用）
        if (myInventory.includes('a2') && questId === 'q1_dawn') {
            finalQuestReward += 150;
        }

        const currentExp = parseInt(String(userData.Exp), 10) || 0;
        const currentLevel = parseInt(String(userData.Level), 10) || 1;
        const currentCoins = parseInt(String(userData.Coins), 10) || 0;
        const currentEnergyDice = parseInt(String(userData.EnergyDice), 10) || 0;

        const newExp = currentExp + finalQuestReward;
        const newLevel = calculateLevelFromExp(newExp);
        const levelDelta = newLevel - currentLevel;

        let gainedCoins = Math.floor(finalQuestReward * 0.1);

        const newCoins = currentCoins + gainedCoins;

        let bonusDice = 0;
        let goldenDiceGain = 0;

        // --- 額外能量骰子獲取與機制 (Bonus Dice Systems) ---
        // 1. 每週加分項目骰子
        // 小天使通話與家人互動（社交骰子)
        if (questTitle.includes('小天使通話') || questTitle.includes('與家人互動') || questTitle.includes('親證圓夢')) {
            bonusDice += 1;
        }
        // 參加心成活動（活躍骰子）
        if (questTitle.includes('心成') || questTitle.includes('同學會') || questTitle.includes('定聚')) {
            bonusDice += 2;
        }
        // 無上限的傳愛分數（奇蹟骰子）
        if (questTitle.includes('傳愛')) {
            bonusDice += 1; // Assuming we add it to normal energy dice for now
        }
        // 參與「大會主題活動」的黃金骰子
        if (questTitle.includes('主題親證') || questTitle.includes('會長交接') || questTitle.includes('大會')) {
            goldenDiceGain += 1;
        }

        const newEnergyDice = currentEnergyDice + questDice + bonusDice;

        let updateQuery = `
      UPDATE "CharacterStats" 
      SET 
        "Exp" = $1, 
        "Level" = $2, 
        "Coins" = $3,
        "EnergyDice" = $4, 
        "LastCheckIn" = $5
    `;
        const updateParams: any[] = [newExp, newLevel, newCoins, newEnergyDice, logicalTodayStr, userId];

        if (goldenDiceGain > 0) {
            updateQuery += `, "GoldenDice" = COALESCE("GoldenDice", 0) + ${goldenDiceGain}`;
        }

        // Apply Level Up Base Multipliers
        const growthRates = ROLE_GROWTH_RATES[userData.Role] || {};
        for (const [stat, rate] of Object.entries(growthRates)) {
            if (rate && rate > 0) {
                // Determine the total gain this level up cycle gives
                const totalGain = rate * levelDelta;
                if (totalGain > 0) {
                    updateQuery += `, "${stat}" = "${stat}" + ${totalGain}`;
                }
            }
        }

        // Apply Daily Fix Cure Bonus (+2)
        if (isCure && roleInfo) {
            const statKey = roleInfo.bonusStat;
            updateQuery += `, "${statKey}" = "${statKey}" + 2`;
        }

        updateQuery += ` WHERE "UserID" = $6 RETURNING *`;

        const updatedStatsRes = await client.query(updateQuery, updateParams);

        // 6. Insert DailyLog
        await client.query(
            `INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
       VALUES ($1, $2, $3, $4, $5)`,
            [new Date().toISOString(), userId, questId, finalQuestTitle, finalQuestReward]
        );

        // Commit transaction
        await client.query('COMMIT');

        return { success: true, user: updatedStatsRes.rows[0] };
    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}
