/**
 * 建立「覺醒大小隊長」正式名單（2026-04-21）
 *
 * 規則：
 *   - 登入方式：姓名 + 手機末三碼「123」
 *   - UserID 臨時使用 9 位數代碼，結尾為 123（待實際手機到齊後更新）
 *   - 小隊命名採編號制：「第N大隊-小隊一/二/三」
 *   - 大隊長（IsCommandant）TeamName 留空，只設 SquadName
 *   - 雙人大隊長 / 雙人小隊長：兩人各一筆，共享同一 SquadName / TeamName
 *   - 大隊 1 其他參與者（李姵琦、王宥鈞、林妙慧、李舜泰、陳品吟）本次暫不建，待確認後補
 *
 * 執行：npx tsx scripts/seed-captain-roster.ts
 * 清除舊名單（含之前的 test_u01~test_u20）：npx tsx scripts/seed-captain-roster.ts --clean
 *
 * 清除模式會刪除：
 *   - test_u01 ~ test_u20 的測試帳號（CharacterStats / Rosters / TeamSettings）
 *   - 本名單的 39 筆帳號（可重複執行安全）
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Client } from 'pg';

interface RosterMember {
    userId: string;
    name: string;
    squadName: string;
    teamName: string | null;
    isCaptain: boolean;
    isCommandant: boolean;
}

// UserID 生成：非手機格式、結尾 123（避免與真實學員手機號碼衝突）
// 依序 roster_01_123 ~ roster_39_123；Roster.phone 沿用同一字串作為主鍵
const makeUserId = (seq: number) => `roster_${String(seq).padStart(2, '0')}_123`;

// 輔助：一行帶入一位大隊長
const commandant = (seq: number, name: string, squadName: string): RosterMember => ({
    userId: makeUserId(seq),
    name,
    squadName,
    teamName: null,
    isCaptain: false,
    isCommandant: true,
});

// 輔助：一行帶入一位小隊長
const captain = (seq: number, name: string, squadName: string, teamName: string): RosterMember => ({
    userId: makeUserId(seq),
    name,
    squadName,
    teamName,
    isCaptain: true,
    isCommandant: false,
});

// ── 名單定義 ─────────────────────────────────────────────────────────
const members: RosterMember[] = [
    // 第一大隊
    commandant(1, '林湘芸', '第一大隊'),
    captain(2, '謝閔旭', '第一大隊', '第一大隊-小隊一'),
    captain(3, '鄭郁家', '第一大隊', '第一大隊-小隊二'),
    captain(4, '詹惠琴', '第一大隊', '第一大隊-小隊三'),

    // 第二大隊（兩位並列大隊長）
    commandant(5, '劉永竣', '第二大隊'),
    commandant(6, '許妤嬿', '第二大隊'),
    captain(7, '汪家慧', '第二大隊', '第二大隊-小隊一'),
    captain(8, '吳欣蘋', '第二大隊', '第二大隊-小隊二'),
    captain(9, '王嘉敏', '第二大隊', '第二大隊-小隊三'),

    // 第三大隊
    commandant(10, '張婷茹', '第三大隊'),
    captain(11, '莊于萱', '第三大隊', '第三大隊-小隊一'),
    captain(12, '宋冠曄', '第三大隊', '第三大隊-小隊二'),
    captain(13, '宋婉宇', '第三大隊', '第三大隊-小隊三'),

    // 第四大隊
    commandant(14, '汪家儀', '第四大隊'),
    captain(15, '詹凱婷', '第四大隊', '第四大隊-小隊一'),
    captain(16, '陳紫璇', '第四大隊', '第四大隊-小隊二'),
    captain(17, '鄭泊宇', '第四大隊', '第四大隊-小隊三'),

    // 第五大隊
    commandant(18, '尤冠閔', '第五大隊'),
    captain(19, '葉芮沂', '第五大隊', '第五大隊-小隊一'),
    captain(20, '魏睿杰', '第五大隊', '第五大隊-小隊二'),
    captain(21, '林育萱', '第五大隊', '第五大隊-小隊三'),

    // 第六大隊
    commandant(22, '洪晉偉', '第六大隊'),
    captain(23, '洪聖雯', '第六大隊', '第六大隊-小隊一'),
    captain(24, '鄭鼎諺', '第六大隊', '第六大隊-小隊二'),
    captain(25, '許佳微', '第六大隊', '第六大隊-小隊三'),

    // 第七大隊
    commandant(26, '蘇鈺婷', '第七大隊'),
    captain(27, '方峻偉', '第七大隊', '第七大隊-小隊一'),
    captain(28, '林宏森', '第七大隊', '第七大隊-小隊二'),
    captain(29, '邱瓊宜', '第七大隊', '第七大隊-小隊三'),

    // 第八大隊（小隊一有兩位共同小隊長）
    commandant(30, '黃千瑋', '第八大隊'),
    captain(31, '徐筱雯', '第八大隊', '第八大隊-小隊一'),
    captain(32, '吳采恩', '第八大隊', '第八大隊-小隊一'),
    captain(33, '張幼儒', '第八大隊', '第八大隊-小隊二'),
    captain(34, '林蓓茵', '第八大隊', '第八大隊-小隊三'),

    // 第九大隊（兩位並列大隊長）
    commandant(35, '黃俊傑', '第九大隊'),
    commandant(36, '蘇慧芳', '第九大隊'),
    captain(37, '王九思', '第九大隊', '第九大隊-小隊一'),
    captain(38, '陳俊諺', '第九大隊', '第九大隊-小隊二'),
    captain(39, '林允博', '第九大隊', '第九大隊-小隊三'),
];

// 舊測試帳號清單（沿用 seed-test-accounts.ts 的 UserID 命名規則）
const LEGACY_TEST_USER_IDS = Array.from({ length: 20 }, (_, i) => `test_u${String(i + 1).padStart(2, '0')}`);

async function cleanLegacyTests(client: Client) {
    await client.query(`DELETE FROM "Rosters" WHERE phone = ANY($1::text[])`, [LEGACY_TEST_USER_IDS]);
    await client.query(`DELETE FROM "CharacterStats" WHERE "UserID" = ANY($1::text[])`, [LEGACY_TEST_USER_IDS]);
    console.log(`✓ 已刪除舊測試帳號（test_u01 ~ test_u20）`);
}

async function cleanCurrentRoster(client: Client) {
    const userIds = members.map(m => m.userId);
    await client.query(`DELETE FROM "Rosters" WHERE phone = ANY($1::text[])`, [userIds]);
    await client.query(`DELETE FROM "CharacterStats" WHERE "UserID" = ANY($1::text[])`, [userIds]);
    console.log(`✓ 已清除名單中的 ${userIds.length} 位帳號`);
}

async function seed(client: Client) {
    const userIds = members.map(m => m.userId);
    const names = members.map(m => m.name);
    const squadNames = members.map(m => m.squadName);
    const teamNames = members.map(m => m.teamName);
    const isCaptains = members.map(m => m.isCaptain);
    const isCommandants = members.map(m => m.isCommandant);

    // 1. Rosters（phone 為 PK，沿用 userId 字串）
    await client.query(
        `
        INSERT INTO "Rosters" (phone, name, squad_name, team_name, is_captain, is_commandant)
        SELECT UNNEST($1::text[]), UNNEST($2::text[]), UNNEST($3::text[]),
               UNNEST($4::text[]), UNNEST($5::boolean[]), UNNEST($6::boolean[])
        ON CONFLICT (phone) DO UPDATE SET
            name          = EXCLUDED.name,
            squad_name    = EXCLUDED.squad_name,
            team_name     = EXCLUDED.team_name,
            is_captain    = EXCLUDED.is_captain,
            is_commandant = EXCLUDED.is_commandant
        `,
        [userIds, names, squadNames, teamNames, isCaptains, isCommandants]
    );
    console.log('✓ Rosters 寫入完成');

    // 2. CharacterStats（主帳號；TeamName 可為 null）
    await client.query(
        `
        INSERT INTO "CharacterStats"
            ("UserID", "Name", "SquadName", "TeamName", "IsCaptain", "IsCommandant",
             "Score", "Streak")
        SELECT
            UNNEST($1::text[]), UNNEST($2::text[]),
            UNNEST($3::text[]), UNNEST($4::text[]),
            UNNEST($5::boolean[]), UNNEST($6::boolean[]),
            0, 0
        ON CONFLICT ("UserID") DO UPDATE SET
            "Name"         = EXCLUDED."Name",
            "SquadName"    = EXCLUDED."SquadName",
            "TeamName"     = EXCLUDED."TeamName",
            "IsCaptain"    = EXCLUDED."IsCaptain",
            "IsCommandant" = EXCLUDED."IsCommandant"
        `,
        [userIds, names, squadNames, teamNames, isCaptains, isCommandants]
    );
    console.log('✓ CharacterStats 寫入完成');

    // 3. TeamSettings（為每個實際出現的小隊建一筆；大隊長因 teamName=null 不會進來）
    const distinctTeams = [...new Set(teamNames.filter((t): t is string => t !== null))];
    await client.query(
        `INSERT INTO "TeamSettings" (team_name, team_coins)
         SELECT UNNEST($1::text[]), 0
         ON CONFLICT (team_name) DO NOTHING`,
        [distinctTeams]
    );
    console.log(`✓ TeamSettings 寫入完成（${distinctTeams.length} 個小隊）`);
}

function printSummary() {
    const bySquad = new Map<string, { commandants: string[]; teams: Map<string, string[]> }>();
    for (const m of members) {
        if (!bySquad.has(m.squadName)) {
            bySquad.set(m.squadName, { commandants: [], teams: new Map() });
        }
        const entry = bySquad.get(m.squadName)!;
        if (m.isCommandant) {
            entry.commandants.push(m.name);
        } else if (m.teamName) {
            if (!entry.teams.has(m.teamName)) entry.teams.set(m.teamName, []);
            entry.teams.get(m.teamName)!.push(m.name);
        }
    }

    console.log('\n================ 名單分組摘要 ================');
    for (const [squad, { commandants, teams }] of bySquad) {
        console.log(`\n【${squad}】  大隊長：${commandants.join('、')}`);
        for (const [team, captains] of teams) {
            console.log(`   ${team}  小隊長：${captains.join('、')}`);
        }
    }
    console.log(`\n總計：${members.filter(m => m.isCommandant).length} 位大隊長 + ${members.filter(m => m.isCaptain).length} 位小隊長 = ${members.length} 位`);
    console.log('登入方式：姓名 + 手機末三碼「123」');
}

async function main() {
    const isClean = process.argv.includes('--clean');

    if (!process.env.DATABASE_URL) {
        console.error('缺少 DATABASE_URL 環境變數（請確認 .env.local）');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    try {
        await client.query('BEGIN');

        // 無論是 seed 還是 clean，都先刪除舊測試帳號
        await cleanLegacyTests(client);

        if (isClean) {
            await cleanCurrentRoster(client);
            await client.query('COMMIT');
            console.log('\n✅ 清除完成（舊測試 20 筆 + 正式名單 39 筆）');
        } else {
            await cleanCurrentRoster(client); // 先清再寫，確保可重複執行
            await seed(client);
            await client.query('COMMIT');
            printSummary();
            console.log('\n✅ 正式大小隊長名單建立完成');
        }
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('執行失敗：', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
