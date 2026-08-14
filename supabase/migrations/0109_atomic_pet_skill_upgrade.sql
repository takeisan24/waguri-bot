-- ============================================================
-- 0109_atomic_pet_skill_upgrade.sql — Nâng kỹ năng thú cưng NGUYÊN TỬ
--
-- 🟠 HIGH — tìm ra ở phần B của lượt quét có hệ thống (spec: docs/spec-audit-money-surface.md).
-- CẢ HAI tầng đều đọc-tính-ghi-đè, không nguyên tử:
--   · web  `upgradePetSkill` (dashboard/actions.ts): đọc skill_points + skills,
--          tính, rồi `update user_pets set skills = <cả khối>, skill_points = n-1`
--   · bot  `/pet skill-up` (pet.js:273-301): y hệt, qua db.updatePetSkills()
--
-- Hai lời gọi song song (bấm đúp / 2 tab / web + bot cùng lúc) cùng đọc
-- skill_points = 1 rồi cùng ghi skill_points = 0 với kỹ năng CỦA RIÊNG MÌNH
-- => nhận 2 cấp kỹ năng cho 1 điểm. Kỹ năng pet cho lợi thế kinh tế thật
-- (double_gem tới +35% nhân đôi quặng, fishing_luck, bakery_efficiency)
-- => bỏ qua ràng buộc thiết kế để lấy lợi thế = HIGH theo ngưỡng đã chốt.
--
-- Ghi ĐÈ NGUYÊN KHỐI `skills` còn xoá mất thay đổi mà phía kia vừa ghi (lost update).
--
-- CÁCH SỬA: một RPC làm trọn việc dưới `FOR UPDATE`, và dùng `jsonb_set` trên GIÁ TRỊ
-- CỘT HIỆN TẠI (không phải bản đã đọc) nên không đè khoá khác của đối phương.
-- Danh sách kỹ năng + cấp trần nằm TRONG hàm: trước đây whitelist chỉ có ở tầng lệnh,
-- nên bất kỳ đường gọi mới nào quên kiểm là lại hở.
--
-- Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upgrade_pet_skill(p_user TEXT, p_skill TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_points INT;
    v_skills JSONB;
    v_cur    INT;
    v_max    INT;
    v_rows   INT;
BEGIN
    -- Cấp trần theo từng kỹ năng — nguồn sự thật DUY NHẤT, khớp SKILL_LIST của
    -- PetSkillTree.tsx và maxLevel trong pet.js.
    v_max := CASE p_skill
        WHEN 'fishing_luck'      THEN 3
        WHEN 'double_gem'        THEN 2
        WHEN 'bakery_efficiency' THEN 3
        ELSE NULL
    END;
    IF v_max IS NULL THEN
        RETURN jsonb_build_object('status','bad_skill');
    END IF;

    SELECT skill_points, COALESCE(skills, '{}'::jsonb)
      INTO v_points, v_skills
      FROM public.user_pets
     WHERE user_id = p_user
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','no_pet');
    END IF;
    IF COALESCE(v_points, 0) <= 0 THEN
        RETURN jsonb_build_object('status','no_points');
    END IF;

    v_cur := COALESCE((v_skills ->> p_skill)::int, 0);
    IF v_cur >= v_max THEN
        RETURN jsonb_build_object('status','max_level','level', v_cur,'max', v_max);
    END IF;

    -- jsonb_set trên `skills` HIỆN TẠI (không phải v_skills đã đọc) -> chỉ đụng đúng
    -- một khoá, không xoá thay đổi khoá khác. Guard `skill_points >= 1` để dù có lọt
    -- qua kiểm tra ở trên thì UPDATE vẫn không trừ quá.
    UPDATE public.user_pets
       SET skills = jsonb_set(COALESCE(skills, '{}'::jsonb), ARRAY[p_skill], to_jsonb(v_cur + 1), true),
           skill_points = skill_points - 1
     WHERE user_id = p_user AND skill_points >= 1;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RETURN jsonb_build_object('status','no_points');
    END IF;

    RETURN jsonb_build_object('status','ok','skill', p_skill,'level', v_cur + 1,'points_left', v_points - 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upgrade_pet_skill(TEXT, TEXT) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.upgrade_pet_skill(TEXT, TEXT) TO service_role;

-- ============================================================
-- VERIFY (trên waguri-test):
--   INSERT INTO user_pets(user_id, skill_points, skills)
--     VALUES ('zz_pet', 1, '{}'::jsonb) ON CONFLICT (user_id) DO UPDATE
--     SET skill_points = 1, skills = '{}'::jsonb;
--   SELECT public.upgrade_pet_skill('zz_pet','double_gem'),      -- ok, level 1
--          public.upgrade_pet_skill('zz_pet','fishing_luck');    -- no_points  <-- mấu chốt
--   SELECT skill_points, skills FROM user_pets WHERE user_id='zz_pet';
--     -> skill_points = 0 và CHỈ MỘT kỹ năng lên cấp
--   SELECT public.upgrade_pet_skill('zz_pet','khong_ton_tai');   -- bad_skill
-- ============================================================
