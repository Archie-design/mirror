# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UI Development Rules

**Every UI change must consider both desktop and mobile.** Before finishing any UI task:
- Use Tailwind responsive prefixes (`md:`, `lg:`) for layout differences
- Fixed pixel sizes (`w-96`, `p-10`, `text-5xl`) must have mobile-friendly equivalents
- Touch targets must be ≥ 44px for mobile usability
- Avoid `fixed`/`absolute` elements that can overlap or cause z-index issues on small screens
- Test touch event handling: mobile fires `touchstart/touchend` AND synthetic mouse events — use `stopPropagation` + `hudRef.current.contains()` guards where needed

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint check
```

No test framework is configured. Manual verification via browser.

## Environment

Requires `.env.local` with:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (direct PostgreSQL connection string to Supabase)
- `ADMIN_PASSWORD` (管理後台密碼；dev 省略時 fallback 為 `"123"`)
- `AUTH_SESSION_SECRET` (**production 必填**，任意隨機字串 ≥32 字元，用於 HMAC 簽章；未設定時 admin 登入一律回傳 500)

## Architecture

**覺醒體系開運親證班：你的黃磚路** is a gamified check-in system for a real-life cultivation class (2026 覺醒開運親證班). Members complete daily/weekly quests and track personal growth goals. Game design spec is in `docs/GAME_DESIGN.md` — always treat this as the authoritative source of truth.

### App Structure

`app/page.tsx` is a large monolithic client component (`"use client"`) that owns all game state and orchestrates every tab. It's intentionally a single page — do not split it into separate routes.

Tab navigation: `daily(每日踏程) | weekly(旅伴週報) | ninegrid(人生大戲) | rank(旅人榜) | stats(我的旅程) | course(親證曆) | captain(隊長基地) | commandant(大隊長總部)` rendered under `<main>` via `activeTab` state.

### Two Database Access Patterns

The codebase uses **both** database clients for different purposes:

1. **`lib/db.ts` → `pg` (node-postgres)**: Used in server actions that require **explicit transactions** (`BEGIN/COMMIT/ROLLBACK`). Used for: `quest.ts` (check-in). Always acquire a client with `connectDb()`, wrap in try/catch, and call `client.end()` in `finally`.

2. **`@supabase/supabase-js`**: Used for simple reads/upserts without transaction guarantees. Used in: `items.ts`, `dice.ts`, `team.ts`, and all client-side reads in `page.tsx`.

### Key Design Conventions

**Logical Date**: `getLogicalDateStr()` in `lib/utils/time.ts` — before 12:00 noon is counted as the previous calendar day. All daily quest duplicate-check queries must use this.

**QuestID Naming**:
- `d1`–`d8`: Basic daily quests (20 pts each, max 3 per logical day)
- `p1`–`p5`: Weighted daily quests (50 pts each, max 3 per logical day)
- `p1_dawn`: Bonus variant of p1 (破曉打拳, +50 pts). Requires p1 on the same logical day (or previous logical day to handle cross-noon edge case). Only recordable **before 12:00 noon Taiwan time** (enforced both in UI and `process_checkin` RPC).
- `diet_veg` / `diet_seafood`: Diet quests (one per logical day, mutually exclusive)
- `wk1|YYYY-MM-DD` ... `wk4_large|YYYY-MM-DD`: Weekly quests (various per-week limits)
- `nine_grid_cell|{index}` / `nine_grid_line|cell{index}`: NineGrid completion logs
- `temp_TIMESTAMP|YYYY-MM-DD`: Admin-created temporary quests (one entry per quest id, lifetime)

### Server Actions (`app/actions/`)

| File | Pattern | Purpose |
|------|---------|---------|
| `quest.ts` | pg transaction | Daily check-in, duplicate prevention, dice/exp awards |
| `dice.ts` | Supabase RPC | `transfer_dice`, `transfer_golden_dice` RPCs |
| `team.ts` | Supabase RPC | Player-to-player dice donation |
| `items.ts` | Supabase | Buy/use GameGold items (`GameInventory`) |
| `admin.ts` | pg transaction | Weekly snapshot, roster import, procedural map entity generation |
| `course.ts` | Supabase | Course registration (`registerForCourse`), attendance marking (`markAttendance`), list query |
| `fines.ts` | Supabase | Squad fine tracking, org submission records |
| `bonus.ts` | Supabase | 傳愛分數 + 聯誼會截圖申請 (interview + b3-b7 bonus quests) |
| `testimony.ts` | Supabase | Member testimony submission |
| `testimonies_admin.ts` | Supabase | Admin review of testimonies |

### Currency Separation

Primary gameplay currency:
- `EnergyDice` / `GoldenDice`: Dice earned from quests and events, used for gameplay mechanics

### Key Constants

**Quest config (`lib/constants.tsx`):**
- `DAILY_BASIC_CONFIG` / `BASIC_QUEST_IDS` / `DAILY_BASIC_LIMIT` (d1–d8, 3/day)
- `DAILY_WEIGHTED_CONFIG` / `WEIGHTED_QUEST_IDS` / `DAILY_WEIGHTED_LIMIT` (p1–p5, 3/day)
- `DAWN_QUEST` (p1_dawn 破曉打拳), `DIET_QUEST_CONFIG` / `DIET_QUEST_IDS` (diet_veg/diet_seafood)
- `WEEKLY_QUEST_CONFIG` (wk1–wk5), `SQUAD_ROLES`, `COMPANION_TYPES`, `QUEST_ICON_MAP`
- `SYSTEM_HEAD_TEAM` (`'體系長'`) / `SYSTEM_HEAD_GATHERING_REWARD` (4000) / `SYSTEM_HEAD_GATHERING_MIN_ATTENDEES` (5) — 體系長跨小隊定聚規則

**Season dates (`lib/utils/time.ts`) — authoritative:**
- Activity (scoring) period: **2026-05-10 ～ 2026-07-19**; graduation ceremony 2026-07-24 (a course event)
- `SEASON_W1_START` (`2026-05-10`) / `SEASON_W2_MONDAY` (`2026-05-18`) + `getSeasonWeekStart()`: 賽季週 W1 5/10–5/17 (8-day special), W2+ Mon–Sun (through W10 7/13–7/19)
- `SEASON_MONTHS` + helpers (`getCurrentSeasonMonth`, `formatSeasonMonthLabel`…): 月排行榜「賽季月」— 第一個月 5/10–6/14 (W1–W5), 第二個月 6/15–7/19 (W6–W10), each 5 weeks; `key` = `MonthlyRankSnapshot.month_start`
- `getCurrentThemePeriod()`: homepage journey phase (before / W1 / W2–8 / W9–10 graduation / after)

**Other:** Admin password via `process.env.ADMIN_PASSWORD` (server-side only; not in `constants.tsx`). One-off bonus task deadline in `app/actions/bonus.ts` — all o-quests close 2026-07-12 23:59 (system scoring ends 7/20 noon). Course events default in `lib/courseConfig.ts`, overridable via `SystemSettings.CourseEvents` (graduation ceremony 2026-07-24).

### API Routes (`app/api/`)

| Route | Purpose |
|-------|---------|
| `GET /api/auth/line` | Initiates LINE Login OAuth (`?action=login` or `?action=bind&uid=USER_ID`) |
| `GET /api/auth/line/callback` | OAuth callback — creates/binds account, sets session cookie |
| `GET /api/cron/weekly-snapshot` | Vercel Cron (Mon 04:30 UTC = Mon 12:30 TW) — writes previous-week leaderboard snapshot (賽季週採週一→週日；W1 5/10–5/17 8 天特例); requires `CRON_SECRET` bearer token |
| `GET /api/cron/monthly-snapshot` | Vercel Cron (daily 04:30 UTC = 12:30 TW) — self-healing: snapshots a 賽季月 only once its end has passed (第一個月 5/10–6/14, 第二個月 6/15–7/19); requires `CRON_SECRET` bearer token |

LINE-related env vars (Login only): `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`

### SystemSettings — Adding New Global Keys

`updateGlobalSetting(key, value)` in `page.tsx` uses **upsert** (`onConflict: 'SettingName'`), so any new key is automatically created on first save. When adding a new key:
1. Add the field to `SystemSettings` interface in `types/index.ts`
2. Add it to the `setSystemSettings({...})` call in the data-load block (~line 907 of `page.tsx`) — **this block explicitly lists fields, so new keys must be added here or they'll be silently dropped on load**

### Course Registration System

`CourseTab` (`components/Tabs/CourseTab.tsx`) integrates student registration, QR code display, and volunteer scanner in one tab:
- Student flow: select course → form (name + phone last 3 digits) → QR code (persisted in `localStorage` with keys `course_class_b_reg` / `course_class_c_reg`)
- Volunteer flow: "志工入口" button → password input → scanner (`app/class/checkin/Scanner.tsx` via dynamic import) + attendance list
- Volunteer password stored in `SystemSettings.VolunteerPassword`; set via Admin Dashboard → 志工掃碼授權 section
- Original standalone pages (`/class/b`, `/class/c`, `/class/checkin`) are kept and still functional

### Database Schema Reference

Main tables: `CharacterStats`, `DailyLogs`, `TeamSettings`, `temporaryquests`, `CourseRegistrations`, `CourseAttendance`, `SystemSettings`, `TopicHistory`, `BonusApplications`, `AdminLogs`, `FinePayments`, `WeeklyRankSnapshot`, `MonthlyRankSnapshot`

Supabase RPC functions defined in `supabase/migrations/`: `transfer_dice`, `transfer_golden_dice`, `checkin_rpc`

One-off migration/repair scripts live in `scripts/` — run with `npx ts-node scripts/<name>.ts`. These are idempotent DB fixups and data migrations, not part of the normal deployment pipeline.

