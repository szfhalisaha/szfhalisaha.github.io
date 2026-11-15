-- SZF v179: Kaydedilmiş 7v7 maçta kalecileri atomik olarak değiştirir.
-- Sadece admin, sadece tamamlanmamış maç. Bahis, skor, değerlendirme etkilenmez.
BEGIN;
CREATE OR REPLACE FUNCTION public.szf_swap_goalkeepers_v179(
  p_match uuid, p_red_id uuid, p_red_guest boolean,
  p_white_id uuid, p_white_guest boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_status text; v_red_count integer; v_white_count integer; v_updated integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.szf_admins WHERE user_id=auth.uid()
 ) THEN RAISE EXCEPTION 'Yonetici yetkisi gerekli'; END IF;
 IF p_red_id IS NULL OR p_white_id IS NULL OR (p_red_id=p_white_id AND p_red_guest=p_white_guest)
 THEN RAISE EXCEPTION 'Iki farkli kaleci secilmeli'; END IF;
 SELECT status INTO v_status FROM public.szf_matches WHERE id=p_match FOR UPDATE;
 IF NOT FOUND OR v_status='completed' THEN RAISE EXCEPTION 'Mac bulunamadi veya tamamlandi'; END IF;
 -- Iki takim 7 kisilik olmali. Once kadrolar degismeden kontrol et.
 SELECT COUNT(*) FILTER (WHERE team_color='red'),COUNT(*) FILTER (WHERE team_color='white')
 INTO v_red_count,v_white_count
 FROM (
   SELECT team_color FROM public.szf_participants WHERE match_id=p_match
   UNION ALL
   SELECT team_color FROM public.szf_guest_players_v53 WHERE match_id=p_match
 ) sides;
 IF v_red_count<>7 OR v_white_count<>7 THEN RAISE EXCEPTION 'Iki takim da 7 kisi olmali'; END IF;
 IF p_red_guest THEN
   PERFORM 1 FROM public.szf_guest_players_v53 WHERE id=p_red_id AND match_id=p_match AND team_color='red' FOR UPDATE;
 ELSE
   PERFORM 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=p_red_id AND team_color='red' FOR UPDATE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kirmizi kaleci bu takimda degil'; END IF;
 IF p_white_guest THEN
   PERFORM 1 FROM public.szf_guest_players_v53 WHERE id=p_white_id AND match_id=p_match AND team_color='white' FOR UPDATE;
 ELSE
   PERFORM 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=p_white_id AND team_color='white' FOR UPDATE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Beyaz kaleci bu takimda degil'; END IF;
 -- Iki satir ayni transaction icinde guncellenir; hata varsa ikisi de geri alinir.
 IF p_red_guest THEN
   UPDATE public.szf_guest_players_v53 SET team_color='white' WHERE id=p_red_id AND match_id=p_match AND team_color='red';
 ELSE
   UPDATE public.szf_participants SET team_color='white' WHERE match_id=p_match AND player_id=p_red_id AND team_color='red';
 END IF;
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 IF v_updated<>1 THEN RAISE EXCEPTION 'Kirmizi kaleci guncellenemedi'; END IF;
 IF p_white_guest THEN
   UPDATE public.szf_guest_players_v53 SET team_color='red' WHERE id=p_white_id AND match_id=p_match AND team_color='white';
 ELSE
   UPDATE public.szf_participants SET team_color='red' WHERE match_id=p_match AND player_id=p_white_id AND team_color='white';
 END IF;
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 IF v_updated<>1 THEN RAISE EXCEPTION 'Beyaz kaleci guncellenemedi'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.szf_swap_goalkeepers_v179(uuid,uuid,boolean,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_swap_goalkeepers_v179(uuid,uuid,boolean,uuid,boolean) TO authenticated;
COMMIT;
