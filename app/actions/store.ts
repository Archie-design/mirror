'use server';

import { connectDb } from '@/lib/db';
import { ARTIFACTS_CONFIG } from '@/lib/constants';

export async function purchaseArtifact(userId: string, artifactId: string, teamName: string | null) {
    const config = ARTIFACTS_CONFIG.find(a => a.id === artifactId);
    if (!config) return { success: false, error: "未知的法寶 ID" };

    const client = await connectDb();
    try {
        await client.query('BEGIN');

        if (config.isTeamBinding) {
            if (!teamName) {
                throw new Error("此為團隊專屬法寶，因您尚未加入任何隊伍，無法購買。");
            }
            // Lock TeamSettings
            const tsRes = await client.query(`SELECT * FROM "TeamSettings" WHERE "team_name" = $1 FOR UPDATE`, [teamName]);
            if (tsRes.rowCount === 0) throw new Error("無效的隊伍資料");

            const teamData = tsRes.rows[0];
            const currentCoins = parseInt(teamData.team_coins, 10) || 0;

            // We need to know how many members in the team to calc total price.
            // A simple approximation or actual count. Let's do actual count:
            const membersRes = await client.query(`SELECT COUNT(*) as count FROM "CharacterStats" WHERE "TeamName" = $1`, [teamName]);
            const memberCount = parseInt(membersRes.rows[0].count, 10) || 1;

            const totalPrice = config.price * memberCount;

            if (currentCoins < totalPrice) {
                throw new Error(`團隊金幣不足！需要 ${totalPrice} 金幣（每人 ${config.price} x ${memberCount} 人），目前僅有 ${currentCoins}。`);
            }

            const currentInventory = typeof teamData.inventory === 'string'
                ? JSON.parse(teamData.inventory)
                : (teamData.inventory || []);

            const ownCount = currentInventory.filter((id: string) => id === artifactId).length;
            if (ownCount >= config.limit) {
                throw new Error(`已達到此法寶的最高持有上限 (${config.limit})。`);
            }
            if (config.exclusiveWith && currentInventory.includes(config.exclusiveWith)) {
                throw new Error(`此法寶與您已擁有的其他裝備互斥，無法同時持有。`);
            }

            const newInventory = [...currentInventory, artifactId];
            const newCoins = currentCoins - totalPrice;

            await client.query(`
                UPDATE "TeamSettings"
                SET "team_coins" = $1, "inventory" = $2::jsonb
                WHERE "team_name" = $3
            `, [newCoins, JSON.stringify(newInventory), teamName]);

        } else {
            // Lock CharacterStats
            const charRes = await client.query(`SELECT * FROM "CharacterStats" WHERE "UserID" = $1 FOR UPDATE`, [userId]);
            if (charRes.rowCount === 0) throw new Error("無效的玩家資料");

            const charData = charRes.rows[0];
            const currentCoins = parseInt(charData.Coins, 10) || 0;

            if (currentCoins < config.price) {
                throw new Error(`個人金幣不足！需要 ${config.price} 金幣，目前僅有 ${currentCoins}。`);
            }

            const currentInventory = typeof charData.Inventory === 'string'
                ? JSON.parse(charData.Inventory)
                : (charData.Inventory || []);

            const ownCount = currentInventory.filter((id: string) => id === artifactId).length;
            if (ownCount >= config.limit) {
                throw new Error(`已達到此法寶的最高持有上限 (${config.limit})。`);
            }

            const newInventory = [...currentInventory, artifactId];
            const newCoins = currentCoins - config.price;

            await client.query(`
                UPDATE "CharacterStats"
                SET "Coins" = $1, "Inventory" = $2::jsonb
                WHERE "UserID" = $3
            `, [newCoins, JSON.stringify(newInventory), userId]);
        }

        await client.query('COMMIT');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

export async function transferCoinsToTeam(userId: string, teamName: string, amount: number) {
    if (amount <= 0) return { success: false, error: "捐獻金額必須大於 0" };

    const client = await connectDb();

    try {
        await client.query('BEGIN');

        // Lock CharacterStats
        const charRes = await client.query(`SELECT "Coins" FROM "CharacterStats" WHERE "UserID" = $1 FOR UPDATE`, [userId]);
        if (charRes.rowCount === 0) throw new Error("無效的玩家資料");

        const currentCoins = parseInt(charRes.rows[0].Coins, 10) || 0;
        if (currentCoins < amount) {
            throw new Error(`個人金幣不足！您只有 ${currentCoins} 金幣。`);
        }

        // Lock TeamSettings
        const tsRes = await client.query(`SELECT "team_coins" FROM "TeamSettings" WHERE "team_name" = $1 FOR UPDATE`, [teamName]);
        if (tsRes.rowCount === 0) throw new Error("無效的隊伍資料");

        const currentTeamCoins = parseInt(tsRes.rows[0].team_coins, 10) || 0;

        // Apply changes
        await client.query(`UPDATE "CharacterStats" SET "Coins" = $1 WHERE "UserID" = $2`, [currentCoins - amount, userId]);
        await client.query(`UPDATE "TeamSettings" SET "team_coins" = $1 WHERE "team_name" = $2`, [currentTeamCoins + amount, teamName]);

        await client.query('COMMIT');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}
