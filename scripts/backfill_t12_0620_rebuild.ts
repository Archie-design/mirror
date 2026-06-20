// 一次性重建：第12小隊 6/20「電影賞析」凝聚（QR 壞掉→只有1人掃到→被駁回）
//
// 背景（經稽核確認，2026-06-20）：
//   session 874cb904…（rejected, 6/20 13:30 終審駁回）因 QR code 故障，3 名出席者中
//   只有陳玖伶掃碼成功，人數不足遭駁回。截圖出席調查確認 3 人皆到：
//   鄭泊宇(900779025)、陳玖伶(912600286)、大隊長汪家儀(928433708)。
//   于萱裁示：追認 3 人出席、重建凝聚並補分。
//
// 金額（base 3000 + 大隊長加成 1000；未全到，第12小隊在籍5人到3人）：
//   鄭泊宇 +4000（W6 餘 5000）｜陳玖伶 +4000（W6 餘 5000）
//   汪家儀 +1000（大隊長，W6 已 4000、餘 1000，封頂）
//
// 寫入：
//   1) 補出席名單（鄭泊宇、汪家儀；陳玖伶已存在）
//   2) session rejected→approved，補 has_commandant=true / reward=4000 / 人數
//   3) process_checkin RPC 入帳（時間戳凝聚日 6/20 12:00）
//
// 安全：idempotent（attendance/DailyLog 已存在則跳過）；先查週上限封頂；
//   預設 dry-run，--commit 才寫入。
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SESSION = '874cb904-36f2-48ab-a6e2-e125749ffeca';
const QUEST_ID = `wk3_offline|${SESSION}`;
const QUEST_TITLE = '小組凝聚（實體）';
const GATHERING_TS = '2026-06-20T12:00:00+08:00';
const LOGICAL_TODAY = '2026-06-20';
// W6（6/15–6/21）
const W_START = '2026-06-15T00:00:00+08:00';
const W_END   = '2026-06-22T00:00:00+08:00';
const CAP = 5000;

// 出席 3 人；needAttendance=是否需補出席名單（陳玖伶已掃過）
const ATTENDEES = [
  { uid: '900779025', name: '鄭泊宇', isCmd: false, desired: 4000, needAttendance: true },
  { uid: '912600286', name: '陳玖伶', isCmd: false, desired: 4000, needAttendance: false },
  { uid: '928433708', name: '汪家儀', isCmd: true,  desired: 4000, needAttendance: true },
];

const COMMIT = process.argv.includes('--commit');

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`\n模式：${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}｜session ${SESSION}\n`);

  const plan: any[] = [];
  for (const a of ATTENDEES) {
    const dupLog = await pg.query(
      `SELECT COUNT(*)::int n FROM "DailyLogs" WHERE "UserID"=$1 AND "QuestID"=$2`, [a.uid, QUEST_ID]);
    const dupAtt = await pg.query(
      `SELECT COUNT(*)::int n FROM "SquadGatheringAttendances" WHERE session_id=$1 AND user_id=$2`, [SESSION, a.uid]);
    const wk = await pg.query(
      `SELECT COALESCE(SUM("RewardPoints"),0)::int used FROM "DailyLogs"
       WHERE "UserID"=$1 AND "QuestID" LIKE 'wk3_offline|%' AND "Timestamp">=$2 AND "Timestamp"<$3`,
      [a.uid, W_START, W_END]);
    const cs = await pg.query(`SELECT "Score" FROM "CharacterStats" WHERE "UserID"=$1`, [a.uid]);
    const used = wk.rows[0].used;
    const remaining = Math.max(0, CAP - used);
    const grant = Math.min(a.desired, remaining);
    const eff = dupLog.rows[0].n > 0 ? 0 : grant;
    const scoreBefore = cs.rows[0]?.Score ?? 0;
    plan.push({
      姓名: a.name, 身分: a.isCmd?'大隊長':'小隊員', W6已累積: used, 餘額: remaining,
      實補: eff, 分數before: scoreBefore, 分數after: scoreBefore + eff,
      出席名單: dupAtt.rows[0].n>0 ? '已有' : (a.needAttendance?'補':'—'),
      入帳: dupLog.rows[0].n>0 ? '已有(跳過)' : (eff>0?`+${eff}`:'0'),
    });
  }
  console.table(plan);
  console.log(`合計補：${plan.reduce((s,p)=>s+p.實補,0)} 分`);

  if (!COMMIT) { console.log('\n🟡 DRY-RUN 結束。加 --commit 寫入。'); await pg.end(); return; }

  console.log('\n🔴 寫入中…');
  // 1) 補出席名單
  for (const a of ATTENDEES) {
    const dupAtt = await pg.query(
      `SELECT COUNT(*)::int n FROM "SquadGatheringAttendances" WHERE session_id=$1 AND user_id=$2`, [SESSION, a.uid]);
    if (dupAtt.rows[0].n === 0) {
      await pg.query(
        `INSERT INTO "SquadGatheringAttendances" (session_id, user_id, user_name, is_commandant, scanned_at)
         VALUES ($1,$2,$3,$4,$5)`, [SESSION, a.uid, a.name, a.isCmd, GATHERING_TS]);
      console.log(`  ✓ 補出席名單：${a.name}`);
    }
  }
  // 2) session rejected→approved
  const { error: upErr } = await supabase.from('SquadGatheringSessions')
    .update({ status: 'approved', approved_has_commandant: true,
              approved_reward_per_person: 4000, approved_attendee_count: 3,
              approved_member_count: 5 })
    .eq('id', SESSION);
  console.log(upErr ? `  ✗ session 更新失敗：${upErr.message}` : '  ✓ session rejected→approved（has_commandant=true, reward=4000, attendee=3）');

  // 3) 入帳
  for (const a of ATTENDEES) {
    const row = plan.find(p => p.姓名===a.name);
    if (!row || row.實補 <= 0) { console.log(`  - ${a.name}：${row?.入帳}`); continue; }
    const { data, error } = await supabase.rpc('process_checkin', {
      p_user_id: a.uid, p_quest_id: QUEST_ID, p_quest_title: QUEST_TITLE,
      p_quest_reward: row.實補, p_logical_today: LOGICAL_TODAY, p_override_timestamp: GATHERING_TS,
    });
    if (error) { console.log(`  ✗ ${a.name}：${error.message}`); continue; }
    const res = data as { success: boolean; error?: string; newScore?: number };
    console.log(res.success ? `  ✓ ${a.name}：+${row.實補} → 新總分 ${res.newScore}` : `  ✗ ${a.name}：${res.error}`);
  }

  console.log('\n=== 複查出席 + 入帳 ===');
  const att = await pg.query(
    `SELECT user_name, is_commandant FROM "SquadGatheringAttendances" WHERE session_id=$1 ORDER BY scanned_at`, [SESSION]);
  console.table(att.rows);
  const logs = await pg.query(
    `SELECT cs."Name", dl."RewardPoints" FROM "DailyLogs" dl LEFT JOIN "CharacterStats" cs ON cs."UserID"=dl."UserID"
     WHERE dl."QuestID" LIKE $1 ORDER BY cs."Name"`, [`wk3_offline|${SESSION}%`]);
  console.table(logs.rows);

  await pg.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
