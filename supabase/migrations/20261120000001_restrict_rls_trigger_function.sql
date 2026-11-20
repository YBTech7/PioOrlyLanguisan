-- Restrict pre-existing RLS automation helper from API callers.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
