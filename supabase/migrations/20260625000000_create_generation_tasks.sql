create table if not exists public.generation_tasks (
  id text primary key,
  model text not null,
  prompt text not null default '',
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  request jsonb,
  video_url text,
  last_frame_url text,
  cos_video_key text,
  cos_video_url text,
  error_message text,
  inserted_at timestamptz not null default now(),
  constraint generation_tasks_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired'))
);

create index if not exists generation_tasks_updated_at_idx
  on public.generation_tasks (updated_at desc);

create index if not exists generation_tasks_status_idx
  on public.generation_tasks (status);

alter table public.generation_tasks enable row level security;
