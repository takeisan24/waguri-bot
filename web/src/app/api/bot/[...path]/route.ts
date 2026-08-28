import { NextResponse } from "next/server";
import { BOT_API } from "../../../../lib/botApi";

// ============================================================
// /api/bot/* — cầu nối CÙNG NGUỒN tới API công khai của bot.
//
// VÌ SAO CẦN. Trang web chạy HTTPS (Vercel), còn bot phục vụ ở `http://<ip>:15247`. Trình
// duyệt CHẶN CỨNG mọi fetch HTTP từ trang HTTPS (mixed content) — chặn im lặng, không có
// lỗi nào hiện ra trong giao diện. Nên bốn thành phần chạy ở trình duyệt (LiveStats,
// EventBanner, LeaderboardTeaser, trang /status) không thể gọi thẳng địa chỉ IP.
//
// Fetch từ MÁY CHỦ thì không vướng luật đó. Route này nhận lời gọi cùng nguồn (HTTPS) rồi
// chuyển tiếp sang bot bằng HTTP — trình duyệt chỉ thấy HTTPS, còn chặng HTTP nằm giữa hai
// máy chủ.
//
// Nó cũng gỡ luôn phụ thuộc vào subdomain `waguribot.wispbyte.app`, thứ đang trả 504 sau 25
// giây trong khi IP trực tiếp trả 200 trong 0,57 giây (đo 28-08).
//
// ⚠️ DANH SÁCH CHO PHÉP, KHÔNG PHẢI PROXY MỞ. Chỉ những đường ĐỌC công khai. Cố ý KHÔNG mở
// `topgg/`, `dbl/`, `casso/`, `premium/notify`: đó là webhook nhận POST kèm chữ ký, và một
// proxy mở sẽ thành đường vòng để gọi chúng từ nguồn khác.
// ============================================================

export const revalidate = 30;

const CHO_PHEP: RegExp[] = [
    /^stats$/,
    /^api\/event$/,
    /^api\/guilds$/,
    /^api\/leaderboard$/,
    /^api\/profile\/\d{5,25}$/,
    /^api\/bakery\/\d{5,25}$/,
];

// `health` là bí danh cho đường gốc `/` của bot — nó trả TEXT ("Waguri OK 🌸") chứ không
// phải JSON, nên phải bọc lại. Không cho `""` (đường rỗng) làm bí danh: `/api/bot/` không
// khớp route `[...path]` nên sẽ 404 một cách khó hiểu.
const DUONG_HEALTH = "health";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const { path } = await params;
    const duong = (path || []).join("/");

    const laHealth = duong === DUONG_HEALTH;
    if (!laHealth && !CHO_PHEP.some((rx) => rx.test(duong))) {
        return NextResponse.json({ error: "not_allowed" }, { status: 404 });
    }

    // Giữ lại query string (vd `?type=level&limit=10`).
    const qs = new URL(request.url).search;

    const ctrl = new AbortController();
    // 4 giây: khớp với thời gian chờ mà các thành phần phía trình duyệt vốn đã dùng, nên
    // hành vi "bot im -> ẩn widget" không đổi.
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
        const res = await fetch(`${BOT_API}/${laHealth ? "" : duong}${qs}`, {
            signal: ctrl.signal,
            // Health phải LUÔN tươi: nó tồn tại để trả lời "bot còn sống KHÔNG, NGAY BÂY GIỜ".
            // Cache 30 giây ở đây sẽ báo "còn sống" cho một con bot vừa chết.
            next: laHealth ? undefined : { revalidate: 30 },
            cache: laHealth ? "no-store" : undefined,
        });
        if (!res.ok) return NextResponse.json({ error: "bot_error" }, { status: 502 });
        if (laHealth) return NextResponse.json({ ok: true, text: await res.text() });
        return NextResponse.json(await res.json());
    } catch {
        // Bot tắt hoặc quá hạn -> 503. Phía trình duyệt đã có sẵn nhánh `.catch()` để ẩn
        // widget, nên người dùng thấy trang gọn chứ không thấy một ô hỏng.
        return NextResponse.json({ error: "bot_unreachable" }, { status: 503 });
    } finally {
        clearTimeout(timer);
    }
}
