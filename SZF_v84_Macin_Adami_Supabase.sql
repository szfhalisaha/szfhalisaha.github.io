-- SZF Airport Halı Saha v84: Supabase SQL Editor'da BİR KEZ çalıştırın.
-- Mevcut gol/asist tablolarına ve eski MVP oylarına dokunulmaz.
ALTER TABLE public.szf_matches ADD COLUMN IF NOT EXISTS mvp_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.szf_mvp_start_on_complete_v84()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.mvp_started_at := now();
  END IF;
  -- Tarih üzerinden oylama süresini yeniden başlatma engeli
  IF OLD.status = 'completed' AND NEW.status = 'completed' THEN
    NEW.mvp_started_at := OLD.mvp_started_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS szf_mvp_start_on_complete_v84 ON public.szf_matches;
CREATE TRIGGER szf_mvp_start_on_complete_v84
BEFORE UPDATE ON public.szf_matches FOR EACH ROW
EXECUTE FUNCTION public.szf_mvp_start_on_complete_v84();

CREATE TABLE IF NOT EXISTS public.szf_mvp_votes_v84 (
  match_id uuid NOT NULL REFERENCES public.szf_matches(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id,voter_id),
  CONSTRAINT szf_mvp_no_self_v84 CHECK (voter_id <> target_id)
);
ALTER TABLE public.szf_mvp_votes_v84 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.szf_mvp_votes_v84 FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.szf_cast_mvp_v84(p_match uuid, p_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.szf_matches%ROWTYPE; v uuid := auth.uid();
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'Oy vermek için giriş yapmalısın.'; END IF;
  SELECT * INTO m FROM public.szf_matches WHERE id=p_match FOR SHARE;
  IF NOT FOUND OR m.status <> 'completed' OR m.mvp_started_at IS NULL THEN
    RAISE EXCEPTION 'Bu maçın oylaması henüz başlamadı.';
  END IF;
  IF now() >= m.mvp_started_at + interval '24 hours' THEN
    RAISE EXCEPTION '24 saatlik oylama süresi doldu.';
  END IF;
  IF v=p_target THEN RAISE EXCEPTION 'Kendine oy veremezsin.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=v) THEN
    RAISE EXCEPTION 'Yalnızca maçta oynayanlar oy verebilir.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=p_target) THEN
    RAISE EXCEPTION 'Seçilen oyuncu bu maçta yer almıyor.';
  END IF;
  INSERT INTO public.szf_mvp_votes_v84(match_id,voter_id,target_id) VALUES(p_match,v,p_target);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Bu maç için oyun zaten kaydedilmiş.';
END $$;

CREATE OR REPLACE FUNCTION public.szf_mvp_status_v84(p_match uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.szf_matches%ROWTYPE; v uuid := auth.uid(); opened boolean;
        n int; myvote boolean; allowed boolean; best int; winners jsonb;
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'Giriş gerekli.'; END IF;
  SELECT * INTO m FROM public.szf_matches WHERE id=p_match;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı.'; END IF;
  opened := m.status='completed' AND m.mvp_started_at IS NOT NULL
        AND now()<m.mvp_started_at+interval '24 hours';
  SELECT COUNT(*) INTO n FROM public.szf_mvp_votes_v84 WHERE match_id=p_match;
  SELECT EXISTS(SELECT 1 FROM public.szf_mvp_votes_v84 WHERE match_id=p_match AND voter_id=v) INTO myvote;
  SELECT EXISTS(SELECT 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=v) INTO allowed;
  IF opened THEN
    RETURN jsonb_build_object('open',true,'voted',myvote,'eligible',allowed,
      'deadline',m.mvp_started_at+interval '24 hours','vote_count',n);
  END IF;
  SELECT max(c) INTO best FROM (SELECT count(*)::int c FROM public.szf_mvp_votes_v84
    WHERE match_id=p_match GROUP BY target_id) z;
  SELECT coalesce(jsonb_agg(target_id), '[]'::jsonb) INTO winners FROM (
    SELECT target_id FROM public.szf_mvp_votes_v84 WHERE match_id=p_match
    GROUP BY target_id HAVING count(*)=best ORDER BY target_id
  ) z;
  RETURN jsonb_build_object('open',false,'voted',myvote,'eligible',allowed,
    'deadline', CASE WHEN m.mvp_started_at IS NOT NULL THEN m.mvp_started_at+interval '24 hours' END,
    'vote_count',n,'winning_votes',coalesce(best,0),'winners',winners);
END $$;

REVOKE ALL ON FUNCTION public.szf_cast_mvp_v84(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.szf_mvp_status_v84(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.szf_cast_mvp_v84(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.szf_mvp_status_v84(uuid) TO authenticated;

-- NOT: Önceden tamamlanmış maçlar için zaman bilinmediğinden otomatik
-- geçmişe dönük oylama açılmaz. Bu maçlarda 0 oy gösterilir.
