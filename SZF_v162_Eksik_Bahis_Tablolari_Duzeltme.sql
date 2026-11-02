-- SZF v162 - Eksik bahis altyapisini kur, v161 bahis degistirme fonksiyonunu etkinlestir.
-- Mevcut bahisleri, maclari ve bakiyeleri SILMEZ.
-- SQL Editor icinde tek sefer calistirin.

BEGIN;

CREATE TABLE IF NOT EXISTS public.szf_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  last_credit_week date NOT NULL DEFAULT
    (date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul')::date)
);

CREATE TABLE IF NOT EXISTS public.szf_bets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.szf_matches(id) ON DELETE CASCADE,
  pick text NOT NULL CHECK (pick IN ('red','draw','white')),
  stake bigint NOT NULL CHECK (stake > 0),
  odds numeric(4,2) NOT NULL CHECK (odds IN (2.00,5.00)),
  paid_out bigint NOT NULL DEFAULT 0,
  placed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,match_id)
);

ALTER TABLE public.szf_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.szf_bets ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.szf_wallets TO authenticated;
GRANT SELECT ON public.szf_bets TO authenticated;

DROP POLICY IF EXISTS szf_v162_wallet_read ON public.szf_wallets;
CREATE POLICY szf_v162_wallet_read ON public.szf_wallets
FOR SELECT TO authenticated USING (user_id=auth.uid());

DROP POLICY IF EXISTS szf_v162_bets_read ON public.szf_bets;
CREATE POLICY szf_v162_bets_read ON public.szf_bets
FOR SELECT TO authenticated USING (user_id=auth.uid());

-- Eksik oyuncu cuzdanlari icin ilk 1000 kredi (var olanlar degismez).
INSERT INTO public.szf_wallets(user_id,balance)
SELECT p.id, 1000 FROM public.profiles p
ON CONFLICT(user_id) DO NOTHING;

COMMIT;

-- SZF v161: Maç başlayana kadar ilk bahis ya da mevcut bahsin güncellenmesi.
-- Eski bahis kredisi iade edilip yeni tutar aynı transaction içinde ayrılır.
-- Önceki maç / bahis kayıtları silinmez.
BEGIN;
CREATE OR REPLACE FUNCTION public.szf_change_bet_v160(p_match uuid,p_pick text,p_stake bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_uid uuid := auth.uid();
 v_match public.szf_matches%rowtype;
 v_previous public.szf_bets%rowtype;
 v_balance bigint;
 v_old_stake bigint := 0;
 v_odds numeric(4,2);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
 IF p_pick IS NULL OR p_pick NOT IN ('red','white','draw') OR p_stake IS NULL OR p_stake < 1
 THEN RAISE EXCEPTION 'Geçersiz bahis'; END IF;
 SELECT * INTO v_match FROM public.szf_matches WHERE id=p_match FOR UPDATE;
 IF NOT FOUND OR v_match.status <> 'open' OR v_match.match_date <= now()
 THEN RAISE EXCEPTION 'Maç başladı veya bahis kapandı'; END IF;
 -- İlk bahis için cüzdan eksikse oluştur, otomatik haftalık dağıtım yapma.
 INSERT INTO public.szf_wallets(user_id,balance) VALUES(v_uid,1000)
 ON CONFLICT(user_id) DO NOTHING;
 SELECT balance INTO v_balance FROM public.szf_wallets WHERE user_id=v_uid FOR UPDATE;
 SELECT * INTO v_previous FROM public.szf_bets
 WHERE user_id=v_uid AND match_id=p_match FOR UPDATE;
 IF FOUND THEN
   IF v_previous.paid_out <> 0 THEN RAISE EXCEPTION 'Sonuçlanmış bahis değiştirilemez'; END IF;
   v_old_stake := v_previous.stake;
 END IF;
 IF p_stake > v_balance + v_old_stake THEN RAISE EXCEPTION 'Yetersiz kredi'; END IF;
 v_odds := CASE WHEN p_pick='draw' THEN 5.00 ELSE 2.00 END;
 UPDATE public.szf_wallets SET balance=balance+v_old_stake-p_stake WHERE user_id=v_uid;
 INSERT INTO public.szf_bets(user_id,match_id,pick,stake,odds)
 VALUES(v_uid,p_match,p_pick,p_stake,v_odds)
 ON CONFLICT(user_id,match_id) DO UPDATE SET
 pick=excluded.pick, stake=excluded.stake, odds=excluded.odds;
END $$;
REVOKE ALL ON FUNCTION public.szf_change_bet_v160(uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.szf_change_bet_v160(uuid,text,bigint) TO authenticated;
COMMIT;


-- PostgREST'in yeni tablo/fonksiyonu hemen gormesi icin
NOTIFY pgrst, 'reload schema';

-- Test: bu sorgular nesneleri gosterir, bahis OYNAMAZ.
SELECT
  to_regclass('public.szf_bets') AS bahis_tablosu,
  to_regclass('public.szf_wallets') AS cuzdan_tablosu,
  to_regprocedure('public.szf_change_bet_v160(uuid,text,bigint)') AS bahis_fonksiyonu;
