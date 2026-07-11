// src/lib/commandLocalizer.js
// Định nghĩa bản dịch và hàm địa phương hóa tự động cho các Slash Commands.

const COMMAND_DESCRIPTIONS = {
    // Kinh tế & Nghề
    "work": {
        vi: "Làm việc kiếm tiền (tốn năng lượng) 💼",
        en: "Work to earn money (consumes energy) 💼"
    },
    "fish": {
        vi: "Đi câu cá kiếm tiền 🎣",
        en: "Go fishing to earn money 🎣"
    },
    "mine": {
        vi: "Đi đào mỏ kiếm tiền ⛏️",
        en: "Go mining to earn money ⛏️"
    },
    "chop": {
        vi: "Đi chặt gỗ kiếm tiền 🪓",
        en: "Go chopping wood to earn money 🪓"
    },
    "daily": {
        vi: "Điểm danh nhận thưởng hàng ngày và duy trì chuỗi 🔥",
        en: "Daily check-in to claim rewards and maintain streak 🔥"
    },
    "quest": {
        vi: "Nhiệm vụ hàng ngày 📜",
        en: "Daily quests 📜"
    },
    "achievements": {
        vi: "Thành tựu (mở khóa nhận thưởng) 🏆",
        en: "Achievements (unlock to claim rewards) 🏆"
    },
    "status": {
        vi: "Trạng thái: năng lượng/mệt/buff/Premium 📊",
        en: "Status: energy/fatigue/buff/Premium 📊"
    },
    "profile": {
        vi: "Hồ sơ tổng quan người chơi 🌸",
        en: "Player profile overview 🌸"
    },
    "jobs": {
        vi: "Xem danh sách và xin việc làm 💼",
        en: "View and apply for jobs 💼"
    },
    "pet": {
        vi: "Thú cưng: nhận nuôi, cho ăn, chăm sóc 🐾",
        en: "Pets: adopt, feed, care 🐾"
    },
    "cuutro": {
        vi: "Nhận trợ cấp cứu trợ khi tài khoản cạn sạch tiền 💸",
        en: "Claim bailout grant when completely broke 💸"
    },

    // Cửa hàng & Kho
    "store": {
        vi: "Cửa hàng vật phẩm và giao dịch 🏪",
        en: "Item store and trading 🏪"
    },
    "market": {
        vi: "Chợ mua bán vật phẩm giữa người chơi 🛒",
        en: "Player-to-player trade market 🛒"
    },
    "inventory": {
        vi: "Xem kho đồ hiện tại của cậu 📦",
        en: "View your current inventory 📦"
    },
    "album": {
        vi: "Xem sổ tay sưu tầm vật phẩm và nhận thưởng bộ sưu tập 📖",
        en: "View item collection album and claim rewards 📖"
    },
    "pass": {
        vi: "Xem và nhận thưởng Sổ Sứ Mệnh (Battle Pass) 📖",
        en: "View and claim Battle Pass rewards 📖"
    },
    "eat": {
        vi: "Dùng đồ ăn để hồi năng lượng hoặc nhận buff 🍞",
        en: "Eat food to restore energy or get buffs 🍞"
    },
    "nghingoi": {
        vi: "Đi ngủ hồi đầy năng lượng 😴",
        en: "Go to sleep to fully restore energy 😴"
    },
    "cosmetic": {
        vi: "Trang trí hồ sơ: danh hiệu & màu sắc 🎨",
        en: "Profile cosmetics: titles & colors 🎨"
    },
    "craft": {
        vi: "Chế tạo công cụ và vật phẩm từ gỗ/quặng/đá 🔨",
        en: "Craft tools and items from wood/ore/stone 🔨"
    },
    "repair": {
        vi: "Sửa công cụ khai thác bị hỏng 🔧",
        en: "Repair broken harvesting tools 🔧"
    },
    "hospital": {
        vi: "Nhập viện hồi phục sức khỏe 🏥",
        en: "Go to hospital to recover health 🏥"
    },

    // Giao dịch & Ngân hàng
    "give": {
        vi: "Chuyển tiền cho người chơi khác 💵",
        en: "Transfer money to another player 💵"
    },
    "bank": {
        vi: "Ngân hàng Gekka: gửi/rút tiền 🏦",
        en: "Gekka Bank: deposit/withdraw money 🏦"
    },
    "rob": {
        vi: "Cướp tiền người chơi khác (rủi ro cao!) 🚨",
        en: "Rob another player (high risk!) 🚨"
    },
    "vay": {
        vi: "Hệ thống vay và trả nợ 🤝",
        en: "Borrow and repay loans system 🤝"
    },
    "tangdo": {
        vi: "Tặng vật phẩm trong kho cho người khác 🎁",
        en: "Gift inventory items to another player 🎁"
    },

    // Minigames & Nuôi trồng
    "heo": {
        vi: "Nuôi heo đất 🐷 (mua/chăm/bán/trộm)",
        en: "Raise piggy bank 🐷 (buy/care/sell/steal)"
    },
    "trongcay": {
        vi: "Trồng cây 🌱 (giống/tưới/thu hoạch/trộm)",
        en: "Plant crops 🌱 (seed/water/harvest/steal)"
    },
    "tiembanh": {
        vi: "Tiệm bánh Gekka 🍰 (kinh doanh thụ động)",
        en: "Gekka Bakery 🍰 (passive income business)"
    },
    "coinflip": {
        vi: "Tung đồng xu cược tiền (ngửa/sấp) 🪙",
        en: "Flip a coin to gamble money (heads/tails) 🪙"
    },
    "taixiu": {
        vi: "Tài Xỉu: cược 3 xúc xắc (Tài 11-17, Xỉu 4-10) 🎲",
        en: "Tai Xiu: bet on 3 dice (Over 11-17, Under 4-10) 🎲"
    },
    "baucua": {
        vi: "Bầu Cua Tôm Cá: đặt cửa các linh vật 🦀",
        en: "Bau Cua Tom Ca: Vietnamese mascot betting game 🦀"
    },
    "bacay": {
        vi: "Ba Cây 🃏 — nhiều người, góp cửa bằng nhau, điểm cao ăn cả",
        en: "Three Cards 🃏 — multiplayer, equal bets, highest points take all"
    },
    "blackjack": {
        vi: "Chơi Blackjack (Xì Dách) với nhà cái Waguri 🃏",
        en: "Play Blackjack (Xi Dach) with dealer Waguri 🃏"
    },
    "crate": {
        vi: "Mở rương bí ẩn nhận vật phẩm ngẫu nhiên 🎁",
        en: "Open a mysterious crate to receive random items 🎁"
    },
    "bingo": {
        vi: "Trò chơi Bingo 🎱",
        en: "Bingo game 🎱"
    },
    "loto": {
        vi: "Trò chơi Loto 🎟️",
        en: "Loto game 🎟️"
    },
    "masoi": {
        vi: "Ma Sói 🐺 — trò chơi suy luận nhiều người (4-15 người)",
        en: "Werewolf 🐺 — multiplayer social deduction game (4-15 players)"
    },
    "xocdia": {
        vi: "Xóc Đĩa 🥢 — đặt cửa Chẵn/Lẻ",
        en: "Xoc Dia 🥢 — bet on Even/Odd plate shake"
    },
    "duangua": {
        vi: "Đua ngựa 🐎 — đặt cửa 1 chú ngựa tốc độ",
        en: "Horse Racing 🐎 — bet on a fast horse"
    },
    "dovui": {
        vi: "Đố vui 🧠 — trả lời câu hỏi nhanh để nhận thưởng",
        en: "Trivia Quiz 🧠 — answer fast to win rewards"
    },

    // Vui & Cộng đồng
    "ship": {
        vi: "Đo độ hợp nhau giữa hai người 🚢",
        en: "Measure compatibility between two people 🚢"
    },
    "boi": {
        vi: "Xem bói tình duyên, vận mệnh 🔮",
        en: "Fortune telling: love, career 🔮"
    },
    "amlich": {
        vi: "Tra cứu âm lịch, can chi, giờ hoàng đạo 🌙",
        en: "Look up lunar calendar, zodiacs, auspicious hours 🌙"
    },
    "lixi": {
        vi: "Phát lì xì cho cả kênh 🧧",
        en: "Distribute lucky money to the channel 🧧"
    },
    "couple": {
        vi: "Hệ thống kết hôn, ly hôn, xem trạng thái 💞",
        en: "Marriage system: marry, divorce, check status 💞"
    },
    "action": {
        vi: "Tương tác: ôm, hôn, xoa đầu, chọc, tát... 🌸",
        en: "Interactions: hug, kiss, pat, poke, slap... 🌸"
    },
    "date": {
        vi: "Rủ người thương đi hẹn hò 💑",
        en: "Invite your partner on a date 💑"
    },
    "confession": {
        vi: "Gửi confession ẩn danh lên kênh chỉ định 🤫",
        en: "Send anonymous confessions to a designated channel 🤫"
    },
    "noitu": {
        vi: "Chơi nối từ tiếng Việt 🔤",
        en: "Play Vietnamese word chain game 🔤"
    },

    // Ảnh & Tiện ích
    "image": {
        vi: "Xem ảnh mèo, chó hoặc waifu dễ thương 🖼️",
        en: "View cute images of cats, dogs, or waifus 🖼️"
    },
    "thoitiet": {
        vi: "Xem thời tiết một thành phố 🌦️",
        en: "View weather conditions of a city 🌦️"
    },
    "announcement": {
        vi: "Xem hoặc gửi thông báo cập nhật bot 📢",
        en: "View or send bot update announcements 📢"
    },

    // AI & Premium
    "ask": {
        vi: "Trò chuyện cùng Waguri Kaoruko 💬",
        en: "Chat with Waguri Kaoruko 💬"
    },
    "premium": {
        vi: "Nâng cấp và quản lý gói Premium 💎",
        en: "Upgrade and manage Premium packages 💎"
    },
    "henho": {
        vi: "Hẹn hò và tặng quà cho Waguri để bồi đắp tình cảm 💖",
        en: "Date and gift Waguri to build affection 💖"
    },

    // Cấu hình & Admin
    "config": {
        vi: "Cài đặt & cấu hình các tính năng cho máy chủ ⚙️",
        en: "Configure and manage server settings ⚙️"
    },
    "eco-admin": {
        vi: "Lệnh quản trị kinh tế (chỉ cho Owner bot) ⚙️",
        en: "Economy administration commands (Owner only) ⚙️"
    },
    "getinvite": {
        vi: "Lấy link mời Waguri tham gia máy chủ của cậu 🔗",
        en: "Get invite link for Waguri to join your server 🔗"
    },
    "premium-admin": {
        vi: "Quản trị cấp phát gói Premium (chỉ cho Owner bot) ⚙️",
        en: "Premium administration (Owner only) ⚙️"
    },
    "serverinfo": {
        vi: "Xem thông tin chi tiết về máy chủ hiện tại 📊",
        en: "View detailed information of the current server 📊"
    },
    "setup": {
        vi: "Thiết lập nhanh các kênh hệ thống cho máy chủ ⚙️",
        en: "Quickly setup system channels for the server ⚙️"
    },

    // Tiền ích khác (utility)
    "bot": {
        vi: "Xem thông tin hệ thống và cấu hình bot 🤖",
        en: "View bot system details and configurations 🤖"
    },
    "deletedata": {
        vi: "Xóa toàn bộ dữ liệu chơi game của cậu (tuân thủ GDPR) ❌",
        en: "Delete all your game data (GDPR compliant) ❌"
    },
    "event": {
        vi: "Xem sự kiện nạp tiền/kinh tế đang diễn ra 🎉",
        en: "View active top-up/economy events 🎉"
    },
    "help": {
        vi: "Xem danh sách và hướng dẫn sử dụng các lệnh 📜",
        en: "View bot commands list and help guide 📜"
    },
    "profile-ctx": {
        vi: "Xem nhanh hồ sơ qua context menu",
        en: "Quickly view user profile via context menu"
    },
    "server": {
        vi: "Xem trạng thái kết nối & độ trễ của hệ thống 🛰️",
        en: "View connection status & latency 🛰️"
    },
    "start": {
        vi: "Nhận quà chào mừng và bắt đầu hành trình cùng Waguri 🎁",
        en: "Claim your welcome gift and start your journey 🎁"
    },
    "ticket": {
        vi: "Tạo vé hỗ trợ liên hệ với Ban quản trị 🎫",
        en: "Create support tickets to contact admins 🎫"
    },
    "user": {
        vi: "Xem thông tin chi tiết của một người dùng 👤",
        en: "View detailed information of a user 👤"
    },
    "vote": {
        vi: "Lấy link vote và nhận phần thưởng từ Top.gg 🗳️",
        en: "Get vote link and claim rewards from Top.gg 🗳️"
    }
};

