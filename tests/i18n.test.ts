// SPDX-License-Identifier: MIT
import { expect, test } from "bun:test";
import { apiLanguage, canonicalLocale, catalogues, rtl, translate, uiLanguage } from "../src/i18n";
import { normalize, parseScript, WordTracker } from "../src/core";
import { spellNumber } from "../src/numbers";

test("platform language negotiation and English fallback", () => {
  expect(uiLanguage(["fr-CA", "en-US"])).toBe("fr");
  expect(uiLanguage(["ja-JP", "es-MX"])).toBe("es");
  expect(uiLanguage(["ja-JP"])).toBe("en");
  expect(translate("Start reading", ["ja-JP", "es-MX"])).toBe("Iniciar lectura");
  expect(translate("Start reading", ["ja-JP"])).toBe("Start reading");
  expect(canonicalLocale("en_GB")).toBe("en-GB");
  expect(canonicalLocale("bad language", "")).toBe("");
  expect(translate("Start reading", "en-GB")).toBe("Start reading");
  expect(translate("Start reading", "de-DE")).toBe("Vorlesen starten");
  expect(translate("Start reading", "fr-CA")).toBe("Commencer la lecture");
  expect(translate("Start reading", "es-MX")).toBe("Iniciar lectura");
  expect(translate("Sentence {0} / {1}", "es", 2, 4)).toBe("Frase 2 / 4");
});
test("all interface catalogues preserve every key and argument", () => {
  for (const catalogue of Object.values(catalogues)) {
    expect(Object.keys(catalogue).sort()).toEqual(Object.keys(catalogues.en).sort());
    for (const key of Object.keys(catalogues.en) as (keyof typeof catalogues.en)[]) {
      expect(catalogue[key].length).toBeGreaterThan(0);
      expect(catalogue[key].match(/\{\d+\}/g) || []).toEqual(catalogues.en[key].match(/\{\d+\}/g) || []);
    }
  }
});
test("OpenAI language hints preserve Chinese regions and do not pin German", () => {
  expect(apiLanguage("en-GB")).toBe("en"); expect(apiLanguage("fr-CA")).toBe("fr");
  expect(apiLanguage("zh-TW")).toBe("zh-tw"); expect(apiLanguage("zh-HK")).toBe("zh-hk");
  expect(rtl("ar-SA")).toBe(true); expect(rtl("en-US")).toBe(false);
});
test("English, French and Spanish numerals align across multiple words", () => {
  for (const [locale, text, spoken] of [
    ["en-GB", "We need 135 new ideas.", "We need one hundred and thirty five new ideas"],
    ["fr-FR", "Nous avons 25 nouvelles idées.", "Nous avons vingt cinq nouvelles idées"],
    ["es-ES", "Tenemos 32 ideas nuevas.", "Tenemos treinta y dos ideas nuevas"],
  ]) {
    const script = parseScript(text!, locale!), tracker = new WordTracker(script);
    expect(tracker.consume(spoken!, "a")).toBe(script.words.length - 1);
  }
  expect(normalize("25", "en")).toBe(normalize("twenty five", "en"));
  expect(spellNumber(80,"fr")).toBe("quatre-vingts");
  expect(spellNumber(21,"es")).toBe("veintiuno");
});
test("non-space scripts, right-to-left text and Unicode ranges", () => {
  for (const [locale, text] of [["zh-CN", "[停顿]你好世界。今天我们一起阅读。"], ["ja-JP", "こんにちは世界。今日は一緒に読みます。"], ["ar-SA", "مرحباً بالعالم. نحن نقرأ هذا النص."]]) {
    const script=parseScript(text!,locale!), tracker=new WordTracker(script);
    expect(script.words.length).toBeGreaterThan(3);
    expect(script.words.map(word => text!.slice(word.start,word.end))).toEqual(script.words.map(word => word.text));
    expect(tracker.consume(script.words.map(word => word.text).join(" "),"a")).toBe(script.words.length-1);
  }
  expect(normalize("कला","hi")).not.toBe(normalize("कल","hi"));
  expect(normalize("İstanbul","tr-TR")).toBe(normalize("istanbul","tr-TR"));
});
