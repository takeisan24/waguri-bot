"use client";

/* Ảnh trong mockup là avatar/reaction từ nhiều CDN Discord bất kỳ, chỉ mang tính
   trang trí — dùng <img> cố ý thay cho next/image (không cần tối ưu LCP/remotePatterns). */
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "./LanguageProvider";
import { MOCKUP, type MockEmbedText } from "../data/mockup";

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

const BOT_AVATAR = "/waguri-avatar.svg";
const USER_AVATAR = "/user-avatar.svg";

export default function DiscordMockup() {
  const { locale } = useLanguage();
  const M = MOCKUP[locale === "en" ? "en" : "vi"];
  const fmt = (n: number) => n.toLocaleString(locale === "en" ? "en-US" : "vi-VN");

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
      time: M.todayAt("16:30"),
      content: M.initialMsg,
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(1);
  const nextId = () => String(++idRef.current); // id ổn định cho React key (tránh Date.now() impure)

  const scrollToBottom = () => {
    // Chỉ cuộn TRONG khung chat (container overflow-y-auto), KHÔNG cuộn cả trang
    // — scrollIntoView trước đây kéo cả trang xuống mockup khi vừa tải.
    const container = messagesEndRef.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const addBotResponse = (command: string) => {
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const now = new Date();
      const timeStr = M.todayAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      const quote = M.quotes[Math.floor(Math.random() * M.quotes.length)];
      const footerText = `🌸 Waguri • ${quote}`;

      // Dựng message bot từ text embed (song ngữ) + phần trang trí (color/image/footer).
      const mk = (color: string, text: MockEmbedText, image?: string): Message => ({
        id: nextId(),
        author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
        time: timeStr,
        embed: { color, ...text, image, footerText, footerIcon: BOT_AVATAR },
      });

      const WIN_GIF = "https://media.tenor.com/TdCu1_KQmAcAAAAM/kaoruko-waguri-kaoruko.gif";
      const LOSE_GIF = "https://media.tenor.com/Jz4bNe6EF-wAAAAM/the-fragrant-flower-blooms-with-dignity-kaoru-hana-wa-rin-to-saku.gif";
      let response: Message;

      if (command === "/work") {
        const gold = Math.floor(Math.random() * 70) + 30;
        response = mk("#ff9eaa", M.work(fmt(gold)), "https://media.tenor.com/gUP3bf_s600AAAAM/waguri-kaoruko.gif");
      } else if (command === "/ask") {
        response = mk("#ffb7c5", M.ask, "https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif");
      } else if (command === "/taixiu") {
        const win = Math.random() > 0.5;
        const d = [0, 1, 2].map(() => Math.floor(Math.random() * 6) + 1);
        const total = d[0] + d[1] + d[2];
        response = mk(win ? "#8de0a6" : "#ff8e9e", M.taixiu(win, d.join(", "), total, total >= 11), win ? WIN_GIF : LOSE_GIF);
      } else if (command === "/daily") {
        const streak = Math.floor(Math.random() * 15) + 1;
        const bonus = streak * 500;
        response = mk("#8de0a6", M.daily(fmt(5000 + bonus), streak, fmt(bonus)), "https://media.tenor.com/gUP3bf_s600AAAAM/waguri-kaoruko.gif");
      } else if (command === "/baucua") {
        const symbols = ["🦌", "🦀", "🐓", "🐟", "🦐", "🍐"];
        const roll = [0, 1, 2].map(() => symbols[Math.floor(Math.random() * 6)]);
        const hits = roll.filter((s) => s === "🦀").length;
        const win = hits > 0;
        response = mk(win ? "#8de0a6" : "#ff8e9e", M.baucua(win, roll.join("  "), hits, fmt(hits * 50000)), win ? WIN_GIF : LOSE_GIF);
      } else if (command === "/heo") {
        const age = Math.floor(Math.random() * 20) + 5;
        const weight = (age * 1.3 + 2).toFixed(1);
        const value = Math.floor(age * 1500) + 10000;
        response = mk("#ffb7c5", M.heo(age, weight, fmt(value)), "https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif");
      } else if (command === "/amlich") {
        response = mk("#d8b4fe", M.amlich(now.toLocaleDateString(locale === "en" ? "en-US" : "vi-VN")), "https://media.tenor.com/WMRHrfBlNmEAAAAM/kaoruko-waguri-waguri-kaoruko.gif");
      } else {
        response = mk("#ff9eaa", M.jobs, "https://media.tenor.com/WMRHrfBlNmEAAAAM/kaoruko-waguri-waguri-kaoruko.gif");
      }

      setMessages(prev => [...prev, response]);
    }, 1200);
  };

  const nowHm = () => {
    const n = new Date();
    return M.todayAt(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`);
  };

  const handleCommandClick = (command: string) => {
    if (isTyping) return;

    // Add user command message
    const userMsg: Message = {
      id: nextId(),
      author: { name: M.you, avatar: USER_AVATAR, isBot: false },
      time: nowHm(),
      content: M.usedCommand(command),
      commandExecuted: command
    };

    setMessages(prev => [...prev, userMsg]);
    addBotResponse(command);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || isTyping) return;

    setMessages(prev => [...prev, {
      id: nextId(),
      author: { name: M.you, avatar: USER_AVATAR, isBot: false },
      time: nowHm(),
      content: text,
    }]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const reply = M.keyword(text.toLowerCase()) ?? M.replies[Math.floor(Math.random() * M.replies.length)];
      setMessages(prev => [...prev, {
        id: nextId(),
        author: { name: "Waguri", avatar: BOT_AVATAR, isBot: true },
        time: nowHm(),
        content: reply,
      }]);
    }, 1200);
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-[#2e2f34] flex flex-col h-[550px] bg-[#313338] text-[#dbdee1] text-sm">
      {/* Discord Window Header */}
      <div className="bg-[#1e1f22] px-4 py-3 flex items-center justify-between border-b border-[#111214] select-none">
        <div className="flex items-center space-x-2">
          <span className="text-[#949ba4] font-bold">#</span>
          <span className="text-white font-semibold tracking-wide">{M.channels[0]}</span>
          <span className="text-[#949ba4] text-xs border-l border-[#4e5058] pl-2 hidden md:inline">
            {M.headerTopic}
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
              {M.channelsTitle}
            </div>
            <div className="space-y-0.5">
              {M.channels.map((ch, i) => (
                <div
                  key={i}
                  className={`flex items-center space-x-2 px-2 py-1.5 rounded cursor-pointer transition ${
                    i === 0
                      ? "bg-[#404249] text-white"
                      : "hover:bg-[#35373c] hover:text-[#dbdee1] text-[#949ba4]"
                  }`}
                >
                  <span>#</span>
                  <span>{ch}</span>
                </div>
              ))}
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
                <span>{M.typing}</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Ô nhập tin nhắn — gõ chuyện trực tiếp với Waguri */}
          <div className="px-4 pt-3 bg-[#383a40] border-t border-[#2e3035]">
            <div className="flex items-center gap-2 bg-[#404249] rounded-lg px-3 py-2.5">
              <span className="text-[#b5bac1] text-lg leading-none">＋</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                placeholder={M.placeholder}
                aria-label={M.inputAria}
                className="flex-1 bg-transparent outline-none text-sm text-[#dbdee1] placeholder:text-[#6d6f78]"
              />
              <button
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                aria-label={M.sendAria}
                className="text-pink-300 hover:text-pink-200 disabled:opacity-30 transition text-lg leading-none cursor-pointer"
              >
                ➤
              </button>
            </div>
          </div>

          {/* Nút chạy thử lệnh */}
          <div className="bg-[#383a40] px-4 py-3 flex flex-wrap items-center gap-2 select-none">
            <span className="text-xs text-[#b5bac1] font-semibold mr-1">{M.tryPrefix}</span>
            {["/ask", "/work", "/jobs", "/taixiu", "/daily", "/baucua", "/heo", "/amlich"].map((cmd) => (
              <button
                key={cmd}
                onClick={() => handleCommandClick(cmd)}
                disabled={isTyping}
                className="px-2.5 py-1.5 text-xs bg-[#ff9eaa] text-[#0d0812] hover:bg-[#ffa1b3] font-bold rounded transition cursor-pointer disabled:opacity-50"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
