import vi from "../locales/vi.json";
import en from "../locales/en.json";

const translations: Record<string, any> = { vi, en };

export function getLanguage(locale: string | null | undefined): "vi" | "en" {
  if (!locale) return "vi";
  const l = locale.toLowerCase();
  if (l.startsWith("en")) return "en";
  return "vi";
}

/**
 * Hàm dịch i18n dùng chung cho cả client và server.
 */
export function t(
  key: string,
  locale: string = "vi",
  params?: Record<string, string | number>
): string {
  const lang = getLanguage(locale);
  const dict = translations[lang] || translations.vi;

  const parts = key.split(".");
  let val: any = dict;
  for (const part of parts) {
    if (val && typeof val === "object" && part in val) {
      val = val[part];
    } else {
      val = null;
      break;
    }
  }

  // Fallback về tiếng Việt nếu tiếng Anh bị thiếu
  if (val == null && lang === "en") {
    let fallbackVal: any = translations.vi;
    for (const part of parts) {
      if (fallbackVal && typeof fallbackVal === "object" && part in fallbackVal) {
        fallbackVal = fallbackVal[part];
      } else {
        fallbackVal = null;
        break;
      }
    }
    val = fallbackVal;
  }

  if (val == null) return key;

  let result = String(val);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(new RegExp(`{${k}}`, "g"), String(v));
    }
  }
  return result;
}

/**
 * Đọc locale từ cookies (Chỉ chạy được ở Server Side).
 */
export async function getLocaleServer(): Promise<"vi" | "en"> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("locale")?.value;
    return getLanguage(cookieLocale);
  } catch {
    return "vi";
  }
}
