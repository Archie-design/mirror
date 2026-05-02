## Why

開營後大隊長與管理員需要快速掌握全大隊或全營的成員樣貌與小隊表現，但目前只有 [exportMemberScoresCsv](app/actions/admin.ts) 一支只有「UserID, 姓名, 大隊, 小隊, 累積分數」的 CSV，且只開放管理員。大隊長手上沒有可下載的視圖、UI 也沒有依角色顯示對應出口。**遇到要做月度報表、出席稽核、調整分組時都得手動拼接資料**，這次補一支「成員批次匯出」加上「小隊摘要」一次解決。

## What Changes

- 新增成員批次匯出 server action：
  - 管理員：匯出全營成員（沒有大隊過濾）
  - 大隊長：自動限縮在自己的 `SquadName`（呼叫端不能跨大隊）
  - 一般學員：拒絕（403）
- 匯出 CSV 由「成員區」+「小隊摘要區」兩段組成，**之間以一行空白分隔**，UTF-8 BOM 避免 Excel 中文亂碼。
  - **成員區**欄位：`UserID, 姓名, 手機末三碼, 大隊, 小隊, 角色, 累積總分, Streak, 最後簽到日`
  - **小隊摘要區**欄位：`小隊名稱, 隊長姓名, 隊員數, 平均分, 總分, 凝聚已核准次數`
- 新增「下載成員清單」按鈕：
  - 管理員：放在 [AdminDashboard.tsx I.i 學員名冊管理](components/Admin/AdminDashboard.tsx#L580) 區塊下方
  - 大隊長：放在 [CommandantTab](components/Tabs/CommandantTab.tsx) 首屏顯眼位置
- **不替換** 既有的 `exportMemberScoresCsv` —— 它已被歷史按鈕引用，保留作向下相容；新功能名為 `exportMembersWithSummary`。

## Capabilities

### New Capabilities

- `member-export`: 成員與小隊摘要的批次匯出能力，含角色驅動的 scope 限制（管理員 vs 大隊長）、雙區塊 CSV 結構、出席統計。

### Modified Capabilities

（無；此 repo 之前未建立 OpenSpec specs，全部走新建）

## Impact

- **新增** `exportMembersWithSummary` server action（在 [app/actions/admin.ts](app/actions/admin.ts)）
- **新增** UI 按鈕 + handler 於 [components/Admin/AdminDashboard.tsx](components/Admin/AdminDashboard.tsx) 與 [components/Tabs/CommandantTab.tsx](components/Tabs/CommandantTab.tsx)
- **DB 讀取**：跨表 JOIN `CharacterStats` × `SquadGatheringSessions/Attendances`（讀多寫零，不改 schema）
- **權限**：沿用 `verifyAdminSession` + `requireUser` + `IsCommandant` 檢查模式，與 [scheduleSquadGathering](app/actions/squad-gathering.ts) 同款
- **效能**：200 名學員 + 27 小隊 + 過去活動，預期 < 500ms 完成查詢；無需快取
