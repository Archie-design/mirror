# 開發規格書 vs 實際程式碼 — 完成度比對報告

**比對日期：2026-04-04（最後更新：2026-04-04）**
**規格來源：`docs/GAME_DESIGN.md` v2.1**

---

## 一、已完成項目 (Implemented)

### 1. 定課任務系統 (Quest System) — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| q1 體運定課 (+1000, 可動態調整) | ✅ | `components/Tabs/DailyQuestsTab.tsx` |
| q1_dawn 破曉體運 (+2000, 05:00-08:00) | ✅ | 與 q1 互斥；兩者皆計入每日3種上限 |
| q2-q22 任意定課 (每日最多3種) | ✅ | 21 項全部實作；每日上限含 q1/q1_dawn（SQL migration 202604040001 修正） |
| r1 關係定課 (+2000/人, 最多3人) | ✅ | 含6種關係類型下拉選單 |
| a1 天使通話 (+500, 週1-3次) | ✅ | `components/Tabs/WeeklyTopicTab.tsx` |
| w1 親證分享 (+1000, 週最多1則) | ✅ | 含 Testimony 系統整合 |
| w2 欣賞夥伴 (+1000, 週最多3則) | ✅ | 不同人檢查 |
| w3 小隊定聚 (+5000, 月最多2次) | ✅ | 含罰款連動 |
| w4 小隊通話 (+3000, 月最多2次) | ✅ | |
| sq1-sq4 小隊主題定聚 (+3000 + 全員+2000) | ✅ | QR Code 掃碼全員到齊驗證（見第10節） |
| t1 個人主題（計劃/解盤完成 +1000） | ✅ | 依電影階段自動解鎖（`getCurrentThemePeriod().movie`） |
| t2 個人主題（每日親證 +500） | ✅ | t1 完成後才能打卡 |
| t3 沉澱週分享 (+600/則, 最多3則) | ✅ | 僅沉澱週可用 |
| b1 傳愛（訂金5千以下）+100 | ✅ | `app/actions/bonus.ts` BONUS_QUEST_CONFIG |
| b2 傳愛（訂金5千以上）+200 | ✅ | quest_id 前綴 b1/b2 正確對應計分 |
| b3-b6 額外加分 | ✅ | `app/actions/bonus.ts` 含三層審核流程 |
| b7 參加實體課程 +1000 | ✅ | quest_id 改為 `b7|{normalizedName}` 防止同課程重複申請 |
| doc1 道在江湖紀錄片（大隊主題） | ✅ | `components/Tabs/CommandantTab.tsx`，截止 2026-07-20 |
| 定課分值動態調整（管理員即時修改） | ✅ | `SystemSettings.QuestRewardOverrides`，AdminDashboard UI |
| 定課啟停控制（管理員停用/啟用） | ✅ | `SystemSettings.DisabledQuests`，DailyQuestsTab + WeeklyTopicTab 套用 |

### 2. 組織架構 — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| 大隊→小隊→學員 三層架構 | ✅ | `CharacterStats`: SquadName(大隊) + TeamName(小隊) |
| 權限層級（學員/小隊長/大隊長/管理者） | ✅ | boolean flags: IsCaptain / IsCommandant / IsGM |
| 7種小隊角色職稱 | ✅ | `setSquadRole()` in `app/actions/team.ts` |
| CSV 批次匯入名冊 | ✅ | `importRostersData()` in `app/actions/admin.ts` |
| 成員轉隊管理 UI | ✅ | AdminDashboard 成員分頁，`transferMember()` in `admin.ts` |
| 成員角色設定 UI | ✅ | AdminDashboard 成員分頁，`setMemberRole()` in `admin.ts` |
| 大隊長納入每個小隊計分 | ✅ | `RankTab.tsx`：大隊長 Exp 完整計入所屬各小隊（memberCount +1）|

### 3. 計分與排行榜 — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| 個人分數累積 | ✅ | `CharacterStats.Exp` |
| 小隊分數 = 總分 ÷ 人數（平均制，含大隊長） | ✅ | `components/Tabs/RankTab.tsx` |
| 個人榜（頭像/姓名/分數/Streak） | ✅ | |
| 小隊榜（隊名/平均分/人數/大隊長加成顯示） | ✅ | |
| Streak 連續打卡追蹤 | ✅ | `CharacterStats.Streak` |
| 中途退出仍計入平均人數 | ✅ | 無退出機制，所有成員均保留在 CharacterStats 中 |

