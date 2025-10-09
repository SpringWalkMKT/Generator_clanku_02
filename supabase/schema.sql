create table if not exists projects (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists drafts (
  id bigint generated always as identity primary key,
  project_id bigint references projects(id),
  channel text,
  content text,
  status text default 'draft',
  version int default 1,
  created_at timestamptz default now()
);

create table if not exists audit (
  id bigint generated always as identity primary key,
  draft_id bigint references drafts(id),
  action text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Presety TOV per kanál
create table if not exists presets (
  id uuid primary key default gen_random_uuid(),
  project_id integer not null references projects(id) on delete cascade,
  channel text not null check (channel in ('LinkedIn','Facebook','Instagram','Blog')),
  name text not null,
  tone_of_voice text not null,
  length_profile text not null, -- 'krátká' | 'střední' | 'dlouhá'
  is_default boolean not null default false,
  created_at timestamp with time zone default now()
);

create index if not exists presets_project_channel_idx
  on presets (project_id, channel, created_at desc);
