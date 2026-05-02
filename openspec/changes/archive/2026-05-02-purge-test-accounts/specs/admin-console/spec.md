## MODIFIED Requirements

### Requirement: 成員管理（Tab I）

管理員 SHALL 可：

- **批量匯入名冊**：貼 CSV → `importRostersData`，詳見 [auth-and-roster](../auth-and-roster/spec.md)
- **列出全部成員**：`listAllMembers()`，含 UserID/Name/SquadName/TeamName/角色/Score/Streak
- **轉隊**：`transferMember(targetUserId, newSquadName, newTeamName)`
- **設定角色**：`setMemberRole(targetUserId, { isCaptain?, isCommandant?, isGM? })`
- **刪除成員**：`deleteMember(targetUserId)`，**會清空相關資料**：CharacterStats、DailyLogs、BonusApplications、CourseRegistrations、UserNineGrid、Rosters
- **匯出成員分數 CSV**：`exportMemberScoresCsv()`，UTF-8 BOM
- **查看活躍度統計**：`getMemberActivityStats()`
- **清除測試帳號**：`purgeTestAccounts()`，批次刪除所有 UserID 不符合 `^[0-9]{9}$` 的帳號；操作前顯示待刪清單供確認

每筆操作 MUST 寫入 `AdminLogs`。

#### Scenario: 刪除成員清空資料

- **WHEN** 管理員刪除學員 X（UserID=912345678）
- **THEN** CharacterStats、DailyLogs、Rosters、BonusApplications、CourseRegistrations、UserNineGrid 中 X 的所有紀錄清空、AdminLogs 新增一筆

#### Scenario: 轉隊

- **WHEN** 管理員把學員 X 從第1小隊轉到第2小隊
- **THEN** CharacterStats.SquadName/TeamName 更新、Rosters 同步、AdminLogs 寫入

#### Scenario: 清除測試帳號需確認

- **WHEN** 管理員點擊「清除測試帳號」按鈕
- **THEN** UI 顯示待刪帳號清單（UserID + Name）及「此操作不可撤銷」警告；管理員按「確認刪除」後執行 `purgeTestAccounts()`
