-- v138: eşleşmiş misafirleri tek kimlik sayarak oyuncu ekleme.
-- Bu SQL hiçbir maç, misafir ya da istatistik kaydını silmez.
create or replace function public.szf_add_match_player_v138(p_match uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match public.szf_matches%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısınız.'; end if;
  select * into v_match from public.szf_matches where id=p_match for update;
  if not found then raise exception 'Maç bulunamadı.'; end if;
  if v_match.status='completed' or v_match.match_date<=now() then
    raise exception 'Tamamlanmış maça oyuncu eklenemez.';
  end if;
  if auth.uid()<>p_player
     and auth.uid() is distinct from v_match.created_by
     and not exists(select 1 from public.szf_admins where user_id=auth.uid()) then
    raise exception 'Bu oyuncuyu ekleme yetkiniz yok.';
  end if;
  if not exists(select 1 from public.profiles where id=p_player) then
    raise exception 'Kayıtlı oyuncu bulunamadı.';
  end if;
  if exists(select 1 from public.szf_participants where match_id=p_match and player_id=p_player) then
    return;
  end if;
  select count(*) into v_count from (
    select 'p:'||p.player_id::text as player_key
      from public.szf_participants p where p.match_id=p_match
    union
    select case when g.linked_user_id is null
                then 'g:'||g.id::text
                else 'p:'||g.linked_user_id::text end
      from public.szf_guest_players_v53 g where g.match_id=p_match
  ) identities;
  if v_count>=14 then raise exception 'Ana kadro dolu (14/14).'; end if;
  insert into public.szf_participants(match_id,player_id,self_confirmed)
    values(p_match,p_player,false);
end;
$$;
revoke all on function public.szf_add_match_player_v138(uuid,uuid) from public, anon;
grant execute on function public.szf_add_match_player_v138(uuid,uuid) to authenticated;
