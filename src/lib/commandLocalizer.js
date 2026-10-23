// src/lib/commandLocalizer.js
// Định nghĩa bản dịch và hàm địa phương hóa tự động cho các Slash Commands.

const COMMAND_DESCRIPTIONS = {
    "redeem": { vi: "Đổi mã quà", en: "Redeem a gift code" },
    "antinuke": {
        vi: "🛡️ Chống nuke: chặn xoá kênh/role & ban hàng loạt, tự phong quyền",
        en: "🛡️ Anti-nuke: stop mass channel/role deletion, ban waves, self-granted perms"
    },
    "leaderboard": {
        vi: "Bảng xếp hạng 🏆",
        en: "Leaderboard 🏆"
    },
    "claim-support": {
        vi: "Nhận phần quà 10.000 xu độc quyền khi gia nhập Server Support 🎁",
        en: "Claim an exclusive 10,000-coin gift for joining the Support Server 🎁"
    },
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

    // Cửa hàng & Kho
    "store": {
        vi: "Cửa hàng vật phẩm và giao dịch 🏪",
        en: "Item store and trading 🏪"
    },
    "market": {
        vi: "Thị trường & Chợ Nông Thủy Sản Biến Động Waguri 📈",
        en: "Waguri Commodity Market & Price Fluctuations 📈"
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
    "cosmetic": {
        vi: "Trang trí hồ sơ: danh hiệu & màu sắc 🎨",
        en: "Profile cosmetics: titles & colors 🎨"
    },
    "craft": {
        vi: "Chế tạo công cụ và vật phẩm từ gỗ/quặng/đá 🔨",
        en: "Craft tools and items from wood/ore/stone 🔨"
    },
    "repair": {
        vi: "Sửa công cụ khai thác bị hỏng 🔧 (chi phí 15% giá mua)",
        en: "Repair broken harvesting tools 🔧 (costs 15% of shop price)"
    },
    "hospital": {
        vi: "Nhập viện hồi phục sức khỏe 🏥 (viện phí cố định 3.000 xu, trừ ví trước rồi tới ngân hàng)",
        en: "Hospital treatment 🏥 (flat 3,000 coin fee, taken from wallet first then bank)"
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

    // Minigames & Nuôi trồng
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
    "blackjack": {
        vi: "Chơi Blackjack (Xì Dách) với nhà cái Waguri 🃏",
        en: "Play Blackjack (Xi Dach) with dealer Waguri 🃏"
    },
    "crate": {
        vi: "Mở rương bí ẩn nhận vật phẩm ngẫu nhiên 🎁",
        en: "Open a mysterious crate to receive random items 🎁"
    },
    "loto": {
        vi: "Trò chơi Loto 🎟️",
        en: "Loto game 🎟️"
    },
    "masoi": {
        vi: "Ma Sói 🐺 — trò chơi suy luận nhiều người (4-15 người)",
        en: "Werewolf 🐺 — multiplayer social deduction game (4-15 players)"
    },

    // Vui & Cộng đồng
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
    "confession": {
        vi: "Gửi confession ẩn danh lên kênh chỉ định 🤫",
        en: "Send anonymous confessions to a designated channel 🤫"
    },

    // Ảnh & Tiện ích
    "image": {
        vi: "Xem ảnh mèo, chó hoặc waifu dễ thương 🖼️",
        en: "View cute images of cats, dogs, or waifus 🖼️"
    },
    "announcement": {
        vi: "Xem hoặc gửi thông báo cập nhật bot 📢",
        en: "View or send bot update announcements 📢"
    },
    "study": {
        vi: "Phòng học bài Pomodoro 24/7 & Lofi Study Room 📚",
        en: "24/7 Pomodoro & Lofi Study Room 📚"
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
    "prestige": {
        vi: "Chuyển sinh — Khởi đầu mới với đặc quyền tối thượng 🌟",
        en: "Prestige — A new beginning with ultimate perks 🌟"
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
        vi: "Bot tạo link mời một server rồi DM cho owner 🔗 (chỉ cho Owner bot)",
        en: "Bot creates a server invite and DMs it to the owner 🔗 (bot Owner only)"
    },
    "premium-admin": {
        vi: "Quản trị cấp phát gói Premium (chỉ cho Owner bot) ⚙️",
        en: "Premium administration (Owner only) ⚙️"
    },
    "serverinfo": {
        // SỬA 21-08-2026: hai chuỗi cũ ("Xem thông tin chi tiết về máy chủ") mô tả SAI việc
        // lệnh làm. Nó xuất báo cáo cấu trúc để rà soát VÀ đòi quyền Quản lý Server — người
        // thường đọc bảng gợi ý rồi gõ vào sẽ bị từ chối mà không hiểu vì sao.
        vi: "Xuất báo cáo cấu trúc server để rà soát 📊 (cần quyền Quản lý Server)",
        en: "Export a server structure report for auditing 📊 (needs Manage Server)"
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
        vi: "Xóa toàn bộ dữ liệu chơi game của cậu — KHÔNG HOÀN TÁC được (tuân thủ GDPR) ❌",
        en: "Delete all your game data — CANNOT BE UNDONE (GDPR compliant) ❌"
    },
    "event": {
        vi: "Xem sự kiện nhân thu nhập/EXP đang diễn ra 🎉 (bật/tắt chỉ cho Owner bot)",
        en: "View active income/EXP multiplier events 🎉 (toggling is bot Owner only)"
    },
    "help": {
        vi: "Xem danh sách và hướng dẫn sử dụng các lệnh 📜",
        en: "View bot commands list and help guide 📜"
    },
    "server": {
        vi: "Xem trạng thái kết nối & độ trễ của hệ thống 🛰️",
        en: "View connection status & latency 🛰️"
    },
    "start": {
        vi: "Nhận quà chào mừng và bắt đầu hành trình cùng Waguri 🎁 (quà cần tài khoản ≥ 7 ngày tuổi)",
        en: "Claim your welcome gift and start your journey 🎁 (gift needs an account 7+ days old)"
    },
    "ticket": {
        vi: "Hệ thống hỗ trợ riêng tư với Staff Waguri 🌸",
        en: "Private support ticket system with Waguri Staff 🌸"
    },
    "user": {
        vi: "Xem thông tin chi tiết của một người dùng 👤",
        en: "View detailed information of a user 👤"
    },
    "vote": {
        vi: "Lấy link vote và nhận phần thưởng từ Top.gg 🗳️",
        en: "Get vote link and claim rewards from Top.gg 🗳️"
    },
    "bakery": {
        vi: "Tiệm bánh Gekka 🍰 (kinh doanh bánh ngọt)",
        en: "Gekka Bakery 🍰 (pastry & bakery business)"
    },
    "dating": {
        vi: "Hẹn hò và dắt Waguri đi chơi để bồi đắp tình cảm 💖",
        en: "Go on a date with Waguri to increase affection 💖"
    },
    "farm": {
        vi: "Vườn nông sản Gekka 🌱 (trồng lúa mì, dâu tây làm bánh)",
        en: "Gekka Farm 🌱 (grow wheat, strawberries for baking)"
    },
    "gift": {
        vi: "Tặng vật phẩm trong kho cho người khác 🎁",
        en: "Gift inventory items to another player 🎁"
    },
    "loan": {
        vi: "Quỹ Tín Dụng Học Đường Kikyo 🤝 (vay vốn hệ thống)",
        en: "Kikyo Student Credit Fund 🤝 (system loan facility)"
    },
    "relief": {
        vi: "Nhận trợ cấp cứu trợ khi tài khoản cạn sạch tiền 💸",
        en: "Claim bailout grant when completely broke 💸"
    },
    "rest": {
        vi: "Đi ngủ hồi đầy năng lượng 😴",
        en: "Go to sleep to fully restore energy 😴"
    },
    "fortune": {
        vi: "Xem bói tình duyên, vận mệnh 🔮",
        en: "Fortune telling: love, career 🔮"
    },
    "lunar": {
        vi: "Tra cứu âm lịch, can chi, giờ hoàng đạo 🌙",
        en: "Look up lunar calendar, zodiacs, auspicious hours 🌙"
    },
    "trivia": {
        vi: "Đố vui 🧠 — trả lời câu hỏi nhanh để nhận thưởng",
        en: "Trivia Quiz 🧠 — answer fast to win rewards"
    },
    "wordchain": {
        vi: "Chơi nối từ tiếng Việt 🔤",
        en: "Play Vietnamese word chain game 🔤"
    },
    "weather": {
        vi: "Xem thời tiết một thành phố 🌦️",
        en: "View weather conditions of a city 🌦️"
    },
    "language": {
        vi: "Chọn ngôn ngữ Waguri nói với riêng cậu 🌐",
        en: "Choose the language Waguri uses with you 🌐"
    }
};

const SUBCOMMAND_DESCRIPTIONS = {
    // bakery
    "bakery.view": { vi: "Xem tình trạng tiệm bánh của cậu", en: "Check your bakery's status" },
    "bakery.open": { vi: "Mở tiệm bánh Gekka (Cấp 3 + 3.000 xu + Bộ Dụng Cụ Làm Bánh)", en: "Open a Gekka bakery (Lv.3 + 3,000 coins + a Baking Tool Set)" },
    "bakery.stock": { vi: "Nhập nguyên liệu (lúa mì, dâu tây, bột) vào tiệm", en: "Stock ingredients (wheat, strawberries, flour) into the shop" },
    "bakery.collect": { vi: "Thu doanh thu tiệm về ví (có thể ra bánh!)", en: "Collect the shop's revenue to your wallet (may yield cakes!)" },
    "bakery.hire": { vi: "Thuê nhân viên NPC phụ tiệm", en: "Hire an NPC staff member to help at the shop" },
    "bakery.fire": { vi: "Sa thải nhân viên NPC", en: "Fire an NPC staff member" },
    "bakery.decor": { vi: "Trang trí tiệm bánh bằng nội thất gỗ / trang sức", en: "Decorate the bakery with wooden furniture / jewelry" },
    "bakery.upgrade": { vi: "Nâng cấp tiệm (tăng tốc nướng & trần doanh thu)", en: "Upgrade the shop (faster baking & higher revenue cap)" },
    "bakery.orders": { vi: "Xem danh sách đơn hàng VIP đặc biệt hôm nay 📋", en: "View special VIP catering orders today 📋" },
    "bakery.deliver": { vi: "Giao đơn hàng VIP nhận Xu, EXP, Danh Tiếng 🎁", en: "Deliver a VIP order to earn Coins, EXP, Reputation 🎁" },

    // dating
    "dating.view": { vi: "Xem trạng thái tình cảm của cậu với Waguri", en: "View your affection status with Waguri" },
    "dating.outing": { vi: "Dắt Waguri đi dạo ngắm cảnh Kikyo (Tốn 20 năng lượng)", en: "Take Waguri for a stroll around Kikyo (costs 20 energy)" },
    "dating.gift": { vi: "Tặng quà trong túi đồ để tăng độ thiện cảm", en: "Give gifts from your bag to increase affection" },

    // farm
    "farm.info": { vi: "Xem tình trạng cây nông sản của cậu", en: "View your crop status" },
    "farm.plant": { vi: "Mua giống & gieo hạt nông sản (500 xu)", en: "Buy seed & plant crop (500 coins)" },
    "farm.water": { vi: "Tưới nước cho cây", en: "Water crop" },
    "farm.fertilize": { vi: "Bón phân cho cây nhanh lớn (200 xu, miễn phí nếu có sẵn phân)", en: "Fertilize crop to grow instantly (200 coins, free if you own fertilizer)" },
    "farm.harvest": { vi: "Thu hoạch nông sản làm bánh", en: "Harvest crop products for baking" },
    "farm.revive": { vi: "Hồi sinh cây đã héo (1.000 xu)", en: "Revive withered crop (1,000 coins)" },
    "farm.clear": { vi: "Phá cây hiện tại để trồng cây mới", en: "Destroy current crop to replant" },
    "farm.steal": { vi: "Trộm cây trưởng thành của người khác", en: "Steal crop from another player" },
    "farm.box": { vi: "Mở Plantbox may mắn (600 xu)", en: "Open a lucky Plantbox (600 coins)" },

    // loan
    "loan.borrow": { vi: "Vay vốn từ Quỹ Tín Dụng Học Đường Kikyo (hạn mức theo Cấp)", en: "Borrow coins from Kikyo Student Credit Fund (limit based on Level)" },
    "loan.pay": { vi: "Thanh toán trả nợ trước hạn", en: "Repay loan early" },
    "loan.status": { vi: "Xem thông tin hợp đồng vay và dư nợ hiện tại", en: "View current loan contract and outstanding balance" },

    // fortune
    "fortune.daily": { vi: "Vận mệnh hôm nay của cậu", en: "Your fortune today" },
    "fortune.zodiac": { vi: "Tử vi theo cung hoàng đạo", en: "Horoscope by zodiac sign" },
    "fortune.oracle": { vi: "Thầy đồ phán một quẻ (mỗi lần một khác)", en: "A fun fortune telling reading" },

    // wordchain
    "wordchain.start": { vi: "Bắt đầu ván nối từ ở kênh này", en: "Start a word chain game in this channel" },
    "wordchain.stop": { vi: "Kết thúc ván nối từ", en: "End the word chain game" },
    "wordchain.status": { vi: "Xem từ hiện cần nối", en: "Check the current word to match" },

    // ticket
    "ticket.create": { vi: "Mở biểu mẫu gửi góp ý hoặc hỗ trợ 🌸", en: "Submit a feedback or support ticket 🌸" },
    "ticket.panel": { vi: "Gửi bảng điều khiển Ticket cố định vào kênh (Dành cho Admin)", en: "Send persistent Ticket Panel to channel (Admin only)" },
    "ticket.close": { vi: "Đóng ticket hỗ trợ hiện tại", en: "Close the current support ticket" },
    "eco-admin.code-create": { vi: "🎁 Tạo mã quà", en: "🎁 Create a gift code" },
    "eco-admin.code-list": { vi: "🎁 Xem các mã quà đã tạo", en: "🎁 List the gift codes you created" },
    "eco-admin.code-revoke": { vi: "🎁 Thu hồi một mã quà", en: "🎁 Revoke a gift code" },
    "antinuke.enable": { vi: "Bật/tắt lá chắn (TẮT có độ trễ 5 phút + báo động)", en: "Turn the shield on/off (turning OFF is delayed 5 minutes + alerts)" },
    "antinuke.mode": { vi: "Chế độ: chỉ ghi log (thử) hay thi hành thật", en: "Mode: log-only (dry run) or enforce" },
    "antinuke.status": { vi: "Xem cấu hình & trạng thái lá chắn", en: "View shield settings and status" },
    "antinuke.check": { vi: "Kiểm tra bot có ĐỦ ĐIỀU KIỆN chống nuke không", en: "Check whether the bot is actually able to stop a nuke" },
    "antinuke.whitelist-add": { vi: "Miễn trừ một người hoặc một role", en: "Exempt a user or a role" },
    "antinuke.whitelist-remove": { vi: "Gỡ miễn trừ", en: "Remove an exemption" },
    "antinuke.whitelist-list": { vi: "Xem danh sách miễn trừ", en: "View the exemption list" },
    "antinuke.logchannel": { vi: "Kênh nhận báo động (bỏ trống để gỡ)", en: "Alert channel (leave empty to clear)" },
    "antinuke.lockdown": { vi: "Khoá/mở khoá server thủ công", en: "Lock or unlock the server manually" },
    "antinuke.incidents": { vi: "Nhật ký sự cố gần đây", en: "Recent incident log" },
    "market.prices": { vi: "Xem biến động giá chợ hiện tại & thời gian biến động tiếp theo 📊", en: "View live market prices & next shift countdown 📊" },
    "market.sell": { vi: "Bán nông/thủy/khoáng sản cho hệ thống theo giá chợ biến động 💸", en: "Sell commodities to the system at live market prices 💸" },
    "bot.ping": { vi: "Kiểm tra độ trễ & trạng thái của bot", en: "Check the bot's latency & status" },
    "bot.about": { vi: "Giới thiệu Waguri & thông tin nhà phát triển 🌸", en: "About Waguri & developer info 🌸" },
    "bot.support": { vi: "Nhận trợ giúp & vào server hỗ trợ Waguri 🛟", en: "Get help & join the Waguri support server 🛟" },
    "bot.invite": { vi: "Mời Waguri về server của cậu 🌸", en: "Invite Waguri to your server 🌸" },
    "event.start": { vi: "Bật sự kiện (owner)", en: "Start an event (owner)" },
    "event.stop": { vi: "Tắt sự kiện (owner)", en: "Stop the event (owner)" },
    "event.status": { vi: "Xem sự kiện hiện tại", en: "View the current event" },
    // config
    "config.confession-channel": { vi: "Đặt kênh đăng confession", en: "Set confession channel" },
    "config.staff-role": { vi: "Đặt role Staff được xem ticket hỗ trợ (bỏ trống để tự dò theo quyền)", en: "Set the staff role that can view support tickets (leave empty to auto-detect by permission)" },
    "config.ai": { vi: "Bật/tắt trò chuyện AI khi tag Waguri", en: "Toggle AI chat when tagging Waguri" },
    "config.ai-channel": { vi: "Giới hạn AI chỉ trả lời ở 1 kênh (bỏ trống = mọi kênh)", en: "Limit AI replies to 1 channel (empty = all channels)" },
    "config.pvp": { vi: "Bật/tắt PvP: cướp /rob + trộm heo/cây", en: "Toggle PvP: rob / thievery" },
    "config.police-jail": { vi: "Bật/tắt tạm giam khi gặp công an", en: "Toggle Discord timeout for police check" },
    "config.gambling": { vi: "Bật/tắt trò may rủi (bài cào, tài xỉu, xóc đĩa…)", en: "Toggle gambling minigames" },
    "config.levelup": { vi: "Bật/tắt báo lên cấp khi trò chuyện", en: "Toggle level-up notices in chat" },
    "config.welcome-channel": { vi: "Đặt kênh chào mừng thành viên mới (bỏ trống để tắt)", en: "Set welcome channel (empty to disable)" },
    "config.welcome-role": { vi: "Đặt role tự động gán khi gia nhập (bỏ trống để tắt)", en: "Set auto-join role (empty to disable)" },
    "config.goodbye-channel": { vi: "Đặt kênh tạm biệt thành viên rời server (bỏ trống để tắt)", en: "Set goodbye channel (empty to disable)" },
    "config.announcement-channel": { vi: "Đặt kênh nhận thông báo cập nhật", en: "Set update announcements channel" },
    "config.language": { vi: "Đặt ngôn ngữ hiển thị cho bot", en: "Set bot display language" },
    "config.reminders": { vi: "Cấu hình lời nhắc đồng hành từ Waguri 🌸", en: "Configure Waguri companion reminders 🌸" },
    "config.view": { vi: "Xem cấu hình hiện tại của máy chủ", en: "View current server configuration" },

    // boi

    // couple
    "couple.status": { vi: "Xem trạng thái tình cảm hiện tại", en: "View current marriage status" },
    "couple.marry": { vi: "Cầu hôn người cậu yêu", en: "Propose to your beloved" },
    "couple.divorce": { vi: "Ly hôn", en: "Divorce your partner" },

    // action

    // image

    // store
    "store.list": { vi: "Xem cửa hàng vật phẩm", en: "View item store" },
    "store.buy": { vi: "Mua vật phẩm từ cửa hàng", en: "Buy items from the store" },
    "store.sell": { vi: "Bán vật phẩm trong kho đồ theo giá chợ (quanh 50% giá mua, biến động 4 tiếng/lần)", en: "Sell inventory items at market price (around 50% of shop price, shifts every 4h)" },

    // pass
    "pass.view": { vi: "Xem tiến trình Sổ Sứ Mệnh hiện tại", en: "View current Battle Pass progress" },
    "pass.buy": { vi: "Mua Sổ Sứ Mệnh Premium", en: "Buy Premium Battle Pass" },

    // tiembanh

    // heo


    // loto
    "loto.open": { vi: "Mở phòng chơi Loto", en: "Open a Loto lobby" },
    "loto.join": { vi: "Mua vé Loto với 5 số", en: "Buy Loto ticket with 5 numbers" },
    "loto.list": { vi: "Xem danh sách vé đã mua", en: "View list of bought Loto tickets" },
    "loto.start": { vi: "Bắt đầu game Loto", en: "Start Loto game" },
    "loto.end": { vi: "Kết thúc/hủy phòng game Loto", en: "Cancel Loto lobby" },

    // bingo

    // vay

    // announcements
    "announcement.view": { vi: "Xem thông báo mới nhất", en: "View latest announcements" },
    "announcement.send": { vi: "Gửi thông báo mới qua Form Modal (chỉ owner)", en: "Send a new announcement via Form Modal (owner only)" },

    // worldevent

    // cosmetic
    "cosmetic.title": { vi: "Đặt danh hiệu (20.000 VNĐ)", en: "Set profile title (20,000 coins)" },
    "cosmetic.color": { vi: "Đặt màu hồ sơ (15.000 VNĐ)", en: "Set profile color (15,000 coins)" },
    "cosmetic.view": { vi: "Xem cosmetic hiện tại", en: "View current profile cosmetics" },
    "cosmetic.badge-buy": { vi: "Mua huy hiệu trưng bày", en: "Buy badges for display" },
    "cosmetic.badge-equip": { vi: "Trưng bày huy hiệu lên profile", en: "Equip badges to display showcase" },

    // pet
    "pet.adopt": { vi: "Nhận nuôi một bé", en: "Adopt a baby pet" },
    "pet.view": { vi: "Xem thú cưng", en: "View your pet status" },
    "pet.feed": { vi: "Cho thú cưng ăn để tăng kinh nghiệm", en: "Feed your pet to increase EXP" },
    "pet.rename": { vi: "Đổi tên thú cưng", en: "Rename your pet" },
    "pet.skill-up": { vi: "Nâng cấp kỹ năng bị động cho thú cưng", en: "Upgrade passive skills for your pet" },
    "pet.ascend": { vi: "Làm lễ thăng bậc độ hiếm cho thú cưng ✨", en: "Perform the rite to ascend your pet's tier ✨" },
    "pet.hatch": { vi: "Ấp trứng nhặt được khi cày để đánh thức loài hiếm 🥚", en: "Hatch an egg found while gathering to awaken a rare species 🥚" },

    // clan

    // bank
    "bank.balance": { vi: "Xem số dư ví, ngân hàng và cấp độ", en: "View wallet, bank balance, and level" },
    "bank.deposit": { vi: "Gửi tiền từ ví vào ngân hàng", en: "Deposit money from wallet to bank" },
    "bank.withdraw": { vi: "Rút tiền từ ngân hàng về ví", en: "Withdraw money from bank to wallet" },

    // henho

    // jobs
    "jobs.list": { vi: "Xem tất cả các nghề nghiệp", en: "List all available jobs" },
    "jobs.info": { vi: "Xem chi tiết một nghề nghiệp", en: "View detailed information about a job" },
    "jobs.apply": { vi: "Nộp đơn xin việc", en: "Apply for a job" },

    // craft
    "craft.list": { vi: "Xem công thức chế tạo", en: "View crafting recipes" },
    "craft.make": { vi: "Chế tạo một món đồ", en: "Craft an item" },

    // eco-admin
    "eco-admin.addmoney": { vi: "Cộng/trừ tiền của người chơi", en: "Add/subtract money of a player" },
    "eco-admin.setmoney": { vi: "Đặt cứng số dư của người chơi", en: "Set balance of a player" },
    "eco-admin.setenergy": { vi: "Đặt năng lượng của người chơi", en: "Set energy of a player" },
    "eco-admin.setexp": { vi: "Đặt EXP của người chơi", en: "Set EXP of a player" },
    "eco-admin.giveitem": { vi: "Cấp vật phẩm miễn phí cho người chơi", en: "Give free items to a player" },
    "eco-admin.setjob": { vi: "Bổ nhiệm công việc cho người chơi", en: "Set job of a player" },
    "eco-admin.premium": { vi: "Cấp/gia hạn Premium cho người chơi", en: "Grant/extend Premium for a player" },
    "eco-admin.ban": { vi: "Chặn user dùng bot", en: "Ban a user from using the bot" },
    "eco-admin.unban": { vi: "Bỏ chặn user", en: "Unban a user" },
    "eco-admin.resetuser": { vi: "Xóa sạch dữ liệu một người chơi", en: "Wipe all data of a player" },
    "eco-admin.report": { vi: "📊 Báo cáo telemetry kinh tế (cung tiền, hoạt động, dòng tiền, top nhận)", en: "📊 Economy telemetry (supply, activity, money flow, top gainers)" },
    "eco-admin.daily": { vi: "📋 Báo cáo Checklist vận hành hằng ngày (5 Cổng chất lượng)", en: "📋 Daily operational checklist report (5 Quality Gates)" },
    "eco-admin.trace": { vi: "🔎 Xem nhật ký giao dịch của một người chơi", en: "🔎 View a player's transaction ledger" },

    // premium-admin
    "premium-admin.pending": { vi: "Xem các đơn Premium đang chờ duyệt", en: "View pending Premium orders" },
    "premium-admin.approve": { vi: "Xác nhận đã nhận tiền & kích hoạt 1 đơn", en: "Approve a Premium order & activate benefits" },

    // study
    "study.start": { vi: "Bắt đầu một phiên học bài Pomodoro ⏳", en: "Start a Pomodoro study session ⏳" },
    "study.status": { vi: "Xem trạng thái phiên học hiện tại 📊", en: "View current study session status 📊" },
    "study.stop": { vi: "Kết thúc phiên học bài sớm 🛑", en: "End study session early 🛑" },
    "study.leaderboard": { vi: "Bảng xếp hạng Chuyên Cần 🏆", en: "Study diligence leaderboard 🏆" },
    "study.shop": { vi: "Tiệm Tri Thức — Đổi Điểm Tri Thức lấy vật phẩm & danh hiệu 🛒", en: "Knowledge Shop — Exchange Study Points for items & titles 🛒" },

    // announcement
    "announcement.clear": { vi: "Xóa bản tin thông báo hiện tại 🗑️ (chỉ cho Owner bot)", en: "Clear current announcement 🗑️ (bot Owner only)" }
};

const OPTION_DESCRIPTIONS = {
    "redeem.code": { vi: "Mã quà cậu nhận được", en: "The gift code you received" },
    "eco-admin.code-create.code": { vi: "Mã quà (4-32 ký tự: A-Z, 0-9, dấu -)", en: "Code (4-32 chars: A-Z, 0-9, hyphen)" },
    "eco-admin.code-create.note": { vi: "Mã này để làm gì? (bắt buộc — 6 tháng sau còn tra được)", en: "What is this code for? (required — so it still makes sense in 6 months)" },
    "eco-admin.code-create.coins": { vi: "Số xu mỗi lượt (trần 50.000)", en: "Coins per use (cap 50,000)" },
    "eco-admin.code-create.item-qty": { vi: "Số lượng vật phẩm (mặc định 1)", en: "Item quantity (default 1)" },
    "eco-admin.code-create.premium-days": { vi: "Số ngày Premium (trần 90)", en: "Premium days (cap 90)" },
    "eco-admin.code-create.max-uses": { vi: "Số lượt đổi tối đa (mặc định 1)", en: "Maximum number of redemptions (default 1)" },
    "eco-admin.code-create.only-user": { vi: "Chỉ riêng một người mới đổi được (mã đền bù)", en: "Restrict the code to one person (compensation code)" },
    "eco-admin.code-create.expires-hours": { vi: "Hết hạn sau bao nhiêu giờ", en: "Expires after this many hours" },
    "eco-admin.code-create.min-account-age": { vi: "Tuổi tài khoản Discord tối thiểu (ngày)", en: "Minimum Discord account age (days)" },
    "eco-admin.code-list.limit": { vi: "Số dòng (mặc định 20, tối đa 50)", en: "Rows to show (default 20, max 50)" },
    "eco-admin.code-revoke.code": { vi: "Mã cần thu hồi", en: "Code to revoke" },
    "ask.image": { vi: "Gửi kèm một tấm ảnh cho Waguri xem (tuỳ chọn)", en: "Attach an image for Waguri to look at (optional)" },
    "antinuke.mode.mode": { vi: "Chế độ", en: "Mode" },
    "antinuke.lockdown.state": { vi: "Khoá hay mở", en: "Lock or unlock" },
    "antinuke.enable.enabled": { vi: "Bật lá chắn?", en: "Enable the shield?" },
    "antinuke.whitelist-add.user": { vi: "Người được miễn trừ", en: "User to exempt" },
    "antinuke.whitelist-add.role": { vi: "Role được miễn trừ", en: "Role to exempt" },
    "antinuke.whitelist-remove.user": { vi: "Người cần gỡ", en: "User to remove" },
    "antinuke.whitelist-remove.role": { vi: "Role cần gỡ", en: "Role to remove" },
    "study.start.duration": { vi: "Thời gian học (phút), mặc định 25m ⏱️", en: "Study duration (minutes), default 25m ⏱️" },
    "study.start.title": { vi: "Tên mục tiêu học bài 📖", en: "Study goal title 📖" },
    "cosmetic.badge-buy.badge": { vi: "Chọn huy hiệu", en: "Choose a badge" },
    "cosmetic.badge-equip.badge": { vi: "Chọn huy hiệu", en: "Choose a badge" },
    "cosmetic.badge-equip.slot": { vi: "Vị trí trưng bày (1..6)", en: "Display slot (1..6)" },
    "craft.make.recipe": { vi: "Món muốn chế", en: "Item to craft" },
    "leaderboard.scope": { vi: "Trong server này hay toàn cầu", en: "This server or global" },
    "eco-admin.trace.limit": { vi: "Số dòng (mặc định 20, tối đa 50)", en: "Number of entries (default 20, max 50)" },
    "pet.feed.food": { vi: "Chọn loại thức ăn cho bé", en: "Choose food for your pet" },
    "pet.skill-up.skill": { vi: "Chọn kỹ năng", en: "Choose a skill" },
    "pet.hatch.egg": { vi: "Chọn quả trứng", en: "Choose an egg" },
    "repair.tool": { vi: "Chọn công cụ muốn sửa", en: "Choose the tool to repair" },
    "bakery.stock.type": { vi: "ID nguyên liệu, vd trai_2000 / thit_heo_2500 / ca_tuoi", en: "Ingredient ID, e.g. trai_2000 / thit_heo_2500 / ca_tuoi" },
    "bakery.stock.amount": { vi: "Số lượng", en: "Quantity" },
    "bakery.hire.staff": { vi: "Nhân vật muốn thuê", en: "Character to hire" },
    "bakery.fire.staff": { vi: "Nhân vật muốn sa thải", en: "Character to fire" },
    "bakery.decor.item": { vi: "Nội thất trang trí", en: "Decoration furnishing" },
    "bakery.deliver.number": { vi: "Số thứ tự đơn hàng (1, 2 hoặc 3)", en: "Order slot number (1, 2 or 3)" },
    "fortune.zodiac.sign": { vi: "Cung của cậu", en: "Your zodiac sign" },
    "lunar.date": { vi: "Ngày dương lịch (dd/mm/yyyy) — bỏ trống = hôm nay", en: "Solar date (dd/mm/yyyy) — leave blank = today" },
    "weather.city": { vi: "Tên thành phố (vd: Hanoi, Da Nang)", en: "City name (e.g. Hanoi, Tokyo)" },
    "lixi.parts": { vi: "Số bao lì xì (mặc định 5)", en: "Number of lucky-money envelopes (default 5)" },
    "loto.join.numbers": { vi: "5 số từ 01-90 (ví dụ: 01 15 27 42 89)", en: "5 numbers from 01-90 (e.g. 01 15 27 42 89)" },
    "event.start.multiplier": { vi: "Hệ số nhân (vd 2)", en: "Multiplier (e.g. 2)" },
    "event.start.hours": { vi: "Số giờ kéo dài", en: "Duration in hours" },
    "help.command": { vi: "Tên lệnh muốn xem chi tiết", en: "Name of the command to view details for" },
    "bet": { vi: "Số tiền cược (vd 1000, 1k, all)", en: "Bet amount (e.g. 1000, 1k, all)" },
    "side": { vi: "Chọn mặt hoặc cửa đặt", en: "Choose side or bet option" },
    "choice": { vi: "Lựa chọn của cậu", en: "Your choice" },
    "user": { vi: "Mục tiêu tương tác", en: "Target user for interaction" },
    "target": { vi: "Người chơi muốn xem/tương tác", en: "Target player to view/interact" },
    "amount": { vi: "Số tiền giao dịch/lì xì", en: "Amount of money" },
    "quantity": { vi: "Số lượng vật phẩm/lì xì", en: "Quantity of items" },
    "item": { vi: "Vật phẩm tương tác", en: "Target item" },
    "name": { vi: "Tên cần nhập", en: "Name to input" },
    "enabled": { vi: "Trạng thái kích hoạt (Bật/Tắt)", en: "Enabled state (True/False)" },
    "role": { vi: "Role gán tự động", en: "Auto-assigned role" },
    "lang": { vi: "Ngôn ngữ hiển thị (vi/en)", en: "Display language (vi/en)" },
    "type": { vi: "Loại hành động", en: "Type of action" },
    "category": { vi: "Danh mục ảnh", en: "Image category" },
    "message": { vi: "Nội dung tin nhắn/confession", en: "Message/confession content" },
    "channel": { vi: "Kênh văn bản chỉ định", en: "Designated text channel" },
    "hex": { vi: "Mã màu Hex (vd: F1C40F)", en: "Hex color code (e.g. F1C40F)" },
    "text": { vi: "Nội dung văn bản/danh hiệu", en: "Text content/title" },
    "species": { vi: "Loài thú cưng", en: "Pet species" },

    // Specific option translations using parentName.optionName
    "bank.balance.target": { vi: "Người muốn xem (mặc định: bạn)", en: "Player to view (default: yourself)" },
    "bank.deposit.amount": { vi: "Số tiền hoặc \"all\"", en: "Amount of money or \"all\"" },
    "bank.withdraw.amount": { vi: "Số tiền hoặc \"all\"", en: "Amount of money or \"all\"" },
    "jobs.info.job": { vi: "Mã nghề cần xem", en: "Job ID to view" },
    "jobs.apply.job": { vi: "Mã nghề muốn ứng tuyển", en: "Job ID to apply" },
    "premium-admin.approve.code": { vi: "Mã đơn (nội dung CK, vd WAGURI...)", en: "Order code (e.g. WAGURI...)" },
    "getinvite.server": { vi: "Server cần lấy link mời (bỏ trống = hiện tại)", en: "Server to invite (empty = current server)" },
    "eco-admin.addmoney.field": { vi: "Ví hay ngân hàng", en: "Wallet or bank" },
    "eco-admin.setmoney.field": { vi: "Ví hay ngân hàng", en: "Wallet or bank" },
    "eco-admin.addmoney.user": { vi: "Người nhận", en: "Recipient player" },
    "eco-admin.setmoney.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.setenergy.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.setexp.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.giveitem.user": { vi: "Người nhận", en: "Recipient player" },
    "eco-admin.setjob.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.premium.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.ban.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.unban.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.resetuser.user": { vi: "Người chơi", en: "Player" },
    "eco-admin.addmoney.amount": { vi: "Số tiền (âm để trừ)", en: "Amount of money (negative to subtract)" },
    "eco-admin.setmoney.amount": { vi: "Số tiền", en: "Amount of money" },
    "eco-admin.setenergy.value": { vi: "Giá trị năng lượng", en: "Energy value" },
    "eco-admin.setexp.value": { vi: "Giá trị kinh nghiệm", en: "EXP value" },
    "eco-admin.giveitem.item": { vi: "Vật phẩm cấp phát", en: "Item ID" },
    "eco-admin.giveitem.qty": { vi: "Số lượng cấp phát (mặc định 1)", en: "Quantity to give (default 1)" },
    "eco-admin.setjob.job": { vi: "Mã nghề bổ nhiệm", en: "Job ID to set" },
    "eco-admin.premium.days": { vi: "Số ngày cấp", en: "Number of days" },
    "config.reminders.status": { vi: "Bật hoặc tắt lời nhắc đồng hành", en: "Enable or disable companion reminders" },
    "config.reminders.channel": { vi: "Kênh nhận lời nhắc (bỏ trống để dùng mặc định)", en: "Reminder channel (leave empty for default)" },
    "config.reminders.style": { vi: "Phong cách lời nhắn của Waguri", en: "Waguri message style" },

    // Generic fallbacks
    "server": { vi: "Server cần chọn", en: "Target server" },
    "qty": { vi: "Số lượng", en: "Quantity" },
    "job": { vi: "Nghề nghiệp", en: "Job" },
    "days": { vi: "Số ngày", en: "Number of days" }
};

// Context menu: tên CHÍNH LÀ chữ hiển thị trong menu chuột phải, không ai gõ nó -> dịch được.
// Khoá = tên đăng ký với Discord (tiếng Anh).
const CONTEXT_MENU_NAMES = {
    "View Waguri Profile": { vi: "Xem hồ sơ Waguri", en: "View Waguri Profile" },
};

const CHOICE_LOCALIZATIONS = {
    // config reminders
    "1": { vi: "Bật (Enabled)", en: "Enabled" },
    "0": { vi: "Tắt (Disabled)", en: "Disabled" },
    "warm": { vi: "Dịu dàng, ấm áp (Warm)", en: "Warm & gentle (Warm)" },
    "energetic": { vi: "Năng động, nhiệt huyết (Energetic)", en: "Energetic & lively (Energetic)" },
    // chống nuke
    "dryrun": { vi: "Chỉ ghi log (an toàn, nên dùng 7 ngày đầu)", en: "Log only (safe — recommended for the first 7 days)" },
    "enforce": { vi: "Thi hành thật (trừng phạt + khoá server)", en: "Enforce (punish + lock the server)" },
    "lock": { vi: "Khoá", en: "Lock" },
    "unlock": { vi: "Mở khoá", en: "Unlock" },
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
    "en": { vi: "Tiếng Anh 🇬🇧", en: "English 🇬🇧" },
    // language
    "auto": { vi: "Tự động theo app Discord", en: "Auto (follow Discord app)" },
    "wallet": { vi: "Ví", en: "Wallet" },
    "bank": { vi: "Ngân hàng", en: "Bank" }
};

/**
 * Tự động địa phương hóa đối tượng Command JSON.
 * @param {object} cmd Command JSON payload (kết quả của command.data.toJSON())
 * @returns {object} Command JSON đã được tiêm name_localizations và description_localizations.
 */
function localizeCommandJSON(cmd) {
    if (!cmd) return cmd;

    // 0. Context menu (chuột phải -> Apps): type 2 = user, 3 = message. Nhóm này KHÔNG có
    // description, và TÊN của nó chính là chữ hiển thị trong menu — không ai GÕ nó. Nên đây
    // là ngoại lệ duy nhất được dịch tên; mọi lệnh slash thì tên phải cố định (xem mục 1).
    // Trước 2026-10-23 nó rơi vào nhánh ghi đè ở dưới nên người dùng tiếng Anh đọc đúng
    // chữ "Xem hồ sơ Waguri".
    if (cmd.type === 2 || cmd.type === 3) {
        const ten = CONTEXT_MENU_NAMES[cmd.name];
        if (ten) cmd.name_localizations = { vi: ten.vi, 'en-US': ten.en, 'en-GB': ten.en };
        return cmd;
    }

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
    // CHỦ Ý ghi đè: mọi ngôn ngữ thấy CÙNG một tên tiếng Anh, nên chữ hướng dẫn chỉ cần một
    // tên. Hệ quả: `setNameLocalizations({ vi: ... })` trong builder KHÔNG tới được Discord —
    // đừng khai lại ở đó. Tên tiếng Việt cũ sống tiếp dưới dạng gõ tắt `w!` (lib/prefixTen.js),
    // và `scripts/check-command-refs.js` chặn chữ hướng dẫn nhắc tên không tồn tại.
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
        const specificKey = `${parentName}.${opt.name}`;
        const optDesc = OPTION_DESCRIPTIONS[specificKey] || OPTION_DESCRIPTIONS[opt.name];
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

// ============================================================
// TRA CỨU THEO NGÔN NGỮ — để `/help` đọc CÙNG nguồn với bảng gợi ý Discord.
//
// VÌ SAO CÓ: `localizeCommandJSON` GHI ĐÈ `cmd.description` bằng bản localizer trước khi
// đăng ký lên Discord, nhưng `help.js` lại đọc thẳng `command.data.toJSON()` — tức bản
// BUILDER, chưa qua localizer. Hệ quả đo được ngày 21-08-2026:
//   · 68 lệnh và 51 subcommand có hai chuỗi mô tả khác nhau ở hai nơi
//   · người dùng tiếng Anh đọc mô tả subcommand bằng TIẾNG VIỆT trong `/help`,
//     dù bản `en` đã có sẵn đủ 157/157 sub ở bảng dưới
//
// Hai hàm này cho `/help` đọc đúng bảng đó, đúng ngôn ngữ người đọc. Mô tả builder lùi về
// vai trò dự phòng — nó vốn đã bị ghi đè trước khi tới Discord.
// ============================================================

/** 'en-US' / 'en-GB' / 'en' -> 'en'; còn lại -> 'vi'. */
const nganNgu = (locale) => (String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'vi');

/**
 * Mô tả của một LỆNH theo ngôn ngữ người đọc.
 * @param {string} ten tên lệnh
 * @param {string} locale
 * @param {string} duPhong dùng khi bảng chưa có mục (mô tả builder)
 */
function moTaLenh(ten, locale, duPhong = '') {
    const m = COMMAND_DESCRIPTIONS[ten];
    return (m && m[nganNgu(locale)]) || duPhong;
}

/**
 * Mô tả của một SUBCOMMAND theo ngôn ngữ người đọc.
 * @param {string} ten tên lệnh · @param {string} sub tên subcommand
 */
function moTaSub(ten, sub, locale, duPhong = '') {
    const m = SUBCOMMAND_DESCRIPTIONS[`${ten}.${sub}`];
    return (m && m[nganNgu(locale)]) || duPhong;
}

module.exports = {
    localizeCommandJSON,
    COMMAND_DESCRIPTIONS,
    SUBCOMMAND_DESCRIPTIONS,
    OPTION_DESCRIPTIONS,
    moTaLenh,
    moTaSub,
};
