// ============================================================
// data/story_chapters.js — Tuyến Cốt Truyện "Hồi Ký Kikyo"
// Phong cách cốt truyện chương hồi Nghịch Thủy Hàn kết hợp 100% Lore Waguri Kaoruko
// ============================================================

const STORY_CHAPTERS = [
    {
        id: 1,
        title: 'Hồi 1: Con Hẻm Ngát Hương',
        summary: 'Cuộc chạm trán bất đắc dĩ với Waguri Kaoruko bên con hẻm hoa ranh giới giữa hai trường.',
        color: '#F472B6',
        nodes: [
            {
                id: 1,
                title: 'Tiết 1: Tấm Thẻ Học Sinh Mới',
                intro: 'Cậu vừa chuyển tới con phố ranh giới giữa Học viện Nữ sinh Kikyo và trường Chidori. Tình cờ, cậu bắt gặp một cô bạn nữ sinh Kikyo đang lúng túng nấp sau tán cây để tránh đoàn kiểm tra kỷ luật trường.',
                dialogue: '"Suỵt... Cậu ơi, làm ơn đừng nói cho ai biết mình đang trốn ở đây nha... 🥺"',
                choiceA: 'Đứng che chắn giúp cô ấy trốn thoát an toàn.',
                choiceB: 'Tò mò hỏi sao nữ sinh Kikyo danh giá lại lén lút trốn ở đây.',
                waguriReplyA: '"Phù... cảm ơn cậu nhiều lắm! Cậu tốt bụng ghê~ À mà... cậu là học sinh mới chuyển đến khu này sao? Hãy kiểm tra thẻ danh tính của cậu xem nào~"',
                waguriReplyB: '"A... chuyện dài dòng lắm, nhưng mình không phải người xấu đâu nha! Xem này, cậu cũng là học sinh mới đúng không? Xem thẻ học sinh của cậu nhé~"',
                command: '/profile',
                targetType: 'profile',
                reward: { coins: 500, exp: 20, item: null, affection: 5 },
                rewardText: '500 xu + 20 EXP + 5 Hảo cảm 🌸'
            },
            {
                id: 2,
                title: 'Tiết 2: Bữa Sáng Tiếp Tế',
                intro: 'Sau khi biết cậu là người mới đến và chưa có người thân quen, Waguri ngỏ ý muốn chỉ cậu cách nhận trợ cấp sinh hoạt mỗi sáng.',
                dialogue: '"Mỗi sáng thức dậy, cậu nhớ điểm danh để nhận chút lộ phí nha. Làng Kikyo luôn có phần quà nhỏ cho người mới đấy!"',
                command: '/daily',
                targetType: 'daily',
                reward: { coins: 1000, exp: 30, item: 'can_cau', affection: 5 },
                rewardText: '1.000 xu + 1 Cần câu trúc + 5 Hảo cảm 🌸'
            },
            {
                id: 3,
                title: 'Tiết 3: Giọt Mồ Hôi Lương Thiện',
                intro: 'Tiền sinh hoạt phí đắt đỏ khiến cả hai cùng rỗng túi. Waguri rủ cậu cùng kiếm việc làm thêm để tự lập.',
                dialogue: '"Hồi mới vào Kikyo bằng học bổng, mình cũng phải tự kiếm việc làm thêm đấy. Cùng nhau đi làm để kiếm những đồng tiền chân chính nhé cậu!"',
                command: '/work',
                targetType: 'work',
                requiredCount: 3,
                reward: { coins: 1500, exp: 50, item: 'cuoc_sat', affection: 5 },
                rewardText: '1.500 xu + 50 EXP (Lên Cấp 2) + 1 Cuốc sắt + 5 Hảo cảm 🌸'
            },
            {
                id: 4,
                title: 'Tiết 4: Người Giữ Bí Mật (Đại Thắng)',
                intro: 'Cậu đã giúp Waguri giữ kín bí mật về việc cô ấy hay lui tới con phố bình dân Chidori.',
                dialogue: '"Cảm ơn cậu vì đã luôn giữ bí mật giúp mình nhé... Mảnh khăn tay này do mình tự thêu, tặng cậu làm kỷ niệm hành trình đầu tiên của chúng mình nha~"',
                command: '/inventory',
                targetType: 'inventory',
                reward: { coins: 3000, exp: 100, item: 'hop_but', affection: 15 },
                rewardText: 'Kỷ Vật: Hộp Bút Kỷ Niệm (+5% EXP) + 3.000 xu + 15 Hảo cảm 🌸'
            }
        ]
    },
    {
        id: 2,
        title: 'Hồi 2: Bờ Sông Sau Giờ Học',
        summary: 'Thử thách của Hoshina Subaru và hành trình khai thác tài nguyên sơn thủy.',
        color: '#38BDF8',
        nodes: [
            {
                id: 1,
                title: 'Tiết 1: Chiều Buông Cần Câu',
                intro: 'Hoshina Subaru (bạn thân của Waguri) cảnh giác nhìn cậu, yêu cầu cậu chứng minh bản thân biết tự lao động sinh tồn.',
                dialogue: '"Waguri ngây thơ nên dễ tin người, nhưng tôi thì không. Muốn đồng hành cùng cô ấy, hãy chứng minh cậu có thể tự nuôi sống mình bằng cần câu này đi."',
                command: '/fish',
                targetType: 'fish',
                reward: { coins: 800, exp: 40, item: null, affection: 5 },
                rewardText: '800 xu + 40 EXP + 5 Hảo cảm 🌸'
            },
            {
                id: 2,
                title: 'Tiết 2: Tiếng Búa Trong Hang Đá',
                intro: 'Cần tìm thêm quặng sắt và đá để gia cố đồ đạc trong nhà trọ mới.',
                dialogue: '"Hang đá sau đồi Kikyo có rất nhiều khoáng sản. Cậu cẩn thận sườn dốc trơn nhé, mình sẽ đứng ngoài cửa hang đợi cậu~"',
                command: '/mine',
                targetType: 'mine',
                reward: { coins: 1200, exp: 60, item: null, affection: 5 },
                rewardText: '1.200 xu + 60 EXP + 5 Hảo cảm 🌸'
            },
            {
                id: 3,
                title: 'Tiết 3: Gieo Mầm Hy Vọng',
                intro: 'Waguri dắt cậu đến cửa hàng nông nghiệp mua hạt giống đầu tiên để gieo xuống mảnh đất sau trường.',
                dialogue: '"Tự tay gieo một hạt giống và nhìn nó nảy mầm là cảm giác kỳ diệu lắm đó! Chúng mình cùng trồng một luống hoa nhé cậu~"',
                command: '/plant',
                targetType: 'plant',
                reward: { coins: 1500, exp: 80, item: null, affection: 5 },
                rewardText: '1.500 xu + 80 EXP + 5 Hảo cảm 🌸'
            },
            {
                id: 4,
                title: 'Tiết 4: Cuốn Sổ Lưu Niệm (Đại Thắng)',
                intro: 'Subaru gật đầu công nhận sự kiên trì của cậu sau khi thấy cậu cẩn thận ghi chép mọi sản vật vào Sổ Tay.',
                dialogue: '"Cậu... làm tốt hơn tôi nghĩ. Giữ lấy chiếc máy ảnh này đi, ghi lại những khoảnh khắc đẹp bên Waguri nhé."',
                command: '/album',
                targetType: 'album',
                reward: { coins: 4000, exp: 150, item: 'may_anh', affection: 15 },
                rewardText: 'Kỷ Vật: Máy Ảnh Subaru + 4.000 xu + 15 Hảo cảm 🌸'
            }
        ]
    },
    {
        id: 3,
        title: 'Hồi 3: Ánh Lửa Lò Gekka',
        summary: 'Bước ngoặt lớn: Cấp 5, mở tiệm bánh Gekka và giải cứu kho bánh mì ế.',
        color: '#FB923C',
        nodes: [
            {
                id: 1,
                title: 'Tiết 1: Lời Đề Nghị Dưới Mái Hiên',
                intro: 'Tiệm bánh Gekka của gia đình Tsumugi Rintaro đang gặp khó khăn: bánh mì làm ra bị tồn đọng và thiếu nhân lực phụ nướng. Waguri tin tưởng nhờ cậu cùng mở bếp lò phụ khi đạt Cấp 5.',
                dialogue: '"Cậu đã đạt Cấp 5 rồi! Cậu có muốn cùng mình và Tsumugi-kun phụ trách một góc lò nướng tại tiệm Gekka không? Mình tin cậu sẽ làm ra những mẻ bánh tuyệt vời nhất!"',
                command: '/tiembanh mo',
                targetType: 'bakery_open',
                reward: { coins: 2000, exp: 100, item: 'bo_lam_banh', affection: 10 },
                rewardText: 'Bộ Dụng Cụ Làm Bánh + 2.000 xu + 10 Hảo cảm 🌸'
            },
            {
                id: 2,
                title: 'Tiết 2: Tái Sinh Bánh Mì Cũ',
                intro: 'Đem những ổ bánh mì và nông sản tích trữ nạp vào lò bánh để chuẩn bị cho mẻ nướng mới.',
                dialogue: '"Tuyệt vời quá! Thay vì để bánh mì bị khô, chúng mình có thể biến tấu chúng thành nhân bánh nướng bơ đường thơm lừng!"',
                command: '/tiembanh nap',
                targetType: 'bakery_stock',
                reward: { coins: 2500, exp: 120, item: null, affection: 5 },
                rewardText: '2.500 xu + 120 EXP + 5 Hảo cảm 🌸'
            },
            {
                id: 3,
                title: 'Tiết 3: Hương Vị Đầu Mùa',
                intro: 'Canh lửa chuẩn xác và nướng mẻ bánh đầu tiên tại lò nướng Gekka.',
                dialogue: '"Mùi thơm bơ sữa lan tỏa khắp con hẻm rồi kìa! Bánh sắp chín rồi, hồi hộp ghê~"',
                command: '/tiembanh nuong',
                targetType: 'bakery_bake',
                reward: { coins: 3000, exp: 150, item: 'men_no_co_truyen', affection: 10 },
                rewardText: 'Men Nở Cổ Truyền + 3.000 xu + 10 Hảo cảm 🌸'
            },
            {
                id: 4,
                title: 'Tiết 4: Năng Lượng Đong Đầy (Đại Thắng)',
                intro: 'Lấy mẻ bánh nóng hổi ra lò và thưởng thức cùng Waguri để hồi phục toàn bộ thể lực.',
                dialogue: '"Ngon quá đi mất! Ăn một miếng bánh ngọt lúc mệt mỏi là mọi áp lực đều tan biến hết luôn đấy. Cảm ơn cậu vì đã cứu nguy cho tiệm Gekka nhé!"',
                command: '/eat banh_kem_dau',
                targetType: 'eat',
                reward: { coins: 6000, exp: 200, item: 'banh_kem_dau', affection: 20 },
                rewardText: 'Kỷ Vật: Bánh Kem Dâu Thượng Hạng + Hồi +50 Năng Lượng + 6.000 xu + 20 Hảo cảm 🌸'
            }
        ]
    },
    {
        id: 4,
        title: 'Hồi 4: Đèn Khuya Mùa Thi',
        summary: 'Trại ôn thi Pomodoro cùng nhóm bạn Chidori và bé thú cưng đi lạc.',
        color: '#A855F7',
        nodes: [
            {
                id: 1,
                title: 'Tiết 1: 25 Phút Tập Trung',
                intro: 'Kỳ thi học kỳ cận kề. Saku Natsusawa lập trại kèm học đêm cho cả nhóm. Cùng Waguri ngồi vào bàn học tập trung 25 phút.',
                dialogue: '"Để giữ được học bổng ở Kikyo, đêm nào mình cũng phải cố gắng rất nhiều... Nhưng học cùng cậu, mình thấy an tâm và có động lực hơn hẳn đấy!"',
                command: '/study start 25',
                targetType: 'study',
                reward: { coins: 2000, exp: 100, item: null, affection: 10 },
                rewardText: '15 Điểm Tri Thức + 2.000 xu + 10 Hảo cảm 🌸'
            },
            {
                id: 2,
                title: 'Tiết 2: Vị Khách Bốn Chân',
                intro: 'Một chú mèo nhỏ bị lạc đang đói lả nép dưới chân bàn học. Cùng Waguri nhận nuôi và chăm sóc bé.',
                dialogue: '"Ôi, nhìn bé con run rẩy thương chưa kìa... Chúng mình nhận nuôi và đặt tên cho bạn nhỏ này nhé cậu?"',
                command: '/pet status',
                targetType: 'pet',
                reward: { coins: 1500, exp: 80, item: 'bot_ngu_coc_pet', affection: 5 },
                rewardText: 'Ngũ Cốc Thảo Dược Pet + 1.500 xu + 5 Hảo cảm 🌸'
            },
            {
                id: 3,
                title: 'Tiết 3: Bữa Ăn Ấm Áp',
                intro: 'Dùng chiếc bánh ngọt bạn tự nướng ở tiệm Gekka cho bé thú cưng ăn để bé hồi phục thể lực.',
                dialogue: '"Bé thích mê bánh của cậu nướng kìa! Nhìn nó ăn ngon lành thấy hạnh phúc ghê á~"',
                command: '/pet feed',
                targetType: 'pet_feed',
                reward: { coins: 2000, exp: 100, item: 'sach_tam_tri', affection: 10 },
                rewardText: 'Sách Tâm Trí Thú Cưng (+1 Kỹ năng) + 2.000 xu + 10 Hảo cảm 🌸'
            },
            {
                id: 4,
                title: 'Tiết 4: Trà Thơm Tĩnh Tâm (Đại Thắng)',
                intro: 'Ghé thăm Cửa hàng Học viện Kikyo, mua trà Lofi và mở khóa những cuốn sách tri thức quý giá.',
                dialogue: '"Uống ngụm trà này vào là tỉnh táo hẳn để ôn nốt bài thi đấy. Kẹp sách này Saku ép từ hoa sơn trà khô, mình tặng lại cho cậu nha."',
                command: '/study shop',
                targetType: 'study_shop',
                reward: { coins: 5000, exp: 200, item: 'tra_lofi', affection: 15 },
                rewardText: 'Kỷ Vật: Kẹp Sách Hoa Khô Saku + Trà Lofi + 5.000 xu + 15 Hảo cảm 🌸'
            }
        ]
    },
    {
        id: 5,
        title: 'Hồi 5: Nhịp Cầu Nối Hai Trường',
        summary: 'Thương hội phồn hoa, xóa bỏ định kiến và thành tựu đỉnh cao.',
        color: '#10B981',
        nodes: [
            {
                id: 1,
                title: 'Tiết 1: Biến Động Thị Trường',
                intro: 'Học sinh hai trường bắt đầu giao lưu và mua bán nông sản tại khu chợ trung tâm. Cùng Waguri quan sát biểu đồ giá cả.',
                dialogue: '"Giá nông sản trên chợ thay đổi theo từng khung giờ đó cậu ơi. Canh lúc giá xanh cao điểm để bán là sinh lời nhiều nhất đấy!"',
                command: '/market prices',
                targetType: 'market',
                reward: { coins: 1500, exp: 80, item: null, affection: 5 },
                rewardText: '1.500 xu + 80 EXP + 5 Hảo cảm 🌸'
            },
            {
                id: 2,
                title: 'Tiết 2: Chuyến Hàng Lớn',
                intro: 'Bán số nông sản tự tay trồng được vào đúng thời điểm thị trường có giá cao nhất.',
                dialogue: '"Cậu tháo vát thật đấy! Tiền công hôm nay rủng rỉnh rồi nè, chúng mình cùng đi ăn mừng thôi!"',
                command: '/market sell',
                targetType: 'market_sell',
                reward: { coins: 3000, exp: 150, item: null, affection: 5 },
                rewardText: '3.000 xu + 150 EXP + 5 Hảo cảm 🌸'
            },
            {
                id: 3,
                title: 'Tiết 3: Mái Nhà Chung',
                intro: 'Gia nhập hoặc thành lập một Bang hội để cùng bạn bè hai trường chung tay xây dựng Đền Thờ Bang.',
                dialogue: '"Dù là học sinh Kikyo hay Chidori, khi cùng chung một Bang hội thì tất cả chúng ta đều là bạn bè tốt của nhau mà đúng không cậu?"',
                command: '/clan',
                targetType: 'clan',
                reward: { coins: 2500, exp: 120, item: null, affection: 5 },
                rewardText: '100 Điểm Cống Hiến + 2.500 xu + 5 Hảo cảm 🌸'
            },
            {
                id: 4,
                title: 'Tiết 4: Người Kết Nối Kikyo (Tốt Nghiệp)',
                intro: 'Bức tường vô hình ngăn cách hai ngôi trường chính thức bị xóa nhòa. Bạn trở thành biểu tượng của sự chân thành và gắn kết.',
                dialogue: '"Cảm ơn cậu vì đã luôn ở bên cạnh mình suốt quãng thời gian qua... Giờ đây, cậu không chỉ là người bạn thân thiết, mà là tri kỷ đặc biệt nhất trong lòng mình đấy~ 🌸"',
                command: '/profile',
                targetType: 'finish',
                reward: { coins: 15000, exp: 500, item: 'title_dai_hoc_si', affection: 30 },
                rewardText: 'DANH HIỆU TỐT NGHIỆP: [🌸 Người Kết Nối Kikyo] + 15.000 xu + 30 Hảo cảm 🌸'
            }
        ]
    }
];

module.exports = {
    STORY_CHAPTERS
};
