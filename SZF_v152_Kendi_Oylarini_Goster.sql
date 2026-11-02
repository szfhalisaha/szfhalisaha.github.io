-- SZF v152: Oyları yalnızca oy veren kişinin kendi hesabında okuyabilmesi.
-- Var olan kayıtları ve puanları değiştirmez.
BEGIN;
ALTER TABLE public.szf_ratings_v70 ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.szf_ratings_v70 TO authenticated;
DROP POLICY IF EXISTS szf_read_own_votes_v152 ON public.szf_ratings_v70;
CREATE POLICY szf_read_own_votes_v152
 ON public.szf_ratings_v70 FOR SELECT TO authenticated
 USING (voter_id = (SELECT auth.uid()));
COMMIT;
NOTIFY pgrst, 'reload schema';
