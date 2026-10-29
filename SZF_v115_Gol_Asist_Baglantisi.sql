-- v115: Every NEW goal and assist are recorded atomically with goal_event_id link.
ALTER TABLE public.szf_match_events_v53 ADD COLUMN IF NOT EXISTS goal_event_id uuid;
CREATE INDEX IF NOT EXISTS szf_match_assist_goal_v115 ON public.szf_match_events_v53(goal_event_id) WHERE goal_event_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.szf_add_goal_assist_v115(p_match uuid,p_person uuid,p_is_guest boolean,p_assist uuid DEFAULT NULL,p_assist_is_guest boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g uuid; scorer_team text; assist_team text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.szf_admins WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Yalnızca yönetici'; END IF;
 IF p_is_guest THEN SELECT team_color INTO scorer_team FROM public.szf_guest_players_v53 WHERE id=p_person AND match_id=p_match;
 ELSE SELECT team_color INTO scorer_team FROM public.szf_participants WHERE player_id=p_person AND match_id=p_match; END IF;
 IF scorer_team NOT IN ('red','white') OR scorer_team IS NULL THEN RAISE EXCEPTION 'Golcü maç kadrosunda ve takımda bulunmalı'; END IF;
 IF p_assist IS NOT NULL THEN
  IF p_is_guest=p_assist_is_guest AND p_person=p_assist THEN RAISE EXCEPTION 'Kendi golüne asist olmaz'; END IF;
  IF p_assist_is_guest THEN SELECT team_color INTO assist_team FROM public.szf_guest_players_v53 WHERE id=p_assist AND match_id=p_match;
  ELSE SELECT team_color INTO assist_team FROM public.szf_participants WHERE player_id=p_assist AND match_id=p_match; END IF;
  IF assist_team IS DISTINCT FROM scorer_team THEN RAISE EXCEPTION 'Asist yapan oyuncu golcüyle aynı takımda olmalı'; END IF;
 END IF;
 IF p_is_guest THEN INSERT INTO public.szf_match_events_v53(match_id,guest_id,kind) VALUES(p_match,p_person,'goal') RETURNING id INTO g;
 ELSE INSERT INTO public.szf_match_events_v53(match_id,player_id,kind) VALUES(p_match,p_person,'goal') RETURNING id INTO g; END IF;
 IF p_assist IS NOT NULL THEN
  IF p_assist_is_guest THEN INSERT INTO public.szf_match_events_v53(match_id,guest_id,kind,goal_event_id) VALUES(p_match,p_assist,'assist',g);
  ELSE INSERT INTO public.szf_match_events_v53(match_id,player_id,kind,goal_event_id) VALUES(p_match,p_assist,'assist',g); END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.szf_add_goal_assist_v115(uuid,uuid,boolean,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_add_goal_assist_v115(uuid,uuid,boolean,uuid,boolean) TO authenticated;
-- Removing a goal also removes only its explicitly paired assist.
CREATE OR REPLACE FUNCTION public.szf_remove_paired_assist_v115()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.kind='goal' THEN DELETE FROM public.szf_match_events_v53 WHERE goal_event_id=OLD.id AND kind='assist'; END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS szf_remove_paired_assist_v115 ON public.szf_match_events_v53;
CREATE TRIGGER szf_remove_paired_assist_v115 AFTER DELETE ON public.szf_match_events_v53
FOR EACH ROW EXECUTE FUNCTION public.szf_remove_paired_assist_v115();
NOTIFY pgrst,'reload schema';
