-- SZF v148: İlk oy süresiz; ilk oydan sonraki 24 saat serbest düzeltme.
-- Ardından sadece birlikte oynanan maçta başlangıç +1 saatten +25 saate kadar
-- her özelliğe -5/0/+5. Önceki maç puanları ve mevcut oylar korunur.
-- ÖNCE yedek alın. Eski oylarda ilk kayıt saati tutulmadığı için geçmiş
-- kayıtların serbest düzeltme aralığı geriye dönük açılmaz.
BEGIN;
ALTER TABLE public.szf_ratings_v70
 ADD COLUMN IF NOT EXISTS first_submitted_at timestamptz;
UPDATE public.szf_ratings_v70
 SET first_submitted_at = COALESCE(updated_at,now()) - interval '24 hours'
 WHERE first_submitted_at IS NULL;
ALTER TABLE public.szf_ratings_v70
 ALTER COLUMN first_submitted_at SET DEFAULT now();
ALTER TABLE public.szf_ratings_v70
 ALTER COLUMN first_submitted_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.szf_rating_match_changes_v148 (
 voter_id uuid NOT NULL,
 target_id uuid NOT NULL,
 match_id uuid NOT NULL REFERENCES public.szf_matches(id) ON DELETE CASCADE,
 base_scores integer[] NOT NULL,
 deltas integer[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (voter_id,target_id,match_id)
);
ALTER TABLE public.szf_rating_match_changes_v148 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.szf_rating_match_changes_v148 FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.szf_submit_rating_v148(
 p_target uuid,p_scores integer[],p_match uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 uid uuid:=auth.uid();
 oldvote public.szf_ratings_v70%rowtype;
 m public.szf_matches%rowtype;
 saved public.szf_rating_match_changes_v148%rowtype;
 baseline integer[];
 final_scores integer[];
 i integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Önce giriş yapmalısın';END IF;
 IF uid=p_target THEN RAISE EXCEPTION 'Kendini değerlendiremezsin';END IF;
 IF array_length(p_scores,1) IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'Altı özellik gerekli';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_target AND approved=true) THEN
   RAISE EXCEPTION 'Değerlendirilecek oyuncu bulunamadı';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(uid::text),hashtext(p_target::text));
 SELECT * INTO oldvote FROM public.szf_ratings_v70 WHERE voter_id=uid AND target_id=p_target FOR UPDATE;
 IF NOT FOUND THEN
  IF p_match IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(p_scores) n WHERE n<1 OR n>99) THEN
   RAISE EXCEPTION 'İlk puanlama 1-99 arasında yapılmalıdır';END IF;
  INSERT INTO public.szf_ratings_v70(voter_id,target_id,scores,updated_at,first_submitted_at)
   VALUES(uid,p_target,p_scores,now(),now());
  RETURN;
 END IF;
 IF p_match IS NULL THEN
  IF now() >= oldvote.first_submitted_at + interval '24 hours' THEN
   RAISE EXCEPTION 'Serbest düzeltme süresi doldu. Yeniden puanlamak için ortak maç gerekli';END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_scores) n WHERE n<1 OR n>99) THEN
   RAISE EXCEPTION 'Puanlar 1-99 arasında olmalı';END IF;
  UPDATE public.szf_ratings_v70 SET scores=p_scores,updated_at=now()
   WHERE voter_id=uid AND target_id=p_target;
  RETURN;
 END IF;
 IF now()<oldvote.first_submitted_at+interval '24 hours' THEN
  RAISE EXCEPTION 'İlk 24 saatte 1-99 serbest düzeltme kullan';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_scores) n WHERE n NOT IN (-5,0,5)) THEN
  RAISE EXCEPTION 'Sadece -5, 0 veya +5 seçilebilir';END IF;
 SELECT * INTO m FROM public.szf_matches WHERE id=p_match;
 IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı';END IF;
 IF now()<m.match_date+interval '1 hour' OR now()>=m.match_date+interval '25 hours' THEN
  RAISE EXCEPTION 'Değerlendirme maçın 1. saatinden itibaren 24 saat açıktır';END IF;
 IF NOT (
   (EXISTS(SELECT 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=uid)
    OR EXISTS(SELECT 1 FROM public.szf_guest_players_v53 WHERE match_id=p_match AND linked_user_id=uid))
   AND
   (EXISTS(SELECT 1 FROM public.szf_participants WHERE match_id=p_match AND player_id=p_target)
    OR EXISTS(SELECT 1 FROM public.szf_guest_players_v53 WHERE match_id=p_match AND linked_user_id=p_target))
 ) THEN RAISE EXCEPTION 'İki oyuncu aynı maçta oynamış olmalı';END IF;
 SELECT * INTO saved FROM public.szf_rating_match_changes_v148
  WHERE voter_id=uid AND target_id=p_target AND match_id=p_match FOR UPDATE;
 baseline:=CASE WHEN FOUND THEN saved.base_scores ELSE oldvote.scores END;
 final_scores:=ARRAY[]::integer[];
 FOR i IN 1..6 LOOP
  final_scores:=array_append(final_scores,GREATEST(1,LEAST(99,baseline[i]+p_scores[i])));
 END LOOP;
 INSERT INTO public.szf_rating_match_changes_v148(voter_id,target_id,match_id,base_scores,deltas)
  VALUES(uid,p_target,p_match,baseline,p_scores)
  ON CONFLICT(voter_id,target_id,match_id)
  DO UPDATE SET deltas=EXCLUDED.deltas,updated_at=now();
 UPDATE public.szf_ratings_v70 SET scores=final_scores,updated_at=now()
  WHERE voter_id=uid AND target_id=p_target;
END $$;

REVOKE ALL ON FUNCTION public.szf_submit_rating_v148(uuid,integer[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_submit_rating_v148(uuid,integer[],uuid) TO authenticated;
-- Eski sınırsız güncelleme kapatılır. Diğer modüller bu fonksiyonu kullanmaz.
REVOKE EXECUTE ON FUNCTION public.szf_submit_rating_v70(uuid,integer[]) FROM PUBLIC,anon,authenticated;
-- Oy kayıtları yalnızca RPC aracılığıyla yazılır (tablo SELECT izinleri korunur).
REVOKE INSERT,UPDATE,DELETE ON public.szf_ratings_v70 FROM PUBLIC,anon,authenticated;
COMMIT;
