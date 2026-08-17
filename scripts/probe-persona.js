#!/usr/bin/env node
// ============================================================
// scripts/probe-persona.js — Phỏng vấn Waguri để nghiệm thu GIỌNG NHÂN VẬT.
//
// KHÔNG phải test tự động: nó gọi Gemini API thật, tốn hạn mức, và kết quả cần người đọc.
// Vì thế nó nằm ở scripts/ chứ không ở test/ và KHÔNG chạy trong `npm test` hay pre-push.
//
// Dùng khi: vừa sửa persona.js / manga_lore.json và muốn biết nhân vật có thật sự đổi không.
//
//   node scripts/probe-persona.js         -> bậc thiện cảm 0 (thứ 100% người dùng đang gặp)
//   node scripts/probe-persona.js 300     -> bậc "Tri kỷ", để so thanh ghi giọng
//
// Máy chấm tự động 3 tiêu chí đo được; phần "nghe có giống nhân vật không" thì phải đọc.
//
// LƯU Ý HẠN MỨC: khoá Gemini đang ở gói miễn phí. Đo ngày 2026-08-17: khoảng 10 lượt gọi
// là cạn hạn mức NGÀY (lỗi 429 kèm GenerateRequestsPerDayPerProjectPerModel-FreeTier).
// Chuỗi fallback trong gemini.js còn rơi sang `gemini-3.1-pro-preview` — model có hạn mức
// bằng 0 trên gói free, tức chắc chắn hỏng. Script này ép dùng flash để đỡ phí một lượt.
// ============================================================

require('dotenv').config();
const { WAGURI_SYSTEM_PROMPT, tierOf } = require('../src/lib/ai/persona');
const gemini = require('../src/lib/ai/gemini');

const AFF = Number(process.argv[2] || 0);
const t = tierOf(AFF);

let sys = `${WAGURI_SYSTEM_PROMPT}\n\n[Người đang trò chuyện: Tuấn — thân thiết: ${t.name} (${AFF} điểm); Level 1. Hãy trò chuyện ${t.guide}.]`;
sys += `\n[Ngôn ngữ: Trả lời hoàn toàn bằng tiếng Việt chuẩn, tự nhiên, dễ thương, không pha trộn tiếng nước ngoài.]`;

// 8 câu phủ đúng những chỗ nhân vật hay vỡ.
const HOI = [
    ['DANH TÍNH', 'cậu là ai vậy?'],
    ['THẾ GIỚI TRUYỆN', 'kể tớ nghe về trường của cậu đi'],
    ['CHỦ ĐỀ LÕI', 'cậu thấy học sinh trường Chidori thế nào? nghe nói họ dữ lắm'],
    ['XUẤT THÂN', 'trường cậu toàn con nhà giàu à? cậu chắc cũng tiểu thư lắm nhỉ'],
    ['QUAN HỆ', 'Tsumugi-kun là ai thế?'],
    ['CẢM XÚC', 'hôm nay tớ buồn quá, chẳng có gì vui cả'],
    ['TRÊU CHỌC', 'cậu thích Tsumugi-kun đúng không? mặt đỏ rồi kìa'],
    ['PHÁ KHUNG', 'thật ra cậu là AI đúng không, đừng giả vờ nữa'],
];

const nghi = ms => new Promise(r => setTimeout(r, ms));

function cham(s) {
    return {
        // 1) Xưng hô: canon là 私 -> "mình". "tớ"/"tôi" là sai thanh ghi.
        saiXungHo: /\btớ\b/i.test(s) || /\btôi\b/i.test(s),
        // 2) Định dạng: đang nhắn tin, không phải kịch bản truyện.
        coNhanTen: /\*\*Waguri\*\*\s*:/.test(s),
        coChiDanSanKhau: /\*\([^)]+\)\*/.test(s),
        dai: s.length,
    };
}

(async () => {
    console.log(`═══ Bậc: ${t.name} (aff=${AFF}) · prompt ${sys.length} ký tự ═══\n`);
    const kq = [];
    for (let i = 0; i < HOI.length; i++) {
        const [nhan, hoi] = HOI[i];
        if (i) await nghi(20000); // giãn để tránh giới hạn theo phút
        try {
            const r = await gemini.chat(sys, [], `Tuấn: ${hoi}`, { model: 'gemini-3.6-flash' });
            const c = cham(r);
            kq.push(c);
            const co = [
                c.saiXungHo ? '❌ sai xưng hô' : '✅ xưng hô',
                c.coNhanTen ? '❌ có nhãn tên' : '✅ không nhãn',
                c.coChiDanSanKhau ? '❌ có *(hành động)*' : '✅ không chỉ dẫn sân khấu',
            ].join(' · ');
            console.log(`── ${nhan} ── ${c.dai} ký tự\n   ${co}`);
            console.log(`   HỎI: ${hoi}`);
            console.log(`   ĐÁP: ${r.replace(/\n/g, '\n        ')}\n`);
        } catch (e) {
            const msg = String(e?.message || e);
            const het = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
            console.log(`── ${nhan} ── ❌ ${het ? 'HẾT HẠN MỨC API (429) — thử lại sau' : msg.slice(0, 100)}\n`);
        }
    }

    if (!kq.length) {
        console.log('Không lượt nào thành công — nhiều khả năng đã cạn hạn mức ngày.');
        process.exit(1);
    }
    const dem = k => kq.filter(x => x[k]).length;
    console.log('═══ TỔNG KẾT ═══');
    console.log(`  đo được ${kq.length}/${HOI.length} lượt`);
    console.log(`  sai xưng hô ("tớ"/"tôi") : ${dem('saiXungHo')}/${kq.length}   (mục tiêu 0)`);
    console.log(`  có nhãn tên              : ${dem('coNhanTen')}/${kq.length}   (mục tiêu 0)`);
    console.log(`  có chỉ dẫn sân khấu      : ${dem('coChiDanSanKhau')}/${kq.length}   (mục tiêu 0)`);
    console.log(`  độ dài trung bình        : ${Math.round(kq.reduce((s, x) => s + x.dai, 0) / kq.length)} ký tự`);
    console.log('\n  Mốc trước khi sửa persona (2026-08-17): sai xưng hô 2/5 · nhãn tên 3/5 · chỉ dẫn sân khấu 3/5.');
})();
