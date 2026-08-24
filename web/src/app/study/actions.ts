"use server";

import { getDiscordIdentity } from "@/lib/discord";
import { ghiLoi } from "@/lib/ghiLoi";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// Phiên học tập trên WEB — nối /study vào cùng hệ thưởng của lệnh /study bên Discord.
//
// NGUYÊN TẮC BẢO MẬT của cả file: Discord ID CHỈ lấy từ phiên đăng nhập trong cookie
// (`getDiscordIdentity`), TUYỆT ĐỐI không nhận từ tham số. Client chỉ được nói "tôi muốn học
// 25 phút" và "phiên số mấy" — không được nói "tôi là ai" hay "cho tôi bao nhiêu xu".
//
// Số tiền thưởng KHÔNG có mặt trong file này: RPC `complete_web_study_session` tự tính từ
// `duration_minutes` đã chốt trong DB lúc bắt đầu, và tự kiểm `now() >= ends_at`. Kể cả khi
// ai đó gọi thẳng Server Action này bằng script, họ vẫn không rút ngắn được phiên hay chọn
// được số xu.
// ============================================================

const MIN_PHUT = 15;
const MAX_PHUT = 120;

export type KetQuaBatDau =
    | { ok: true; sessionId: number; endsAt: string; durationMinutes: number }
    | { ok: false; ma: "chua_dang_nhap" | "dang_co_phien" | "loi_db"; endsAt?: string };

export type KetQuaHoanThanh =
    | { ok: true; coins: number; exp: number; points: number; streak: number; minutes: number }
    | { ok: false; ma: "chua_dang_nhap" | "chua_het_gio" | "khong_thay_phien" | "chua_choi_bot" | "loi_db"; giayConLai?: number };

/** Discord ID của phiên đăng nhập hiện tại, hoặc null nếu chưa đăng nhập. */
async function layDiscordId(): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return getDiscordIdentity(data.user).id;
}

/** Bắt đầu một phiên học được DB ghi nhận. */
export async function batDauPhienHoc(soPhut: number, tenPhien?: string): Promise<KetQuaBatDau> {
    try {
        const userId = await layDiscordId();
        if (!userId) return { ok: false, ma: "chua_dang_nhap" };

        // Kẹp lại ở đây nữa dù RPC cũng kẹp — chặn từ vòng ngoài để log DB không đầy rác.
        const phut = Math.max(MIN_PHUT, Math.min(MAX_PHUT, Math.floor(Number(soPhut) || 25)));

        const admin = createAdminClient();
        const { data, error } = await admin.rpc("start_web_study_session", {
            p_user_id: userId,
            p_session_name: (tenPhien || "").slice(0, 50),
            p_duration_minutes: phut,
        });
        if (ghiLoi("study/batDauPhienHoc", error)) return { ok: false, ma: "loi_db" };

        if (!data?.success) {
            if (data?.error === "already_active") {
                return { ok: false, ma: "dang_co_phien", endsAt: data.ends_at };
            }
            return { ok: false, ma: "loi_db" };
        }

        return {
            ok: true,
            sessionId: Number(data.session_id),
            endsAt: String(data.ends_at),
            durationMinutes: Number(data.duration_minutes),
        };
    } catch (e) {
        ghiLoi("study/batDauPhienHoc", { message: String(e) });
        return { ok: false, ma: "loi_db" };
    }
}

/**
 * Dời hạn kết thúc ra xa đúng bằng khoảng người dùng đã tạm dừng.
 * Chỉ có thể làm phần thưởng ĐẾN MUỘN HƠN nên tin số giây từ client là an toàn.
 */
export async function buTruThoiGianTamDung(sessionId: number, giayDaDung: number): Promise<{ ok: boolean }> {
    try {
        const userId = await layDiscordId();
        if (!userId) return { ok: false };

        const giay = Math.max(0, Math.min(14400, Math.floor(Number(giayDaDung) || 0)));
        if (giay === 0) return { ok: true };

        const admin = createAdminClient();
        const { data, error } = await admin.rpc("extend_web_study_session", {
            p_session_id: Math.floor(Number(sessionId)),
            p_user_id: userId,
            p_add_seconds: giay,
        });
        if (ghiLoi("study/buTruThoiGianTamDung", error)) return { ok: false };
        return { ok: !!data?.success };
    } catch (e) {
        ghiLoi("study/buTruThoiGianTamDung", { message: String(e) });
        return { ok: false };
    }
}

/** Chốt phiên và nhận thưởng. Thưởng do DB tự tính — action này không truyền số nào vào. */
export async function hoanThanhPhienHoc(sessionId: number): Promise<KetQuaHoanThanh> {
    try {
        const userId = await layDiscordId();
        if (!userId) return { ok: false, ma: "chua_dang_nhap" };

        const admin = createAdminClient();
        const { data, error } = await admin.rpc("complete_web_study_session", {
            p_session_id: Math.floor(Number(sessionId)),
            p_user_id: userId,
        });
        if (ghiLoi("study/hoanThanhPhienHoc", error)) return { ok: false, ma: "loi_db" };

        if (!data?.success) {
            if (data?.error === "too_early") {
                return { ok: false, ma: "chua_het_gio", giayConLai: Number(data.seconds_left) || 0 };
            }
            if (data?.error === "no_game_account") return { ok: false, ma: "chua_choi_bot" };
            if (data?.error === "session_not_found_or_inactive") return { ok: false, ma: "khong_thay_phien" };
            return { ok: false, ma: "loi_db" };
        }

        return {
            ok: true,
            coins: Number(data.earned_coins) || 0,
            exp: Number(data.earned_exp) || 0,
            points: Number(data.study_points) || 0,
            streak: Number(data.new_streak) || 1,
            minutes: Number(data.minutes) || 0,
        };
    } catch (e) {
        ghiLoi("study/hoanThanhPhienHoc", { message: String(e) });
        return { ok: false, ma: "loi_db" };
    }
}

/** Bỏ phiên giữa chừng — không thưởng, giống hệt `/study stop` bên bot. */
export async function huyPhienHoc(sessionId: number): Promise<{ ok: boolean }> {
    try {
        const userId = await layDiscordId();
        if (!userId) return { ok: false };

        const admin = createAdminClient();
        const { data, error } = await admin.rpc("cancel_web_study_session", {
            p_session_id: Math.floor(Number(sessionId)),
            p_user_id: userId,
        });
        if (ghiLoi("study/huyPhienHoc", error)) return { ok: false };
        return { ok: !!data?.success };
    } catch (e) {
        ghiLoi("study/huyPhienHoc", { message: String(e) });
        return { ok: false };
    }
}

/** Trang biết có nên mời đăng nhập hay không (chỉ dùng để hiển thị). */
export async function dangDangNhap(): Promise<boolean> {
    return (await layDiscordId()) !== null;
}
