"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "./LanguageProvider";

export default function LanguageSelector() {
  const { locale, setLocale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const languages = [
    { code: "vi" as const, name: "Tiếng Việt", flag: "🇻🇳" },
    { code: "en" as const, name: "English", flag: "🇺🇸" },
  ];

  const currentLang = languages.find((lang) => lang.code === locale) || languages[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-pink-300/20 text-pink-200 hover:text-white hover:border-pink-300/40 bg-[#0d0812]/40 backdrop-blur-sm transition-all focus:outline-none cursor-pointer"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>{currentLang.flag}</span>
        <span className="uppercase">{currentLang.code}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-32 origin-top-right rounded-xl border border-pink-300/10 bg-[#0d0812]/95 backdrop-blur-md shadow-[0_4px_20px_rgba(255,183,197,0.15)] ring-1 ring-black/5 focus:outline-none z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="py-1">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLocale(lang.code);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-4 py-2 text-xs text-left cursor-pointer transition-colors ${
                  locale === lang.code
                    ? "bg-pink-500/20 text-pink-300 font-bold"
                    : "text-slate-300 hover:bg-pink-500/5 hover:text-pink-100"
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