const SUBCOMMAND_DESCRIPTIONS = {
    // config
    "config.confession-channel": { vi: "Đặt kênh đăng confession", en: "Set confession channel" },
    "config.ai": { vi: "Bật/tắt trò chuyện AI khi tag Waguri", en: "Toggle AI chat when tagging Waguri" },
    "config.ai-channel": { vi: "Giới hạn AI chỉ trả lời ở 1 kênh (bỏ trống = mọi kênh)", en: "Limit AI replies to 1 channel (empty = all channels)" },
    "config.pvp": { vi: "Bật/tắt PvP: cướp /rob + trộm heo/cây", en: "Toggle PvP: rob / thievery" },
    "config.police-jail": { vi: "Bật/tắt tạm giam khi gặp công an", en: "Toggle Discord timeout for police check" },
    "config.gambling": { vi: "Bật/tắt trò may rủi (bài cào, tài xỉu, xóc đĩa…)", en: "Toggle gambling minigames" },
    "config.welcome-channel": { vi: "Đặt kênh chào mừng thành viên mới (bỏ trống để tắt)", en: "Set welcome channel (empty to disable)" },
    "config.welcome-role": { vi: "Đặt role tự động gán khi gia nhập (bỏ trống để tắt)", en: "Set auto-join role (empty to disable)" },
    "config.announcement-channel": { vi: "Đặt kênh nhận thông báo cập nhật", en: "Set update announcements channel" },
    "config.language": { vi: "Đặt ngôn ngữ hiển thị cho bot", en: "Set bot display language" },
    "config.view": { vi: "Xem cấu hình hiện tại của máy chủ", en: "View current server configuration" },

    // boi
    "boi.hangngay": { vi: "Vận mệnh hôm nay của cậu", en: "Your fortune for today" },
    "boi.cunghoangdao": { vi: "Tử vi theo cung hoàng đạo", en: "Horoscope by zodiac sign" },
    "boi.thaydo": { vi: "Thầy đồ phán một quẻ (mỗi lần một khác)", en: "Get a random prophecy from the teacher" },

    // couple
    "couple.status": { vi: "Xem trạng thái tình cảm hiện tại", en: "View current marriage status" },
    "couple.marry": { vi: "Cầu hôn người cậu yêu", en: "Propose to your beloved" },
    "couple.divorce": { vi: "Ly hôn", en: "Divorce your partner" },

    // action
    "action.hug": { vi: "Ôm một ai đó", en: "Hug someone" },
    "action.kiss": { vi: "Hôn một ai đó", en: "Kiss someone" },
    "action.pat": { vi: "Xoa đầu một ai đó", en: "Pat someone on the head" },
    "action.poke": { vi: "Chọc ghẹo một ai đó", en: "Poke someone" },
    "action.slap": { vi: "Tát một ai đó", en: "Slap someone" },

    // image
    "image.cat": { vi: "Xem ảnh mèo dễ thương", en: "View cute cat pictures" },
    "image.dog": { vi: "Xem ảnh chó dễ thương", en: "View cute dog pictures" },
    "image.waifu": { vi: "Xem ảnh anime waifu dễ thương", en: "View cute anime waifu pictures" },

    // store
    "store.list": { vi: "Xem cửa hàng vật phẩm", en: "View item store" },
    "store.buy": { vi: "Mua vật phẩm từ cửa hàng", en: "Buy items from the store" },
    "store.sell": { vi: "Bán vật phẩm trong kho đồ", en: "Sell items from your inventory" },

    // pass
    "pass.view": { vi: "Xem tiến trình Sổ Sứ Mệnh hiện tại", en: "View current Battle Pass progress" },
    "pass.buy": { vi: "Mua Sổ Sứ Mệnh Premium", en: "Buy Premium Battle Pass" },

    // tiembanh
    "tiembanh.view": { vi: "Xem tình trạng tiệm bánh của cậu", en: "View Gekka Bakery status" },
    "tiembanh.open": { vi: "Mở tiệm bánh mới", en: "Open a new Gekka Bakery" },
    "tiembanh.bake": { vi: "Thu hoạch tiền bánh nướng", en: "Collect baked cake revenues" },
    "tiembanh.stock": { vi: "Nhập thêm nguyên liệu làm bánh", en: "Fill cake ingredients stock" },
    "tiembanh.upgrade": { vi: "Nâng cấp tiệm bánh", en: "Upgrade Gekka Bakery level" },
    "tiembanh.hired": { vi: "Thuê nhân viên mới", en: "Hire a new staff member" },
    "tiembanh.fired": { vi: "Sa thải nhân viên", en: "Fire a staff member" },

    // heo
    "heo.info": { vi: "Xem tình trạng heo của cậu", en: "View your piggy bank status" },
    "heo.mua": { vi: "Mua một chú heo con", en: "Buy a new baby pig" },
    "heo.an": { vi: "Cho heo ăn", en: "Feed your pig" },
    "heo.tam": { vi: "Tắm cho heo", en: "Bathe your pig" },
    "heo.ngu": { vi: "Cho heo ngủ", en: "Put your pig to sleep" },
    "heo.ban": { vi: "Chế biến & bán heo trưởng thành", en: "Process & sell adult pig" },
    "heo.chuabenh": { vi: "Chữa bệnh cho heo", en: "Heal your sick pig" },
    "heo.trom": { vi: "Trộm heo trưởng thành của người khác", en: "Steal adult pig from another player" },
    "heo.box": { vi: "Mở Pigbox may mắn", en: "Open a lucky Pigbox" },

    // trongcay
    "trongcay.info": { vi: "Xem tình trạng cây của cậu", en: "View your crop status" },
    "trongcay.muagiong": { vi: "Mua giống & trồng cây", en: "Buy seed & plant crop" },
    "trongcay.tuoi": { vi: "Tưới nước cho cây", en: "Water crop" },
    "trongcay.bonphan": { vi: "Bón phân cho cây nhanh lớn", en: "Fertilize crop to grow instantly" },
    "trongcay.thuhoach": { vi: "Thu hoạch cây trưởng thành", en: "Harvest crop products" },
    "trongcay.hoisinh": { vi: "Hồi sinh cây đã chết", en: "Revive dead crop" },
    "trongcay.phacay": { vi: "Phá cây hiện tại để trồng cây mới", en: "Destroy current crop to replant" },
    "trongcay.trom": { vi: "Trộm cây trưởng thành của người khác", en: "Steal crop from another player" },
    "trongcay.box": { vi: "Mở Plantbox may mắn", en: "Open a lucky Plantbox" },

    // loto
    "loto.open": { vi: "Mở phòng chơi Loto", en: "Open a Loto lobby" },
    "loto.join": { vi: "Mua vé Loto với 5 số", en: "Buy Loto ticket with 5 numbers" },
    "loto.list": { vi: "Xem danh sách vé đã mua", en: "View list of bought Loto tickets" },
    "loto.start": { vi: "Bắt đầu game Loto", en: "Start Loto game" },
    "loto.end": { vi: "Kết thúc/hủy phòng game Loto", en: "Cancel Loto lobby" },

    // bingo
    "bingo.open": { vi: "Mở phòng chơi Bingo", en: "Open a Bingo lobby" },
    "bingo.buy": { vi: "Mua vé Bingo", en: "Buy a Bingo ticket" },
    "bingo.check": { vi: "Kiểm tra vé Bingo của cậu", en: "Check your Bingo ticket" },
    "bingo.start": { vi: "Bắt đầu game Bingo", en: "Start Bingo game" },
    "bingo.end": { vi: "Kết thúc/hủy phòng game Bingo", en: "Cancel Bingo lobby" },

    // vay
    "vay.muon": { vi: "Vay tiền từ ngân hàng", en: "Borrow money from bank" },
    "vay.tra": { vi: "Trả nợ ngân hàng", en: "Repay bank loan" },
    "vay.doi": { vi: "Thay đổi kỳ hạn", en: "Change loan terms" },
    "vay.so": { vi: "Xem sổ nợ hiện tại", en: "View current debt log" },

    // announcements
    "announcement.view": { vi: "Xem thông báo mới nhất", en: "View latest announcements" },
    "announcement.send": { vi: "Gửi thông báo mới", en: "Send a new announcement" }
};

