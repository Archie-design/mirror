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

## Architecture

**real-take（大方圓開運親證班：這不是電影）** is a gamified check-in system for a real-life cultivation class (2026 大方圓開運親證班). Members complete daily/weekly quests and track personal growth goals. Game design spec is in `docs/GAME_DESIGN.md` — always treat this as the authoritative source of truth.

### App Structure

`app/page.tsx` is a large monolithic client component (`"use client"`) that owns all game state and orchestrates every tab. It's intentionally a single page — do not split it into separate routes.

Tab navigation: `daily(每日觀影) | weekly(導演報表) | stats(觀影分析) | rank(票房榜) | captain(製片總部) | commandant(片商總部) | course(首映曆)` rendered under `<main>` via `activeTab` state.

### Two Database Access Patterns

The codebase uses **both** database clients for different purposes:

1. **`lib/db.ts` → `pg` (node-postgres)**: Used in server actions that require **explicit transactions** (`BEGIN/COMMIT/ROLLBACK`). Used for: `quest.ts` (check-in). Always acquire a client with `connectDb()`, wrap in try/catch, and call `client.end()` in `finally`.

2. **`@supabase/supabase-js`**: Used for simple reads/upserts without transaction guarantees. Used in: `items.ts`, `dice.ts`, `team.ts`, and all client-side reads in `page.tsx`.

### Key Design Conventions

**Logical Date**: `getLogicalDateStr()` in `lib/utils/time.ts` — before 12:00 noon is counted as the previous calendar day. All daily quest duplicate-check queries must use this.

**QuestID Naming**:
- `q1`–`q7`: Daily quests (max 3 per logical day)
- `q1_dawn`: Special variant of q1 (破曉打拳). Mutually exclusive with `q1` on the same day.
- `w1`–`w4`: Weekly quests. QuestID format: `w1|YYYY-MM-DD`
- `t1`: Bi-weekly topic quest
- `t`-prefixed: System activity quests
- `temp_TIMESTAMP|YYYY-MM-DD`: Temporary quests from admin

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
| `w4.ts` | Supabase | 傳愛分數 application lifecycle (submit → squad review → admin final) |
| `testimony.ts` | Supabase | Member testimony submission |
| `testimonies_admin.ts` | Supabase | Admin review of testimonies |

### Currency Separation

Primary gameplay currency:
- `EnergyDice` / `GoldenDice`: Dice earned from quests and events, used for gameplay mechanics

### Key Constants (`lib/constants.tsx`)

- `BASE_START_DATE_STR` / `END_DATE`: Season date range (Feb 1 – Jun 28, 2026)
- `PENALTY_PER_DAY`: Fine amount per missed day (50)
- `ADMIN_PASSWORD`: Hardcoded to `"123"` — dev-only, not a security boundary
- `ZONES`: The 6 zone definitions (pride/doubt/anger/greed/delusion/chaos)
- `IN_GAME_ITEMS` (`i1`–`i10`): Purchasable shop items with `GameGold`
- `MONSTER_DROP_ITEMS` (`d1`–`d7`): Monster-only drops stored in `CharacterStats.GameInventory`

### API Routes (`app/api/`)

| Route | Purpose |
|-------|---------|
| `POST /api/webhook/line` | LINE Bot webhook — verifies signature, routes keyword commands, parses/saves testimonies, uploads cards to Google Drive |
| `GET /api/auth/line` | Initiates LINE Login OAuth (`?action=login` or `?action=bind&uid=USER_ID`) |
| `GET /api/auth/line/callback` | OAuth callback — creates/binds account, sets session cookie |
| `GET /api/cron/auto-draw` | Vercel Cron (Mon 04:00 UTC = 12:00 TW) — auto-draws mandatory quest for all squads; requires `CRON_SECRET` bearer token |
| `POST /api/admin/setup-richmenu` | Sets up LINE Rich Menu via Messaging API |

Additional LINE-related env vars: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID`

### LINE Bot Integration (`lib/line/`)

- `client.ts`: LINE Messaging API client factory
- `keywords.ts`: Keyword → tutorial response map (slash-prefixed, e.g. `/打卡`)
- `parser.ts`: Parses free-text messages into structured testimony data
- `testimony-card.tsx`: Renders testimony cards as React → image
- `google-drive.ts`: Uploads generated card images to Google Drive

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

Main tables: `CharacterStats`, `DailyLogs`, `TeamSettings`, `temporaryquests`, `MandatoryQuestHistory`, `CourseRegistrations`, `CourseAttendance`, `SystemSettings`, `Testimonies`, `TopicHistory`, `W4Applications`, `AdminLogs`, `FinePayments`

Supabase RPC functions defined in `supabase/migrations/`: `transfer_dice`, `transfer_golden_dice`, `checkin_rpc`

One-off migration/repair scripts live in `scripts/` — run with `npx ts-node scripts/<name>.ts`. These are idempotent DB fixups and data migrations, not part of the normal deployment pipeline.
