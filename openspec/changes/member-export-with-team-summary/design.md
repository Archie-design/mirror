## Context

* 既有 [exportMemberScoresCsv](app/actions/admin.ts#L633) 只提供管理員、欄位精簡（UserID, 姓名, 大隊, 小隊, 累積分數），且只在 [AdminDashboard.tsx](components/Admin/AdminDashboard.tsx) 有按鈕。
* 大隊長已可透過 [CommandantTab.tsx](components/Tabs/CommandantTab.tsx) 查看與管理大隊事務，但沒有資料匯出能力。
* 認證模式參考 [scheduleSquadGathering](app/actions/squad-gathering.ts) — 用 `requireUser()` 取得 userId、查 `IsCommandant` 旗標決定權限；`verifyAdminSession()` 是另一條獨立的管理員通道。
* CSV 已有「UTF-8 BOM」做法 ([admin.ts:648](app/actions/admin.ts#L648))，可沿用。
* 凝聚資料表 `SquadGatheringSessions`（`status='approved'`）來自 [202604210001_squad_gathering_sessions.sql](supabase/migrations/202604210001_squad_gathering_sessions.sql)。

## Goals / Non-Goals

**Goals**
- 一支 server action `exportMembersWithSummary` 同時處理管理員與大隊長兩種 scope。
- 雙區塊 CSV：成員區 + 小隊摘要區，單一空行分隔。
- 兩個前端入口（AdminDashboard、CommandantTab）皆呼叫同一支 action，差異只在 scope 由 server 端推斷。
- 效能：200 成員 × 27 小隊 × 80 凝聚 → < 1 秒、無 N+1。

**Non-Goals**
- 不替換或刪除既有 `exportMemberScoresCsv`（仍有舊 UI 在引用）。
- 不引入新的 DB 欄位、不改 schema。
- 不做匯入功能（只匯出）。
- 不做 server-side cache（資料量小、且實際只在月底偶發呼叫）。

## Decisions

### D1：單一 action 內部分支 vs. 兩個 action

**選**：單一 `exportMembersWithSummary(scopeOverride?)`，呼叫端不傳 scope，server 自己決定。

**為什麼**：
- 安全：呼叫端永遠不能宣稱自己是其他大隊長 / 管理員 — server 認 cookie 即可。
- DRY：兩個 action 90% 邏輯重疊。
- UX 一致：兩個按鈕綁同一個 endpoint。

**對立方案**：兩個獨立 action（admin / commandant）。優點是路徑明確、權限分離，但 query 邏輯就要寫兩次。否決。

### D2：scope 判定順序

```typescript
// 1. 先看 admin session
if (await verifyAdminSession()) return { scope: 'all' };

// 2. 再看 user session + IsCommandant
const userId = await requireUser();
const stats = await supabase.from('CharacterStats')
  .select('SquadName, IsCommandant').eq('UserID', userId).single();
if (stats?.IsCommandant && stats.SquadName) return { scope: stats.SquadName };

return null;  // 拒絕
```

管理員身份優先 — 若管理員恰好也是某個大隊長，匯出全營（與 AdminDashboard 的視角一致）。

### D3：DB 查詢分 3 trip vs. 1 個 view

**選**：3 個獨立查詢（並行 `Promise.all`）：
1. `CharacterStats` 篩 SquadName
2. 由 1 取得的 TeamName list → `SquadGatheringSessions` 篩 `status='approved'`，計算每個小隊的 count
3. 沒有 trip 3，只是把 1+2 在 server 記憶體 group by

實際就是 2 個 round trip，組合在 server。

**為什麼**：
- 200 筆 + 80 筆 → 兩個簡單查詢直覺、易測。
- 無需建 view（無 schema 變更）。
- N+1 風險為零（沒有 per-team 查詢）。

**對立方案**：在 PostgreSQL 寫一個 RPC function 一次回傳所有資料。優點是單一 round trip，但維護成本高（schema 變更要記得改 view），效益有限。否決。

### D4：CSV 格式為單檔雙區塊 vs. 兩個 CSV

**選**：單一 CSV，內含「成員區」+ 空行 + 「小隊摘要區」。

**為什麼**：
- 用戶說「下載成員清單」概念上是一個檔案。
- Excel 開啟時兩個區塊都看得到，可分頁複製。
- 兩個檔案需要打包 zip 或選擇器，UI 複雜。

**對立**：產 ZIP 含兩個 CSV。否決，過度工程。

### D5：CSV escaping

用最小化的 RFC 4180 規則：欄位若含 `,`、`"`、`\n` 任一字元，整個欄位用雙引號包覆，內部雙引號加倍為 `""`。寫一個 `escapeCsv(value: string)` helper 在 [lib/utils](lib/utils/) 新檔案。

### D6：UI 反饋

按鈕在處理期間：
- disabled
- 文字「匯出中…」
- 完成後文字復原、錯誤時用 `setModalMessage` 顯示

跟 [exportMemberScoresCsv 的按鈕](components/Admin/AdminDashboard.tsx#L640) 同款體驗。

## Risks / Trade-offs

| 風險 | 對策 |
|------|------|
| **CSV 雙區塊開啟在 Excel 會把空行視為新表格** | 接受 — 用戶實際使用反而方便（空行隔開兩段）；docs 說明即可 |
| **大隊長若已在管理員 session 切回大隊視角會匯出全營** | 接受 — D2 的設計即是「以最高權限優先」 |
| **未來成員擴張到 1000+** | Pre-1k 沒問題；之後考慮 streaming response |
| **凝聚計數查詢可能漏掉 archived 狀態** | spec 已明定 `status='approved'`；其他狀態不算 |
| **手機末三碼洩漏** | 末三碼本就不是機密（用於登入第二因子的部分）；管理員 / 大隊長角色看見合理 |

## Migration Plan

1. 部署新 server action — 不影響既有功能
2. 部署 UI 按鈕 — 出現於對應角色的視圖
3. **無 DB migration**
4. **rollback**：直接 revert UI commit 即可（server action 不被任何既有功能引用）

## Open Questions

無 — 所有決策已收斂。
