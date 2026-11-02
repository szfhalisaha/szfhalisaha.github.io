-- SZF v155 - Uc oylarin genel kart ortalamasina etkisini notrler.
-- Oy veren kisinin 1 veya 99 kaydi ASLA degistirilmez.
-- Her ozellik icin yalnizca 2..98 oylarin ortalamasi hesaplanir.
-- Uc oylar toplam kisi sayisina dahil, hesaplanan etki olarak ayni ortalamaya esdegerdir.
-- Bir ozellik icin hic normal oy yoksa 70 notr gecici deger kullanilir.
-- Oyuncunun puanlari onceki gibi 10 farkli oy sonrasi gorunur.
-- Mevcut RLS ve bireysel oy gizliligi korunur.
BEGIN;
CREATE OR REPLACE FUNCTION public.szf_rating_summary_v70()
RETURNS TABLE(target_id uuid,voter_count bigint,scores integer[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH per_target AS (
  SELECT r.target_id, count(DISTINCT r.voter_id) AS vote_count,
   ARRAY[
    COALESCE(round(avg(r.scores[1]) FILTER (WHERE r.scores[1] BETWEEN 2 AND 98))::integer,70),
    COALESCE(round(avg(r.scores[2]) FILTER (WHERE r.scores[2] BETWEEN 2 AND 98))::integer,70),
    COALESCE(round(avg(r.scores[3]) FILTER (WHERE r.scores[3] BETWEEN 2 AND 98))::integer,70),
    COALESCE(round(avg(r.scores[4]) FILTER (WHERE r.scores[4] BETWEEN 2 AND 98))::integer,70),
    COALESCE(round(avg(r.scores[5]) FILTER (WHERE r.scores[5] BETWEEN 2 AND 98))::integer,70),
    COALESCE(round(avg(r.scores[6]) FILTER (WHERE r.scores[6] BETWEEN 2 AND 98))::integer,70)
   ] AS effective_scores
  FROM public.szf_ratings_v70 AS r GROUP BY r.target_id
 )
 SELECT t.target_id,t.vote_count,
  CASE WHEN t.vote_count>=10 THEN t.effective_scores ELSE NULL::integer[] END
 FROM per_target AS t
$$;
REVOKE ALL ON FUNCTION public.szf_rating_summary_v70() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_rating_summary_v70() TO authenticated;
COMMIT;
