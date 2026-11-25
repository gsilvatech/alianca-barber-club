create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type = 'appointment_canceled'),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (appointment_id, recipient_user_id, event_type)
);

alter table public.push_notification_events enable row level security;
