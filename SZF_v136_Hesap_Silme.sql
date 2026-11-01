-- Supabase SQL Editor (postgres) ile bir kez calistirin.
-- Gercek Auth kullanicisini siler; yabanci anahtar bagimliliklari varsa hata verir ve islem geri alinir.
-- Admin kontrolu uygulama arayuzune degil veritabanindaki szf_admins tablosuna dayanir.
create or replace function public.szf_admin_delete_account_v136(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.szf_admins where user_id = auth.uid()) then
    raise exception 'Yalnizca yoneticiler hesap silebilir';
  end if;
  if p_target is null or p_target = auth.uid() then
    raise exception 'Kendi hesabinizi silemezsiniz';
  end if;
  if exists (select 1 from public.szf_admins where user_id = p_target) then
    raise exception 'Yonetici hesaplari silinemez';
  end if;
  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'Hesap bulunamadi';
  end if;
  delete from auth.users where id = p_target;
end;
$$;
revoke all on function public.szf_admin_delete_account_v136(uuid) from public, anon;
grant execute on function public.szf_admin_delete_account_v136(uuid) to authenticated;
