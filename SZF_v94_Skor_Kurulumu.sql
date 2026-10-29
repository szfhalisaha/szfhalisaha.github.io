-- SZF v94: Maç skorları. Var olan kayıtlar korunur.
ALTER TABLE public.szf_matches ADD COLUMN IF NOT EXISTS red_score integer;
ALTER TABLE public.szf_matches ADD COLUMN IF NOT EXISTS white_score integer;
DO $$ BEGIN
 ALTER TABLE public.szf_matches ADD CONSTRAINT szf_match_red_score_range CHECK (red_score BETWEEN 0 AND 99);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE public.szf_matches ADD CONSTRAINT szf_match_white_score_range CHECK (white_score BETWEEN 0 AND 99);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.szf_save_match_score_v94(p_match uuid,p_red integer,p_white integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.szf_admins WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Yalnızca yönetici skor kaydedebilir'; END IF;
 IF p_red IS NULL OR p_white IS NULL OR p_red NOT BETWEEN 0 AND 99 OR p_white NOT BETWEEN 0 AND 99 THEN RAISE EXCEPTION 'Geçersiz skor'; END IF;
 UPDATE public.szf_matches SET red_score=p_red,white_score=p_white WHERE id=p_match AND match_date<=now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı veya henüz başlamadı'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.szf_save_match_score_v94(uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.szf_save_match_score_v94(uuid,integer,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
