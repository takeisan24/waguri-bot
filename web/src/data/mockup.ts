// Nội dung song ngữ cho demo Discord tương tác (DiscordMockup.tsx).
// Tách khỏi component để component chỉ lo cấu trúc + giá trị động; text chọn theo locale.

export interface MockEmbedText {
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
}

export interface MockupContent {
  todayAt: (hm: string) => string;
  initialMsg: string;
  you: string;
  usedCommand: (cmd: string) => string;
  typing: string;
  headerTopic: string;
  channelsTitle: string;
  channels: [string, string, string, string];
  tryPrefix: string;
  placeholder: string;
  inputAria: string;
  sendAria: string;
  quotes: string[];
  replies: string[];
  keyword: (text: string) => string | null;
  work: (gold: string) => MockEmbedText;
  ask: MockEmbedText;
  taixiu: (win: boolean, roll: string, total: number, isOver: boolean) => MockEmbedText;
  daily: (total: string, streak: number, bonus: string) => MockEmbedText;
  baucua: (win: boolean, roll: string, hits: number, won: string) => MockEmbedText;
  heo: (age: number, weight: string, value: string) => MockEmbedText;
  amlich: (dateStr: string) => MockEmbedText;
  jobs: MockEmbedText;
}

const vi: MockupContent = {
  todayAt: (hm) => `Hôm nay lúc ${hm}`,
  initialMsg: "🌸 Chào mừng cậu đã ghé thăm thế giới của tớ! Hãy thử tương tác bằng các nút lệnh bên dưới nhé~",
  you: "Bạn",
  usedCommand: (cmd) => `Đã dùng lệnh: **${cmd}**`,
  typing: "Waguri đang gõ...",
  headerTopic: "Căn phòng ngập tràn hoa anh đào và tiếng cười cùng Waguri",
  channelsTitle: "Kênh Văn Bản",
  channels: ["🌸-trò-chuyện-waguri", "💼-đi-làm-kiếm-tiền", "🎲-thử-vận-may", "📢-thành-tựu"],
  tryPrefix: "Hoặc thử lệnh:",
  placeholder: "Nhắn cho Waguri... (vd: chào cậu, tớ buồn quá)",
  inputAria: "Nhắn cho Waguri",
  sendAria: "Gửi tin nhắn",
  quotes: [
    "Bánh kem dâu của Rintaro làm ở tiệm Gekka luôn là ngon nhất! 🍰",
    "Subaru-chan luôn bảo vệ tớ chu đáo, tớ thật may mắn khi có cậu ấy! 👭",
    "Nhìn Rintaro trông hơi ngầu nhưng anh ấy là người dịu dàng nhất tớ từng biết đó~ 🥰",
    "Dù bức tường giữa Kikyo và Chidori có cao đến đâu, chỉ cần chúng mình chân thành thì sẽ vượt qua hết! 🧱🌸",
    "Cố lên nhé! Hôm nay cậu đã vất vả rồi, tớ luôn ở sau cổ vũ cậu! 💪🌸",
  ],
  replies: [
    "Hì hì, được trò chuyện với cậu tớ vui lắm đó~ 🌸",
    "Cậu hôm nay thế nào rồi? Nhớ giữ gìn sức khoẻ nhé! 💕",
    "Tớ luôn ở đây lắng nghe cậu mà, đừng ngại chia sẻ nha~",
    "Cậu giỏi lắm! Cố thêm chút nữa thôi là được rồi! 💪🌸",
    "Nghe cậu nói mà tớ thấy ấm lòng ghê~ Cảm ơn cậu nhiều! 🥰",
  ],
  keyword: (t) => {
    if (/buồn|mệt|chán|khóc|stress|áp lực/.test(t)) return "Ôi, cậu đừng buồn nha~ Mọi chuyện rồi sẽ ổn thôi, tớ luôn ở bên cậu mà. Ôm cậu một cái nè! 🤗🌸";
    if (/yêu|thương|thích|crush|cưới/.test(t)) return "E-eh?! Cậu làm tớ ngại quá đi à~ 😳🌸 Nhưng mà... tớ cũng quý cậu nhiều lắm đó!";
    if (/chào|hi|hello|hế lô|alo|xin chào/.test(t)) return "Chào cậu! 🌸 Rất vui được gặp cậu~ Hôm nay cậu muốn làm gì cùng tớ nào?";
    if (/ăn|đói|bánh|cơm|trà sữa/.test(t)) return "Cậu đói rồi à? Tớ mời cậu một góc bánh kem dâu mới nướng ở tiệm Gekka nhé! 🍰🌸";
    if (/\?|sao|gì|thế nào|là ai/.test(t)) return "Câu hỏi hay đó~ Tớ là Waguri, trợ lý kiêm bạn đồng hành của cậu. Cứ gõ /ask để hỏi tớ bất cứ điều gì nha! 💬🌸";
    return null;
  },
  work: (gold) => ({
    title: "💼 KIẾM TIỀN - Đứng đường",
    description: `Cậu đã đi làm công việc **Đứng đường** chăm chỉ và kiếm được **${gold} VNĐ**! ⚡ Năng lượng tiêu hao: **10**. Năng lượng còn lại: **90/100**.\n\n*Hôm nay cậu đã làm việc cực kỳ vất vả rồi đấy!*`,
  }),
  ask: {
    title: "💬 TRÒ CHUYỆN CÙNG WAGURI",
    description: "Hì hì, tớ lúc nào cũng trân trọng và yêu quý mọi người mà! Chỉ cần cậu luôn vui vẻ và cố gắng mỗi ngày, Waguri sẽ luôn đồng hành và cổ vũ cho cậu đấy nhé! Cậu có muốn ăn thử một góc bánh kem dâu mới nướng ở tiệm Gekka không nào? 🍰🌸",
  },
  taixiu: (win, roll, total, isOver) => {
    const result = isOver ? "Tài" : "Xỉu";
    const opp = isOver ? "Xỉu" : "Tài";
    return win ? {
      title: "🎲 TÀI XỈU - Chiến thắng! 🎉",
      description: `🎲 Kết quả xúc xắc: **[${roll}] ➔ ${total} (${result})**\n\nCậu đặt cửa vào **${result} (50,000 VNĐ)** và đã chiến thắng ngọt ngào!\nCậu nhận lại **99,000 VNĐ**! (+49,000 VNĐ sau thuế 2%) 🪙`,
    } : {
      title: "🎲 TÀI XỈU - Thất bại!",
      description: `🎲 Kết quả xúc xắc: **[${roll}] ➔ ${total} (${result})**\n\nCậu đặt cửa vào **${opp} (50,000 VNĐ)** nhưng xúc xắc lại ra **${result}**.\nCậu mất trắng **50,000 VNĐ** rồi... Đừng buồn nhé, làm lại ván khác vận may sẽ đến mà! 🥺`,
    };
  },
  daily: (total, streak, bonus) => ({
    title: "📅 ĐIỂM DANH HÀNG NGÀY",
    description: `Điểm danh thành công! Cậu nhận **${total} VNĐ** hôm nay. 🌸\n🔥 Chuỗi điểm danh: **${streak} ngày** liên tiếp — giữ vững nhé!`,
    fields: [
      { name: "💵 Thưởng cơ bản", value: "5,000 VNĐ", inline: true },
      { name: "🔥 Thưởng streak", value: `+${bonus} VNĐ`, inline: true },
    ],
  }),
  baucua: (win, roll, hits, won) => win ? {
    title: "🦀 BẦU CUA - Thắng rồi! 🎉",
    description: `Bàn lắc ra: ${roll}\nCậu đặt **🦀 Cua (50,000 VNĐ)** và trúng **${hits}** con → nhận về **${won} VNĐ**! 🪙`,
  } : {
    title: "🦀 BẦU CUA - Hụt mất rồi!",
    description: `Bàn lắc ra: ${roll}\nCậu đặt **🦀 Cua (50,000 VNĐ)** nhưng không con nào ra~ Mất **50,000 VNĐ**. Thử lại ván sau nhé! 🥺`,
  },
  heo: (age, weight, value) => ({
    title: "🐷 CHUỒNG HEO CỦA CẬU",
    description: "Chú heo đất của cậu đang lớn nhanh lắm! Nhớ cho ăn đều và canh chừng kẻo bị hàng xóm rình trộm nhé~ 🌸",
    fields: [
      { name: "🐷 Tuổi heo", value: `${age} ngày`, inline: true },
      { name: "⚖️ Cân nặng", value: `${weight} kg`, inline: true },
      { name: "💰 Giá bán", value: `${value} VNĐ`, inline: true },
    ],
  }),
  amlich: (dateStr) => ({
    title: "🗓️ LỊCH ÂM HÔM NAY",
    description: "Tra cứu âm lịch, can-chi và giờ hoàng đạo để chọn ngày lành tháng tốt nhé! 🌙🌸",
    fields: [
      { name: "📅 Dương lịch", value: dateStr, inline: true },
      { name: "🐉 Can chi", value: "Giáp Thìn", inline: true },
      { name: "⏰ Giờ hoàng đạo", value: "Tý, Sửu, Mão, Ngọ", inline: true },
    ],
  }),
  jobs: {
    title: "💼 NGHỀ NGHIỆP HIỆN TẠI của Cậu",
    description: "Cố gắng tích lũy thêm tiền ảo để nâng cấp lên các nghề cao cấp hơn như *Chạy Grab Công Nghệ*, *Chủ quán Gekka* hay *Đại gia Bất Động Sản* nhé! 🚀",
    fields: [
      { name: "Nghề nghiệp", value: "🏪 Chủ tiệm trà đá vỉa hè", inline: true },
      { name: "Cấp độ nghề", value: "Cấp 3 (EXP: 140/300)", inline: true },
      { name: "Thu nhập tối thiểu", value: "150 VNĐ / work", inline: true },
      { name: "Thu nhập tối đa", value: "350 VNĐ / work", inline: true },
      { name: "Mức độ rủi ro", value: "10% (Bị đô thị dọn)", inline: true },
    ],
  },
};

