-- SZF Airport Halı Saha v117 - Maçın Adamı 24 saat kesin kapanış
-- Bu SQL Supabase SQL Editor'da BİR KEZ çalıştırılmalıdır.
-- Mevcut oylar silinmez. Oylama, maçın tamamlandı durumuna geçirildiği andan başlar.
ALTER TABLE public.szf_matches ADD COLUMN IF NOT EXISTS mvp_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.szf_mvp_24h_start_v117()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.mvp_started_at := now();
  ELSIF OLD.status='completed' THEN
    NEW.mvp_started_at := OLD.mvp_started_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS szf_mvp_24h_start_v117 ON public.szf_matches;
CREATE TRIGGER szf_mvp_24h_start_v117 BEFORE UPDATE ON public.szf_matches
FOR EACH ROW EXECUTE FUNCTION public.szf_mvp_24h_start_v117();

-- Hem normal oyuncuya hem misafire oy verme, güncelleme ve doğrudan tablo erişimi engellenir.
CREATE OR REPLACE FUNCTION public.szf_mvp_24h_guard_v117()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE start_at timestamptz; current_status text; voter uuid;
BEGIN
  voter:=auth.uid();
  IF voter IS NULL THEN RAISE EXCEPTION 'Oy vermek için giriş yapmalısın'; END IF;
  IF NEW.voter_id IS DISTINCT FROM voter THEN RAISE EXCEPTION 'Başka oyuncu adına oy kullanamazsın'; END IF;
  SELECT status,mvp_started_at INTO current_status,start_at FROM public.szf_matches WHERE id=NEW.match_id FOR SHARE;
  IF current_status IS DISTINCT FROM 'completed' OR start_at IS NULL OR now() >= start_at + interval '24 hours' THEN
    RAISE EXCEPTION '24 saatlik Maçın Adamı oylaması kapandı veya henüz açılmadı';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.szf_participants p WHERE p.match_id=NEW.match_id AND p.player_id=voter) THEN
    RAISE EXCEPTION 'Sadece bu maçta oynayanlar oy kullanabilir';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.match_id IS DISTINCT FROM OLD.match_id OR NEW.voter_id IS DISTINCT FROM OLD.voter_id) THEN
    RAISE EXCEPTION 'Oy sahibi veya maç değiştirilemez';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS szf_mvp_24h_votes_v117 ON public.szf_mvp_votes_v53;
CREATE TRIGGER szf_mvp_24h_votes_v117 BEFORE INSERT OR UPDATE ON public.szf_mvp_votes_v53
FOR EACH ROW EXECUTE FUNCTION public.szf_mvp_24h_guard_v117();
DROP TRIGGER IF EXISTS szf_mvp_24h_guest_votes_v117 ON public.szf_mvp_guest_votes_v109;
CREATE TRIGGER szf_mvp_24h_guest_votes_v117 BEFORE INSERT OR UPDATE ON public.szf_mvp_guest_votes_v109
FOR EACH ROW EXECUTE FUNCTION public.szf_mvp_24h_guard_v117();
NOTIFY pgrst,'reload schema';
