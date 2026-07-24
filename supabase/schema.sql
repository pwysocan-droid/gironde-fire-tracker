-- Gironde fire tracker — history store.
-- Run once in the Supabase SQL editor (or psql). Then set SUPABASE_URL,
-- SUPABASE_SERVICE_ROLE_KEY and SNAPSHOT_SECRET in Vercel, and replace the
-- two placeholders in the cron.schedule call below.

create table if not exists public.gironde_snapshots (
  taken_at        timestamptz primary key default now(),
  detections_6h   integer      not null,
  detections_24h  integer      not null,
  total_frp       numeric      not null,
  centroid_lat    numeric,
  centroid_lon    numeric,
  wind_speed      numeric,
  wind_gust       numeric,
  wind_dir        numeric,
  humidity        numeric,
  pm25            numeric,
  firefighters    integer
);

-- Service-role key bypasses RLS; enabling it locks the table to everyone else.
alter table public.gironde_snapshots enable row level security;

-- The database feeds itself: Vercel Hobby crons only run daily, so pg_cron
-- calls the snapshot endpoint every 15 minutes instead.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'snapshot-gironde',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://gironde-fire-tracker.vercel.app/api/snapshot',
    headers := jsonb_build_object('Authorization', 'Bearer SNAPSHOT_SECRET_HERE')
  )
  $$
);

-- Housekeeping: one row per 15 min is ~35k rows/year — no pruning needed for
-- the life of this fire, but if you want it:
-- select cron.schedule('prune-gironde', '0 4 * * *',
--   $$delete from public.gironde_snapshots where taken_at < now() - interval '30 days'$$);
