-- Run this once in Supabase → SQL Editor

create table if not exists meetings (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  meeting_name text,
  source       text default 'text',
  transcript   text,
  summary      text,
  action_items jsonb,
  created_at   timestamptz default now()
);

alter table meetings enable row level security;

create policy "Users can read own meetings"   on meetings for select using (auth.uid() = user_id);
create policy "Users can insert own meetings" on meetings for insert with check (auth.uid() = user_id);
create policy "Users can delete own meetings" on meetings for delete using (auth.uid() = user_id);

create index if not exists meetings_user_id_idx  on meetings(user_id);
create index if not exists meetings_created_idx  on meetings(created_at desc);
