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
- `GEMINI_API_KEY`

## Architecture

**星光西遊** is a gamified check-in system for a real-life cultivation class (2026 大無限開運親證班). Players complete daily/weekly quests, move on a hex map, and engage in combat. Game design spec is in `docs/GAME_DESIGN.md` and `docs/MAP_DESIGN.md` — always treat these as the authoritative source of truth.

### App Structure

`app/page.tsx` is a large monolithic client component (`"use client"`) that owns all game state and orchestrates every tab. It's intentionally a single page — do not split it into separate routes.

Tab navigation: `daily | weekly | stats | rank | captain | shop` rendered under `<main>` via `activeTab` state.

### Two Database Access Patterns

The codebase uses **both** database clients for different purposes:

1. **`lib/db.ts` → `pg` (node-postgres)**: Used in server actions that require **explicit transactions** (`BEGIN/COMMIT/ROLLBACK`). Used for: `quest.ts` (check-in), `store.ts` (artifact purchase, coin transfer). Always acquire a client with `pool.connect()`, wrap in try/catch, and release in `finally`.

2. **`@supabase/supabase-js`**: Used for simple reads/upserts without transaction guarantees. Used in: `combat.ts`, `items.ts`, `dice.ts`, `team.ts`, `gemini.ts`, and all client-side reads in `page.tsx`.

### Key Design Conventions

**Logical Date**: `getLogicalDateStr()` in `lib/utils/time.ts` — before 12:00 noon is counted as the previous calendar day. All daily quest duplicate-check queries must use this.

**QuestID Naming**:
- `q1`–`q7`: Daily quests (max 3 per logical day)
- `q1_dawn`: Special variant of q1 (破曉打拳). Mutually exclusive with `q1` on the same day.
- `w1`–`w4`: Weekly quests. QuestID format: `w1|YYYY-MM-DD`
- `t1`: Bi-weekly topic quest
- `t`-prefixed: System activity quests (幌金繩 a4 bonus applies)
- `bd_yuanmeng|YYYY-MM-DD`: 定風珠 a6 親證圓夢計劃 (max 3 per week)
- `temp_TIMESTAMP|YYYY-MM-DD`: Temporary quests from admin

**Artifact System** (`lib/constants.tsx` → `ARTIFACTS_CONFIG`):
- `a1` 如意金箍棒: personal, ×1.2 exp, 1200 coins, limit 1
- `a2` 照妖鏡: personal, +150 exp on `q1_dawn` only, 250 coins
- `a3` 七彩袈裟: team, ×1.5 exp on `q1`/`q1_dawn`, 550/member
- `a4` 幌金繩: team, ×1.5 exp on `t`-prefix quests, 700/member
- `a5` 金剛杖: personal, ×1.2 exp (exclusive with a1), free for elders
- `a6` 定風珠: personal, unlocks 親證圓夢計劃 打卡 UI (bd_yuanmeng prefix), 650 coins
- Personal inventory: `CharacterStats.Inventory` (string[] JSON)
- Team inventory: `TeamSettings.inventory` (string[] JSON)

**Hex Map**: Axial coordinate `(Q, R)`, pointy-topped. Origin `(0,0)` = 本心草原 (safe zone). Zone detection via `getHexRegion()` in `lib/utils/hex.ts`. Seven zones: center, pride(N), doubt(NE), anger(SE), greed(S), delusion(SW), chaos(NW).

### Server Actions (`app/actions/`)

| File | Pattern | Purpose |
|------|---------|---------|
| `quest.ts` | pg transaction | Daily check-in, artifact exp multipliers, duplicate prevention |
| `store.ts` | pg transaction | Artifact purchase, coin transfer to team |
| `combat.ts` | Supabase RPC | Combat resolution, `add_combat_rewards` RPC |
| `map.ts` | Supabase | Chest opening, Mimic Savvy check |
| `dice.ts` | Supabase RPC | `transfer_dice`, `transfer_golden_dice` RPCs |
| `team.ts` | Supabase RPC | Player-to-player dice donation |
| `items.ts` | Supabase | Buy/use GameGold items (`GameInventory`) |
| `gemini.ts` | Gemini API | AI-generated encounters (DDA), `gemini-2.5-flash` |
| `admin.ts` | Supabase | Weekly snapshot, roster import |

### Currency Separation

Three separate currencies — **never mix them**:
- `CharacterStats.Coins`: Earned from quests (10% of exp), used for personal artifacts (a1, a2, a6) and team donation
- `CharacterStats.GameGold`: Earned from combat (`monsterLevel × 20`), used exclusively for `GameInventory` items (i1–i10)
- `EnergyDice` / `GoldenDice`: Movement AP and special dice

### Database Schema Reference

Main tables: `CharacterStats`, `DailyLogs`, `TeamSettings`, `MapEntities`, `temporaryquests`, `MandatoryQuestHistory`

Supabase RPC functions defined in `supabase/migrations/`: `add_combat_rewards`, `transfer_dice`, `transfer_golden_dice`, `global_dice_bonus`
