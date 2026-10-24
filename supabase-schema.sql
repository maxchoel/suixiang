-- 随想 · 云同步数据库结构
-- 在 Supabase 控制台的 SQL Editor 里整段运行一次即可。

create table if not exists public.entries (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text       text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

alter table public.entries enable row level security;

drop policy if exists "own entries" on public.entries;
create policy "own entries"
  on public.entries
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists entries_user_updated_idx
  on public.entries (user_id, updated_at);

-- 只允许登录用户通过 API 访问；RLS 会限制为「只能看到自己的行」。
grant select, insert, update, delete on public.entries to authenticated;
