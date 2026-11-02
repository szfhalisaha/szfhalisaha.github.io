-- SZF v160: Maç başlayana kadar ilk bahis ya da mevcut bahsin güncellenmesi.
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
