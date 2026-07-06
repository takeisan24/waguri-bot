"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { t as translateFunc } from "../lib/i18n";

interface LanguageContextType {
  locale: "vi" | "en";
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (newLocale: "vi" | "en") => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({
  children,
  locale: initialLocale,
}: {
  children: React.ReactNode;
  locale: "vi" | "en";
}) {
  const [locale, setLocaleState] = useState<"vi" | "en">(initialLocale);

  // Đồng bộ hóa khi server thay đổi hoặc cookie cập nhật
  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  const setLocale = (newLocale: "vi" | "en") => {
    setLocaleState(newLocale);
    // Set cookie trực tiếp ở client-side
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    // Refresh lại trang để server-side nhận cookie mới và re-render chuẩn
    window.location.reload();
  };

  const t = (key: string, params?: Record<string, string | number>) => {
    return translateFunc(key, locale, params);
  };

  return (
    <LanguageContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