### 4. 管理後台 — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| 後台分頁化（成員/任務/審核/系統） | ✅ | `AdminDashboard.tsx`：4-tab 導航 |
| 特殊加分副本（臨時任務） | ✅ | TemporaryQuests CRUD（任務分頁） |
| 傳愛終審（大隊長最終核准/駁回） | ✅ | `app/actions/bonus.ts`（審核分頁） |
| 管理日誌 (AdminActivityLog) | ✅ | 完整記錄所有管理操作（系統分頁） |
| 成員名冊管理（CSV 匯入 + UI 搜尋/轉隊/角色） | ✅ | AdminDashboard 成員分頁 |
| 罰款系統設定 | ✅ | `app/actions/fines.ts`（系統分頁） |
| 定課分值編輯 & 啟停開關 | ✅ | AdminDashboard 任務分頁 |
| 志工掃碼授權（密碼設定） | ✅ | `SystemSettings.VolunteerPassword`（審核分頁） |
| 修行者票房榜預覽 | ✅ | 系統分頁，即時讀取 leaderboard |

### 5. 活動時間軸 — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| 第1-4週 阿甘正傳 (5/4-5/31) | ✅ | `getCurrentThemePeriod()` in `lib/utils/time.ts` |
| 沉澱週 功夫熊貓 (6/1-6/7) | ✅ | |
| 第5-8週 哈利波特 (6/8-7/5) | ✅ | |
| 沉澱週 腦筋急轉彎 (7/6-7/12) | ✅ | |
| 道在江湖紀錄片截止（7/20） | ✅ | CommandantTab 顯示截止日期並鎖定表單 |

### 6. LINE 整合 — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| LINE Bot Webhook | ✅ | `app/api/webhook/line/route.ts` |
| LINE Login OAuth | ✅ | `app/api/auth/line/route.ts` + callback |
| Rich Menu 設定 | ✅ | `app/api/admin/setup-richmenu/route.tsx`（API 保留，後台 UI 已移除） |
| 親證故事解析→圖卡→Google Drive | ✅ | `lib/line/parser.ts` + `testimony-card.tsx` + `google-drive.ts` |
| 自動抽籤 Cron (週一 12:00 TW) | ✅ | `app/api/cron/auto-draw/route.ts` |

### 7. 課程系統 — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| 課程報名 + QR Code | ✅ | `components/Tabs/CourseTab.tsx` |
| 志工掃碼入場 | ✅ | `app/class/checkin/Scanner.tsx` |
| 出席紀錄 | ✅ | CourseAttendance 表 |

### 8. Tab 頁面 — 完成度：100%

| Tab | 元件 | 狀態 |
|-----|------|------|
| daily (每日觀影) | `DailyQuestsTab.tsx` | ✅ |
| weekly (導演報表) | `WeeklyTopicTab.tsx` | ✅ |
| stats (觀影分析) | `StatsTab.tsx` | ✅ |
| rank (票房榜) | `RankTab.tsx` | ✅ |
| captain (製片總部) | `CaptainTab.tsx` | ✅ |
| commandant (片商總部) | `CommandantTab.tsx` | ✅ |
| course (首映曆) | `CourseTab.tsx` | ✅ |

### 9. 視覺品牌 — 完成度：100%

| 規格項目 | 狀態 | 說明 |
|---------|------|------|
| 配色：深海軍藍 #1B2A4A | ✅ | 全站背景、卡片底色 |
| 配色：電影金 #F5C842 | ✅ | 標題、高亮、金榜色 |
| 配色：戲院紅 #C0392B | ✅ | 主要 CTA、個人榜強調色 |
| 配色：深灰炭黑 #16213E | ✅ | 深層背景、主頁底色 |
| 副標題「這不是電影」 | ✅ | Header 顯示（金色微字） |
| 電影裝飾圖示（膠卷、打板機等） | ✅ | `components/ui/FilmIcons.tsx`：6 種自訂 SVG（膠卷圓盤/條紋/3D眼鏡/擴音器/打板機/放映機）；Tab 導覽列圖示、Header 膠卷條紋分隔線、Login 頁面浮動裝飾 |

