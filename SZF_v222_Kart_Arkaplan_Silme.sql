-- v222: Portrait cutouts separate from original player avatars.
-- Run ONCE in Supabase SQL Editor before using admin batch converter.
create table if not exists public.szf_card_portraits_v222 (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  portrait_path text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.szf_card_portraits_v222 enable row level security;
revoke all on public.szf_card_portraits_v222 from anon;
grant select on public.szf_card_portraits_v222 to authenticated;
drop policy if exists szf_portraits_read_v222 on public.szf_card_portraits_v222;
create policy szf_portraits_read_v222 on public.szf_card_portraits_v222
 for select to authenticated using (true);
-- Only the security-definer function below can mutate cutout mappings.
create or replace function public.szf_save_card_portrait_v222(
 p_player uuid, p_path text
) returns void language plpgsql security definer
set search_path = '' as $$
declare v_admin uuid := auth.uid();
begin
 if v_admin is null or not exists (
  select 1 from public.szf_admins where user_id=v_admin
 ) then raise exception 'Yonetici yetkisi gerekli'; end if;
 if not exists(select 1 from public.profiles where id=p_player) then
  raise exception 'Oyuncu bulunamadi'; end if;
 if p_path is null then
   delete from public.szf_card_portraits_v222 where player_id=p_player;
   return;
 end if;
 -- Only files under the signed-in admin's avatars folder can be assigned.
 if p_path !~ ('^' || v_admin::text || '/cutouts/[a-f0-9-]{36}-[0-9]+[.]png$')
 then raise exception 'Gecersiz portre dosya yolu'; end if;
 if not exists(
    select 1 from storage.objects
     where bucket_id='avatars' and name=p_path
 ) then raise exception 'Portre dosyasi bulunamadi'; end if;
 insert into public.szf_card_portraits_v222(player_id,portrait_path,updated_by)
 values(p_player,p_path,v_admin)
 on conflict(player_id) do update set
 portrait_path=excluded.portrait_path,updated_by=excluded.updated_by,updated_at=now();
end $$;
revoke all on function public.szf_save_card_portrait_v222(uuid,text) from public,anon;
grant execute on function public.szf_save_card_portrait_v222(uuid,text) to authenticated;

-- Note: Requires existing Supabase avatars storage INSERT policy to allow
-- authenticated user uploads to their own "<auth.uid()>/..." folder.
