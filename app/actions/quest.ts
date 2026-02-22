'use server';

import { getPool } from '@/lib/db';
import { getLogicalDateStr } from '@/lib/utils/time';

const ROLE_CURE_MAP: Record<string, { cureTaskId: string; bonusStat: string; diceBonus?: number }> = {
    '孫悟空': { cureTaskId: 'q2', bonusStat: 'Spirit' },
    '豬八戒': { cureTaskId: 'q6', bonusStat: 'Physique' },
    '沙悟淨': { cureTaskId: 'q4', bonusStat: 'Savvy' },
    '白龍馬': { cureTaskId: 'q5', bonusStat: 'Charisma' },
    '唐三藏': { cureTaskId: 'q3', bonusStat: 'Potential' }
};

export async function processCheckInTransaction(
    userId: string,
    questId: string,
    questTitle: string,
    questReward: number,
    questDice: number = 0
) {
    const pool = getPool();
    const client = await pool.connect();

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
        // 這裡我們簡化處理：先檢查相同 questId 今天是否已完成過（如果是 qxx 定課）
        if (questId.startsWith('q')) {
            const dupCheck = await client.query(
                `SELECT COUNT(*) as count FROM "DailyLogs" WHERE "UserID" = $1 AND "QuestID" = $2 AND "Timestamp"::text LIKE $3`,
                [userId, questId, `${logicalTodayStr}%`]
            );
            if (parseInt(dupCheck.rows[0].count, 10) > 0) {
                throw new Error("此定課今日已完成。");
            }
        }

        // 4. Determine bonus properties based on character role
        const roleInfo = ROLE_CURE_MAP[userData.Role];
        const isCure = roleInfo?.cureTaskId === questId;
        const finalQuestTitle = isCure ? `${questTitle} (天命對治)` : questTitle;

        // 5. Update CharacterStats
        const newExp = userData.Exp + questReward;
        const newLevel = Math.max(1, Math.floor(newExp / 1000) + 1);
        const newEnergyDice = userData.EnergyDice + questDice;

        let updateQuery = `
      UPDATE "CharacterStats" 
      SET 
        "Exp" = $1, 
        "Level" = $2, 
        "EnergyDice" = $3, 
        "LastCheckIn" = $4
    `;
        const updateParams: any[] = [newExp, newLevel, newEnergyDice, logicalTodayStr, userId];

        if (isCure && roleInfo) {
            const statKey = roleInfo.bonusStat;
            // Append the specific stat increment dynamically
            updateQuery += `, "${statKey}" = "${statKey}" + 2`;
        }

        updateQuery += ` WHERE "UserID" = $5 RETURNING *`;

        const updatedStatsRes = await client.query(updateQuery, updateParams);

        // 6. Insert DailyLog
        await client.query(
            `INSERT INTO "DailyLogs" ("Timestamp", "UserID", "QuestID", "QuestTitle", "RewardPoints")
       VALUES ($1, $2, $3, $4, $5)`,
            [new Date().toISOString(), userId, questId, finalQuestTitle, questReward]
        );

        // Commit transaction
        await client.query('COMMIT');

        return { success: true, user: updatedStatsRes.rows[0] };
    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
