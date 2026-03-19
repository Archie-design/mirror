# 成就系統 (Achievement System)

## Context

目前玩家完成定課後只有 exp/coins/骰子等數值回饋，缺乏長期積累的成就感與驚喜感。本系統為日常定課、每週任務、臨時任務設計一套「秘密成就」機制：**條件對玩家隱藏**，只顯示模糊提示，讓玩家自行探索發現。解鎖時有儀式感的彈窗通知。

---

## 設計原則

- **條件永遠不公開**：unlock logic 只存在於 server action，client 只看到 hint（模糊提示）
- **未解鎖成就**：暗色卡片，🔒圖示，「???」標題，hint 文字（微暗斜體）
- **已解鎖成就**：稀有度色彩邊框 + 外發光效果，成就名 + 描述 + 解鎖日期
- **解鎖當下**：check-in 後彈出專屬「成就解鎖」modal（有稀有度動畫）

---

## 成就目錄（共 43 個）

稀有度：常見 / 罕見 / 稀有 / 傳說

### 一、一般定課成就（30 個）

| ID | 名稱 | 稀有 | Hint | 描述（解鎖後） | 條件（server-only） |
|----|------|------|------|--------------|---------------------|
| first_step | 千里之行 | 常見 | 萬事起於足下… | 完成了人生第一個定課 | 總打卡數 ≥ 1 |
| full_day | 圓滿一日 | 常見 | 今日已盡，無悔矣 | 在同一邏輯日完成 3 個定課 | 單日 3 個 q-prefix quest |
| streak_3 | 三日不輟 | 常見 | 三天，是個開始… | 連續 3 天完成打拳定課 | q1/q1_dawn 連續 3 天 |
| dawn_boxer | 破曉修士 | 常見 | 清晨的微光有你的身影 | 累計破曉打拳 5 次 | q1_dawn × 5 |
| veg_pioneer | 蓮台素客 | 常見 | 一飲一啄，皆有定數… | 累計海鮮素 20 次 | q6 × 20 |
| early_sleeper | 夜歸明月 | 常見 | 子時前已入夢… | 累計子時入睡 20 次 | q7 × 20 |
| weekly_caller | 小天使之約 | 常見 | 緣分自有定時… | 累計小天使通話 5 次 | w1 × 5 |
| comeback | 回頭是岸 | 罕見 | 路雖繞，終能歸… | 某項定課超過 7 天未做，今日重新完成 | 任一日課 gap ≥ 7 天後完成 |
| streak_7 | 七日精進 | 罕見 | 七，是完整的數字… | 連續 7 天完成打拳定課 | q1/q1_dawn 連續 7 天 |
| full_week | 圓滿五日 | 罕見 | 無一日荒廢… | 連續 5 天各完成至少 1 個定課 | 任意 quest 連續 5 天 |
| dawn_devotee | 寅時武者 | 罕見 | 天還未亮，你已… | 累計破曉打拳 20 次 | q1_dawn × 20 |
| meditation_master | 定慧之境 | 罕見 | 心靜方能見本性… | 累計感恩冥想 30 次 | q2 × 30 |
| dance_devotee | 當下之身 | 罕見 | 舞動即是修行… | 累計當下之舞 30 次 | q3 × 30 |
| role_cure_10 | 破執之路 | 罕見 | 心魔有名，方能破解… | 累計完成解毒定課 10 次 | role cureTaskId × 10 |
| w4_giver | 傳愛使者 | 罕見 | 愛是唯一不減的資源… | 累計傳愛任務 10 次 | w4 × 10 |
| topic_devotee | 主題探索者 | 罕見 | 每個主題都是一扇門… | 累計主題親證 5 次 | t-prefix × 5 |
| yuanmeng | 圓夢行者 | 罕見 | 夢想不是用想的… | 累計親證圓夢 3 次 | bd_yuanmeng × 3 |
| all_daily | 七藝初探 | 罕見 | 七種修行，缺一不可… | 每項日課各完成過一次 | q1(or q1_dawn)、q2-q7 各≥1次 |
| temp_master | 隨機應變 | 罕見 | 世事難料，但你準備好了… | 累計完成臨時任務 5 次 | temp_* × 5 |
| marathon | 百日征途 | 稀有 | 修行路上，計步者長 | 累計完成 100 個定課 | 總打卡數 ≥ 100 |
| mastery_q1 | 打拳宗師 | 稀有 | 拳不離手，曲不離口… | 累計打拳 50 次 | (q1+q1_dawn) × 50 |
| phoenix | 浴火重生 | 稀有 | 塵封已久的修行，重新燃起… | 某項定課超過 14 天未做，今日重新完成 | 任一日課 gap ≥ 14 天後完成 |
| streak_30 | 月之恆心 | 稀有 | 月滿則虧，但在滿之前… | 連續 30 天完成打拳定課 | q1/q1_dawn 連續 30 天 |
| role_cure_50 | 執念消融 | 稀有 | 重複，是最深的修行… | 累計完成解毒定課 50 次 | role cureTaskId × 50 |
| five_hundred | 五百修為 | 稀有 | 路遙知馬力… | 累計完成 500 個定課 | 總打卡數 ≥ 500 |
| dawn_legend | 破曉傳說 | 稀有 | 日日破曉，心不曾眠… | 累計破曉打拳 50 次 | q1_dawn × 50 |
| full_month | 月圓無缺 | 稀有 | 一月之中，滴水不漏… | 連續 20 天各完成至少 1 個定課 | 任意 quest 連續 20 天 |
| prodigal | 置之死地 | 傳說 | 有些事，你以為永遠不會再做了… | 某項定課超過 30 天未做，今日重新完成 | 任一日課 gap ≥ 30 天後完成 |
| omnipractice | 無所不修 | 傳說 | 修行無邊，卻有人走遍… | 完成過所有類型定課（q1-q7、w1-w4、t、bd_yuanmeng）| 所有 quest 類型各≥1次 |
| eternal_dawn | 永恆破曉 | 傳說 | 傳說中有人，每日破曉… | 連續 7 天完成破曉打拳 | q1_dawn 連續 7 天 |

