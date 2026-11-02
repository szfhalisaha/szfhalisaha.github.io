-- SZF v158 - Her SONUCLANAN MAC icin 1 kez katilima gore sanal kredi.
-- Onceden var olan bakiyeleri degistirmez. Kurulumdan once sonuclanan maclara odeme yapmaz.
-- Kirmizi/Beyaz takim ayrimi yoktur. Oynayan +1000, diger kayitli hesaplar +500.
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

CREATE OR REPLACE FUNCTION public.szf_award_match_credits_v158()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record; v_played boolean; v_amount integer;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status='completed' THEN RETURN NEW; END IF;
  -- Only approved registered player accounts participate in the league.
  -- Locking the match row is handled by the parent UPDATE transaction.
  FOR p IN SELECT id FROM public.profiles WHERE approved IS TRUE LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.szf_participants sp
      WHERE sp.match_id=NEW.id AND sp.player_id=p.id
    ) OR EXISTS (
      SELECT 1 FROM public.szf_guest_players_v53 gp
      WHERE gp.match_id=NEW.id AND gp.linked_user_id=p.id
    ) INTO v_played;
    v_amount:=CASE WHEN v_played THEN 1000 ELSE 500 END;
    INSERT INTO public.szf_match_credit_awards_v158(match_id,user_id,amount)
      VALUES (NEW.id,p.id,v_amount) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.szf_wallets(user_id,balance)
        VALUES(p.id,1000+v_amount)
      ON CONFLICT (user_id) DO UPDATE
        SET balance=public.szf_wallets.balance+EXCLUDED.balance-1000;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS szf_award_match_credits_v158 ON public.szf_matches;
CREATE TRIGGER szf_award_match_credits_v158
AFTER UPDATE OF status ON public.szf_matches
FOR EACH ROW WHEN (NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.szf_award_match_credits_v158();

-- Haftalik giris kredisi verilmesini de kesin olarak durdurur.
CREATE OR REPLACE FUNCTION public.szf_claim_weekly_credits()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_balance bigint;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Giris gerekli'; END IF;
 INSERT INTO public.szf_wallets(user_id,balance) VALUES(v_uid,1000) ON CONFLICT DO NOTHING;
 SELECT balance INTO v_balance FROM public.szf_wallets WHERE user_id=v_uid;
 RETURN v_balance;
END $$;
COMMIT;
