-- 0084_fix_prestige_energy.sql
-- Khắc phục lỗi Chuyển sinh tìm bảng public.energy không tồn tại.
-- Đồng bộ cập nhật thẳng vào energy & energy_updated_at của users.

CREATE OR REPLACE FUNCTION public.prestige_user(
    p_user_id TEXT,
    p_req_exp BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
    v_exp BIGINT;
    v_prestige INT;
BEGIN
    SELECT exp, prestige INTO v_exp, v_prestige FROM public.users WHERE user_id = p_user_id FOR UPDATE;
    IF v_exp IS NULL THEN 
        RETURN jsonb_build_object('status', 'no_user'); 
    END IF;

    -- Kiểm tra cấp độ tối thiểu
    IF v_exp < p_req_exp THEN
        RETURN jsonb_build_object('status', 'level_insufficient');
    END IF;

    -- Tiến hành chuyển sinh
    UPDATE public.users SET 
        exp = 0,
        prestige = prestige + 1,
        wallet = 5000, -- Cung cấp 5,000 xu khởi nghiệp
        bank = 0,
        job_id = NULL, -- Hủy nghề nghiệp hiện tại để bắt đầu lại
        energy = 100 + (prestige + 1) * 5, -- Hồi phục đầy năng lượng cực đại mới
        energy_updated_at = now()
    WHERE user_id = p_user_id;

    -- Thưởng nóng Huy hiệu Chuyển sinh tương ứng
    INSERT INTO public.user_badges (user_id, badge_id, is_equipped, slot_index)
    VALUES (p_user_id, 'prestige_' || (v_prestige + 1), TRUE, 1)
    ON CONFLICT (user_id, badge_id) DO UPDATE SET is_equipped = TRUE, slot_index = 1;

    RETURN jsonb_build_object('status', 'ok', 'new_prestige', v_prestige + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.prestige_user(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prestige_user(TEXT, BIGINT) TO service_role;