### 二、團隊協作成就（3 個）

> 需查詢同小隊成員的 DailyLogs：以 `CharacterStats.TeamName` 找出隊友 UserID 列表，再比對當日記錄。

| ID | 名稱 | 稀有 | Hint | 描述（解鎖後） | 條件（server-only） |
|----|------|------|------|--------------|---------------------|
| team_punch | 同心齊拳 | 罕見 | 獨行者快，眾行者遠… | 與隊友在同一天都完成了打拳定課 | 當日隊內 ≥ 2 人完成 q1/q1_dawn（含自己）|
| team_perfect | 眾志成城 | 稀有 | 你的小隊創造了奇蹟… | 小隊全員在同一天都有打卡記錄 | 當日隊內全員各至少 1 個 quest |
| team_streak | 共修三日 | 稀有 | 同行三天，心更近了… | 與任一隊友連續 3 天同日完成打拳 | 任一隊友連續 3 天同日皆有 q1/q1_dawn |

### 三、角色職業專屬成就（10 個，每職業 2 個）

> 條件中加入 `CharacterStats.Role === 'X'` 判斷，其他職業永遠無法解鎖（卡片顯示「此成就與你的職業無緣」而非通用 hint）。

| ID | 名稱 | 職業 | 稀有 | Hint | 描述（解鎖後） | 條件 |
|----|------|------|------|------|--------------|------|
| wukong_dawn | 齊天武聖 | 孫悟空 | 稀有 | 某位鬥戰勝佛的傳人… | 身為孫悟空，累計破曉打拳 30 次 | Role=孫悟空 + q1_dawn × 30 |
| wukong_spirit | 火眼金睛 | 孫悟空 | 罕見 | 神識洞明，萬象皆透… | 神識屬性達到 20 點 | Role=孫悟空 + Spirit ≥ 20 |
| bajie_veg | 齋戒持身 | 豬八戒 | 稀有 | 老豬也有清靜之日… | 身為豬八戒，累計海鮮素 30 次 | Role=豬八戒 + q6 × 30 |
| bajie_physique | 根骨渾厚 | 豬八戒 | 罕見 | 力大無窮，從此而來… | 根骨屬性達到 20 點 | Role=豬八戒 + Physique ≥ 20 |
| wujing_chant | 悟淨持念 | 沙悟淨 | 稀有 | 水中沙，心中定… | 身為沙悟淨，累計嗯啊吽七次 30 次 | Role=沙悟淨 + q4 × 30 |
| wujing_savvy | 慧根深種 | 沙悟淨 | 罕見 | 悟性如流水，無形無礙… | 悟性屬性達到 20 點 | Role=沙悟淨 + Savvy ≥ 20 |
| horse_gratitude | 五感圓融 | 白龍馬 | 稀有 | 馬行千里，感恩相隨… | 身為白龍馬，累計五感恩 30 次 | Role=白龍馬 + q5 × 30 |
| horse_charisma | 魅力非凡 | 白龍馬 | 罕見 | 行者之魅，眾人傾心… | 魅力屬性達到 20 點 | Role=白龍馬 + Charisma ≥ 20 |
| monk_dance | 疑心盡消 | 唐三藏 | 稀有 | 師父的心，終於放下… | 身為唐三藏，累計當下之舞 30 次 | Role=唐三藏 + q3 × 30 |
| monk_streak | 取經之心 | 唐三藏 | 傳說 | 十萬八千里，一步未停… | 連續 14 天有完成任意定課 | Role=唐三藏 + 任意 quest 連續 14 天 |