const OPTION_DESCRIPTIONS = {
    "bet": { vi: "Số tiền cược (vd 1000, 1k, all)", en: "Bet amount (e.g. 1000, 1k, all)" },
    "side": { vi: "Chọn mặt hoặc cửa đặt", en: "Choose side or bet option" },
    "choice": { vi: "Lựa chọn của cậu", en: "Your choice" },
    "user": { vi: "Mục tiêu tương tác", en: "Target user for interaction" },
    "target": { vi: "Người chơi muốn xem/tương tác", en: "Target player to view/interact" },
    "amount": { vi: "Số tiền giao dịch/lì xì", en: "Amount of money" },
    "quantity": { vi: "Số lượng vật phẩm/lì xì", en: "Quantity of items" },
    "item": { vi: "Vật phẩm tương tác", en: "Target item" },
    "name": { vi: "Tên cần nhập", en: "Name to input" },
    "thanh_pho": { vi: "Tên thành phố (vd: Hanoi, Tokyo)", en: "City name (e.g. Hanoi, Tokyo)" },
    "cung": { vi: "Cung hoàng đạo của cậu", en: "Your zodiac sign" },
    "enabled": { vi: "Trạng thái kích hoạt (Bật/Tắt)", en: "Enabled state (True/False)" },
    "role": { vi: "Role gán tự động", en: "Auto-assigned role" },
    "lang": { vi: "Ngôn ngữ hiển thị (vi/en)", en: "Display language (vi/en)" },
    "user1": { vi: "Người thứ nhất", en: "First user" },
    "user2": { vi: "Người thứ hai (bỏ trống = chính cậu)", en: "Second user (empty = yourself)" },
    "type": { vi: "Loại hành động", en: "Type of action" },
    "category": { vi: "Danh mục ảnh", en: "Image category" },
    "message": { vi: "Nội dung tin nhắn/confession", en: "Message/confession content" },
    "channel": { vi: "Kênh văn bản chỉ định", en: "Designated text channel" },
    "hex": { vi: "Mã màu Hex (vd: F1C40F)", en: "Hex color code (e.g. F1C40F)" },
    "text": { vi: "Nội dung văn bản/danh hiệu", en: "Text content/title" }
};

