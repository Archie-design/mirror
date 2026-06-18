// 一次性清理：approved 但分數已被取消（無對應 DailyLogs）的孤兒 BonusApplications
//
// 背景（2026-06-18）：
//   後台「取消分數」(deleteCheckInRecord) 舊版只刪 DailyLogs + 扣 Score，沒清
//   BonusApplications，導致前台「我的旅程」仍顯示「已核准」。程式已修；此腳本清理
//   修復前殘留的孤兒（approved 但該 user+quest 已無 DailyLogs → 分數實際已不在）。
//
// 安全：
//   - 動態比對，不寫死 ID：只刪「status='approved' 且 該 user_id+quest_id 在 DailyLogs 無紀錄」者。
//   - 僅針對本次稽核確認的 3 個 user（避免誤動其他資料）。
//   - 預設 dry-run，--commit 才刪。
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';

// 本次稽核確認要清的對象（user_id, quest_id），全部需符合 approved + DailyLogs=0 才會刪
const TARGETS = [
  { uid: '928433181', quest: 'o2_1', who: '莊于萱/測試2' },
  { uid: '928433181', quest: 'o2_4', who: '莊于萱/測試' },
  { uid: '988062156', quest: 'o6',   who: '林姵廷/四階' },
];
const COMMIT = process.argv.includes('--commit');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(`\n模式：${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}\n`);

  const plan: any[] = [];
  for (const t of TARGETS) {
    const ba = await c.query(
      `SELECT id, status FROM "BonusApplications" WHERE user_id=$1 AND quest_id=$2 AND status='approved'`,
      [t.uid, t.quest]);
    const dl = await c.query(
      `SELECT COUNT(*)::int n FROM "DailyLogs" WHERE "UserID"=$1 AND "QuestID"=$2`,
      [t.uid, t.quest]);
    const safe = ba.rowCount! > 0 && dl.rows[0].n === 0;
    plan.push({
      對象: t.who, UserID: t.uid, quest: t.quest,
      approved筆數: ba.rowCount, DailyLogs: dl.rows[0].n,
      動作: safe ? `刪除 ${ba.rowCount} 筆 approved 孤兒` : '跳過（不符條件）',
      ids: safe ? ba.rows.map((r:any)=>r.id).join(',') : '',
    });
  }
  console.table(plan);

  if (!COMMIT) { console.log('\n🟡 DRY-RUN 結束。加 --commit 刪除。'); await c.end(); return; }

  console.log('\n🔴 刪除中…');
  for (const t of TARGETS) {
    const row = plan.find(p => p.UserID===t.uid && p.quest===t.quest);
    if (!row || !row.ids) { console.log(`  - ${t.who}：跳過`); continue; }
    const { rowCount } = await c.query(
      `DELETE FROM "BonusApplications" WHERE user_id=$1 AND quest_id=$2 AND status='approved'`,
      [t.uid, t.quest]);
    console.log(`  ✓ ${t.who}：刪除 ${rowCount} 筆`);
  }

  console.log('\n=== 複查：剩餘 approved 孤兒 ===');
  const left = await c.query(`
    SELECT ba.user_id, cs."Name", ba.quest_id FROM "BonusApplications" ba
    LEFT JOIN "CharacterStats" cs ON cs."UserID"=ba.user_id
    WHERE ba.status='approved'
      AND (SELECT COUNT(*) FROM "DailyLogs" dl WHERE dl."UserID"=ba.user_id AND dl."QuestID"=ba.quest_id)=0`);
  console.log(`剩餘孤兒：${left.rowCount} 筆`);
  console.table(left.rows);

  await c.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
