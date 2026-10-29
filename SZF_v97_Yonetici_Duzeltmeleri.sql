-- SZF Airport Halı Saha v97. Non-destructive schema/permissions update.
-- Run once in Supabase SQL Editor as the project owner. Do not run with a client-side key.
BEGIN;
-- Maç oluşturucu kendi maçının sadece başlık/tarih bilgilerini düzenleyebilir;
-- yöneticiler de aynı işlemi yapabilir. Diğer satırlara izin verilmez.
GRANT SELECT ON TABLE public.szf_matches TO authenticated;
GRANT UPDATE (title, match_date) ON TABLE public.szf_matches TO authenticated;
DROP POLICY IF EXISTS "szf_match_edit_v97" ON public.szf_matches;
CREATE POLICY "szf_match_edit_v97" ON public.szf_matches FOR UPDATE TO authenticated
USING (created_by = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.szf_admins a WHERE a.user_id = (SELECT auth.uid())))
WITH CHECK (created_by = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.szf_admins a WHERE a.user_id = (SELECT auth.uid())));
-- Historical team reconciliation: available only to designated admins.
CREATE OR REPLACE FUNCTION public.szf_history_player_team_v97(p_match uuid,p_player uuid,p_team text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.szf_admins a WHERE a.user_id = auth.uid()) THEN RAISE EXCEPTION 'Yönetici yetkisi gerekli'; END IF;
 IF p_team IS NOT NULL AND p_team NOT IN ('red','white') THEN RAISE EXCEPTION 'Geçersiz takım'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.szf_matches m WHERE m.id=p_match AND m.match_date<=now()) THEN RAISE EXCEPTION 'Geçmiş maç bulunamadı'; END IF;
 UPDATE public.szf_participants SET team_color=p_team WHERE match_id=p_match AND player_id=p_player;
 IF NOT FOUND THEN RAISE EXCEPTION 'Oyuncu maçta bulunamadı'; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.szf_history_guest_team_v97(p_guest uuid,p_team text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.szf_admins a WHERE a.user_id = auth.uid()) THEN RAISE EXCEPTION 'Yönetici yetkisi gerekli'; END IF;
 IF p_team IS NOT NULL AND p_team NOT IN ('red','white') THEN RAISE EXCEPTION 'Geçersiz takım'; END IF;
 UPDATE public.szf_guest_players_v53 g SET team_color=p_team
 WHERE g.id=p_guest AND EXISTS (SELECT 1 FROM public.szf_matches m WHERE m.id=g.match_id AND m.match_date<=now());
 IF NOT FOUND THEN RAISE EXCEPTION 'Geçmiş anonim oyuncu bulunamadı'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.szf_history_player_team_v97(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.szf_history_guest_team_v97(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_history_player_team_v97(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.szf_history_guest_team_v97(uuid,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
