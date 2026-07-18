// src/lib/commandLocalizer.js
// Định nghĩa bản dịch và hàm địa phương hóa tự động cho các Slash Commands.

const COMMAND_DESCRIPTIONS = {
    "leaderboard": {
        vi: "Bảng xếp hạng 🏆",
        en: "Leaderboard 🏆"
    },
    "clan": {
        vi: "Bang hội 🏰 — lập bang, gia nhập, quỹ chung",
        en: "Guild 🏰 — create, join, shared treasury"
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
    "prestige": {
        vi: "Chuyển sinh — Khởi đầu mới với đặc quyền tối thượng 🌟",
        en: "Prestige — A new beginning with ultimate perks 🌟"
    },
    "worldevent": {
        vi: "Sự kiện cộng đồng toàn server 🌍",
        en: "Server-wide co-op community event 🌍"
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
    "market.view": { vi: "Xem các món đang bán", en: "Browse items on sale" },
    "market.mine": { vi: "Xem các món cậu đang bán", en: "View the items you're selling" },
    "market.sell": { vi: "Đăng bán một món trong kho", en: "List an item from your inventory for sale" },
    "market.buy": { vi: "Mua một món theo mã", en: "Buy an item by its ID" },
    "market.cancel": { vi: "Gỡ món cậu đang bán (trả về kho)", en: "Remove your listing (returns it to inventory)" },
    "market.auctions": { vi: "Xem các phiên đấu giá đang hoạt động 🔨", en: "View active auctions 🔨" },
    "market.auction": { vi: "Tạo một phiên đấu giá vật phẩm 🔨", en: "Start an item auction 🔨" },
    "market.bid": { vi: "Đặt giá cho một phiên đấu giá 💰", en: "Place a bid on an auction 💰" },
    "market.cancel-auction": { vi: "Hủy phiên đấu giá của cậu (khi chưa có ai bid) 🔨", en: "Cancel your auction (only if no bids yet) 🔨" },
    "tiembanh.xem": { vi: "Xem tình trạng tiệm bánh của cậu", en: "Check your bakery's status" },
    "tiembanh.mo": { vi: "Mở tiệm bánh (cần Lv.15 + Bộ Dụng Cụ Làm Bánh)", en: "Open a bakery (requires Lv.15 + Baking Tool Kit)" },
    "tiembanh.nhapnl": { vi: "Nhập nguyên liệu (trái/hoa/thịt/cá đã farm) vào tiệm", en: "Stock ingredients (farmed fruit/flowers/meat/fish) into the shop" },
    "tiembanh.thu": { vi: "Thu doanh thu tiệm về ví (có thể ra bánh!)", en: "Collect the shop's revenue to your wallet (may yield cakes!)" },
    "tiembanh.thue": { vi: "Thuê nhân viên NPC phụ tiệm", en: "Hire an NPC staff member to help at the shop" },
    "tiembanh.sathai": { vi: "Sa thái nhân viên NPC", en: "Fire an NPC staff member" },
    "tiembanh.trangtri": { vi: "Trang trí tiệm bánh bằng nội thất gỗ / trang sức", en: "Decorate the bakery with wooden furniture / jewelry" },
    "tiembanh.nangcap": { vi: "Nâng cấp tiệm (tăng tốc nướng & trần doanh thu)", en: "Upgrade the shop (faster baking & higher revenue cap)" },
    "noitu.start": { vi: "Bắt đầu ván nối từ ở kênh này", en: "Start a word-chain game in this channel" },
    "noitu.stop": { vi: "Kết thúc ván nối từ", en: "End the word-chain game" },
    "noitu.status": { vi: "Xem từ hiện cần nối", en: "See the current word to chain from" },
    "announcement.auto": { vi: "Tự động sinh thông báo từ Git Commit bằng AI (chỉ owner)", en: "Auto-generate an announcement from Git commits with AI (owner only)" },
    "bot.ping": { vi: "Kiểm tra độ trễ & trạng thái của bot", en: "Check the bot's latency & status" },
    "bot.about": { vi: "Giới thiệu Waguri & thông tin nhà phát triển 🌸", en: "About Waguri & developer info 🌸" },
    "bot.support": { vi: "Nhận trợ giúp & vào server hỗ trợ Waguri 🛟", en: "Get help & join the Waguri support server 🛟" },
    "bot.invite": { vi: "Mời Waguri về server của cậu 🌸", en: "Invite Waguri to your server 🌸" },
    "event.start": { vi: "Bật sự kiện (owner)", en: "Start an event (owner)" },
    "event.stop": { vi: "Tắt sự kiện (owner)", en: "Stop the event (owner)" },
    "event.status": { vi: "Xem sự kiện hiện tại", en: "View the current event" },
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
    "announcement.send": { vi: "Gửi thông báo mới", en: "Send a new announcement" },

    // worldevent
    "worldevent.view": { vi: "Xem tiến trình sự kiện co-op hôm nay", en: "View today's co-op event progress" },
    "worldevent.contribute": { vi: "Đóng góp tài nguyên vào sự kiện chung", en: "Contribute resources to the co-op event" },
    "worldevent.claim": { vi: "Nhận phần thưởng co-op của ngày", en: "Claim today's co-op reward" },

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

    // clan
    "clan.create": { vi: "Lập bang mới (tốn 50,000 VNĐ)", en: "Create a new clan (costs 50,000 coins)" },
    "clan.join": { vi: "Gia nhập một bang", en: "Join an existing clan" },
    "clan.leave": { vi: "Rời bang", en: "Leave your current clan" },
    "clan.info": { vi: "Xem thông tin bang", en: "View clan details" },
    "clan.list": { vi: "Bảng xếp hạng bang (theo quỹ)", en: "Clan leaderboard (by treasury)" },
    "clan.deposit": { vi: "Góp tiền hoặc tài nguyên vào quỹ bang", en: "Deposit money or resources to clan treasury" },
    "clan.withdraw": { vi: "Rút quỹ bang (chỉ trưởng bang)", en: "Withdraw from clan treasury (leader only)" },
    "clan.kick": { vi: "Đuổi thành viên (chỉ trưởng bang)", en: "Kick a member from clan (leader only)" },
    "clan.disband": { vi: "Giải tán bang (chỉ trưởng bang)", en: "Disband the clan (leader only)" },
    "clan.war": { vi: "Khai chiến với bang khác (chỉ trưởng bang)", en: "Declare war on another clan (leader only)" },
    "clan.shrine": { vi: "Xây dựng và nâng cấp Đền thờ bang hội để nhận buff EXP 🏛️", en: "Build and upgrade Clan Shrine for EXP buffs 🏛️" },

    // bank
    "bank.balance": { vi: "Xem số dư ví, ngân hàng và cấp độ", en: "View wallet, bank balance, and level" },
    "bank.gui": { vi: "Gửi tiền từ ví vào ngân hàng", en: "Deposit money from wallet to bank" },
    "bank.rut": { vi: "Rút tiền từ ngân hàng về ví", en: "Withdraw money from bank to wallet" },

    // henho
    "henho.view": { vi: "Xem trạng thái tình cảm của cậu với Waguri", en: "View affection status with Waguri" },
    "henho.di-choi": { vi: "Dắt Waguri đi dạo ngắm cảnh Kikyo (Tốn 20 năng lượng)", en: "Take Waguri out for a walk in Kikyo (Costs 20 energy)" },
    "henho.tang-qua": { vi: "Tặng quà trong túi đồ để tăng độ thiện cảm", en: "Gift items from inventory to increase affection" },

    // jobs
    "jobs.list": { vi: "Xem tất cả các nghề nghiệp", en: "List all available jobs" },
    "jobs.info": { vi: "Xem chi tiết một nghề nghiệp", en: "View detailed information about a job" },
    "jobs.apply": { vi: "Nộp đơn xin việc", en: "Apply for a job" },
    "jobs.quit": { vi: "Xin nghỉ việc hiện tại", en: "Resign from current job" },

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
    "eco-admin.report": { vi: "📊 Báo cáo telemetry kinh tế (cung tiền, phân bố, xu hướng)", en: "📊 View economic telemetry report (money supply, distribution, trends)" },

    // premium-admin
    "premium-admin.cho": { vi: "Xem các đơn Premium đang chờ duyệt", en: "View pending Premium orders" },
    "premium-admin.duyet": { vi: "Xác nhận đã nhận tiền & kích hoạt 1 đơn", en: "Approve a Premium order & activate benefits" }
};

const OPTION_DESCRIPTIONS = {
    "clan.war.clan": { vi: "Tên bang đối thủ", en: "Rival clan's name" },
    "cosmetic.badge-buy.badge": { vi: "Chọn huy hiệu", en: "Choose a badge" },
    "cosmetic.badge-equip.badge": { vi: "Chọn huy hiệu", en: "Choose a badge" },
    "cosmetic.badge-equip.slot": { vi: "Vị trí trưng bày (1..6)", en: "Display slot (1..6)" },
    "craft.make.recipe": { vi: "Món muốn chế", en: "Item to craft" },
    "leaderboard.phamvi": { vi: "Trong server này hay toàn cầu", en: "This server or global" },
    "market.sell.price": { vi: "Giá bán (cả lô)", en: "Sale price (whole lot)" },
    "market.auction.starting_bid": { vi: "Giá khởi điểm", en: "Starting bid" },
    "market.auction.min_increment": { vi: "Bước giá tối thiểu", en: "Minimum bid increment" },
    "market.auction.hours": { vi: "Thời gian đấu giá (giờ)", en: "Auction duration (hours)" },
    "pet.feed.food": { vi: "Chọn loại thức ăn cho bé", en: "Choose food for your pet" },
    "pet.skill-up.skill": { vi: "Chọn kỹ năng", en: "Choose a skill" },
    "repair.tool": { vi: "Chọn công cụ muốn sửa", en: "Choose the tool to repair" },
    "tiembanh.nhapnl.loai": { vi: "ID nguyên liệu, vd trai_2000 / thit_heo_2500 / ca_tuoi", en: "Ingredient ID, e.g. trai_2000 / thit_heo_2500 / ca_tuoi" },
    "tiembanh.nhapnl.sl": { vi: "Số lượng", en: "Quantity" },
    "tiembanh.thue.nhan_vien": { vi: "Nhân vật muốn thuê", en: "Character to hire" },
    "tiembanh.sathai.nhan_vien": { vi: "Nhân vật muốn sa thải", en: "Character to fire" },
    "tiembanh.trangtri.vat_pham": { vi: "Nội thất trang trí", en: "Decoration furnishing" },
    "vay.muon.lender": { vi: "Người cậu muốn vay", en: "The person you want to borrow from" },
    "vay.tra.lender": { vi: "Chủ nợ", en: "Creditor" },
    "vay.doi.borrower": { vi: "Con nợ", en: "Debtor" },
    "amlich.ngay": { vi: "Ngày dương lịch (dd/mm/yyyy) — bỏ trống = hôm nay", en: "Solar date (dd/mm/yyyy) — leave blank = today" },
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
    "text": { vi: "Nội dung văn bản/danh hiệu", en: "Text content/title" },
    "id": { vi: "ID hoặc mã định danh", en: "ID or unique identifier" },
    "species": { vi: "Loài thú cưng", en: "Pet species" },
    "resource": { vi: "Tên tài nguyên", en: "Resource name" },

    // Specific option translations using parentName.optionName
    "bank.balance.target": { vi: "Người muốn xem (mặc định: bạn)", en: "Player to view (default: yourself)" },
    "bank.gui.amount": { vi: "Số tiền hoặc \"all\"", en: "Amount of money or \"all\"" },
    "bank.rut.amount": { vi: "Số tiền hoặc \"all\"", en: "Amount of money or \"all\"" },
    "henho.tang-qua.item": { vi: "Chọn quà muốn tặng", en: "Choose gift item" },
    "jobs.info.job": { vi: "Mã nghề cần xem", en: "Job ID to view" },
    "jobs.apply.job": { vi: "Mã nghề muốn ứng tuyển", en: "Job ID to apply" },
    "craft.make.item": { vi: "Vật phẩm muốn chế tạo", en: "Item ID to craft" },
    "craft.make.qty": { vi: "Số lượng chế tạo", en: "Quantity to craft" },
    "premium-admin.duyet.ma": { vi: "Mã đơn (nội dung CK, vd WAGURI...)", en: "Order code (e.g. WAGURI...)" },
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

    // Generic fallbacks
    "server": { vi: "Server cần chọn", en: "Target server" },
    "ma": { vi: "Mã giao dịch/đơn", en: "Transaction/order code" },
    "qty": { vi: "Số lượng", en: "Quantity" },
    "job": { vi: "Nghề nghiệp", en: "Job" },
    "days": { vi: "Số ngày", en: "Number of days" }
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
    "en": { vi: "Tiếng Anh 🇬🇧", en: "English 🇬🇧" },
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

module.exports = { localizeCommandJSON };
