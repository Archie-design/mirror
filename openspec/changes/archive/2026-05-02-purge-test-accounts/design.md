## Context

系統以 `CharacterStats.UserID` 作為學員主鍵，標準化為 9 位數字手機號。開發期間 seed scripts 建立了不符合此規則的測試帳號：

- `scripts/seed-test-accounts.ts`：UserID = `test_u01`–`test_u20`（20 筆）
- `scripts/seed-captain-roster.ts`：UserID = `roster_NN_123`（格式 `roster_<兩位數>_123`）

這些帳號在 production 環境中不應存在，會影響排行榜統計與罰款計算。現有 `deleteMember(targetUserId)` 已具備單筆刪除的完整邏輯（清除 6 張相關表），本次只需在此基礎上加批次識別層。

## Goals / Non-Goals

**Goals:**
- 識別所有 `CharacterStats.UserID` 不符合 `^[0-9]{9}$` 的帳號
- 批次執行與 `deleteMember` 相同的清除邏輯
- 寫一筆批次 AdminLogs 記錄此操作
- 管理後台提供安全的確認流程（顯示待刪清單 → 確認 → 執行）

**Non-Goals:**
- 不刪除符合 9 位數字標準的帳號（即使是測試用途的真實手機號）
- 不修改 seed scripts 本身
- 不提供「復原」功能（刪除不可逆，confirm dialog 已是安全保障）

## Decisions

### 識別邏輯：regex 而非 hardcode 清單

**選擇**：`WHERE "UserID" !~ '^[0-9]{9}$'`（PostgreSQL regex）

**原因**：比 hardcode `test_u01`...`test_u20` 更健壯。若未來有其他非標準測試 ID（如 `demo_xyz`），同樣能被識別，無需修改邏輯。負面影響：理論上若真實學員手機號資料異常，也可能誤識別，但 9 位數字標準是系統既有約束，不應有例外。

### 批次刪除：逐筆呼叫 vs 單一 SQL

**選擇**：逐筆呼叫現有 `deleteMember` 邏輯（解構其內部邏輯在迴圈中執行）

**原因**：`deleteMember` 使用 Supabase client 逐表刪除，重用確保行為一致。測試帳號數量有限（< 50 筆），效能無虞。若重構為單一 SQL，需維護兩套邏輯，增加 drift 風險。

### AdminLogs：批次一筆 vs 每筆一筆

**選擇**：寫一筆批次紀錄，`details` 含 `{ deletedIds: [...], count: N }`

**原因**：測試帳號刪除是一次性管理操作，批次紀錄更易讀。個別紀錄對審計無額外價值（這些帳號本就不是真實學員）。

### UI：confirm dialog 顯示清單

在執行前先呼叫 `listTestAccounts()` 取得待刪清單，dialog 中顯示 UserID + Name，讓管理員確認範圍後再按「確認刪除」。避免誤操作。

## Risks / Trade-offs

- **誤識別**：若有人以非 9 位數字格式的真實帳號（e.g. 管理員 demo 帳號），會被識別為測試帳號。→ Mitigation：confirm dialog 顯示完整清單，管理員視覺確認後才執行。
- **刪除不可逆**：沒有 rollback。→ Mitigation：dialog 明確標示「此操作不可撤銷」，且 AdminLogs 留有紀錄（含被刪 UserID 清單）。
- **Supabase service role 必須啟用**：批次刪除需要 service role key（現有 `deleteMember` 已用此 pattern）。→ 無額外風險，沿用現有設計。

## Migration Plan

無資料庫 schema 變更，無 migration 需要。功能 deploy 後管理員在後台手動執行一次即可清除所有測試帳號。
