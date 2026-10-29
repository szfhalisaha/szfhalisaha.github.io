-- SZF Airport Halı Saha: sadece 29 Ekim 2026 19:30 maçı için kadro eşleştirmesi.
-- YALNIZCA Supabase SQL Editor'da bir kez çalıştırın.
-- İşlem sadece mevcut maç katılımcılarının takım rengini günceller; kimseyi eklemez/silmez.
-- 14 tekil kayıt / 7 kırmızı oyuncu doğrulanmazsa tamamı geri alınır.
BEGIN;
DO $szf$
DECLARE
  v_match uuid;
  v_total integer;
  v_ambiguous text;
BEGIN
  SELECT count(*), min(id) INTO v_total, v_match
  FROM public.szf_matches
  WHERE (match_date AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-10-29'
    AND (match_date AT TIME ZONE 'Europe/Istanbul')::time = TIME '19:30:00';
  IF v_total <> 1 THEN
    RAISE EXCEPTION '29 Ekim 19:30 için tek maç bulunamadı (eşleşme: %). Hiçbir kayıt değişmedi.',v_total;
  END IF;

  CREATE TEMP TABLE szf_29_roster ON COMMIT DROP AS
  SELECT 'p'::text AS kind, sp.player_id AS id, p.display_name::text AS name,
         sp.team_color::text AS old_team
  FROM public.szf_participants sp JOIN public.profiles p ON p.id=sp.player_id
  WHERE sp.match_id=v_match
  UNION ALL
  SELECT 'g', g.id, g.display_name, g.team_color
  FROM public.szf_guest_players_v53 g WHERE g.match_id=v_match;
  SELECT count(*) INTO v_total FROM szf_29_roster;
  IF v_total <> 14 THEN
    RAISE EXCEPTION 'Maçta 14 kişi bekleniyor, % kayıt var. Eşleşen mükerrer kayıt olabilir. Hiçbir şey değişmedi.', v_total;
  END IF;
  IF (SELECT count(DISTINCT (kind,id)) FROM szf_29_roster) <> 14 THEN
    RAISE EXCEPTION 'Mükerrer oyuncu satırları var. Hiçbir şey değişmedi.';
  END IF;

  CREATE TEMP TABLE szf_29_red_names(name text, pattern text) ON COMMIT DROP;
  INSERT INTO szf_29_red_names VALUES
     ('Hasan Limon', 'hasan limon%'),
     ('Ozan', 'ozan%'),
     ('Emre', 'emre%'),
     ('Kerem', 'kerem%'),
     ('Alper', 'alper%'),
     ('Üzeyir', 'uzeyir%'),
     ('Bedirhan', 'bedirhan%');
  -- Türkçe harfleri aramada sadeleştir; ismin ilk kelimesi yetiyorsa eşleştir.
  CREATE TEMP TABLE szf_29_resolved ON COMMIT DROP AS
  SELECT n.name AS requested, r.kind, r.id, r.name,
         count(*) OVER (PARTITION BY n.name) AS matches
  FROM szf_29_red_names n
  JOIN szf_29_roster r
    ON translate(lower(trim(r.name)),'çğıöşü','cgiosu') LIKE n.pattern;

  SELECT string_agg(n.name||' ('||coalesce(x.cnt,0)||' eşleşme)', ', ') INTO v_ambiguous
  FROM szf_29_red_names n
  LEFT JOIN (SELECT requested, count(*) cnt FROM szf_29_resolved GROUP BY requested) x ON x.requested=n.name
  WHERE coalesce(x.cnt,0)<>1;
  IF v_ambiguous IS NOT NULL THEN
    RAISE EXCEPTION 'Kırmızı oyuncular kesin bulunamadı: %. Hiçbir kayıt değişmedi.',v_ambiguous;
  END IF;
  IF (SELECT count(DISTINCT (kind,id)) FROM szf_29_resolved) <> 7 THEN
    RAISE EXCEPTION 'Kırmızı takıma aynı kişi birden fazla adla eşleşti.';
  END IF;

  -- Kırmızı takımdaki yedi kişiye red; maçtaki diğer yedi kişiye white.
  UPDATE public.szf_participants sp
  SET team_color = CASE WHEN EXISTS (
     SELECT 1 FROM szf_29_resolved x WHERE x.kind='p' AND x.id=sp.player_id
  ) THEN 'red' ELSE 'white' END
  WHERE sp.match_id=v_match;
  UPDATE public.szf_guest_players_v53 g
  SET team_color = CASE WHEN EXISTS (
     SELECT 1 FROM szf_29_resolved x WHERE x.kind='g' AND x.id=g.id
  ) THEN 'red' ELSE 'white' END
  WHERE g.match_id=v_match;
  RAISE NOTICE '29 Ekim kadrosu kaydedildi. Kırmızı 7, Beyaz 7.';
END $szf$;
COMMIT;
-- Kontrol: tarihi ve takımı göster; değiştirmez.
SELECT v.team_color, v.display_name FROM (
 SELECT sp.team_color, p.display_name
 FROM public.szf_participants sp JOIN public.profiles p ON p.id=sp.player_id
 JOIN public.szf_matches m ON m.id=sp.match_id
 WHERE (m.match_date AT TIME ZONE 'Europe/Istanbul')::date=DATE '2026-10-29' AND (m.match_date AT TIME ZONE 'Europe/Istanbul')::time=TIME '19:30:00'
 UNION ALL
 SELECT g.team_color,g.display_name FROM public.szf_guest_players_v53 g
 JOIN public.szf_matches m ON m.id=g.match_id
 WHERE (m.match_date AT TIME ZONE 'Europe/Istanbul')::date=DATE '2026-10-29' AND (m.match_date AT TIME ZONE 'Europe/Istanbul')::time=TIME '19:30:00'
) v ORDER BY v.team_color,v.display_name;
