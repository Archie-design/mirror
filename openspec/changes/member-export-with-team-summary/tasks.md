## 1. Utilities

- [x] 1.1 在 `lib/utils/csv.ts` 新檔，匯出 `escapeCsv(value: string | number | null | undefined): string` — 依 RFC 4180 跳脫逗號 / 雙引號 / 換行
- [x] 1.2 在 `lib/utils/csv.ts` 補匯出 `formatCsvRows(rows: Array<Array<string|number|null>>): string` — 把矩陣串接成「一行一筆、欄位以逗號分隔、欄位內呼叫 `escapeCsv`」的字串

## 2. Server Action — `exportMembersWithSummary`

- [x] 2.1 在 [app/actions/admin.ts](app/actions/admin.ts) 末段新增 server action `exportMembersWithSummary(): Promise<{ success: boolean; csv?: string; error?: string }>`
- [x] 2.2 實作 D2 的 scope 判定：先 `verifyAdminSession()`、否則 `requireUser()` + 查 `IsCommandant`；其餘回 `{ success: false, error: '無權限' }`
- [x] 2.3 用 service-role Supabase client 並行抓兩個資料源（`Promise.all`）：
  - `CharacterStats` 全欄 + 篩 SquadName（管理員不篩）
  - `SquadGatheringSessions` 篩 `status='approved'` + 篩 `team_name in (對應大隊的小隊名單)`（管理員不篩）
- [x] 2.4 server 端 group by `TeamName` 計算每小隊：隊員數、總分、平均分（floor）、隊長姓名（多人「、」串接）、凝聚已核准次數
- [x] 2.5 用 `formatCsvRows` 組合成「成員區表頭 + N 列成員 + 空白行 + 小隊摘要表頭 + M 列小隊」字串，前綴 UTF-8 BOM `﻿`
- [x] 2.6 回傳 `{ success: true, csv }`；任何 throw 接到 `try/catch` 後回 `{ success: false, error: '匯出失敗：' + msg }`

## 3. 角色 → 標籤對應

- [x] 3.1 在 server action 內定義 `roleLabel(stats)`：`IsCommandant ? '大隊長' : IsCaptain ? '小隊長' : '一般'`
- [x] 3.2 大隊長的「小隊」欄填「（大隊長）」（其他角色照填 `TeamName`）

## 4. 管理員 UI — `AdminDashboard.tsx`

- [x] 4.1 在 I.i 學員名冊管理區塊（[AdminDashboard.tsx 約 line 580](components/Admin/AdminDashboard.tsx#L580)）內，緊接「批量匯入名冊」按鈕之後，加一顆「下載成員清單」按鈕
- [x] 4.2 新增 state `const [memberExporting, setMemberExporting] = useState(false)` + handler
- [x] 4.3 handler 邏輯：呼叫 `exportMembersWithSummary` → 取得 csv → 走 既有 [Blob 下載 pattern](components/Admin/AdminDashboard.tsx#L645) → 檔名 `members_export_${date}.csv`

## 5. 大隊長 UI — `CommandantTab.tsx`

- [x] 5.1 在 [CommandantTab.tsx](components/Tabs/CommandantTab.tsx) 首屏（標題附近）加一顆「下載成員清單」按鈕
- [x] 5.2 新增同名 state + handler，邏輯與 4.3 相同
- [x] 5.3 視覺：與 CommandantTab 既有風格一致（rose 主題、按鈕 padding、min-h-[44px]）

## 6. 驗證

- [x] 6.1 跑 `npx tsc --noEmit` 全綠
- [ ] 6.2 啟動 dev server，用管理員 session 點下載 → 檢查 CSV 含全營資料 + UTF-8 BOM
- [ ] 6.3 用大隊長 session 點下載 → 檢查 CSV 只有自己大隊資料、不含其他大隊
- [ ] 6.4 用 Excel 開檔 → 中文正常顯示、空行分隔成員/小隊兩區
- [ ] 6.5 一般學員從 DevTools 強制呼叫 server action → 應收到 `{ success: false, error: '無權限' }`
- [ ] 6.6 200 名測試資料下，server log 顯示單次匯出 < 1s
