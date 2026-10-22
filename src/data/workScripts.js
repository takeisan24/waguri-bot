// Kịch bản /work theo từng nghề. Placeholder: {amount} = số tiền, {job} = tên nghề.
// 3 nhóm: success (thắng), fail (xui), jackpot (trúng lớn). Thiếu nhóm nào -> dùng default.

module.exports = {
    default: {
        success: [
            '✅ Cậu ghé tiệm Gekka phụ Rintaro nướng bánh dâu tây, được tặng phần lương ngọt ngào **{amount}**! 🍰',
            '✅ Một ngày phụ giúp tiệm Gekka vô cùng vui vẻ và suôn sẻ, cậu nhận được tiền tiêu vặt **{amount}**! 🌸',
        ],
        fail: [
            '⚠️ Cậu lỡ tay làm cháy mẻ bánh bông lan dâu tây ở tiệm Gekka, phải đền bù **{amount}**... 🥺',
            '⚠️ Trục trặc nhỏ khi chuẩn bị nguyên liệu làm bánh kem dâu, cậu bị tổn thất **{amount}**... 😢',
        ],
        jackpot: [
            '🤑 TRÚNG MÁNH LỚN! Khách đặt tiệc bánh ngọt lớn đột xuất tại tiệm Gekka, Rintaro chia hoa hồng cho cậu tận **{amount}**! 🎉🍰',
        ],
    },
    nhat_ve_chai: {
        success: ['✅ Cậu quét dọn sạch sẽ những cánh hoa anh đào rụng quanh khuôn viên học viện Kikyo danh giá, nhận công **{amount}**! 🌸'],
        fail: ['⚠️ Cậu lỡ tay quét bay cả chậu hoa lan quý của phòng hiệu trưởng học viện Kikyo, bị phạt mất **{amount}**... 😰'],
        jackpot: ['🤑 Cậu nhặt được một chiếc ví rơi trên bục giảng Kikyo và trả lại cho chủ nhân. Cậu được bạn ấy hậu tạ **{amount}**! 💖'],
    },
    ban_tra_da: {
        success: ['✅ Waguri và Subaru rủ cậu ra Hồ Tây mở quầy trà đá vỉa hè kiểu Việt. Nhờ nụ cười tươi rói của Waguri, khách kéo đến đông nghịt, thu về **{amount}**! 🍵✨'],
        fail: ['⚠️ Một cơn mưa giông Hồ Tây đổ bộ bất ngờ, Waguri và cậu ôm thùng đá chạy tán loạn, gió thổi bay mất **{amount}**... ☔'],
        jackpot: ['🤑 Cả nhóm bạn Chidori (Saku, Usami, Madoka) rủ nhau ghé uống trà đá và bao trọn cả quán. Cậu trúng đậm **{amount}**! 🎉🍵'],
    },
    phu_ho: {
        success: ['✅ Cậu đánh bột, nhào bột và dọn khay bánh phụ Rintaro cả ngày, nhận tiền công xứng đáng **{amount}**! 🍞'],
        fail: ['⚠️ Cậu lỡ đổ nhầm muối vào kem tươi thay vì đường cát, phải đền nguyên liệu mất **{amount}**... 🧂'],
        jackpot: ['🤑 Cậu nhào tay được mẻ bột hoàn hảo đến mức Rintaro đem ra làm bánh cho khách VIP, thưởng nóng cho cậu **{amount}**! 🎉🍞'],
    },
    shipper: {
        success: ['✅ Cậu giao giỏ bánh kem dâu tây của tiệm Gekka đến đúng giờ cho buổi họp lớp của học sinh Kikyo, nhận tiền công **{amount}**! 🛵'],
        fail: ['⚠️ Gặp trời mưa trơn trượt, cậu ngã làm hỏng chiếc bánh sinh nhật đặt trước của khách, phải tự bỏ tiền đền **{amount}**... 🌧️'],
        jackpot: ['🤑 Cậu giao bánh cho biệt thự nhà Waguri, ba mẹ cô ấy rất hài lòng và thưởng nóng cho cậu **{amount}**! 🎁'],
    },
    sinh_vien: {
        success: ['✅ Cậu tranh thủ làm thêm vài giờ ở tiệm Gekka sau giờ học tại trường Chidori, nhận lương **{amount}**! 🎒'],
        fail: ['⚠️ Học bù quá giờ nên cậu đi làm thêm trễ, bị quản lý tiệm trừ lương **{amount}**... ⏰'],
        jackpot: ['🤑 Vừa trông tiệm vừa ôn bài mà cậu vẫn đứng đầu kỳ thi Kikyo, tiệm Gekka thưởng luôn học bổng **{amount}**! 🎉🎓'],
    },
    xe_om: {
        success: ['✅ Cậu chạy xe Honda Wave chở Waguri vi vu dạo phố cổ Hà Nội ngắm hoa đào, Waguri thích thú trả cậu **{amount}**! 🛵🌸'],
        fail: ['⚠️ Xe bị hỏng bugi giữa đường phố cổ đông đúc, cậu tốn tiền sửa xe và lỡ hẹn, mất **{amount}**... 🛠️'],
        jackpot: ['🤑 Gặp khách du lịch Nhật Bản muốn đi tham quan Hồ Gươm, cậu hướng dẫn tận tình và nhận tip khủng **{amount}**! 💴🎉'],
    },
    nong_dan: {
        success: ['✅ Cậu ra nông trại thu hoạch lúa mì và dâu tây chín mọng để kịp chuyển cho tiệm Gekka, nhận tiền công **{amount}**! 🌾'],
        fail: ['⚠️ Một đàn sâu kéo đến gặm sạch luống dâu vừa ra trái, vụ này cậu lỗ mất **{amount}**... 🐛'],
        jackpot: ['🤑 Vụ dâu tây của cậu được mùa chưa từng có, Rintaro thu mua trọn cả nông trại cho tiệm Gekka với giá **{amount}**! 🎉🍓'],
    },
    tho_sua_xe: {
        success: ['✅ Cậu đứng bếp nướng hàng chục mẻ bánh tart trái cây vàng ươm thơm lừng, Rintaro trả lương **{amount}**! 🥧'],
        fail: ['⚠️ Cậu quên đặt chuông hẹn giờ nướng bánh làm cháy khét cả mẻ bánh crepe thơm ngon, đền bù **{amount}**... 🔥'],
        jackpot: ['🤑 Khay bánh tart trái cây của cậu vừa ra lò đã bán hết trong một buổi sáng, Rintaro chia cho cậu **{amount}**! 🎉🥧'],
    },
    streamer: {
        success: ['✅ Cậu cùng Subaru đi tuần tra và giữ gìn kỷ cương học viện Kikyo nghiêm ngặt, được trưởng ban khen thưởng **{amount}**! 🕵️‍♀️'],
        fail: ['⚠️ Cậu bất cẩn làm mất sổ kỷ luật học sinh Kikyo, bị phạt trừ lương tháng **{amount}**... 📋'],
        jackpot: ['🤑 Phá được vụ án học sinh lẻn trốn ra tiệm Gekka ăn bánh trong giờ học, cậu nhận thưởng nóng **{amount}**! 🏆'],
    },
    moi_gioi: {
        success: ['✅ Cậu sắp xếp lịch trình và quản lý nhân viên tiệm Gekka hoàn hảo, doanh số tăng cao, nhận hoa hồng **{amount}**! 📊'],
        fail: ['⚠️ Sơ suất kiểm kho khiến một số hộp sữa bơ bị hết hạn sử dụng, cậu phải đền **{amount}**... 🥛'],
        jackpot: ['🤑 Chốt thành công hợp đồng cung cấp bánh ngọt tráng miệng cho ngày hội lớn của Kikyo, nhận hoa hồng khổng lồ **{amount}**! 💎🎉'],
    },
    dev: {
        success: ['✅ Cậu khéo tay trang trí một chiếc bánh kem cưới lộng lẫy bằng hoa anh đào tươi, khách rất thích, trả **{amount}**! 🎂🌸'],
        fail: ['⚠️ Lỡ tay làm rơi dâu tây trang trí lên sàn nhà, cậu phải bỏ tiền túi mua dâu mới đền **{amount}**... 🍓'],
        jackpot: ['🤑 Chiếc bánh ngọt trang trí chủ đề hoa anh đào của cậu đoạt giải nhất cuộc thi làm bánh thành phố, nhận thưởng **{amount}**! 🏆🧁'],
    },
    chu_tich: {
        success: ['✅ Cậu điều hành hoạt động của toàn tiệm Gekka vô cùng trơn tru, nhận lương tháng **{amount}**! 💼'],
        fail: ['⚠️ Quyết định nhập loại bột mì mới không hợp khẩu vị khách khiến tiệm sụt giảm doanh số, cậu gánh lỗ **{amount}**... 📉'],
        jackpot: ['🤑 Mở rộng thành công thêm chi nhánh tiệm bánh Gekka sang phố bên cạnh, doanh thu tăng vọt, bỏ túi **{amount}**! 🏢🎉'],
    },
    dai_gia: {
        success: ['✅ Chuỗi tiệm bánh Gekka của cậu làm ăn cực kỳ phát đạt, ung dung nhận lợi nhuận chia sẻ **{amount}**! 🏦'],
        fail: ['⚠️ Giá nguyên liệu sữa và bơ nhập khẩu từ Hokkaido tăng đột biến, chi phí vận hành lỗ **{amount}**... 📈'],
        jackpot: ['🤑 Chuỗi bánh Gekka của cậu được lên truyền hình giới thiệu là tiệm bánh được yêu thích nhất cả nước, lời **{amount}**! 👑✨'],
    },
};
