'use server';

import { connectDb } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

const _supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const _supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ── 通用管理操作 Log ──────────────────────────────────────
export async function logAdminAction(
    action: string,
    actor: string,
    targetId?: string,
    targetName?: string,
    details?: Record<string, any>,
    result: 'success' | 'error' = 'success'
) {
    try {
        const supabase = createClient(_supabaseUrl, _supabaseKey);
        await supabase.from('AdminActivityLog').insert({
            action, actor, target_id: targetId, target_name: targetName, details, result,
        });
    } catch (_) { /* log failure should never break the main flow */ }
}

export async function triggerWeeklySnapshot() {
    
    const client = await connectDb();
    try {
        await client.query('BEGIN');

        // 1. Calculate past 7 days boundary
        const today = new Date();
        const past7Date = new Date();
        past7Date.setDate(today.getDate() - 7);
        const past7ISO = past7Date.toISOString();

        // 2. Find active users (who have logged anything in the last 7 days)
        const activeUsersRes = await client.query(`
            SELECT DISTINCT "UserID" FROM "DailyLogs"
            WHERE "Timestamp" >= $1
        `, [past7ISO]);

        const activeUsersCount = activeUsersRes.rowCount || 0;

        if (activeUsersCount === 0) {
            await client.query('COMMIT');
            return { success: true, worldState: 'normal', rate: 0, message: "過去 7 天無活躍使用者，環境保持平衡。" };
        }

        // 3. Count total daily quests (q1~q7) completed by these active users in last 7 days
        const logsRes = await client.query(`
            SELECT COUNT(*) as count FROM "DailyLogs"
            WHERE "Timestamp" >= $1 AND "QuestID" LIKE 'q%'
        `, [past7ISO]);

        const totalQuests = parseInt(logsRes.rows[0].count, 10);

        // 4. Calculate Rate (Max 3 quests/day per active user * 7 days = 21 max per user)
        const maxPossible = activeUsersCount * 21;
        const rate = totalQuests / maxPossible;

        // 5. Determine new World State
        let worldState = 'normal';
        let stateMsg = "【世俗】眾生修行平平，三界維持恐怖平衡。";
        if (rate > 0.8) {
            worldState = 'good';
            stateMsg = "【共好】全服精進達標！靈氣復甦，天降祥瑞與寶箱。";
        } else if (rate < 0.5) {
            worldState = 'bad';
            stateMsg = "【共業】全服懈怠！妖氣沖天，西北混沌區「世界王」結界鬆動。";
        }

        // 6. Update SystemSettings
        await client.query(`
            INSERT INTO "SystemSettings" ("SettingName", "Value") 
            VALUES ('WorldState', $1)
            ON CONFLICT ("SettingName") DO UPDATE SET "Value" = EXCLUDED."Value"
        `, [worldState]);

        await client.query(`
            INSERT INTO "SystemSettings" ("SettingName", "Value") 
            VALUES ('WorldStateMsg', $1)
            ON CONFLICT ("SettingName") DO UPDATE SET "Value" = EXCLUDED."Value"
        `, [stateMsg]);

        // 7. Clear old global entities
        await client.query(`DELETE FROM "MapEntities" WHERE owner_id IS NULL AND type != 'personal'`);

        // 8. Generate new procedural entities based on worldState
        const chanceChest = worldState === 'good' ? 0.05 : worldState === 'bad' ? 0.01 : 0.02;
        const chanceMonster = worldState === 'good' ? 0.01 : worldState === 'bad' ? 0.08 : 0.02;

        // We simulate a grid area of radius ~15 to scatter entities
        const R = 15;
        for (let q = -R; q <= R; q++) {
            for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
                if (q === 0 && r === 0) continue; // Safe hub

                const rand = Math.random();
                if (rand < chanceChest) {
                    await client.query(`
                        INSERT INTO "MapEntities" (q, r, type, name, icon) 
                        VALUES ($1, $2, 'treasure', '神秘寶箱', '🎁')
                    `, [q, r]);
                } else if (rand < chanceChest + chanceMonster) {
                    await client.query(`
                        INSERT INTO "MapEntities" (q, r, type, name, icon) 
                        VALUES ($1, $2, 'monster', '野生妖獸', '🐉')
                    `, [q, r]);
                }
            }
        }

        await client.query('COMMIT');
        await logAdminAction('weekly_snapshot', 'admin', undefined, undefined, { worldState, rate: Math.round(rate * 100) + '%' });
        return { success: true, worldState, rate, message: stateMsg };

    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('weekly_snapshot', 'admin', undefined, undefined, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

export async function checkWeeklyW3Compliance(weekMondayISO?: string) {
    
    const client = await connectDb();
    try {
        // Determine the week range (Monday 00:00 to Sunday 23:59:59)
        let weekStart: Date;
        if (weekMondayISO) {
            weekStart = new Date(weekMondayISO);
        } else {
            weekStart = new Date();
            const day = weekStart.getDay() || 7;
            weekStart.setDate(weekStart.getDate() - (day - 1));
            weekStart.setHours(0, 0, 0, 0);
        }
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekLabel = weekStart.toISOString().slice(0, 10);

        // Get all users
        const usersRes = await client.query<{ UserID: string; Name: string; TotalFines: number }>(
            `SELECT "UserID", "Name", "TotalFines" FROM "CharacterStats"`
        );

        // Get all w3 logs in that week range
        const logsRes = await client.query<{ UserID: string }>(
            `SELECT "UserID" FROM "DailyLogs"
             WHERE "QuestID" LIKE 'w3%'
               AND "Timestamp" >= $1 AND "Timestamp" < $2`,
            [weekStart.toISOString(), weekEnd.toISOString()]
        );

        const completedUserIds = new Set(logsRes.rows.map(r => r.UserID));

        const violators: { userId: string; name: string }[] = [];

        await client.query('BEGIN');
        for (const user of usersRes.rows) {
            if (!completedUserIds.has(user.UserID)) {
                violators.push({ userId: user.UserID, name: user.Name });
                await client.query(
                    `UPDATE "CharacterStats" SET "TotalFines" = "TotalFines" + 200 WHERE "UserID" = $1`,
                    [user.UserID]
                );
            }
        }
        await client.query('COMMIT');

        await logAdminAction('w3_compliance', 'admin', undefined, weekLabel, {
            totalUsers: usersRes.rowCount || 0,
            violatorCount: violators.length,
            violators: violators.map(v => v.name),
        });
        return {
            success: true,
            weekLabel,
            totalUsers: usersRes.rowCount || 0,
            violatorCount: violators.length,
            violators,
        };
    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('w3_compliance', 'admin', undefined, undefined, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

const ZH_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

/**
 * 測試用：將現有玩家隨機分配到大隊 / 小隊，並自動設定隊長與 TeamSettings。
 * 每支小隊 SQUAD_SIZE 人，每個大隊 SQUADS_PER_BATTALION 支小隊。
 * 可重複執行（覆蓋舊值）。
 */
export async function autoAssignSquadsForTesting(
    squadSize = 4,
    squadsPerBattalion = 3
) {
    
    const client = await connectDb();
    try {
        await client.query('BEGIN');

        // 1. 取得所有玩家並隨機排列
        const { rows: allUsers } = await client.query<{ UserID: string; Name: string }>(
            `SELECT "UserID", "Name" FROM "CharacterStats" ORDER BY "UserID"`
        );
        if (allUsers.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: '資料庫中尚無玩家' };
        }

        // Fisher-Yates shuffle
        for (let i = allUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allUsers[i], allUsers[j]] = [allUsers[j], allUsers[i]];
        }

        // 2. 分組
        const squads: { battalionName: string; squadName: string; members: typeof allUsers }[] = [];
        for (let i = 0; i < allUsers.length; i += squadSize) {
            const squadIdx = squads.length;
            const battalionIdx = Math.floor(squadIdx / squadsPerBattalion);
            const squadInBattalion = (squadIdx % squadsPerBattalion) + 1;
            const battalionName = `第${ZH_NUMS[battalionIdx] ?? battalionIdx + 1}大隊`;
            const squadName = `${battalionName}-小隊${ZH_NUMS[squadInBattalion - 1] ?? squadInBattalion}`;
            squads.push({ battalionName, squadName, members: allUsers.slice(i, i + squadSize) });
        }

        // 3. 更新 CharacterStats + upsert TeamSettings
        for (const squad of squads) {
            for (let mi = 0; mi < squad.members.length; mi++) {
                const user = squad.members[mi];
                const isCaptain = mi === 0;
                await client.query(
                    `UPDATE "CharacterStats"
                     SET "SquadName" = $1, "TeamName" = $2, "IsCaptain" = $3
                     WHERE "UserID" = $4`,
                    [squad.battalionName, squad.squadName, isCaptain, user.UserID]
                );
            }
            await client.query(
                `INSERT INTO "TeamSettings" (team_name, team_coins)
                 VALUES ($1, 0)
                 ON CONFLICT (team_name) DO NOTHING`,
                [squad.squadName]
            );
        }

        await client.query('COMMIT');

        await logAdminAction('auto_assign_squads', 'admin', undefined, undefined, {
            totalPlayers: allUsers.length,
            squadCount: squads.length,
            battalionCount: Math.ceil(squads.length / squadsPerBattalion),
        });
        return {
            success: true,
            totalPlayers: allUsers.length,
            squadCount: squads.length,
            battalionCount: Math.ceil(squads.length / squadsPerBattalion),
            summary: squads.map(s => ({
                squad: s.squadName,
                members: s.members.map((m, i) => `${m.Name}${i === 0 ? '（隊長）' : ''}`)
            })),
        };
    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('auto_assign_squads', 'admin', undefined, undefined, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

export async function importRostersData(csvContent: string) {
    
    const client = await connectDb();

    try {
        await client.query('BEGIN');

        const rows = csvContent.split('\n');
        let count = 0;

        for (const row of rows) {
            const cols = row.split(',').map(c => c.trim());
            // Expecting: email, squad_name, team_name, is_captain
            const email = cols[0]?.toLowerCase();
            if (!email || !email.includes('@')) continue;

            const squad_name = cols[1] || null;
            const team_name = cols[2] || null;
            const is_captain = String(cols[3]).toLowerCase() === 'true';

            await client.query(`
                INSERT INTO "Rosters" (email, squad_name, team_name, is_captain)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email) 
                DO UPDATE SET 
                    squad_name = EXCLUDED.squad_name,
                    team_name = EXCLUDED.team_name,
                    is_captain = EXCLUDED.is_captain
            `, [email, squad_name, team_name, is_captain]);

            // If they already created a CharacterStat, automatically map their squad info
            await client.query(`
                UPDATE "CharacterStats"
                SET "SquadName" = $2, "TeamName" = $3, "IsCaptain" = $4
                WHERE "Email" = $1
            `, [email, squad_name, team_name, is_captain]);

            count++;
        }

        await client.query('COMMIT');
        await logAdminAction('roster_import', 'admin', undefined, undefined, { count });
        return { success: true, count };
    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('roster_import', 'admin', undefined, undefined, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}
