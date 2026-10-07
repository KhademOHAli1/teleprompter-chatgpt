// SPDX-License-Identifier: MIT
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
export const catalogues = { en, de, fr, es };
export type Message = keyof typeof en;
export type UiLanguage = keyof typeof catalogues;

export function canonicalLocale(value: unknown, fallback = "en-US"): string {
  if (typeof value !== "string" || value.length > 100) return fallback;
  try { return Intl.getCanonicalLocales(value.replaceAll("_", "-"))[0] || fallback; } catch { return fallback; }
}
export function uiLanguage(preferences: readonly string[]): UiLanguage {
  for (const preference of preferences) {
    const code = canonicalLocale(preference, "").split("-")[0];
    if (code && code in catalogues) return code as UiLanguage;
  }
  return "en";
}
export function systemLocale(): string {
  return canonicalLocale(typeof navigator !== "undefined" ? navigator.languages?.[0] || navigator.language : undefined);
}
let preferences = typeof navigator !== "undefined" ? [...(navigator.languages || [navigator.language])] : ["en-US"];
export function setLocale(locale?: string): void { preferences = locale ? [canonicalLocale(locale)] : typeof navigator !== "undefined" ? [...navigator.languages] : ["en-US"]; }
export function currentLocale(): string { return canonicalLocale(preferences[0]); }
export function t(key: Message, ...args: (string | number)[]): string {
  return translate(key, preferences, ...args);
}
export function translate(key: Message, locale: string | readonly string[], ...args: (string | number)[]): string {
  const language = uiLanguage(typeof locale === "string" ? [locale] : locale);
  return catalogues[language][key].replace(/\{(\d+)\}/g, (match, index: string) => String(args[Number(index)] ?? match));
}
export function number(value: number): string { return new Intl.NumberFormat(currentLocale()).format(value); }
export function apiLanguage(locale: string): string {
  const tag = new Intl.Locale(canonicalLocale(locale));
  if (tag.language === "zh" && tag.region && ["CN", "TW", "HK"].includes(tag.region)) return "zh-" + tag.region.toLowerCase();
  return tag.language;
}
export const speechLocales = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "es-MX", "pt-BR", "pt-PT", "it-IT", "nl-NL", "da-DK", "sv-SE", "nb-NO", "fi-FI", "pl-PL", "cs-CZ", "sk-SK", "hu-HU", "ro-RO", "el-GR", "tr-TR", "ru-RU", "uk-UA", "ar-SA", "he-IL", "fa-IR", "hi-IN", "bn-IN", "ta-IN", "te-IN", "id-ID", "ms-MY", "vi-VN", "th-TH", "ja-JP", "ko-KR", "zh-CN", "zh-TW", "zh-HK"];
export const rtl = (locale: string) => ["ar", "fa", "he", "ur", "ps", "dv", "yi"].includes(new Intl.Locale(canonicalLocale(locale)).language);
export function localizeDocument(): void {
  document.documentElement.lang = uiLanguage(preferences);
  document.documentElement.dir = "ltr"; // The four shipped UI translations are left to right.
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) element.textContent = t(element.dataset.i18n as Message);
  for (const attribute of ["placeholder", "aria-label", "title"])
    for (const element of document.querySelectorAll<HTMLElement>("[data-i18n-" + attribute + "]")) element.setAttribute(attribute, t(element.getAttribute("data-i18n-" + attribute) as Message));
}
