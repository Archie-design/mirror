-- ── TopicHistory ────────────────────────────────────────────────────────────
-- 記錄管理員設定過的主題影展標題歷史
create table if not exists "TopicHistory" (
  id          bigint generated always as identity primary key,
  "TopicTitle" text        not null,
  created_at  timestamptz not null default now()
);

alter table "TopicHistory" enable row level security;

-- 任何人可讀（管理員介面顯示歷史記錄）
create policy "Public read TopicHistory"
  on "TopicHistory" for select using (true);

-- 只有 service role 可寫（透過 server action 呼叫）
create policy "Service role write TopicHistory"
  on "TopicHistory" for all using (auth.role() = 'service_role');


-- ── temporaryquests ──────────────────────────────────────────────────────────
-- 管理員新增的臨時任務（temp_TIMESTAMP 格式 id）
create table if not exists temporaryquests (
  id          text        primary key,
  title       text        not null,
  sub         text,
  "desc"      text,
  reward      integer     not null default 1000,
  limit_count integer     not null default 1,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table temporaryquests enable row level security;

-- 任何人可讀
create policy "Public read temporaryquests"
  on temporaryquests for select using (true);

-- 只有 service role 可寫
create policy "Service role write temporaryquests"
  on temporaryquests for all using (auth.role() = 'service_role');
