create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reminder_minutes integer not null default 60 check (reminder_minutes in (0, 30, 60)),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind = 'appointment_reminder'),
  reminder_minutes integer not null check (reminder_minutes in (30, 60)),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'no_subscription', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (appointment_id, recipient_user_id, kind, reminder_minutes, scheduled_for)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create index if not exists notification_deliveries_appointment_id_idx on public.notification_deliveries(appointment_id);

alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "Users manage their own push subscriptions" on public.push_subscriptions;
create policy "Users manage their own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their notification preferences" on public.notification_preferences;
create policy "Users manage their notification preferences" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
