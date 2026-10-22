create table public.usb_game_runs (
  id uuid primary key,
  player_id uuid not null,
  seed bigint not null check (seed between 0 and 4294967295),
  created_at bigint not null,
  nickname text,
  score integer check (score between 0 and 500),
  ticks integer check (ticks between 1 and 36000),
  finished_at bigint,
  constraint complete_result check (
    (score is null and nickname is null and ticks is null and finished_at is null)
    or (score is not null and nickname is not null and char_length(nickname) between 1 and 16 and ticks is not null and finished_at is not null)
  )
);
create index usb_game_runs_player_created on public.usb_game_runs (player_id, created_at);
create index usb_game_runs_ranking on public.usb_game_runs (score desc, finished_at, id) where score is not null;
alter table public.usb_game_runs enable row level security;
revoke all on table public.usb_game_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.usb_game_runs to service_role;

create function public.usb_game_start_run(p_player_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  run_id uuid := gen_random_uuid();
  run_seed bigint := floor(random() * 4294967296)::bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));
  if (select count(*) from public.usb_game_runs where player_id = p_player_id and created_at > now_ms - 60000) >= 30 then
    raise exception 'rate_limit';
  end if;
  insert into public.usb_game_runs (id, player_id, seed, created_at) values (run_id, p_player_id, run_seed, now_ms);
  delete from public.usb_game_runs where id in (select id from public.usb_game_runs where score is null and created_at < now_ms - 86400000 limit 100);
  return jsonb_build_object('id', run_id, 'seed', run_seed);
end;
$$;

create function public.usb_game_finish_run(p_id uuid, p_nickname text, p_score integer, p_ticks integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result public.usb_game_runs;
begin
  select * into strict result from public.usb_game_runs where id = p_id for update;
  if result.score is null then
    update public.usb_game_runs set nickname = p_nickname, score = p_score, ticks = p_ticks,
      finished_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint
      where id = p_id returning * into result;
  end if;
  return to_jsonb(result);
end;
$$;

create function public.usb_game_leaderboard(p_mode text default 'best', p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with candidates as (
    select *, row_number() over (partition by player_id order by score desc, finished_at, id) as personal
    from public.usb_game_runs where score is not null
  ), filtered as (
    select * from candidates where p_mode = 'all' or personal = 1
  ), ranked as (
    select *, row_number() over (order by score desc, finished_at, id) as rank from filtered
  ), page as (
    select * from ranked order by rank limit 20 offset greatest(0, least(p_offset, 1000000))
  ), total as (select count(*) as n from filtered)
  select jsonb_build_object(
    'mode', case when p_mode = 'all' then 'all' else 'best' end,
    'total', (select n from total),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nickname', nickname, 'score', score, 'seconds', ticks / 120.0, 'createdAt', finished_at, 'rank', rank) order by rank) from page), '[]'::jsonb),
    'nextOffset', case when greatest(0, least(p_offset, 1000000)) + 20 < (select n from total) then greatest(0, least(p_offset, 1000000)) + 20 else null end
  );
$$;

revoke all on function public.usb_game_start_run(uuid) from public, anon, authenticated;
revoke all on function public.usb_game_finish_run(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.usb_game_leaderboard(text, integer) from public, anon, authenticated;
grant execute on function public.usb_game_start_run(uuid) to service_role;
grant execute on function public.usb_game_finish_run(uuid, text, integer, integer) to service_role;
grant execute on function public.usb_game_leaderboard(text, integer) to service_role;
notify pgrst, 'reload schema';