const CHOICE_LOCALIZATIONS = {
    // boi
    "bach_duong": { vi: "♈ Bạch Dương", en: "♈ Aries" },
    "kim_nguu": { vi: "♉ Kim Ngưu", en: "♉ Taurus" },
    "song_tu": { vi: "♊ Song Tử", en: "♊ Gemini" },
    "cu_giai": { vi: "♋ Cự Giải", en: "♋ Cancer" },
    "su_tu": { vi: "♌ Sư Tử", en: "♌ Leo" },
    "xu_nu": { vi: "♍ Xử Nữ", en: "♍ Virgo" },
    "thien_binh": { vi: "♎ Thiên Bình", en: "♎ Libra" },
    "bo_cap": { vi: "♏ Bọ Cạp", en: "♏ Scorpio" },
    "nhan_ma": { vi: "♐ Nhân Mã", en: "♐ Sagittarius" },
    "ma_ket": { vi: "♑ Ma Kết", en: "♑ Capricorn" },
    "bao_binh": { vi: "♒ Bảo Bình", en: "♒ Aquarius" },
    "song_ngu": { vi: "♓ Song Ngư", en: "♓ Pisces" },
    // action
    "hug": { vi: "Ôm", en: "Hug" },
    "kiss": { vi: "Ôm hôn", en: "Kiss" },
    "pat": { vi: "Xoa đầu", en: "Pat head" },
    "poke": { vi: "Chọc", en: "Poke" },
    "slap": { vi: "Tát yêu", en: "Playful Slap" },
    // image
    "cat": { vi: "Mèo 🐱", en: "Cat 🐱" },
    "dog": { vi: "Cún 🐶", en: "Dog 🐶" },
    "waifu": { vi: "Waifu anime 🌸", en: "Waifu anime 🌸" },
    // config lang
    "vi": { vi: "Tiếng Việt 🇻🇳", en: "Vietnamese 🇻🇳" },
    "en": { vi: "Tiếng Anh 🇬🇧", en: "English 🇬🇧" }
};

