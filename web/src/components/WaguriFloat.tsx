"use client";

import React, { useState, useEffect } from "react";
import { useLanguage } from "./LanguageProvider";

export default function WaguriFloat() {
  const { t } = useLanguage();
  const [showScroll, setShowScroll] = useState(false);
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    // Hiện nút Back to Top khi cuộn xuống 400px
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScroll(true);
      } else {
        setShowScroll(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    
    // Hiện bong bóng chat của Waguri sau 1.5s vào trang
    const timer = setTimeout(() => {
      setShowBubble(true);
    }, 1500);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timer);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3 pointer-events-none">
      {/* Bong bóng chat ngọt ngào của Waguri */}
      <div
        className={`pointer-events-auto max-w-[220px] p-3.5 rounded-2xl bg-[#140c1a]/95 border border-pink-300/20 text-xs text-pink-100 shadow-2xl backdrop-blur-md transition-all duration-500 transform ${
          showBubble 
            ? "opacity-100 translate-y-0 scale-100" 
            : "opacity-0 translate-y-4 scale-95"
        }`}
      >
        <div className="relative">
          <p className="leading-relaxed">
            {t("home.float_bubble")}
          </p>
          <button 
            onClick={() => setShowBubble(false)} 
            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-pink-500/25 hover:bg-pink-500/50 text-[10px] text-pink-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            ✕
          </button>
          {/* Mũi tên nhỏ chỉ xuống avatar */}
          <div className="absolute -bottom-5 right-4 w-3 h-3 bg-[#140c1a] border-r border-b border-pink-300/20 rotate-45" />
        </div>
      </div>

      {/* Floating Waguri Avatar & Back to Top Group */}
      <div className="flex items-center gap-2.5 pointer-events-auto">
        {/* Nút Back to Top */}
        <button
          onClick={scrollToTop}
          className={`p-3 rounded-full bg-[#140c1a]/80 hover:bg-pink-400 hover:text-[#0d0812] border border-pink-300/25 text-pink-300 shadow-xl backdrop-blur-md transition-all duration-300 cursor-pointer transform ${
            showScroll 
              ? "opacity-100 scale-100 translate-y-0" 
              : "opacity-0 scale-75 translate-y-4 pointer-events-none"
          }`}
          title={t("home.float_scroll_top")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>

        {/* Tròn Avatar Waguri */}
        <div 
          onClick={() => setShowBubble(!showBubble)}
          className="relative w-12 h-12 cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300"
          title={t("home.float_chat")}
        >
          <div className="w-full h-full rounded-full border border-pink-300/30 overflow-hidden bg-[#120c1a]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif"
              alt="Waguri Kaoruko"
              className="w-full h-full object-cover"
            />
          </div>
          {/* Online Indicator Green Dot (Nằm ngoài khung overflow-hidden để không bị cắt) */}
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0d0812] rounded-full animate-pulse z-10" />
        </div>
      </div>
    </div>
  );
}
