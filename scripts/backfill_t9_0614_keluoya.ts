// 一次性補帳：第9小隊 6/14 實體凝聚 — 追認柯洛雅出席（漏掃碼）
//
// 背景（經稽核確認，2026-06-18）：
//   session e36f6542…（approved, 6/16 終審）實際掃碼 3 人（宋婉宇、翁崧益、大隊長張婷茹），
//   每人 4000 / 大隊長 1000（封頂）。柯洛雅（933466542）出現在合照、實際有到但漏掃碼，
//   完全沒入帳（0 分）。于萱裁示：追認出席，補 +4000，並補進 session 出席名單。
//
// 金額：base 3000 + 大隊長加成 1000 = 4000（同場其他小隊員一致）。
//   柯洛雅 W5（6/8–6/14）wk3_offline 累積 0，餘額 5000 → +4000 完整補得進。
//
// 寫入：
//   1) SquadGatheringAttendances 補一筆柯洛雅（is_commandant=false，scanned_at=凝聚日正午）
//   2) process_checkin RPC 入帳 wk3_offline|<session>，+4000，時間戳凝聚日 6/14 12:00
//   3) 更新 session.approved_attendee_count 3→4
//
// 安全：idempotent（attendance 已存在 / DailyLog 已存在 → 跳過）；先查週上限封頂；
//   預設 dry-run，--commit 才寫入。
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SESSION = 'e36f6542-fad6-4104-a1e2-c386ce07ec36';
const QUEST_ID = `wk3_offline|${SESSION}`;
const QUEST_TITLE = '小組凝聚（實體）';
const GATHERING_TS = '2026-06-14T12:00:00+08:00';
const LOGICAL_TODAY = '2026-06-14';
// W5（6/8–6/14）
const W_START = '2026-06-08T00:00:00+08:00';
const W_END   = '2026-06-15T00:00:00+08:00';
const CAP = 5000;

const UID = '933466542';
const NAME = '柯洛雅';
const DESIRED = 4000;

const COMMIT = process.argv.includes('--commit');

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`\n模式：${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}`);
  console.log(`對象：${NAME}（${UID}）｜session ${SESSION}\n`);

  // 去重 1：DailyLog
  const dupLog = await pg.query(
    `SELECT COUNT(*)::int n FROM "DailyLogs" WHERE "UserID"=$1 AND "QuestID"=$2`, [UID, QUEST_ID]);
  // 去重 2：attendance
  const dupAtt = await pg.query(
    `SELECT COUNT(*)::int n FROM "SquadGatheringAttendances" WHERE session_id=$1 AND user_id=$2`,
    [SESSION, UID]);
  // 週上限
  const wk = await pg.query(
    `SELECT COALESCE(SUM("RewardPoints"),0)::int used FROM "DailyLogs"
     WHERE "UserID"=$1 AND "QuestID" LIKE 'wk3_offline|%' AND "Timestamp">=$2 AND "Timestamp"<$3`,
    [UID, W_START, W_END]);
  const cs = await pg.query(`SELECT "Score" FROM "CharacterStats" WHERE "UserID"=$1`, [UID]);
  const used = wk.rows[0].used;
  const remaining = Math.max(0, CAP - used);
  const grant = Math.min(DESIRED, remaining);
  const scoreBefore = cs.rows[0]?.Score ?? 0;

  console.table([{
    對象: NAME, W5已累積: used, 餘額: remaining, 想補: DESIRED,
    實補: dupLog.rows[0].n > 0 ? 0 : grant,
    分數before: scoreBefore, 分數after: dupLog.rows[0].n > 0 ? scoreBefore : scoreBefore + grant,
    DailyLog已存在: dupLog.rows[0].n > 0 ? '是(跳過)' : '否',
    出席名單已存在: dupAtt.rows[0].n > 0 ? '是(跳過)' : '否',
  }]);

  if (!COMMIT) { console.log('\n🟡 DRY-RUN 結束。加 --commit 寫入。'); await pg.end(); return; }

  console.log('\n🔴 寫入中…');
  // 1) 補出席名單
  if (dupAtt.rows[0].n === 0) {
    await pg.query(
      `INSERT INTO "SquadGatheringAttendances" (session_id, user_id, user_name, is_commandant, scanned_at)
       VALUES ($1,$2,$3,false,$4)`,
      [SESSION, UID, NAME, GATHERING_TS]);
    console.log('  ✓ 補出席名單（SquadGatheringAttendances）');
  } else console.log('  - 出席名單已存在，跳過');

  // 2) 入帳
  if (dupLog.rows[0].n === 0 && grant > 0) {
    const { data, error } = await supabase.rpc('process_checkin', {
      p_user_id: UID, p_quest_id: QUEST_ID, p_quest_title: QUEST_TITLE,
      p_quest_reward: grant, p_logical_today: LOGICAL_TODAY, p_override_timestamp: GATHERING_TS,
    });
    if (error) console.log(`  ✗ 入帳失敗：${error.message}`);
    else {
      const res = data as { success: boolean; error?: string; newScore?: number };
      console.log(res.success ? `  ✓ 入帳 +${grant} → 新總分 ${res.newScore}` : `  ✗ ${res.error}`);
    }
  } else console.log('  - DailyLog 已存在或無可補，跳過入帳');

  // 3) 更新 session attendee count
  const { error: upErr } = await supabase
    .from('SquadGatheringSessions')
    .update({ approved_attendee_count: 4 })
    .eq('id', SESSION);
  console.log(upErr ? `  ✗ session 更新失敗：${upErr.message}` : '  ✓ session.approved_attendee_count → 4');

  console.log('\n=== 複查本場出席 + 入帳 ===');
  const att = await pg.query(
    `SELECT a.user_name, a.is_commandant FROM "SquadGatheringAttendances" a WHERE a.session_id=$1 ORDER BY a.scanned_at`, [SESSION]);
  console.table(att.rows);
  const logs = await pg.query(
    `SELECT cs."Name", dl."RewardPoints" FROM "DailyLogs" dl LEFT JOIN "CharacterStats" cs ON cs."UserID"=dl."UserID"
     WHERE dl."QuestID" LIKE $1 ORDER BY cs."Name"`, [`wk3_offline|${SESSION}%`]);
  console.table(logs.rows);

  await pg.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