/**
 * Tự động địa phương hóa đối tượng Command JSON.
 * @param {object} cmd Command JSON payload (kết quả của command.data.toJSON())
 * @returns {object} Command JSON đã được tiêm name_localizations và description_localizations.
 */
function localizeCommandJSON(cmd) {
    if (!cmd) return cmd;

    // 1. Dịch Command chính
    const cmdDesc = COMMAND_DESCRIPTIONS[cmd.name];
    if (cmdDesc) {
        cmd.description = cmdDesc.vi;
        cmd.description_localizations = {
            "vi": cmdDesc.vi,
            "en-US": cmdDesc.en,
            "en-GB": cmdDesc.en
        };
    } else {
        cmd.description_localizations = {
            "vi": cmd.description
        };
    }
    cmd.name_localizations = {
        "vi": cmd.name,
        "en-US": cmd.name,
        "en-GB": cmd.name
    };

    // 2. Dịch đệ quy các Subcommands và Options
    if (Array.isArray(cmd.options)) {
        for (const opt of cmd.options) {
            localizeOption(cmd.name, opt);
        }
    }

    return cmd;
}

function localizeOption(parentName, opt) {
    if (!opt) return;

    // A. Nếu là Subcommand hoặc SubcommandGroup (type 1 hoặc 2)
    if (opt.type === 1 || opt.type === 2) {
        const fullSubName = `${parentName}.${opt.name}`;
        const subDesc = SUBCOMMAND_DESCRIPTIONS[fullSubName];
        if (subDesc) {
            opt.description = subDesc.vi;
            opt.description_localizations = {
                "vi": subDesc.vi,
                "en-US": subDesc.en,
                "en-GB": subDesc.en
            };
        } else {
            opt.description_localizations = {
                "vi": opt.description
            };
        }
        opt.name_localizations = {
            "vi": opt.name,
            "en-US": opt.name,
            "en-GB": opt.name
        };

        // Đệ quy tiếp vào các option của subcommand
        if (Array.isArray(opt.options)) {
            for (const subOpt of opt.options) {
                localizeOption(fullSubName, subOpt);
            }
        }
    } 
    // B. Nếu là Regular Option (type 3-11)
    else {
        const optDesc = OPTION_DESCRIPTIONS[opt.name];
        if (optDesc) {
            opt.description = optDesc.vi;
            opt.description_localizations = {
                "vi": optDesc.vi,
                "en-US": optDesc.en,
                "en-GB": optDesc.en
            };
        } else {
            opt.description_localizations = {
                "vi": opt.description
            };
        }
        opt.name_localizations = {
            "vi": opt.name,
            "en-US": opt.name,
            "en-GB": opt.name
        };

        // Địa phương hóa choices nếu có
        if (Array.isArray(opt.choices)) {
            for (const choice of opt.choices) {
                const choiceLoc = CHOICE_LOCALIZATIONS[choice.value];
                if (choiceLoc) {
                    choice.name = choiceLoc.vi;
                    choice.name_localizations = {
                        "vi": choiceLoc.vi,
                        "en-US": choiceLoc.en,
                        "en-GB": choiceLoc.en
                    };
                }
            }
        }
    }
}

module.exports = { localizeCommandJSON };
