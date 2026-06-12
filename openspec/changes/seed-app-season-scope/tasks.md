# Tasks — 階段 0：多租戶 scope 地基

> 全部 additive、單租戶行為不變，可在賽季中安全執行。

## 1. Migration：加 scope 欄位 + 索引

- [ ] 1.1 對「賽季帳本/產物表」加 `app_id TEXT NOT NULL DEFAULT 'qinzheng'`、`season_id TEXT NOT NULL DEFAULT '2026'`
      （清單見 design.md「加 scope」那組；確認 NOT NULL DEFAULT 為 metadata-only、不重寫大表）
- [ ] 1.2 熱查詢表補 scope 前綴複合索引（DailyLogs、Weekly/MonthlyRankSnapshot、SquadGatheringSessions、各 *Applications）
- [ ] 1.3 暫不動的表（CharacterStats/SystemSettings/Rosters/LineGroups/NineGridTemplates）保持原樣，於 migration 註解標明原因

## 2. 單一 scope 來源

- [ ] 2.1 新增 `lib/scope.ts`：`CURRENT_APP_ID='qinzheng'`、`CURRENT_SEASON_ID='2026'`（預留改讀 `process.env`）
- [ ] 2.2 `scopedFrom(table)` helper：包 `supabase.from(table)`，提供帶 scope 的 select/insert 慣例

## 3. 寫入端填 scope（additive）

- [ ] 3.1 `lib/checkin-core.ts`：insert DailyLogs 時帶 `app_id/season_id`
- [ ] 3.2 主要 insert 點（squad-gathering / online-gathering / weekly-practice / temp-quest / bonus / nine-grid）帶 scope
- [ ] 3.3 確認漏帶時 DB DEFAULT 仍補當前賽季（防呆，不應依賴）

## 4. 慣例與防線（不全面改寫）

- [ ] 4.1 在 CLAUDE.md／README 記下慣例：scoped 表「新程式碼」一律走 `scopedFrom`，禁裸 `supabase.from`
- [ ] 4.2 （選用）加一條 lint/grep CI 檢查，標記新出現的裸 `supabase.from('<scoped table>')`

## 5. 驗證（行為不變）

- [ ] 5.1 既有流程全測：打卡、凝聚、精進力、排行、後台明細 → 結果與改前一致
- [ ] 5.2 新寫入的 row：`app_id='qinzheng'`、`season_id='2026'`
- [ ] 5.3 既有 row：經 DEFAULT 回填後皆為當前賽季（抽查 DailyLogs/Snapshot）
- [ ] 5.4 `npx tsc --noEmit` 乾淨、`npm run build` 通過
- [ ] 5.5 migration 先於分支/備援驗證大表加欄位耗時與鎖表

## 6. 明確不做（後續階段，另開 change）

- [ ] 6.1 ❌ Account/Participation 拆分（階段 1）
- [ ] 6.2 ❌ 既有所有讀取點改帶 scope（階段 1）
- [ ] 6.3 ❌ scope-enforcing RLS（待第二租戶前）
- [ ] 6.4 ❌ check-in 引擎抽 package（階段 2）
- [ ] 6.5 ❌ 官網 SSO cookie 跨子網域 / 小天使掛載（階段 3）
- [ ] 6.6 ❌ aggregate RPC 帶 scope（階段 1 啟用多租戶時）
