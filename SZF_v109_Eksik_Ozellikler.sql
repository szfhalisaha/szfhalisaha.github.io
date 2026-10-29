-- SZF v109: Supabase SQL Editor'da bir kez çalıştırın.
-- Mevcut tablolar ve eski MVP oyları silinmez.
CREATE TABLE IF NOT EXISTS public.szf_mvp_guest_votes_v109 (
 match_id uuid NOT NULL REFERENCES public.szf_matches(id) ON DELETE CASCADE,
 voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 guest_id uuid NOT NULL REFERENCES public.szf_guest_players_v53(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(match_id,voter_id)
);
ALTER TABLE public.szf_mvp_guest_votes_v109 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS szf_mvp_guest_vote_read_v109 ON public.szf_mvp_guest_votes_v109;
CREATE POLICY szf_mvp_guest_vote_read_v109 ON public.szf_mvp_guest_votes_v109 FOR SELECT TO authenticated USING (true);
REVOKE INSERT,UPDATE,DELETE ON public.szf_mvp_guest_votes_v109 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.szf_mvp_guest_votes_v109 TO authenticated;
CREATE OR REPLACE FUNCTION public.szf_vote_mvp_guest_v109(p_match uuid,p_guest uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=auth.uid();
BEGIN
 IF v IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.szf_matches WHERE id=p_match AND status='completed') THEN RAISE EXCEPTION 'Maç tamamlanmamış'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=v) THEN RAISE EXCEPTION 'Yalnızca maçın kayıtlı oyuncuları oy kullanabilir'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.szf_guest_players_v53 WHERE match_id=p_match AND id=p_guest) THEN RAISE EXCEPTION 'Bu misafir maç kadrosunda yok'; END IF;
 IF EXISTS (SELECT 1 FROM public.szf_guest_players_v53 WHERE id=p_guest AND linked_user_id=v) THEN RAISE EXCEPTION 'Kendine oy veremezsin'; END IF;
 IF EXISTS (SELECT 1 FROM public.szf_mvp_votes_v53 WHERE match_id=p_match AND voter_id=v) THEN RAISE EXCEPTION 'Bu maçta zaten oy kullandın'; END IF;
 INSERT INTO public.szf_mvp_guest_votes_v109(match_id,voter_id,guest_id) VALUES(p_match,v,p_guest)
 ON CONFLICT (match_id,voter_id) DO UPDATE SET guest_id=excluded.guest_id,created_at=now();
END $$;
REVOKE ALL ON FUNCTION public.szf_vote_mvp_guest_v109(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_vote_mvp_guest_v109(uuid,uuid) TO authenticated;

-- Var olan event tablosuna KK türünü ekleyin. Mevcut tür kontrol kısıtları
-- şemaya göre değişebildiğinden sadece kind sütununu kontrol eden CHECK'ler kaldırılır.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='public.szf_match_events_v53'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%kind%'
 LOOP EXECUTE format('ALTER TABLE public.szf_match_events_v53 DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE public.szf_match_events_v53 ADD CONSTRAINT szf_event_kind_v109 CHECK (kind IN ('goal','assist','own_goal'));
CREATE OR REPLACE FUNCTION public.szf_add_own_goal_v109(p_match uuid,p_person uuid,p_is_guest boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.szf_admins WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Yalnızca yönetici'; END IF;
 IF p_is_guest THEN
  IF NOT EXISTS(SELECT 1 FROM public.szf_guest_players_v53 WHERE id=p_person AND match_id=p_match) THEN RAISE EXCEPTION 'Misafir maçta bulunamadı'; END IF;
  INSERT INTO public.szf_match_events_v53(match_id,guest_id,kind) VALUES(p_match,p_person,'own_goal');
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=p_person) THEN RAISE EXCEPTION 'Oyuncu maçta bulunamadı'; END IF;
  INSERT INTO public.szf_match_events_v53(match_id,player_id,kind) VALUES(p_match,p_person,'own_goal');
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.szf_add_own_goal_v109(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_add_own_goal_v109(uuid,uuid,boolean) TO authenticated;
-- KK rakip takım skoruna yazılır; oyuncunun normal gol istatistiğine girmez.
-- Skor henüz elle kaydedilmediyse skora dokunulmaz; sonuç ekranında KK ayrıca gösterilir.
CREATE OR REPLACE FUNCTION public.szf_own_goal_score_v109()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE side text; change_count integer;
BEGIN
 IF (CASE WHEN TG_OP='DELETE' THEN OLD.kind ELSE NEW.kind END) <> 'own_goal' THEN
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 change_count:=CASE WHEN TG_OP='DELETE' THEN -1 ELSE 1 END;
 IF (CASE WHEN TG_OP='DELETE' THEN OLD.guest_id ELSE NEW.guest_id END) IS NOT NULL THEN
  SELECT team_color INTO side FROM public.szf_guest_players_v53
   WHERE id=(CASE WHEN TG_OP='DELETE' THEN OLD.guest_id ELSE NEW.guest_id END);
 ELSE
  SELECT team_color INTO side FROM public.szf_participants
   WHERE match_id=(CASE WHEN TG_OP='DELETE' THEN OLD.match_id ELSE NEW.match_id END)
   AND player_id=(CASE WHEN TG_OP='DELETE' THEN OLD.player_id ELSE NEW.player_id END);
 END IF;
 IF side='red' THEN
  UPDATE public.szf_matches SET white_score=greatest(0,white_score+change_count)
   WHERE id=(CASE WHEN TG_OP='DELETE' THEN OLD.match_id ELSE NEW.match_id END) AND white_score IS NOT NULL;
 ELSIF side='white' THEN
  UPDATE public.szf_matches SET red_score=greatest(0,red_score+change_count)
   WHERE id=(CASE WHEN TG_OP='DELETE' THEN OLD.match_id ELSE NEW.match_id END) AND red_score IS NOT NULL;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS szf_own_goal_score_v109 ON public.szf_match_events_v53;
CREATE TRIGGER szf_own_goal_score_v109 AFTER INSERT OR DELETE ON public.szf_match_events_v53
FOR EACH ROW EXECUTE FUNCTION public.szf_own_goal_score_v109();
NOTIFY pgrst,'reload schema';
