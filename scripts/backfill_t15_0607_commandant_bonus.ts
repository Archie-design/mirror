// 一次性補帳：第15小隊 6/07 實體凝聚 — 追認大隊長出席，補大隊長加成 +1000
//
// 背景（經稽核確認，2026-06-18）：
//   session 54c5b9f8…（approved, 6/08 終審）出席 6 名小隊員，大隊長尤冠閔（901224113）
//   實際有出席但未掃碼，系統判定無大隊長 → 每人 base 3000。
//   于萱裁示：追認大隊長出席，6 名小隊員每人補 +1000（3000→4000）。
//   大隊長本人不補：他 W4（6/1–6/7）wk3_offline 已累積 5000 封頂。
//
// QuestID 設計：wk3_offline|<sessionId>|cmdadj
//   — 前綴仍是 'wk3_offline|'，會被週上限統計（LIKE 'wk3_offline|%'）正確涵蓋，
//     不造成週上限破口；又與原 'wk3_offline|<sessionId>' 不同字串，去重明確。
//
// 安全：
//   - 每人補前先查 W4 週上限餘額，封頂 5000 後只補實際可補（這 6 人餘額 2000，補 1000 OK）。
//   - idempotent：此 cmdadj QuestID 已存在 → 跳過。
//   - 走 process_checkin RPC（同步 Score + DailyLogs），時間戳用凝聚日 6/07 12:00。
//   - 另更新 session.approved_has_commandant=true、approved_reward_per_person=4000，
//     使 session 紀錄與實際相符。
//   - 預設 dry-run，--commit 才寫入。
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SESSION = '54c5b9f8-b95e-4a86-892b-bf73d43cc4ce';
const QUEST_ID = `wk3_offline|${SESSION}|cmdadj`;
const QUEST_TITLE = '小組凝聚（實體）大隊長加成補差';
const GATHERING_TS = '2026-06-07T12:00:00+08:00';
const LOGICAL_TODAY = '2026-06-07';
// W4 週窗口（6/1 00:00 +08 ~ 6/8 00:00 +08）
const W_START = '2026-06-01T00:00:00+08:00';
const W_END   = '2026-06-08T00:00:00+08:00';
const CAP = 5000;
const BONUS = 1000;

const MEMBERS = [
  { uid: '986375479', name: '朱家德' },
  { uid: '982730078', name: '許雯珺' },
  { uid: '988399425', name: '潘采玟' },
  { uid: '985910950', name: '洪鈺雯' },
  { uid: '953114943', name: '林育萱' },
  { uid: '955710885', name: '賴千斐' },
];

const COMMIT = process.argv.includes('--commit');

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`\n模式：${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}`);
  console.log(`QuestID：${QUEST_ID}\n`);

  const plan: any[] = [];
  for (const m of MEMBERS) {
    const dup = await pg.query(
      `SELECT COUNT(*)::int n FROM "DailyLogs" WHERE "UserID"=$1 AND "QuestID"=$2`,
      [m.uid, QUEST_ID]);
    const wk = await pg.query(
      `SELECT COALESCE(SUM("RewardPoints"),0)::int used FROM "DailyLogs"
       WHERE "UserID"=$1 AND "QuestID" LIKE 'wk3_offline|%'
         AND "Timestamp">=$2 AND "Timestamp"<$3`, [m.uid, W_START, W_END]);
    const cs = await pg.query(`SELECT "Score" FROM "CharacterStats" WHERE "UserID"=$1`, [m.uid]);
    const used = wk.rows[0].used;
    const remaining = Math.max(0, CAP - used);
    const grant = Math.min(BONUS, remaining);
    const scoreBefore = cs.rows[0]?.Score ?? 0;
    let action: string;
    if (dup.rows[0].n > 0) action = '跳過（已補過）';
    else if (grant <= 0) action = `跳過（W4 已滿 ${used}/${CAP}）`;
    else action = `補 +${grant}`;
    const eff = dup.rows[0].n > 0 || grant <= 0 ? 0 : grant;
    plan.push({
      姓名: m.name, UserID: m.uid, W4已累積: used, 餘額: remaining,
      實補: eff, 分數before: scoreBefore, 分數after: scoreBefore + eff, 動作: action,
    });
  }
  console.table(plan);
  console.log(`合計補：${plan.reduce((s,p)=>s+p.實補,0)} 分`);

  if (!COMMIT) { console.log('\n🟡 DRY-RUN 結束。加 --commit 寫入。'); await pg.end(); return; }

  console.log('\n🔴 寫入中…');
  for (const m of MEMBERS) {
    const row = plan.find(p => p.UserID === m.uid);
    if (!row || row.實補 <= 0) { console.log(`  - ${m.name}：${row?.動作}`); continue; }
    const { data, error } = await supabase.rpc('process_checkin', {
      p_user_id: m.uid, p_quest_id: QUEST_ID, p_quest_title: QUEST_TITLE,
      p_quest_reward: row.實補, p_logical_today: LOGICAL_TODAY, p_override_timestamp: GATHERING_TS,
    });
    if (error) { console.log(`  ✗ ${m.name}：${error.message}`); continue; }
    const res = data as { success: boolean; error?: string; newScore?: number };
    if (!res.success) { console.log(`  ✗ ${m.name}：${res.error}`); continue; }
    console.log(`  ✓ ${m.name}：+${row.實補} → 新總分 ${res.newScore}`);
  }

  // 更新 session 紀錄與實際相符
  const { error: upErr } = await supabase
    .from('SquadGatheringSessions')
    .update({ approved_has_commandant: true, approved_reward_per_person: 4000 })
    .eq('id', SESSION);
  console.log(upErr ? `  ✗ session 更新失敗：${upErr.message}`
                    : '  ✓ session 更新：approved_has_commandant=true, reward=4000');

  console.log('\n=== 複查本場兩種 wk3_offline 紀錄 ===');
  const after = await pg.query(
    `SELECT dl."UserID", cs."Name", dl."QuestID", dl."RewardPoints"
     FROM "DailyLogs" dl LEFT JOIN "CharacterStats" cs ON cs."UserID"=dl."UserID"
     WHERE dl."QuestID" LIKE $1 ORDER BY cs."Name"`, [`wk3_offline|${SESSION}%`]);
  console.table(after.rows);

  await pg.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
