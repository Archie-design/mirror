# 認證與名冊（auth-and-roster）

## Purpose

定義學員註冊（手機 + 姓名）、登入（姓名 + 手機末三碼）、LINE Login 綁定/登入流程，以及 `Rosters` 名冊（管理員預先匯入的學員白名單）的 PK 規則與註冊時自動回填邏輯。

> 來源：[docs/ARCHITECTURE.md §4.3](../../../docs/ARCHITECTURE.md)、[docs/FEATURE_AUDIT_2026_05.md IV-1](../../../docs/FEATURE_AUDIT_2026_05.md)、[CLAUDE.md](../../../CLAUDE.md)

## Requirements

### Requirement: UserID 為標準化手機

`CharacterStats.UserID` SHALL 為標準化後的 9 位數手機號碼。標準化由 [standardizePhone](../../../lib/utils/phone.ts) 提供：移除所有非數字、若 10 位且開頭為 0 則去掉開頭 0，最終為 9 位字串。

#### Scenario: 09 開頭手機標準化

- **WHEN** 學員填手機 `0912345678`
- **THEN** UserID = `912345678`

#### Scenario: 9 位開頭手機標準化

- **WHEN** 學員填手機 `912345678`
- **THEN** UserID = `912345678`（一致）

#### Scenario: 含分隔符標準化

- **WHEN** 學員填手機 `0912-345-678`
- **THEN** UserID = `912345678`（移除 `-`）

---

### Requirement: 註冊流程

註冊 SHALL 透過 `registerAccount({ name, phone, email?, fortunes? })`：

1. 驗證 name + phone 必填
2. `userId = standardizePhone(phone)`，無效時拒絕
3. 查 `Rosters` 對應 `phone = userId` 的紀錄
4. 若 Roster 命中：自動帶入 `SquadName`、`TeamName`、`IsCaptain`、`IsCommandant`
5. INSERT `CharacterStats`，違反 unique（同手機已註冊）回傳「此手機號碼已經建立過帳號」
6. 設定 session cookie
7. 若提供 fortunes：依最低運自動 `initMemberGrid`

#### Scenario: 名單驗證模式 + Roster 命中

- **WHEN** Roster 含 phone=912345678, team_name=「第一大隊-第1小隊」
- **AND** 學員以該手機註冊
- **THEN** CharacterStats 建立、自動帶入 SquadName/TeamName，session cookie 設定

#### Scenario: 名單驗證模式 + Roster 未命中

- **WHEN** Roster 不含學員手機，但 SystemSettings.RegistrationMode='roster'
- **THEN** **依目前實作**：CharacterStats 仍建立、SquadName/TeamName 為空（學員可進入但未分組）；管理員應之後匯入名冊回填

#### Scenario: 重複註冊

- **WHEN** 學員以已存在的手機嘗試註冊
- **THEN** 系統拒絕「此手機號碼已經建立過帳號」

---

### Requirement: 登入流程

登入 SHALL 透過 `loginWithPhone(name, phoneSuffix)`：

1. 驗證 name + phoneSuffix 必填
2. `SELECT * FROM CharacterStats WHERE Name = ? AND UserID LIKE '%<suffix>'`
3. 命中 → 設定 session cookie（30 分鐘 localStorage + HttpOnly cookie）
4. 未命中 → 「查無此觀影者帳號」

`phoneSuffix` 通常為手機末三碼，但實作允許任何長度後綴。

#### Scenario: 末三碼登入成功

- **WHEN** 學員 UserID=912345678、Name='王小明'
- **AND** 輸入 name='王小明', phoneSuffix='678'
- **THEN** 系統命中、設定 session、回傳 stats

#### Scenario: 姓名錯誤

- **WHEN** 輸入 name='王大明', phoneSuffix='678'
- **THEN** 系統回「查無此觀影者帳號」（不洩漏哪個欄位錯）

---

### Requirement: Rosters PK 為 phone

`Rosters` 表 SHALL 以 `phone`（標準化後 9 位）為 PRIMARY KEY。表結構：

