# 組織與權限（org-roles）

## Purpose

定義系統四種角色（學員、小隊長、大隊長、管理員）的範圍、權限矩陣，以及大隊／小隊兩層組織結構與成員歸屬規則。

> 來源：[docs/GAME_DESIGN.md §2](../../../docs/GAME_DESIGN.md)、[docs/FEATURE_AUDIT_2026_05.md II-* / III-* / IV-*](../../../docs/FEATURE_AUDIT_2026_05.md)

## Requirements

### Requirement: 組織層級

系統 SHALL 採兩層組織結構：

```
大隊（Brigade，CharacterStats.SquadName）
  └── 小隊（Squad，CharacterStats.TeamName）× N
        └── 學員（Member）× M
```

**命名規範**（由 [Rosters](../auth-and-roster/spec.md) 匯入決定）：
- 大隊：「第一大隊」～「第九大隊」
- 小隊：`<大隊名>-第<1-3>小隊`，例：「第一大隊-第1小隊」

#### Scenario: 學員歸屬一個大隊一個小隊

- **WHEN** 學員 X 註冊後 Roster 比對成功
- **THEN** `SquadName='第一大隊', TeamName='第一大隊-第1小隊'`

---

### Requirement: 角色定義與旗標

`CharacterStats` SHALL 用以下 boolean 旗標表示角色：

| 角色 | 旗標 | TeamName |
|------|------|----------|
| 學員 | （無） | 必填 |
| 小隊長 | `IsCaptain=true` | 必填，與 Roster 的 team_name 一致 |
| 大隊長 | `IsCommandant=true` | **NULL**（不歸屬任何小隊） |
| 管理員 | （cookie session 認證，非 CharacterStats 旗標） | n/a |

#### Scenario: 大隊長 TeamName=NULL

- **WHEN** Roster 中 phone X 設 `is_commandant=true, team_name=null`
- **AND** X 註冊
- **THEN** CharacterStats.IsCommandant=true、TeamName=NULL

#### Scenario: 小隊長同時兼一般打卡

- **WHEN** 小隊長打 d1
- **THEN** 與一般學員相同地計分，IsCaptain 不影響打卡邏輯

---

### Requirement: 學員權限

學員 SHALL 可：
- 打卡（每日、每週、九宮格、一次性任務、臨時任務）
- 查看個人分數、Streak、本人九宮格進度
- 查看排行榜（個人、小隊）
- 提交線上凝聚申請、一次性任務申請、課程報名

學員 MUST NOT 看到：他人個人資料、其他成員的 DailyLogs 詳細、審核後台、管理工具。

#### Scenario: 學員嘗試呼叫審核 API

- **WHEN** 一般學員呼叫 `reviewBonusApplication(...)`
- **THEN** 系統拒絕並回傳「無權限」

---

### Requirement: 小隊長權限

小隊長（`IsCaptain=true`）SHALL 可：

- 查看本小隊所有成員的分數、Streak、九宮格進度
- 一級審核：戲劇進修 o2_*、線上凝聚 wk3_online、實體凝聚送審
- 取消本小隊隊員的九宮格格子（`uncompleteCellByCapt`）
- 在實體凝聚當日展示 QR 並「自助簽到」

小隊長 MUST NOT 操作：他小隊隊員、二級審核、管理後台、九宮格模板。

#### Scenario: 小隊長嘗試審他隊申請

- **WHEN** 第1小隊小隊長嘗試核准第2小隊員的 o2_1
- **THEN** 系統拒絕「僅能審本小隊申請」

---

### Requirement: 大隊長權限

大隊長（`IsCommandant=true`）SHALL 可：

- 查看本大隊所有小隊成員資料
- 安排本大隊小隊的實體凝聚日（`scheduleSquadGathering`）
- 二級審核：實體凝聚 final review、一次性任務 tier-2 final review

大隊長 MUST NOT 操作：他大隊資料、管理後台（除非另外被授予 admin session）、九宮格模板。

#### Scenario: 大隊長嘗試管理他大隊小隊

- **WHEN** 第一大隊大隊長嘗試為「第二大隊-第1小隊」排凝聚日
- **THEN** 系統拒絕「僅能排定本大隊轄下小隊」

---

### Requirement: 管理員權限

管理員身份 SHALL 透過 [admin session cookie](../../../app/actions/admin-auth.ts) 認證（不存於 `CharacterStats`）。管理員可：

- 全營成員管理（新增、轉隊、設角色、刪除）
- 名冊批量匯入 / 匯出
- 定課分值調整、定課啟停
- 臨時加碼任務管理
- 九宮格公版模板管理
- 實體凝聚排期、二級審核（覆蓋大隊長）
- 系統公告發布
- 志工密碼設定

詳細權限見 [admin-console](../admin-console/spec.md)。

#### Scenario: 管理員兼任大隊長

- **WHEN** 某帳號 IsCommandant=true 且持有 admin session
- **THEN** 兩個角色獨立運作；admin session 給予「跨大隊」操作權，IsCommandant 給予大隊長 UI 入口

---

### Requirement: 角色變更影響範圍

當管理員透過後台變更某成員角色（轉隊、升降小隊長/大隊長）時，系統 SHALL：

1. 更新 `CharacterStats.SquadName` / `TeamName` / `IsCaptain` / `IsCommandant`
2. 同步更新 `Rosters` 對應 phone 的記錄
3. 寫一筆 `AdminLogs` 含 actor、target、變更前後狀態
4. **不重置** Score / Streak / DailyLogs / 一次性任務申請

#### Scenario: 升任小隊長

- **WHEN** 管理員把學員 X 從第1小隊員升為小隊長
- **THEN** `CharacterStats.IsCaptain=true`、Roster 同步、AdminLogs 寫入、Score 不變
