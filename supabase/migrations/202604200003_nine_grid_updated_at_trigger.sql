-- P2 #8：把 updated_at 交給 DB 維護，避免 client clock skew 汙染排序。
-- 建立共用 trigger function，讓 UserNineGrid / NineGridTemplates 在 UPDATE 時自動寫入 NOW()。
-- App 端可以停止傳 updated_at 欄位（傳也不會錯，但以 DB 寫入為準）。

CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_user_nine_grid_updated_at ON public."UserNineGrid";
CREATE TRIGGER tg_user_nine_grid_updated_at
BEFORE UPDATE ON public."UserNineGrid"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

DROP TRIGGER IF EXISTS tg_nine_grid_templates_updated_at ON public."NineGridTemplates";
CREATE TRIGGER tg_nine_grid_templates_updated_at
BEFORE UPDATE ON public."NineGridTemplates"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
