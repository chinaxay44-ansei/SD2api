alter table public.generation_tasks
  add column if not exists user_key_hash text not null default 'legacy';

alter table public.generation_tasks
  alter column user_key_hash drop default;

create index if not exists generation_tasks_user_key_updated_at_idx
  on public.generation_tasks (user_key_hash, updated_at desc);
