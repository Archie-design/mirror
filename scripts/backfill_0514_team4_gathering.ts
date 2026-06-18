// 一次性補帳：5/14 第4小隊實體凝聚（session 0d1d4dd5… 5/13 被取消、從未入帳）
//
// 補帳對象與金額（經稽核確認，2026-06-18）：
//   汪家慧 985953405  +4000（第4小隊成員，W1 已累積 0）
//   林澤宇 901007711  +4000（第4小隊成員，W1 已累積 0）
//   劉永竣 910364053  +1000（大隊長，5/14 已在第6小隊那場 +4000，補到 W1 週上限 5000）
//   許妤嬿 975031925  +1000（大隊長，同上）
//
// 安全機制：
//   1. 去重：process_checkin RPC 對 wk3_offline 不做去重，故腳本先查
//      「該 UserID + 此 wk3_offline|<sessionId> QuestID」是否已存在，已存在則跳過。
//   2. 週上限：RPC 不做 wk3_offline 週上限，故腳本沿用 squad-gathering 的呼叫端邏輯——
//      先算 W1（5/10–5/17）已累積，封頂 5000 後只傳實際可補金額。
//   3. 時間戳：用凝聚日 2026-05-14T12:00:00+08:00（落在 W1），不佔錯週上限。
//   4. dry-run：預設只印不寫。加 --commit 才真正入帳。
//
// 執行：
//   npx ts-node scripts/backfill_0514_team4_gathering.ts            # dry-run
//   npx ts-node scripts/backfill_0514_team4_gathering.ts --commit   # 實際寫入
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SESSION_ID = '0d1d4dd5-0d7e-4a7f-873c-cf83bffc9c7e';
const QUEST_ID = `wk3_offline|${SESSION_ID}`;
const QUEST_TITLE = '小組凝聚（實體）';
const GATHERING_TS = '2026-05-14T12:00:00+08:00';
const LOGICAL_TODAY = '2026-05-14';
// W1 賽季週窗口（5/10 00:00 +08 ~ 5/18 00:00 +08）
const W1_START = '2026-05-10T00:00:00+08:00';
const W1_END = '2026-05-18T00:00:00+08:00';
const WEEKLY_CAP = 5000;

// 「想補的目標金額」（封頂前）
const TARGETS: { userId: string; name: string; desired: number }[] = [
  { userId: '985953405', name: '汪家慧', desired: 4000 },
  { userId: '901007711', name: '林澤宇', desired: 4000 },
  { userId: '910364053', name: '劉永竣', desired: 1000 },
  { userId: '975031925', name: '許妤嬿', desired: 1000 },
];

const COMMIT = process.argv.includes('--commit');

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`\n模式：${COMMIT ? '🔴 COMMIT（實際寫入）' : '🟡 DRY-RUN（只印不寫）'}`);
  console.log(`QuestID：${QUEST_ID}`);
  console.log(`時間戳：${GATHERING_TS}\n`);

  const plan: any[] = [];

  for (const t of TARGETS) {
    // (1) 去重：此人此 session 是否已入帳
    const dup = await pg.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM("RewardPoints"),0)::int AS pts
       FROM "DailyLogs" WHERE "UserID" = $1 AND "QuestID" = $2`,
      [t.userId, QUEST_ID]
    );
    const alreadyForSession = dup.rows[0].n as number;

    // (2) 週上限：W1 已累積（所有 wk3_offline）
    const wk = await pg.query(
      `SELECT COALESCE(SUM("RewardPoints"),0)::int AS used
       FROM "DailyLogs"
       WHERE "UserID" = $1 AND "QuestID" LIKE 'wk3_offline|%'
         AND "Timestamp" >= $2 AND "Timestamp" < $3`,
      [t.userId, W1_START, W1_END]
    );
    const w1Used = wk.rows[0].used as number;
    const remaining = Math.max(0, WEEKLY_CAP - w1Used);
    const grant = Math.min(t.desired, remaining);

    // 目前總分
    const cs = await pg.query(`SELECT "Score" FROM "CharacterStats" WHERE "UserID" = $1`, [t.userId]);
    const scoreBefore = (cs.rows[0]?.Score ?? 0) as number;

    let action: string;
    if (alreadyForSession > 0) action = `跳過（此 session 已入帳 ${dup.rows[0].pts} 分）`;
    else if (grant <= 0) action = `跳過（W1 已達上限 ${w1Used}/${WEEKLY_CAP}）`;
    else action = `入帳 +${grant}`;

    plan.push({
      姓名: t.name,
      UserID: t.userId,
      想補: t.desired,
      W1已累積: w1Used,
      餘額: remaining,
      實際入帳: alreadyForSession > 0 || grant <= 0 ? 0 : grant,
      分數before: scoreBefore,
      分數after: alreadyForSession > 0 || grant <= 0 ? scoreBefore : scoreBefore + grant,
      動作: action,
    });
  }

  console.table(plan);

  if (!COMMIT) {
    console.log('\n🟡 DRY-RUN 結束。確認無誤後加 --commit 實際寫入。');
    await pg.end();
    return;
  }

  console.log('\n🔴 開始寫入…');
  for (const t of TARGETS) {
    const row = plan.find((p) => p.UserID === t.userId);
    if (!row || row.實際入帳 <= 0) {
      console.log(`  - ${t.name}：${row?.動作 ?? '跳過'}`);
      continue;
    }
    const { data, error } = await supabase.rpc('process_checkin', {
      p_user_id: t.userId,
      p_quest_id: QUEST_ID,
      p_quest_title: QUEST_TITLE,
      p_quest_reward: row.實際入帳,
      p_logical_today: LOGICAL_TODAY,
      p_override_timestamp: GATHERING_TS,
    });
    if (error) { console.log(`  ✗ ${t.name}：RPC 失敗 ${error.message}`); continue; }
    const res = data as { success: boolean; error?: string; newScore?: number };
    if (!res.success) { console.log(`  ✗ ${t.name}：${res.error}`); continue; }
    console.log(`  ✓ ${t.name}：+${row.實際入帳} → 新總分 ${res.newScore}`);
  }

  console.log('\n=== 寫入後複查 wk3_offline|<此 session> ===');
  const after = await pg.query(
    `SELECT dl."UserID", cs."Name", dl."RewardPoints", dl."Timestamp"
     FROM "DailyLogs" dl LEFT JOIN "CharacterStats" cs ON cs."UserID" = dl."UserID"
     WHERE dl."QuestID" = $1 ORDER BY cs."Name"`,
    [QUEST_ID]
  );
  console.table(after.rows);

  await pg.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