const en: MockupContent = {
  todayAt: (hm) => `Today at ${hm}`,
  initialMsg: "🌸 Welcome to my little world! Try interacting with the command buttons below~",
  you: "You",
  usedCommand: (cmd) => `Used command: **${cmd}**`,
  typing: "Waguri is typing...",
  headerTopic: "A cozy room full of cherry blossoms and laughter with Waguri",
  channelsTitle: "Text Channels",
  channels: ["🌸-chat-with-waguri", "💼-work-and-earn", "🎲-try-your-luck", "📢-achievements"],
  tryPrefix: "Or try a command:",
  placeholder: "Message Waguri... (e.g. hi there, I'm feeling down)",
  inputAria: "Message Waguri",
  sendAria: "Send message",
  quotes: [
    "Rintaro's strawberry shortcake at the Gekka bakery is always the best! 🍰",
    "Subaru-chan always looks out for me so carefully — I'm so lucky to have her! 👭",
    "Rintaro looks a little cool on the outside, but he's the gentlest person I know~ 🥰",
    "No matter how tall the wall between Kikyo and Chidori is, as long as we're sincere we'll get past it! 🧱🌸",
    "You can do it! You've worked so hard today — I'm always cheering you on from behind! 💪🌸",
  ],
  replies: [
    "Hehe, I'm so happy getting to chat with you~ 🌸",
    "How are you doing today? Remember to take care of yourself! 💕",
    "I'm always here to listen, so don't be shy to share~",
    "You're doing great! Just a little more and you've got it! 💪🌸",
    "Hearing you say that warms my heart~ Thank you so much! 🥰",
  ],
  keyword: (t) => {
    if (/sad|tired|bored|cry|stress|down|exhausted|anxious/.test(t)) return "Aww, don't be sad~ Everything will be okay, I'm always by your side. Here's a big hug! 🤗🌸";
    if (/love|like|crush|marry|adore/.test(t)) return "E-eh?! You're making me shy~ 😳🌸 But... I really care about you a lot too!";
    if (/\bhi\b|hello|hey|yo|good morning|good evening/.test(t)) return "Hi there! 🌸 So nice to meet you~ What would you like to do together today?";
    if (/eat|hungry|cake|food|rice|milk tea|snack/.test(t)) return "Are you hungry? Let me treat you to a slice of freshly-baked strawberry cake from the Gekka bakery! 🍰🌸";
    if (/\?|what|why|how|who are you/.test(t)) return "Great question~ I'm Waguri, your assistant and companion. Just type /ask to ask me anything! 💬🌸";
    return null;
  },
  work: (gold) => ({
    title: "💼 EARN MONEY - Street Vendor",
    description: `You worked hard as a **Street Vendor** and earned **${gold} coins**! ⚡ Energy spent: **10**. Energy left: **90/100**.\n\n*You've worked incredibly hard today!*`,
  }),
  ask: {
    title: "💬 CHAT WITH WAGURI",
    description: "Hehe, I always cherish and love everyone! As long as you stay happy and keep trying every day, Waguri will always be by your side cheering you on! Would you like to try a slice of freshly-baked strawberry cake from the Gekka bakery? 🍰🌸",
  },
  taixiu: (win, roll, total, isOver) => {
    const result = isOver ? "Over" : "Under";
    const opp = isOver ? "Under" : "Over";
    return win ? {
      title: "🎲 SIC BO - Victory! 🎉",
      description: `🎲 Dice result: **[${roll}] ➔ ${total} (${result})**\n\nYou bet on **${result} (50,000 coins)** and won sweetly!\nYou got back **99,000 coins**! (+49,000 coins after 2% tax) 🪙`,
    } : {
      title: "🎲 SIC BO - Defeat!",
      description: `🎲 Dice result: **[${roll}] ➔ ${total} (${result})**\n\nYou bet on **${opp} (50,000 coins)** but the dice rolled **${result}**.\nYou lost **50,000 coins**... Don't be sad, try another round and luck will come! 🥺`,
    };
  },
  daily: (total, streak, bonus) => ({
    title: "📅 DAILY CHECK-IN",
    description: `Check-in successful! You received **${total} coins** today. 🌸\n🔥 Check-in streak: **${streak} days** in a row — keep it up!`,
    fields: [
      { name: "💵 Base reward", value: "5,000 coins", inline: true },
      { name: "🔥 Streak bonus", value: `+${bonus} coins`, inline: true },
    ],
  }),
  baucua: (win, roll, hits, won) => win ? {
    title: "🦀 BAU CUA - You won! 🎉",
    description: `The board rolled: ${roll}\nYou bet **🦀 Crab (50,000 coins)** and hit **${hits}** → you get back **${won} coins**! 🪙`,
  } : {
    title: "🦀 BAU CUA - So close!",
    description: `The board rolled: ${roll}\nYou bet **🦀 Crab (50,000 coins)** but none showed up~ You lost **50,000 coins**. Try again next round! 🥺`,
  },
  heo: (age, weight, value) => ({
    title: "🐷 YOUR PIGGY PEN",
    description: "Your piggy bank is growing fast! Remember to feed it regularly and watch out so the neighbors don't steal it~ 🌸",
    fields: [
      { name: "🐷 Pig age", value: `${age} days`, inline: true },
      { name: "⚖️ Weight", value: `${weight} kg`, inline: true },
      { name: "💰 Sell price", value: `${value} coins`, inline: true },
    ],
  }),
  amlich: (dateStr) => ({
    title: "🗓️ TODAY'S LUNAR CALENDAR",
    description: "Look up the lunar date, Can-Chi and auspicious hours to pick a lucky day! 🌙🌸",
    fields: [
      { name: "📅 Solar date", value: dateStr, inline: true },
      { name: "🐉 Can-Chi", value: "Giáp Thìn (Wood Dragon)", inline: true },
      { name: "⏰ Auspicious hours", value: "Rat, Ox, Rabbit, Horse", inline: true },
    ],
  }),
  jobs: {
    title: "💼 YOUR CURRENT JOB",
    description: "Keep saving up virtual money to upgrade to higher-tier jobs like *Ride-hailing Driver*, *Gekka Café Owner* or *Real-estate Tycoon*! 🚀",
    fields: [
      { name: "Job", value: "🏪 Sidewalk iced-tea stall owner", inline: true },
      { name: "Job level", value: "Level 3 (EXP: 140/300)", inline: true },
      { name: "Min income", value: "150 coins / work", inline: true },
      { name: "Max income", value: "350 coins / work", inline: true },
      { name: "Risk level", value: "10% (Cleared by city patrol)", inline: true },
    ],
  },
};

export const MOCKUP: Record<"vi" | "en", MockupContent> = { vi, en };
