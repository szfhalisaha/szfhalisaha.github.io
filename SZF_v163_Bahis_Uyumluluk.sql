-- SZF v163: Eski ve yeni site surumleri ayni bahis fonksiyonunu kullanir.
-- Mevcut bahisler ve bakiyeler korunur.
BEGIN;
CREATE OR REPLACE FUNCTION public.szf_place_bet(p_match uuid, p_pick text, p_stake bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  PERFORM public.szf_change_bet_v160(p_match,p_pick,p_stake);
END;
$$;
REVOKE ALL ON FUNCTION public.szf_place_bet(uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_place_bet(uuid,text,bigint) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT to_regprocedure('public.szf_place_bet(uuid,text,bigint)') AS eski_surum_uyumlu,
       to_regprocedure('public.szf_change_bet_v160(uuid,text,bigint)') AS yeni_surum;
