-- SZF v176 | Mac sonu +1000 / +500 kredi odemeleri
-- Supabase SQL Editor (postgres / proje sahibi) uzerinde calistirin.
-- Mevcut cüzdanlari ve bahisleri sifirlamaz; odemeler mac+kullanici bazinda tektir.
-- Geriye donuk SADECE en son tamamlanan maca odeme yapar.
-- NOT: Eskiden bu maca ledger disindan elle kredi eklendiyse once kontrol edin.
BEGIN;

CREATE TABLE IF NOT EXISTS public.szf_match_credit_awards_v158 (
  match_id uuid NOT NULL REFERENCES public.szf_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount IN (500,1000)),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id,user_id)
);
ALTER TABLE public.szf_match_credit_awards_v158 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.szf_match_credit_awards_v158 FROM PUBLIC, anon, authenticated;

-- Hem tetikleyici hem onarim tek merkezi fonksiyonu cagirir.
CREATE OR REPLACE FUNCTION public.szf_distribute_match_credits_v176(p_match uuid)
RETURNS TABLE (credited_accounts integer, credited_total bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_status text;
  v_date timestamptz;
  v_user record;
  v_amount integer;
  v_inserted integer;
  v_count integer := 0;
  v_total bigint := 0;
BEGIN
  SELECT m.status, m.match_date INTO v_status,v_date
  FROM public.szf_matches m WHERE m.id=p_match FOR UPDATE;
  IF NOT FOUND OR v_status <> 'completed' OR v_date > now() THEN
    RAISE EXCEPTION 'Kredi icin sonuclanmis mac gerekli';
  END IF;
  FOR v_user IN
    SELECT p.id FROM public.profiles p
    JOIN auth.users u ON u.id=p.id
    WHERE p.approved IS TRUE
    ORDER BY p.id
  LOOP
    v_amount := CASE WHEN
      EXISTS(SELECT 1 FROM public.szf_participants sp
             WHERE sp.match_id=p_match AND sp.player_id=v_user.id)
      OR EXISTS(SELECT 1 FROM public.szf_guest_players_v53 gp
             WHERE gp.match_id=p_match AND gp.linked_user_id=v_user.id)
    THEN 1000 ELSE 500 END;
    INSERT INTO public.szf_match_credit_awards_v158(match_id,user_id,amount)
      VALUES(p_match,v_user.id,v_amount) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 1 THEN
      INSERT INTO public.szf_wallets(user_id,balance)
        VALUES(v_user.id,1000+v_amount)
      ON CONFLICT (user_id) DO UPDATE
        SET balance = public.szf_wallets.balance + v_amount;
      v_count := v_count+1;
      v_total := v_total+v_amount;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_count,v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.szf_distribute_match_credits_v176(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.szf_award_match_credits_v158()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
   PERFORM * FROM public.szf_distribute_match_credits_v176(NEW.id);
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS szf_award_match_credits_v158 ON public.szf_matches;
CREATE TRIGGER szf_award_match_credits_v158
AFTER UPDATE OF status ON public.szf_matches
FOR EACH ROW WHEN (NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.szf_award_match_credits_v158();

-- Haftalik +1000 yerine yalnızca başlangic cuzdanini garanti et.
CREATE OR REPLACE FUNCTION public.szf_claim_weekly_credits()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_balance bigint;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Giris gerekli'; END IF;
 INSERT INTO public.szf_wallets(user_id,balance) VALUES(v_uid,1000) ON CONFLICT DO NOTHING;
 SELECT balance INTO v_balance FROM public.szf_wallets WHERE user_id=v_uid;
 RETURN v_balance;
END $$;

-- Son tamamlanan mac icin daha once ODEME KAYDI OLMAYAN hesaplari telafi et.
-- Bu kayitlar mevcutsa yeniden kredi eklenmez.
DO $$
DECLARE v_match uuid;
BEGIN
 SELECT m.id INTO v_match FROM public.szf_matches m
 WHERE m.status='completed' AND m.match_date <= now()
 ORDER BY m.match_date DESC,m.id DESC LIMIT 1;
 IF v_match IS NOT NULL THEN
   PERFORM * FROM public.szf_distribute_match_credits_v176(v_match);
 END IF;
END $$;
COMMIT;

-- Kontrol: son maca dagitilan kredi sayilari, toplamlar ve tarih.
SELECT m.match_date, count(a.user_id) AS odeme_alan,
 count(*) FILTER (WHERE a.amount=1000) AS oynayan_1000,
 count(*) FILTER (WHERE a.amount=500) AS oynamayan_500,
 coalesce(sum(a.amount),0) AS toplam_kredi
FROM public.szf_matches m
LEFT JOIN public.szf_match_credit_awards_v158 a ON a.match_id=m.id
WHERE m.status='completed'
GROUP BY m.id,m.match_date
ORDER BY m.match_date DESC LIMIT 5;
