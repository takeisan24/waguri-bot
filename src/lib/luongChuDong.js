const db = require('../database.js');
const config = require('../config');

// ============================================================
// lib/luongChuDong.js — MỘT cửa ghi lương dương của /work và /fish /mine /chop.
//
// Vì sao gom ở đây: hai lệnh cần CÙNG một bộ luật (chế độ off/log/enforce, nhánh lỗi
// rollback/khong_ro, dòng log, câu nói với người chơi). Hai bản chép tay sẽ lệch nhau.
//
// Mọi con số tính tiền thật (bảng mốc dải, sàn) nằm ở SQL (nhan_thu_nhap_chu_dong). Ở đây KHÔNG tính
// dải; chỉ chọn nhánh theo kết quả RPC và trả ĐÚNG số đã ghi (INV-3) để chỗ gọi in lên embed.
// Không gọi supabase.rpc trực tiếp (luật 1) — chỉ qua db.nhanThuNhapChuDong / db.addMoney.
// Gọi qua `db.xxx` (không destructure) để test thay được bằng bản giả.
// ============================================================

/**
 * @param {string} userId
 * @param {number} gross   lương dương sau mọi hệ số (> 0). gross <= 0 -> không làm gì.
 * @param {'work'|'gather'} source
 * @returns {Promise<{daGhi:boolean, soGhi:number, che:string, giam:boolean, sanDay:boolean, loai:string|null}>}
 *   daGhi : lương đã XÁC NHẬN vào ví (false -> chỗ gọi phải dùng chuỗi luong_chua_xac_nhan).
 *   soGhi : số xu THỰC vào ví (0 nếu chưa xác nhận). Chỗ gọi in con số này, không in gross.
 *   giam  : chỉ true ở 'enforce' khi RPC trả net < gross -> thêm một dòng Waguri.
 *   sanDay: (chỉ để chọn CÂU) tổng ngày đã vượt BAND_COPY_FLOOR_FROM.
 *   loai  : null | 'rollback' | 'khong_ro' — nhánh lỗi đã đi (để test/log).
 */
async function ghiLuongChuDong(userId, gross, source) {
    const che = db.layBandMode();
    const kq = { daGhi: false, soGhi: 0, che, giam: false, sanDay: false, loai: null };
    if (!(gross > 0)) return kq;

    if (che === 'off') {
        // Trạng thái trước spec: addMoney nguyên số, nhãn nguồn giữ 'work'/'gather'.
        const ok = (await db.addMoney(userId, gross, 'wallet', source)) === true;
        if (!ok) console.error(`[PAYOUT FAIL] ${source} user=${userId} payout=${gross}`);
        kq.daGhi = ok; kq.soGhi = ok ? gross : 0;
        return kq;
    }

    const r = await db.nhanThuNhapChuDong(userId, gross, source);
    if (r && r.ok) {
        kq.daGhi = true;
        kq.soGhi = r.net;
        if (che === 'log' && r.netTinh < gross) {
            const dong = `[BAND LOG] user=${userId} src=${source} gross=${gross} net_tinh=${r.netTinh} tong_sau=${r.tongSau}`;
            console.log(dong);
            // Console Wispbyte không được lưu -> gom lại, gửi về kênh log mỗi 30 phút.
            require('./nhatKyVongDoi').ghiBandLog(dong, userId);
        }
        if (che === 'enforce' && r.net < gross) {
            kq.giam = true;
            kq.sanDay = r.tongSau > config.WORK.BAND_COPY_FLOOR_FROM;
        }
        return kq;
    }

    // RPC lỗi. KHÔNG bao giờ gọi lại RPC (khong_ro có thể đã commit -> gọi lại = trả 2 lần).
    const loai = (r && r.loai) || 'khong_ro';
    kq.loai = loai;
    console.warn(`[BAND FAIL] ${loai} user=${userId} src=${source} gross=${gross} ma=${(r && r.ma) || '?'}`);
    const tran = config.WORK.BAND_ERR_CAP;
    // rollback + log = hành vi hôm nay (chế độ log không được làm người chơi thiệt).
    // Mọi trường hợp còn lại (rollback+enforce, khong_ro ở CẢ HAI chế độ): tối đa tran, <= gross.
    const can = (loai === 'rollback' && che === 'log') ? gross : Math.min(gross, tran);
    const ok = (await db.addMoney(userId, can, 'wallet', source)) === true;
    if (!ok) {
        console.error(`[PAYOUT FAIL] ${source} user=${userId} payout=${can}`);
        return kq;       // daGhi=false, soGhi=0
    }
    kq.daGhi = true; kq.soGhi = can;
    return kq;
}

module.exports = { ghiLuongChuDong };
