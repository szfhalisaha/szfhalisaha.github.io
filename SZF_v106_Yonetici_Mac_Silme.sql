-- SZF v106: iki yonetici icin mac silme yetkisi.
-- Oyuncu, mac ve istatistik tablolarinin verilerini bu kurulum SILMEZ.
BEGIN;
ALTER TABLE public.szf_matches ENABLE ROW LEVEL SECURITY;
GRANT DELETE ON TABLE public.szf_matches TO authenticated;
DROP POLICY IF EXISTS "szf_matches_owner_delete_v20" ON public.szf_matches;
DROP POLICY IF EXISTS "szf_matches_admin_delete_v106" ON public.szf_matches;
CREATE POLICY "szf_matches_admin_delete_v106" ON public.szf_matches
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.szf_admins a WHERE a.user_id = (SELECT auth.uid()))
);
COMMIT;
-- Not: Baska DELETE/FOR ALL RLS politikasi varsa o da yetki verebilir.
-- Supabase'de ayri DELETE politikalarini kontrol edin.
