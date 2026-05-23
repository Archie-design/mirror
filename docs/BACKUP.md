# 資料庫離線備份與災備

## 策略總覽

| 層級 | 機制 | 保留 | 觸發 |
|------|------|------|------|
| **L1** Supabase 自動備份 | Pro plan 內建 | 7 天 | 平台自動 |
| **L2** 離線 dump（本專案） | GitHub Actions + Storage `db-backups` | **30 天** | 每日 19:30 UTC (台灣 03:30) |
| **L3** PITR（選配） | Pro $100/mo 加購 | 7–28 天任意秒 | 平台自動 |
| **L4** 業務快照 | `WeeklyRankSnapshot` / `MonthlyRankSnapshot` | 全部 | Vercel Cron |

**L2** 是本文件主軸。L1/L3 由 Supabase 平台提供；L4 是排行榜業務需求。

## L2 離線備份運作

### 觸發
- 排程：每日 `19:30 UTC` (= 隔日台灣 03:30)
- 手動：GitHub → Actions → `Daily DB Backup` → `Run workflow`
- 流程：[.github/workflows/backup-daily.yml](../.github/workflows/backup-daily.yml)

### Workflow 步驟
1. 安裝 `postgresql-client-16`（含 `pg_dump`）
2. `pg_dump $BACKUP_DATABASE_URL | gzip > backup_YYYYMMDD_HHMM.sql.gz`
   - flags：`--no-owner --no-acl --clean --if-exists --quote-all-identifiers`
3. POST 到 Supabase Storage `db-backups` bucket
4. 列出 bucket、保留最新 30 份、刪除其餘

### 失敗告警
- GitHub Actions 預設失敗會 email repo admin
- 可手動到 Actions tab 查看 log

---

## 一次性設定（部署前必做）

### 1. 建立 Supabase Storage bucket
Dashboard → Storage → New bucket
- Name: `db-backups`
- **Public**：❌ NOT public（私密）
- File size limit：1 GB（或不限）

### 2. GitHub Repo Secrets
Repo → Settings → Secrets and variables → Actions → New repository secret

| Secret 名稱 | 取得方式 |
|-------------|---------|
| `BACKUP_DATABASE_URL` | Supabase Dashboard → Project Settings → Database → **Connection string → URI**（注意：**用 `5432` direct connection / session-mode，不可用 `6543` transaction-mode pooler**）|
| `NEXT_PUBLIC_SUPABASE_URL` | 同 `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | 同 `.env.local`（敏感）|

⚠️ `pg_dump` 無法用 `6543` transaction-mode pooler（不支援 prepared statements）。
- 正確 URL 格式：`postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres`
- 或直連：`postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres`

### 3. 首次驗證
1. GitHub Actions → `Daily DB Backup` → `Run workflow`（手動觸發）
2. 確認各步綠燈：install → dump → upload → rotate
3. Supabase Dashboard → Storage → `db-backups` 應出現 `backup_YYYYMMDD_HHMM.sql.gz`
4. 點 download → 本機 `gunzip -t backup_*.sql.gz` 應靜默通過（檔案完整）

---

## 災備還原步驟

### 情境 A：誤刪 / 誤改少量資料（< 7 天內）
**首選用 Supabase Pro 平台備份還原**（含完整 PITR 體驗）：
1. Supabase Dashboard → Database → Backups
2. 選距離事故最近的時間點 → Restore
3. 可選還原到當前 project（覆寫）或新 project

### 情境 B：超過 7 天 / 平台備份不可用 / 跨 project 還原
**用 L2 離線備份 + Branching 演練後切換**：

1. **下載目標 dump**
   ```bash
   curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     "$SUPABASE_URL/storage/v1/object/db-backups/backup_YYYYMMDD_HHMM.sql.gz" \
     -o backup.sql.gz
   gunzip backup.sql.gz
   ```

2. **建 Supabase Branch**（避免直接動 prod）
   - Dashboard → Branches → Create branch
   - 取得 branch 的 connection URL

3. **還原到 branch**
   ```bash
   psql "$BRANCH_DATABASE_URL" < backup.sql
   ```

4. **驗證 branch 資料**：跑核心查詢確認行數與時間戳合理
   ```sql
   SELECT COUNT(*) FROM "CharacterStats";
   SELECT MAX("Timestamp") FROM "DailyLogs";
   ```

5. **Promote branch to production**（Supabase Dashboard 操作）
   - 此步會以 branch 的狀態覆寫 production
   - 不可逆，謹慎執行

### 情境 C：Supabase 帳號完全失效 / 需遷移
1. 下載最新 dump（L2 備份）
2. 在新 Supabase project 建立同名 storage bucket（若需保留截圖）
3. `psql $NEW_DATABASE_URL < backup.sql`
4. 更新 `.env.local` 與 Vercel env 為新 project credentials
5. 重新部署

---

## 演練建議

每季至少一次：
1. 下載最近一筆 dump
2. 用 Supabase Branching 開臨時 branch
3. `psql` 還原
4. 驗證 row count + 業務查詢
5. 刪除 branch
6. 紀錄演練結果於本文件 changelog

## 異動紀錄

| 日期 | 內容 |
|------|------|
| 2026-05-24 | 初版：建立 L2 GitHub Actions 離線備份；保留 30 天 |
