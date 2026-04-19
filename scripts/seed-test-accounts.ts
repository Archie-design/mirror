/**
 * 建立 20 筆測試帳號並分配大隊 / 小隊
 * 分組：2 大隊 × 2 小隊 × 5 人
 *
 * 執行：npx ts-node scripts/seed-test-accounts.ts
 * 清除：npx ts-node scripts/seed-test-accounts.ts --clean
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Client } from 'pg';

interface TestMember {
    userId: string;
    email: string;
    name: string;
    squadName: string;  // 大隊
    teamName: string;   // 小隊
    isCaptain: boolean;     // 小隊長
    isCommandant: boolean;  // 大隊長
}

const members: TestMember[] = [
    // ── 第一大隊・小隊一（大隊長 + 小隊長在此） ──────────────────
    { userId: 'test_u01', email: 'test01@mirror.dev', name: '測試一號', squadName: '第一大隊', teamName: '第一大隊-小隊一', isCaptain: true,  isCommandant: true  },
    { userId: 'test_u02', email: 'test02@mirror.dev', name: '測試二號', squadName: '第一大隊', teamName: '第一大隊-小隊一', isCaptain: false, isCommandant: false },
    { userId: 'test_u03', email: 'test03@mirror.dev', name: '測試三號', squadName: '第一大隊', teamName: '第一大隊-小隊一', isCaptain: false, isCommandant: false },
    { userId: 'test_u04', email: 'test04@mirror.dev', name: '測試四號', squadName: '第一大隊', teamName: '第一大隊-小隊一', isCaptain: false, isCommandant: false },
    { userId: 'test_u05', email: 'test05@mirror.dev', name: '測試五號', squadName: '第一大隊', teamName: '第一大隊-小隊一', isCaptain: false, isCommandant: false },

    // ── 第一大隊・小隊二 ─────────────────────────────────────────
    { userId: 'test_u06', email: 'test06@mirror.dev', name: '測試六號', squadName: '第一大隊', teamName: '第一大隊-小隊二', isCaptain: true,  isCommandant: false },
    { userId: 'test_u07', email: 'test07@mirror.dev', name: '測試七號', squadName: '第一大隊', teamName: '第一大隊-小隊二', isCaptain: false, isCommandant: false },
    { userId: 'test_u08', email: 'test08@mirror.dev', name: '測試八號', squadName: '第一大隊', teamName: '第一大隊-小隊二', isCaptain: false, isCommandant: false },
    { userId: 'test_u09', email: 'test09@mirror.dev', name: '測試九號', squadName: '第一大隊', teamName: '第一大隊-小隊二', isCaptain: false, isCommandant: false },
    { userId: 'test_u10', email: 'test10@mirror.dev', name: '測試十號', squadName: '第一大隊', teamName: '第一大隊-小隊二', isCaptain: false, isCommandant: false },

    // ── 第二大隊・小隊一（大隊長 + 小隊長在此） ──────────────────
    { userId: 'test_u11', email: 'test11@mirror.dev', name: '測試十一', squadName: '第二大隊', teamName: '第二大隊-小隊一', isCaptain: true,  isCommandant: true  },
    { userId: 'test_u12', email: 'test12@mirror.dev', name: '測試十二', squadName: '第二大隊', teamName: '第二大隊-小隊一', isCaptain: false, isCommandant: false },
    { userId: 'test_u13', email: 'test13@mirror.dev', name: '測試十三', squadName: '第二大隊', teamName: '第二大隊-小隊一', isCaptain: false, isCommandant: false },
    { userId: 'test_u14', email: 'test14@mirror.dev', name: '測試十四', squadName: '第二大隊', teamName: '第二大隊-小隊一', isCaptain: false, isCommandant: false },
    { userId: 'test_u15', email: 'test15@mirror.dev', name: '測試十五', squadName: '第二大隊', teamName: '第二大隊-小隊一', isCaptain: false, isCommandant: false },

    // ── 第二大隊・小隊二 ─────────────────────────────────────────
    { userId: 'test_u16', email: 'test16@mirror.dev', name: '測試十六', squadName: '第二大隊', teamName: '第二大隊-小隊二', isCaptain: true,  isCommandant: false },
    { userId: 'test_u17', email: 'test17@mirror.dev', name: '測試十七', squadName: '第二大隊', teamName: '第二大隊-小隊二', isCaptain: false, isCommandant: false },
    { userId: 'test_u18', email: 'test18@mirror.dev', name: '測試十八', squadName: '第二大隊', teamName: '第二大隊-小隊二', isCaptain: false, isCommandant: false },
    { userId: 'test_u19', email: 'test19@mirror.dev', name: '測試十九', squadName: '第二大隊', teamName: '第二大隊-小隊二', isCaptain: false, isCommandant: false },
    { userId: 'test_u20', email: 'test20@mirror.dev', name: '測試二十', squadName: '第二大隊', teamName: '第二大隊-小隊二', isCaptain: false, isCommandant: false },
];

async function clean(client: any) {
    const testEmails = members.map(m => m.email);
    const testUserIds = members.map(m => m.userId);

    await client.query(`DELETE FROM "Rosters" WHERE email = ANY($1::text[])`, [testEmails]);
    await client.query(`DELETE FROM "CharacterStats" WHERE "UserID" = ANY($1::text[])`, [testUserIds]);

    const teamNames = [...new Set(members.map(m => m.teamName))];
    await client.query(`DELETE FROM "TeamSettings" WHERE team_name = ANY($1::text[])`, [teamNames]);

    console.log('✓ 測試帳號清除完成');
}

async function seed(client: any) {
    const emails      = members.map(m => m.email);
    const names       = members.map(m => m.name);
    const squadNames  = members.map(m => m.squadName);
    const teamNames   = members.map(m => m.teamName);
    const isCaptains  = members.map(m => m.isCaptain);
    const isCommandants = members.map(m => m.isCommandant);
    const userIds     = members.map(m => m.userId);

    // 1. Rosters（供名單驗證模式使用）
    await client.query(`
        INSERT INTO "Rosters" (email, name, squad_name, team_name, is_captain, is_commandant)
        SELECT UNNEST($1::text[]), UNNEST($2::text[]), UNNEST($3::text[]),
               UNNEST($4::text[]), UNNEST($5::boolean[]), UNNEST($6::boolean[])
        ON CONFLICT (email) DO UPDATE SET
            name          = EXCLUDED.name,
            squad_name    = EXCLUDED.squad_name,
            team_name     = EXCLUDED.team_name,
            is_captain    = EXCLUDED.is_captain,
            is_commandant = EXCLUDED.is_commandant
    `, [emails, names, squadNames, teamNames, isCaptains, isCommandants]);
    console.log('✓ Rosters 寫入完成');

    // 2. CharacterStats（讓後台成員列表可以看見這些帳號）
    await client.query(`
        INSERT INTO "CharacterStats"
            ("UserID", "Name", "Email", "SquadName", "TeamName", "IsCaptain", "IsCommandant",
             "Score", "Streak")
        SELECT
            UNNEST($1::text[]), UNNEST($2::text[]), UNNEST($3::text[]),
            UNNEST($4::text[]), UNNEST($5::text[]),
            UNNEST($6::boolean[]), UNNEST($7::boolean[]),
            0, 0
        ON CONFLICT ("UserID") DO UPDATE SET
            "Name"         = EXCLUDED."Name",
            "Email"        = EXCLUDED."Email",
            "SquadName"    = EXCLUDED."SquadName",
            "TeamName"     = EXCLUDED."TeamName",
            "IsCaptain"    = EXCLUDED."IsCaptain",
            "IsCommandant" = EXCLUDED."IsCommandant"
    `, [userIds, names, emails, squadNames, teamNames, isCaptains, isCommandants]);
    console.log('✓ CharacterStats 寫入完成');

    // 3. TeamSettings（確保各小隊有隊伍紀錄）
    const distinctTeams = [...new Set(teamNames)];
    await client.query(`
        INSERT INTO "TeamSettings" (team_name, team_coins)
        SELECT UNNEST($1::text[]), 0
        ON CONFLICT (team_name) DO NOTHING
    `, [distinctTeams]);
    console.log('✓ TeamSettings 寫入完成');

    // 結果摘要
    console.log('\n分組摘要：');
    const grouped: Record<string, Record<string, string[]>> = {};
    for (const m of members) {
        if (!grouped[m.squadName]) grouped[m.squadName] = {};
        if (!grouped[m.squadName][m.teamName]) grouped[m.squadName][m.teamName] = [];
        const roles = [m.isCommandant ? '大隊長' : '', m.isCaptain ? '小隊長' : ''].filter(Boolean);
        grouped[m.squadName][m.teamName].push(`${m.name}${roles.length ? `（${roles.join('+')}）` : ''}`);
    }
    for (const [squad, teams] of Object.entries(grouped)) {
        console.log(`\n【${squad}】`);
        for (const [team, people] of Object.entries(teams)) {
            console.log(`  ${team}：${people.join('、')}`);
        }
    }
}

async function main() {
    const isClean = process.argv.includes('--clean');
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
        await client.query('BEGIN');
        if (isClean) {
            await clean(client);
        } else {
            await seed(client);
        }
        await client.query('COMMIT');
        console.log(isClean ? '\n清除完成。' : '\n20 筆測試帳號建立完成。');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('執行失敗：', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