### 10. 小隊主題定聚 QR 簽到系統 — 完成度：100%

| 規格項目 | 狀態 | 實作位置 |
|---------|------|---------|
| SquadGatheringCheckins 資料表 | ✅ | `supabase/migrations/202604040002_squad_gathering_checkins.sql` |
| 開啟定聚（小隊長產生 gathering_id） | ✅ | `WeeklyTopicTab.tsx`：按下主題按鈕產生 `{themeId}\|{teamName}\|{date}` |
| 顯示 QR Code（成員掃碼連結） | ✅ | `WeeklyTopicTab.tsx`：`react-qr-code` 顯示 `/squad-checkin?g=...` URL |
| 即時到場名單（小隊長視角） | ✅ | `getGatheringStatus()` in `app/actions/squad-gathering.ts` |
| 成員掃碼落地頁 | ✅ | `app/squad-checkin/page.tsx`：支援 LINE uid 自動簽到 + 姓名末三碼手動查找 |
| 全員到齊後解鎖 +2000 按鈕 | ✅ | `awardGatheringFullBonus()` in `app/actions/squad-gathering.ts` |

---

## 二、待完成 / 有落差項目

> **目前無待辦項目。** 所有規格書功能已全數實作完成。

---

## 三、更新紀錄

### 2026-04-04（本次）

| 項目 | 內容 |
|------|------|
| q1 每日上限修正 | SQL migration 202604040001：q1/q1_dawn 計入每日3種上限；DailyQuestsTab 前端顯示邏輯同步修正 |
| b7 同課程去重 | `bonus.ts`：quest_id 改為 `b7\|{normalizedName}`，防止同活動多次申請 |
| sq1-sq4 QR 掃碼定聚 | 新增 SquadGatheringCheckins 表、squad-gathering server actions、/squad-checkin 掃碼頁、WeeklyTopicTab QR 流程 |
| 個人主題任務標題 | 改由 `getCurrentThemePeriod().movie` 日期驅動，移除後台手動設定欄位 `TopicQuestTitle` |
| Admin 後台重構 | 移除天使通話配對、LINE Rich Menu UI、親證故事存檔；新增4分頁導航（成員/任務/審核/系統） |
| 視覺品牌裝飾圖示 | 新增 `components/ui/FilmIcons.tsx`（6種自訂 SVG）；套用至 Login 背景、Header 分隔線、Tab 圖示 |

### 2026-04-03

| 項目 | 內容 |
|------|------|
| b1/b2 計分修正 | `bonus.ts` BONUS_QUEST_CONFIG 新增 b1(+100)/b2(+200)，quest_id 前綴正確 |
| 定課分值動態調整 | `SystemSettings.QuestRewardOverrides`，Admin UI + DailyQuestsTab + WeeklyTopicTab |
| 定課啟停控制 | `SystemSettings.DisabledQuests`，各 Tab 套用過濾 |
| 道在江湖紀錄片 | `CommandantTab.tsx` 新增提交 UI，`bonus.ts` 新增 doc1 類型 |
| 成員管理 UI | AdminDashboard 新增搜尋/轉隊/角色調整，`admin.ts` 新增 3 個 action |
| 視覺品牌調整 | 全站配色換為規格書色盤，Header 新增副標題 |
| 大隊長計分整合 | `RankTab.tsx`：大隊長等同每個小隊的額外成員，Exp 完整計入各隊均分 |

---

## 四、總結

| 類別 | 完成度 |
|------|--------|
| 定課任務系統 | **100%** |
| 組織架構 | **100%** |
| 計分與排行榜 | **100%** |
| 管理後台 | **100%** |
| 活動時間軸 | **100%** |
| LINE 整合 | **100%** |
| 課程系統 | **100%** |
| 視覺主題 | **100%** |
| 小隊主題定聚 QR 簽到 | **100%** |
| **整體** | **100%** |
