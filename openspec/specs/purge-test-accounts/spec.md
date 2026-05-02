# 清除測試帳號（purge-test-accounts）

## Purpose

定義測試帳號的識別規則及批次清除機制，供管理員在後台一鍵清除非正式學員帳號。

## Requirements

### Requirement: 識別測試帳號

系統 SHALL 將 `CharacterStats.UserID` 不符合 `^[0-9]{9}$` 的帳號識別為測試帳號。管理員 SHALL 可透過 `listTestAccounts()` 取得待清除帳號清單。

#### Scenario: 查詢測試帳號清單

- **WHEN** 管理員進入「清除測試帳號」流程
- **THEN** 系統回傳所有 UserID 不符合 9 位數字的 CharacterStats 記錄（含 UserID、Name）

#### Scenario: 標準帳號不被識別

- **WHEN** 學員 UserID='912345678'（9 位數字）
- **THEN** 此帳號不出現在測試帳號清單中

---

### Requirement: 批次清除測試帳號

管理員 SHALL 可透過 `purgeTestAccounts()` 一次刪除所有測試帳號。每筆刪除 MUST 執行與 `deleteMember` 相同的完整清除邏輯（CharacterStats、DailyLogs、BonusApplications、CourseRegistrations、UserNineGrid、Rosters）。操作完成後 MUST 寫一筆批次 AdminLogs。

#### Scenario: 批次清除成功

- **WHEN** 管理員確認清除 N 筆測試帳號
- **THEN** N 筆帳號的 CharacterStats 及所有關聯資料清空、AdminLogs 新增一筆 action='purge_test_accounts'，details 含 `{ deletedIds: [...], count: N }`

#### Scenario: 無測試帳號時空跑

- **WHEN** 系統中已無測試帳號、管理員再次執行清除
- **THEN** server 回傳 `{ count: 0 }`、不寫 AdminLogs（無操作無需記錄）

#### Scenario: 標準帳號不被刪除

- **WHEN** 管理員執行批次清除
- **THEN** UserID 符合 9 位數字的帳號完全不受影響
