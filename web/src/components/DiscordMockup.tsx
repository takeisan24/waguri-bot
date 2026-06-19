"use client";

import React, { useState, useEffect, useRef } from "react";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface EmbedData {
  color: string;
  title?: string;
  description?: string;
  fields?: EmbedField[];
  image?: string;
  thumbnail?: string;
  footerText?: string;
  footerIcon?: string;
}

interface Message {
  id: string;
  author: {
    name: string;
    avatar: string;
    isBot: boolean;
  };
  time: string;
  content?: string;
  embed?: EmbedData;
  commandExecuted?: string;
}

const WAGURI_QUOTES = [
  "Bánh kem dâu của Rintaro làm ở tiệm Gekka luôn là ngon nhất! 🍰",
  "Subaru-chan luôn bảo vệ tớ chu đáo, tớ thật may mắn khi có cậu ấy! 👭",
  "Nhìn Rintaro trông hơi ngầu nhưng anh ấy là người dịu dàng nhất tớ từng biết đó~ 🥰",
  "Dù bức tường giữa Kikyo và Chidori có cao đến đâu, chỉ cần chúng mình chân thành thì sẽ vượt qua hết! 🧱🌸",
  "Cố lên nhé! Hôm nay cậu đã vất vả rồi, tớ luôn ở sau cổ vũ cậu! 💪🌸"
];

const BOT_AVATAR = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"; // placeholder for anime avatar
const USER_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3";