---

## 技術架構

### 1. 資料庫 Migration

新建：`supabase/migrations/202603210000_achievements.sql`

```sql
CREATE TABLE IF NOT EXISTS "Achievements" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "CharacterStats"("UserID") ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON "Achievements" (user_id);
```

### 2. `lib/achievements.ts`（新建，client-safe）

```typescript
export interface AchievementDef {
  id: string;
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: string;           // emoji
  hint: string;           // 永遠對玩家顯示（模糊提示）
  description: string;    // 只在解鎖後顯示
  roleExclusive?: string; // 職業限定；非本職業卡片顯示「此成就與你的職業無緣」
}

export const ACHIEVEMENTS: AchievementDef[] = [ /* 43 個，無任何條件邏輯 */ ];
export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

export const RARITY_STYLE = {
  common:    { border: 'border-orange-700/50', glow: 'shadow-orange-900/40',  text: 'text-orange-400',  bg: 'bg-orange-950/30',  label: '常見' },
  rare:      { border: 'border-slate-400/50',  glow: 'shadow-slate-500/40',   text: 'text-slate-200',   bg: 'bg-slate-700/20',   label: '罕見' },
  epic:      { border: 'border-yellow-500/60', glow: 'shadow-yellow-600/50',  text: 'text-yellow-300',  bg: 'bg-yellow-950/30',  label: '稀有' },
  legendary: { border: 'border-purple-500/70', glow: 'shadow-purple-600/60',  text: 'text-purple-300',  bg: 'bg-purple-950/30',  label: '傳說' },
};
```

### 3. `app/actions/achievements.ts`（新建，server-only）

**`checkAndUnlockAchievements(userId, newQuestId)`** → `Promise<string[]>`
- 查詢：`DailyLogs`（全部，order by Timestamp）、`CharacterStats`（Role + 六維 stats + TeamName）、`Achievements`（已解鎖）
- 團隊成就額外查：同 TeamName 的所有隊友 UserID → 當日 DailyLogs
- 內部工具函數（server 私有）：
  - `getMaxConsecutiveDays(sortedDates: string[])`
  - `getStreakEndingOn(sortedDates: string[], target: string)`
  - `getDaysSinceLastDone(sortedDates: string[], today: string)` — gap 天數（今天完成前距上次幾天）
