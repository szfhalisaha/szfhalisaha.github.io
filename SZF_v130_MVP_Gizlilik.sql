-- SZF Airport Hali Saha v130: Maçın Adamı oylaması
-- Supabase SQL Editor üzerinde BİR KEZ çalıştırın.
-- Herkese bireysel oy kayıtlarını açan eski SELECT politikalarını iptal ediyoruz.
-- SECURITY DEFINER fonksiyonları katılımı, tek oy hakkını ve zaman aralığını sunucuda denetler.
create or replace function public.szf_mvp_state_v130(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.szf_matches%rowtype; uid uuid := auth.uid();
  eligible boolean; voted boolean; ended boolean; started boolean; n integer; best integer; totals jsonb; winners jsonb;
begin
  if uid is null then raise exception 'Giriş yapmalısın'; end if;
  select * into m from public.szf_matches where id=p_match;
  if not found then return '{}'::jsonb; end if;
  started := now() >= m.match_date;
  ended := now() >= m.match_date + interval '24 hours';
  select exists(select 1 from public.szf_participants p where p.match_id=p_match and p.player_id=uid)
     or exists(select 1 from public.szf_guest_players_v53 g where g.match_id=p_match and g.linked_user_id=uid) into eligible;
  select exists(select 1 from public.szf_mvp_votes_v53 v where v.match_id=p_match and v.voter_id=uid)
     or exists(select 1 from public.szf_mvp_guest_votes_v109 v where v.match_id=p_match and v.voter_id=uid) into voted;
  if ended then
    with ballot as (select 'p:'||target_id::text as candidate from public.szf_mvp_votes_v53 where match_id=p_match
      union all select 'g:'||guest_id::text from public.szf_mvp_guest_votes_v109 where match_id=p_match),
    tally as (select candidate, count(*)::integer as votes from ballot group by candidate)
    select coalesce(jsonb_agg(jsonb_build_object('target',candidate,'votes',votes) order by votes desc), '[]'::jsonb), coalesce(max(votes),0)
      into totals,best from tally;
    select coalesce(jsonb_agg(x->>'target'), '[]'::jsonb) into winners
      from jsonb_array_elements(totals) x where (x->>'votes')::integer=best and best>0;
    select coalesce(sum((x->>'votes')::integer),0) into n from jsonb_array_elements(totals) x;
  else
    -- During live voting do not calculate/return any vote totals or individual ballots.
    totals := '[]'::jsonb; winners := '[]'::jsonb; n:=0; best:=0;
  end if;
  return jsonb_build_object('open',started and not ended,'eligible',eligible,'voted',voted,
    'deadline',m.match_date + interval '24 hours',
    'finished',ended,'vote_count',n,'winning_votes',best,'winners',winners,'totals',totals);
end $$;

create or replace function public.szf_mvp_cast_v130(p_match uuid,p_target text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.szf_matches%rowtype; uid uuid:=auth.uid(); gid uuid; pid uuid;
begin
 if uid is null then raise exception 'Giriş yapmalısın'; end if;
 perform pg_advisory_xact_lock(hashtext(p_match::text),hashtext(uid::text));
 select * into m from public.szf_matches where id=p_match for share;
 if not found then raise exception 'Maç bulunamadı'; end if;
 if now()<m.match_date then raise exception 'Oylama maçın başlangıcında açılır'; end if;
 if now()>=m.match_date+interval '24 hours' then raise exception 'Oylama sona erdi'; end if;
 if not (exists(select 1 from public.szf_participants where match_id=p_match and player_id=uid)
         or exists(select 1 from public.szf_guest_players_v53 where match_id=p_match and linked_user_id=uid))
 then raise exception 'Yalnızca bu maçın katılımcıları oy verebilir'; end if;
 if p_target like 'p:%' then
   pid:=substring(p_target from 3)::uuid;
   if pid=uid then raise exception 'Kendine oy veremezsin'; end if;
   if not exists(select 1 from public.szf_participants where match_id=p_match and player_id=pid)
     and not exists(select 1 from public.szf_guest_players_v53 where match_id=p_match and linked_user_id=pid)
   then raise exception 'Seçilen oyuncu bu maçta değil'; end if;
 elsif p_target like 'g:%' then
   gid:=substring(p_target from 3)::uuid;
   if not exists(select 1 from public.szf_guest_players_v53 where match_id=p_match and id=gid) then raise exception 'Misafir bu maçta değil'; end if;
   if exists(select 1 from public.szf_guest_players_v53 where id=gid and linked_user_id=uid) then raise exception 'Kendine oy veremezsin'; end if;
 else raise exception 'Geçersiz oyuncu'; end if;
 -- Kullanıcı daha önce oy verdiyse iki tablodaki eski tercihini kaldır ve tek yeni oy kaydet.
 delete from public.szf_mvp_votes_v53 where match_id=p_match and voter_id=uid;
 delete from public.szf_mvp_guest_votes_v109 where match_id=p_match and voter_id=uid;
 if pid is not null then
   insert into public.szf_mvp_votes_v53(match_id,voter_id,target_id) values(p_match,uid,pid);
 else
   insert into public.szf_mvp_guest_votes_v109(match_id,voter_id,guest_id) values(p_match,uid,gid);
 end if;
end $$;

-- DIRECT READ of individual choices is forbidden. Users must call aggregate RPC above.
revoke select on public.szf_mvp_votes_v53 from public, anon, authenticated;
revoke select on public.szf_mvp_guest_votes_v109 from public, anon, authenticated;
revoke execute on function public.szf_mvp_state_v130(uuid) from public;
revoke execute on function public.szf_mvp_cast_v130(uuid,text) from public;
grant execute on function public.szf_mvp_state_v130(uuid) to authenticated;
grant execute on function public.szf_mvp_cast_v130(uuid,text) to authenticated;

-- Misafir forma numarası (isteğe bağlı)
alter table public.szf_guest_players_v53 add column if not exists jersey_number integer check (jersey_number between 1 and 99);

-- 24 saat sonra yelek tercihi veritabanında da kilitlenir; sonuç istatistikleri değişmez.
create or replace function public.szf_v130_lock_old_vest()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.status='completed'
    and now()>=coalesce(old.mvp_started_at,old.match_date)+interval '24 hours'
    and new.vest_team is distinct from old.vest_team
 then raise exception 'Maç bittikten 24 saat sonra yelek giyen takım değiştirilemez'; end if;
 return new;
end $$;
drop trigger if exists szf_v130_lock_old_vest_trigger on public.szf_matches;
create trigger szf_v130_lock_old_vest_trigger before update of vest_team on public.szf_matches
for each row execute function public.szf_v130_lock_old_vest();
