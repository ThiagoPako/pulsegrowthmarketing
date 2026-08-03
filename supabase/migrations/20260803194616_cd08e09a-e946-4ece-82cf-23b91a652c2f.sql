REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_role(app_role, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_by_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trim_mural_desabafo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_promotion_redemption(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_by_login(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_promotion_redemption(uuid) TO anon, authenticated;