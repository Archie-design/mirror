## Why

未來要把系統演進成「官網下多個子系統 + 多賽季」：親證班明年換皮、並行開發類似定課的「小天使」，全部共用 LINE 登入、寫進**同一個 Supabase**。

現況：~27 張表全部隱性綁死「唯一的親證班賽季」，沒有任何 `app_id`/`season_id`。一旦有第二個寫入者（小天使或 2027 親證班）進來，資料會混在同一批 row、QuestID 命名空間衝突、排行榜互相污染。**而且 scope 欄位必須在「混入第二批資料之前」就存在**——事後要把已混合的歷史資料分回去極難。

本 change 只做**階段 0 地基**：在賽季中、零行為變更的前提下，把多租戶 scope 鍵種下去，為後續階段（Account/Participation 拆分、引擎抽出、官網 SSO、小天使掛載）解鎖。

已鎖定的方向（前次探討）：
- 隔離模型 = **同一庫 + scope 欄位**
- 換皮 = **code fork**（只 fork 設定/主題/UI；DB schema + 登入 + 引擎共用一份，不得 fork）

## What Changes

- **新增 scope 欄位**：對「賽季範圍的帳本/產物表」加 `app_id TEXT NOT NULL DEFAULT 'qinzheng'` + `season_id TEXT NOT NULL DEFAULT '2026'`。既有資料由 DEFAULT 自動回填為當前賽季 → 既有查詢結果完全不變。
- **單一 scope 來源**：新增 `lib/scope.ts` 的 `CURRENT_APP_ID` / `CURRENT_SEASON_ID`（之後可改由部署環境變數提供）。
- **寫入端填 scope**：`processCheckInCore` 與各 insert 點寫入時帶上 scope（additive，不影響讀取）。
- **scoped data-layer 慣例（鋪路，不全面改寫）**：提供 `scopedFrom(table)` helper 並訂下慣例「scoped 表不得裸用 `supabase.from`」；新程式碼一律走 helper。既有 call sites 的全面遷移留待階段 1。

**刻意不做（後續階段）**：Account/Participation 拆分、以 scope 強制的 RLS、把既有所有讀取點改帶 scope、check-in 引擎抽 package、SSO cookie 跨子網域、賽季設定資料化。階段 0 維持**單租戶行為**，只是欄位與接縫就位。

## Capabilities

### New Capabilities

- `platform-tenancy`: 定義「賽季範圍資料的多租戶 scope 鍵（app_id/season_id）」契約——哪些表帶、寫入如何填、單一 scope 來源、當前部署值。

## Impact

- **新增 migration**：對 scoped 表加 `app_id`/`season_id`（NOT NULL DEFAULT）+ 必要複合索引（如 `DailyLogs(app_id, season_id, "UserID", "Timestamp")`）
- **新增檔案**：`lib/scope.ts`（scope 常數 + `scopedFrom` helper）
- **修改寫入點**：`lib/checkin-core.ts` 及主要 insert（gathering/applications/temp/nine-grid）填 scope
- **不改 schema 既有欄位、不改 RLS、不改 RPC、不拆 CharacterStats**
- **行為**：單租戶下與現狀完全一致（DEFAULT 回填 + 讀取不加 filter）
- **時機**：可在賽季中安全執行（純 additive）
- **與 `unify-score-period-attribution` 關係**：獨立、相容；兩者都只動寫入端/欄位，不衝突
