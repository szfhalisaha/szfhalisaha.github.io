-- v137: Kayitli oyuncuyu aktif maca guvenli ekleme.
-- Supabase SQL Editor'de bir kez calistirin.
create or replace function public.szf_add_match_player_v137(p_match uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match public.szf_matches%rowtype;
  v_participants integer;
  v_guests integer;
begin
  if auth.uid() is null then
    raise exception 'Once giris yapmalisiniz.';
  end if;
  select * into v_match from public.szf_matches where id=p_match for update;
  if not found then raise exception 'Mac bulunamadi.'; end if;
  if v_match.status='completed' or v_match.match_date<=now() then
    raise exception 'Tamamlanmis maca oyuncu eklenemez.';
  end if;
  if auth.uid()<>p_player
     and auth.uid() is distinct from v_match.created_by
     and not exists(select 1 from public.szf_admins where user_id=auth.uid()) then
    raise exception 'Bu oyuncuyu ekleme yetkiniz yok.';
  end if;
  if not exists(select 1 from public.profiles where id=p_player) then
    raise exception 'Kayitli oyuncu bulunamadi.';
  end if;
  if exists(select 1 from public.szf_participants where match_id=p_match and player_id=p_player) then
    return;
  end if;
  select count(*) into v_participants from public.szf_participants where match_id=p_match;
  select count(*) into v_guests from public.szf_guest_players_v53 where match_id=p_match and linked_user_id is null;
  if v_participants+v_guests>=14 then raise exception 'Kadro dolu (14/14).'; end if;
  insert into public.szf_participants(match_id,player_id,self_confirmed)
    values(p_match,p_player,false);
end;
$$;
revoke all on function public.szf_add_match_player_v137(uuid,uuid) from public;
grant execute on function public.szf_add_match_player_v137(uuid,uuid) to authenticated;