```sql
CREATE TABLE Rosters (
    phone TEXT PRIMARY KEY,
    name TEXT,
    birthday TEXT,
    squad_name TEXT,
    team_name TEXT,
    is_captain BOOLEAN DEFAULT false,
    is_commandant BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

匯入時 `importRostersData` MUST 對 CSV 第一欄呼叫 `standardizePhone` 標準化、長度不為 9 的列略過（含 CSV 表頭）。

#### Scenario: CSV 含表頭被略過

- **WHEN** 管理員貼上 CSV 含表頭列 `phone,name,...`
- **THEN** 表頭列 `standardizePhone('phone')` 結果長度不為 9，被略過

#### Scenario: 09xx 與 9xx 視為同一筆

- **WHEN** CSV 同一 phone 一行寫 `0912345678` 一行寫 `912345678`
- **THEN** 兩列標準化為 `912345678`，後者覆蓋前者（ON CONFLICT DO UPDATE）

---

### Requirement: 名冊匯入同步 CharacterStats

`importRostersData` MUST 在 INSERT/UPSERT Rosters 之後，對既已註冊的 CharacterStats 同步以下欄位：

```sql
UPDATE CharacterStats SET
  SquadName = roster.squad_name,
  TeamName = roster.team_name,
  IsCaptain = roster.is_captain,
  IsCommandant = roster.is_commandant,
  Birthday = COALESCE(roster.birthday, CharacterStats.Birthday)
WHERE CharacterStats.UserID = roster.phone
```

未註冊的 phone 只進 Rosters，等該人註冊時自動帶入。

#### Scenario: 已註冊用戶分組變更

- **WHEN** 管理員匯入 CSV 把學員 X（已註冊，UserID=912345678）從第1小隊改到第2小隊
- **THEN** Rosters.phone=912345678 更新、CharacterStats.UserID=912345678 同步更新 TeamName

#### Scenario: 未註冊 phone

- **WHEN** CSV 含 phone=987654321 但該人尚未註冊
- **THEN** Rosters 多一筆、CharacterStats 不變；該人之後註冊時自動帶入

---

### Requirement: LINE Login 綁定與登入

系統 SHALL 提供兩個 LINE OAuth 動作：

- **綁定**（`?action=bind&uid=<UserID>`）：登入後的學員把自己 LINE 帳號綁到 CharacterStats.LineUserId
- **登入**（`?action=login`）：未登入者用 LINE 直接登入，需該 LINE 帳號已綁定

**狀態流轉**：

| 狀態 | 動作 |
|------|------|
| 學員未綁定，按 LINE 登入 | 導 `/?line_error=not_bound` |
| 學員已綁定，按 LINE 登入 | callback 設定 2 分鐘 HttpOnly cookie → 前端 GET `/api/auth/session` 取出 userId、設 30 分鐘 localStorage session |
| 學員按 LINE 綁定 | callback UPDATE LineUserId、導 `/?line_bound=success` |

#### Scenario: 綁定後可用 LINE 登入

- **WHEN** 學員 X 完成 LINE 綁定
- **AND** 之後在新瀏覽器點「用 LINE 登入」
- **THEN** OAuth 完成後回到首頁、進入登入狀態

#### Scenario: 未綁定學員嘗試 LINE 登入

- **WHEN** LINE 帳號未綁定任何 CharacterStats
- **THEN** 導 `/?line_error=not_bound`、提示「請先以姓名 + 手機末三碼登入後再進行綁定」

---

### Requirement: Session 有效期

學員 session SHALL 有以下兩層：

1. **HttpOnly cookie**（server-only）：用於 server actions 的 `requireUser()` / `requireSelf(userId)` 檢查；簽章後存入 cookie
2. **localStorage `session_uid`**：30 分鐘有效，前端用於恢復登入狀態（refresh / 重新進入頁面）

`returnTo` URL 參數 SHALL 在以下情境被遵守：學員按需登入流程（如掃 QR 凝聚頁未登入）後，自動 redirect 到原本要去的頁面。

#### Scenario: localStorage 過期

- **WHEN** 學員 31 分鐘後重新打開頁面
- **THEN** localStorage 已過期、前端顯示登入畫面

#### Scenario: returnTo 跳轉

- **WHEN** 學員從 `/squad-gathering/<id>` 跳到 `/?returnTo=/squad-gathering/<id>?autoCheckin=1`
- **AND** 完成登入或自動恢復 session
- **THEN** 系統 redirect 到 `/squad-gathering/<id>?autoCheckin=1`、自動觸發掃碼簽到