- 比對 43 個成就條件，batch insert 新解鎖，回傳新解鎖 `string[]`

**`getUserAchievements(userId)`** → `Promise<{achievement_id: string, unlocked_at: string}[]>`

### 4. 修改 `app/actions/quest.ts`

`processCheckInTransaction` 成功 COMMIT 後 await achievement check，整合進回傳值：

```typescript
const newAchievements = await checkAndUnlockAchievements(userId, questId);
return { ..., newAchievements };
```

### 5. `app/page.tsx` 修改

- 新增 `achievementQueue: AchievementDef[]` state
- 新增 `'achievements'` 到 `activeTab` union type
- Tab 導覽列新增「🏆成就」按鈕
- 新增 `userAchievements` state，mount 時 + check-in 後以 `getUserAchievements` 刷新
- 新增 `AchievementUnlockModal`：

```
┌─────────────────────────────┐
│  ✨ 成就解鎖！               │
│                             │
│  [稀有度色彩邊框+glow 大卡]  │
│   🌸 破曉修士               │  ← 稀有度色文字
│   [稀有 • 2026-03-19]       │
│   累計破曉打拳 5 次…         │  ← 描述（解鎖後才顯示）
│                             │
│      [ 領旨！ ]              │
└─────────────────────────────┘
```

多個成就時 queue 依序彈出（fixed, z-[1100]）。

### 6. 新建 `components/Tabs/AchievementsTab.tsx`

Props：`{ achievements: {achievement_id: string, unlocked_at: string}[], userData: CharacterStats }`

**Layout：**
- Header：「已解鎖 X / 43 個成就」＋進度條
- 稀有度篩選 tabs（全部 / 常見 / 罕見 / 稀有 / 傳說），sticky
- `grid grid-cols-2 gap-3`，卡片最小高度 100px

**卡片視覺：**

```
已解鎖：
┌══════════════════════╗  ← 稀有度彩色邊框 + shadow glow
║  🔥  打拳宗師         ║
║  [稀有]              ║
║  累計打拳 50 次…      ║
║  2026-03-15 解鎖      ║
╚══════════════════════╝

未解鎖（一般）：
┌──────────────────────┐  ← 暗灰邊框
│  🔒  ???             │
│  拳不離手，曲不離口…  │  ← hint，dim 斜體小字
└──────────────────────┘

未解鎖（職業限定，非本職業）：
┌──────────────────────┐
│  🚫  此成就與你的      │  ← opacity-40
│     職業無緣          │
└──────────────────────┘
```

### 7. 修改 `types/index.ts`

```typescript
export interface AchievementRecord {
  achievement_id: string;
  unlocked_at: string;
}
```

---

## 關鍵檔案

| 檔案 | 動作 |
|------|------|
| `supabase/migrations/202603210000_achievements.sql` | **新建** |
| `lib/achievements.ts` | **新建**：43 個成就定義（純展示，無條件） |
| `app/actions/achievements.ts` | **新建**：check + unlock server action |
| `app/actions/quest.ts` | **修改**：COMMIT 後 await checkAndUnlockAchievements |
| `components/Tabs/AchievementsTab.tsx` | **新建**：獨立成就頁面 |
| `app/page.tsx` | **修改**：新 tab + AchievementUnlockModal + state |
| `types/index.ts` | **修改**：AchievementRecord 型別 |

---

## 驗證

1. 完成第一個定課 → 彈出「千里之行」modal（常見橘色邊框）
2. 連續 3 天打拳 → 彈出「三日不輟」（罕見銀色）
3. 多個成就同時解鎖 → queue 依序彈出
4. 切換到「🏆成就」tab → 43 個成就顯示，稀有度篩選正常
5. 未解鎖顯示謎題卡 + hint；已解鎖顯示彩色 glow 卡
6. 職業限定非本職業 → 顯示「與你的職業無緣」，無 hint
7. 隊友同日打拳 → 觸發「同心齊拳」
8. 條件邏輯不出現在前端 bundle
9. 手機版觸控友好，卡片 ≥ 44px 高度