export default function DiscordMockup() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
      time: "Hôm nay lúc 16:30",
      content: "🌸 Chào mừng cậu đã ghé thăm thế giới của tớ! Hãy thử tương tác bằng các nút lệnh bên dưới nhé~",
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const addBotResponse = (command: string) => {
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const now = new Date();
      const timeStr = `Hôm nay lúc ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const quote = WAGURI_QUOTES[Math.floor(Math.random() * WAGURI_QUOTES.length)];

      let response: Message;

      if (command === "/work") {
        const randGold = Math.floor(Math.random() * 70) + 30;
        response = {
          id: String(Date.now()),
          author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
          time: timeStr,
          embed: {
            color: "#ff9eaa", // INFO pink
            title: "💼 KIẾM TIỀN - Đứng đường",
            description: `Cậu đã đi làm công việc **Đứng đường** chăm chỉ và kiếm được **${randGold.toLocaleString()} VNĐ**! ⚡ Năng lượng tiêu hao: **10**. Năng lượng còn lại: **90/100**.\n\n*Hôm nay cậu đã làm việc cực kỳ vất vả rồi đấy!*`,
            image: "https://media.tenor.com/gUP3bf_s600AAAAM/waguri-kaoruko.gif",
            footerText: `🌸 Waguri • ${quote}`,
            footerIcon: BOT_AVATAR
          }
        };
      } else if (command === "/ask") {
        response = {
          id: String(Date.now()),
          author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
          time: timeStr,
          embed: {
            color: "#ffb7c5",
            title: "💬 TRÒ CHUYỆN CÙNG WAGURI",
            description: "Hì hì, tớ lúc nào cũng trân trọng và yêu quý mọi người mà! Chỉ cần cậu luôn vui vẻ và cố gắng mỗi ngày, Waguri sẽ luôn đồng hành và cổ vũ cho cậu đấy nhé! Cậu có muốn ăn thử một góc bánh kem dâu mới nướng ở tiệm Gekka không nào? 🍰🌸",
            image: "https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif",
            footerText: `🌸 Waguri • ${quote}`,
            footerIcon: BOT_AVATAR
          }
        };
      } else if (command === "/taixiu") {
        const win = Math.random() > 0.5;
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const dice3 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2 + dice3;
        const resultType = total >= 11 ? "Tài" : "Xỉu";

        response = {
          id: String(Date.now()),
          author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
          time: timeStr,
          embed: win ? {
            color: "#8de0a6", // SUCCESS Green
            title: "🎲 TÀI XỈU - Chiến thắng! 🎉",
            description: `🎲 Kết quả xúc xắc: **[${dice1}, ${dice2}, ${dice3}] ➔ ${total} (${resultType})**\n\nCậu đặt cược vào **${resultType} (50,000 VNĐ)** và đã chiến thắng ngọt ngào!\nCậu nhận lại **99,000 VNĐ**! (+49,000 VNĐ sau thuế 2%) 🪙`,
            image: "https://media.tenor.com/TdCu1_KQmAcAAAAM/kaoruko-waguri-kaoruko.gif",
            footerText: `🌸 Waguri • ${quote}`,
            footerIcon: BOT_AVATAR
          } : {
            color: "#ff8e9e", // ERROR Red
            title: "🎲 TÀI XỈU - Thất bại!",
            description: `🎲 Kết quả xúc xắc: **[${dice1}, ${dice2}, ${dice3}] ➔ ${total} (${resultType})**\n\nCậu đặt cược vào **${resultType === "Tài" ? "Xỉu" : "Tài"} (50,000 VNĐ)** nhưng xúc xắc lại ra **${resultType}**.\nCậu mất trắng **50,000 VNĐ** rồi... Đừng buồn nhé, làm lại ván khác vận may sẽ đến mà! 🥺`,
            image: "https://media.tenor.com/Jz4bNe6EF-wAAAAM/the-fragrant-flower-blooms-with-dignity-kaoru-hana-wa-rin-to-saku.gif",
            footerText: `🌸 Waguri • ${quote}`,
            footerIcon: BOT_AVATAR
          }
        };
      } else {
        response = {
          id: String(Date.now()),
          author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
          time: timeStr,
          embed: {
            color: "#ff9eaa",
            title: "💼 NGHỀ NGHIỆP HIỆN TẠI của Cậu",
            fields: [
              { name: "Nghề nghiệp", value: "🏪 Chủ tiệm trà đá vỉa hè", inline: true },
              { name: "Cấp độ nghề", value: "Cấp 3 (EXP: 140/300)", inline: true },
              { name: "Thu nhập tối thiểu", value: "150 VNĐ / work", inline: true },
              { name: "Thu nhập tối đa", value: "350 VNĐ / work", inline: true },
              { name: "Mức độ rủi ro", value: "10% (Bị đô thị dọn)", inline: true }
            ],
            description: "Cố gắng tích lũy thêm tiền ảo để nâng cấp lên các nghề cao cấp hơn như *Chạy Grab Công Nghệ*, *Chủ quán Gekka* hay *Đại gia Bất Động Sản* nhé! 🚀",
            image: "https://media.tenor.com/WMRHrfBlNmEAAAAM/kaoruko-waguri-waguri-kaoruko.gif",
            footerText: `🌸 Waguri • ${quote}`,
            footerIcon: BOT_AVATAR
          }
        };
      }

      setMessages(prev => [...prev, response]);
    }, 1200);
  };

  const handleCommandClick = (command: string) => {
    if (isTyping) return;

    const now = new Date();
    const timeStr = `Hôm nay lúc ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Add user command message
    const userMsg: Message = {
      id: String(Date.now()),
      author: { name: "Bạn", avatar: USER_AVATAR, isBot: false },
      time: timeStr,
      content: `Đã dùng lệnh: **${command}**`,
      commandExecuted: command
    };

    setMessages(prev => [...prev, userMsg]);
    addBotResponse(command);
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-[#2e2f34] flex flex-col h-[550px] bg-[#313338] text-[#dbdee1] text-sm">
      {/* Discord Window Header */}
      <div className="bg-[#1e1f22] px-4 py-3 flex items-center justify-between border-b border-[#111214] select-none">
        <div className="flex items-center space-x-2">
          <span className="text-[#949ba4] font-bold">#</span>
          <span className="text-white font-semibold tracking-wide">🌸-trò-chuyện-waguri</span>
          <span className="text-[#949ba4] text-xs border-l border-[#4e5058] pl-2 hidden md:inline">
            Căn phòng ngập tràn hoa anh đào và tiếng cười cùng Waguri
          </span>
        </div>
        <div className="flex items-center space-x-3 text-[#b5bac1]">
          <span className="cursor-pointer hover:text-white transition">🔔</span>
          <span className="cursor-pointer hover:text-white transition">📌</span>
          <span className="cursor-pointer hover:text-white transition">👤</span>
        </div>
      </div>

      {/* Main Container: Channels + Chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side Channels (Hidden on mobile) */}
        <div className="w-60 bg-[#2b2d31] p-3 flex-col space-y-4 hidden md:flex select-none">
          <div>
            <div className="text-[11px] font-bold text-[#949ba4] tracking-wider px-2 mb-1 uppercase">
              Kênh Văn Bản
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2 px-2 py-1.5 rounded bg-[#404249] text-white cursor-pointer">
                <span>#</span>
                <span>🌸-trò-chuyện-waguri</span>
              </div>
              <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-[#35373c] hover:text-[#dbdee1] text-[#949ba4] cursor-pointer transition">
                <span>#</span>
                <span>💼-đi-làm-kiếm-tiền</span>
              </div>
              <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-[#35373c] hover:text-[#dbdee1] text-[#949ba4] cursor-pointer transition">
                <span>#</span>
                <span>🎲-cờ-bạc-vui-vẻ</span>
              </div>
              <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-[#35373c] hover:text-[#dbdee1] text-[#949ba4] cursor-pointer transition">
                <span>#</span>
                <span>📢-thành-tựu</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 flex flex-col bg-[#313338] overflow-hidden">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="flex items-start space-x-3 hover:bg-[#2e3035] -mx-4 px-4 py-1 rounded transition group">
                <img
                  src={msg.author.avatar}
                  alt={msg.author.name}
                  className="w-10 h-10 rounded-full object-cover mt-0.5"
                />
                <div className="flex-1 space-y-1 overflow-hidden">
                  <div className="flex items-center space-x-2">
                    <span className={`font-semibold hover:underline cursor-pointer ${msg.author.isBot ? "text-pink-300" : "text-white"}`}>
                      {msg.author.name}
                    </span>
                    {msg.author.isBot && (
                      <span className="bg-[#5865f2] text-white text-[10px] font-bold px-1 py-0.2 rounded uppercase select-none">
                        BOT
                      </span>
                    )}
                    <span className="text-[#949ba4] text-xs">{msg.time}</span>
                  </div>

                  {msg.content && <p className="text-[#dbdee1] break-words whitespace-pre-wrap leading-relaxed">{msg.content}</p>}

                  {/* Discord Rich Embed Render */}
                  {msg.embed && (
                    <div
                      className="max-w-[520px] rounded border-l-4 bg-[#2b2d31] p-3 flex flex-col space-y-3 mt-1.5 overflow-hidden shadow-sm"
                      style={{ borderLeftColor: msg.embed.color }}
                    >
                      {msg.embed.title && (
                        <div className="font-bold text-white text-base hover:underline cursor-pointer">
                          {msg.embed.title}
                        </div>
                      )}
                      
                      {msg.embed.description && (
                        <div className="text-[#dbdee1] text-[13px] leading-relaxed whitespace-pre-wrap">
                          {msg.embed.description}
                        </div>
                      )}

                      {msg.embed.fields && msg.embed.fields.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                          {msg.embed.fields.map((f, idx) => (
                            <div key={idx} className={f.inline ? "" : "col-span-full"}>
                              <div className="font-semibold text-white text-xs mb-0.5">{f.name}</div>
                              <div className="text-[#dbdee1] text-[13px]">{f.value}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.embed.image && (
                        <div className="rounded overflow-hidden max-h-[250px] flex items-center justify-center bg-[#1e1f22]">
                          <img
                            src={msg.embed.image}
                            alt="Waguri Reaction"
                            className="max-w-full max-h-[250px] object-contain rounded"
                          />
                        </div>
                      )}

                      {msg.embed.footerText && (
                        <div className="flex items-center space-x-1.5 pt-1 border-t border-[#35363c] text-[11px] text-[#949ba4]">
                          {msg.embed.footerIcon && (
                            <img
                              src={msg.embed.footerIcon}
                              alt=""
                              className="w-4 h-4 rounded-full object-cover"
                            />
                          )}
                          <span>{msg.embed.footerText}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center space-x-2 text-xs text-[#949ba4] px-4 py-1">
                <div className="flex space-x-1">
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span>Waguri đang gõ...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Interactive Control Buttons */}
          <div className="bg-[#383a40] px-4 py-3 flex flex-wrap items-center gap-2 select-none border-t border-[#2e3035]">
            <span className="text-xs text-[#b5bac1] font-semibold mr-1">Chạy thử lệnh:</span>
            <button
              onClick={() => handleCommandClick("/ask")}
              disabled={isTyping}
              className="px-2.5 py-1.5 text-xs bg-[#ff9eaa] text-[#0d0812] hover:bg-[#ffa1b3] font-bold rounded transition cursor-pointer disabled:opacity-50"
            >
              /ask
            </button>
            <button
              onClick={() => handleCommandClick("/work")}
              disabled={isTyping}
              className="px-2.5 py-1.5 text-xs bg-[#ff9eaa] text-[#0d0812] hover:bg-[#ffa1b3] font-bold rounded transition cursor-pointer disabled:opacity-50"
            >
              /work
            </button>
            <button
              onClick={() => handleCommandClick("/jobs")}
              disabled={isTyping}
              className="px-2.5 py-1.5 text-xs bg-[#ff9eaa] text-[#0d0812] hover:bg-[#ffa1b3] font-bold rounded transition cursor-pointer disabled:opacity-50"
            >
              /jobs
            </button>
            <button
              onClick={() => handleCommandClick("/taixiu")}
              disabled={isTyping}
              className="px-2.5 py-1.5 text-xs bg-[#ff9eaa] text-[#0d0812] hover:bg-[#ffa1b3] font-bold rounded transition cursor-pointer disabled:opacity-50"
            >
              /taixiu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
