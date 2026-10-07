// SPDX-License-Identifier: MIT
// Intl has no spell-out formatter. These small rules cover the shipped UI languages;
// other languages retain literal numerals, with provider-specific spoken-number limits.
const under20 = {
  en: ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"],
  de: ["null","eins","zwei","drei","vier","fünf","sechs","sieben","acht","neun","zehn","elf","zwölf","dreizehn","vierzehn","fünfzehn","sechzehn","siebzehn","achtzehn","neunzehn"],
  fr: ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf"],
  es: ["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve"],
};
export function spellNumber(n: number, language: string): string {
  if (!(language in under20) || n < 0 || n >= 1_000_000) return String(n);
  const lang = language as keyof typeof under20, units = under20[lang];
  if (n < 20) return units[n]!;
  if (n < 100) {
    const rest=n%10, tens=Math.floor(n/10);
    if (lang === "de") return (rest ? (rest === 1 ? "ein" : units[rest]) + "und" : "") + ["","","zwanzig","dreißig","vierzig","fünfzig","sechzig","siebzig","achtzig","neunzig"][tens];
    if (lang === "en") return ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"][tens] + (rest ? " " + units[rest] : "");
    if (lang === "fr") {
      if (n >= 80) return "quatre-vingt" + (n === 80 ? "s" : "-" + spellNumber(n-80,lang));
      if (n >= 70) return "soixante" + (n === 71 ? " et " : "-") + spellNumber(n-60,lang);
      return ["","","vingt","trente","quarante","cinquante","soixante"][tens] + (rest ? (rest===1 ? " et " : "-") + units[rest] : "");
    }
    if (n < 30) return n === 20 ? "veinte" : ["","veintiuno","veintidós","veintitrés","veinticuatro","veinticinco","veintiséis","veintisiete","veintiocho","veintinueve"][rest]!;
    return ["","","","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"][tens] + (rest ? " y " + units[rest] : "");
  }
  const base=n<1000?100:1000, head=Math.floor(n/base), rest=n%base;
  if (lang === "de") return (head === 1 ? "ein" : spellNumber(head,lang)) + (base === 100 ? "hundert" : "tausend") + (rest ? spellNumber(rest,lang) : "");
  if (lang === "en") return spellNumber(head,lang) + (base === 100 ? " hundred" : " thousand") + (rest ? " " + spellNumber(rest,lang) : "");
  if (lang === "fr") return (head===1 ? "" : spellNumber(head,lang)+" ") + (base===100 ? "cent"+(head>1 && !rest?"s":"") : "mille") + (rest?" "+spellNumber(rest,lang):"");
  if (base===100) return (n===100?"cien":["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"][head]) + (rest?" "+spellNumber(rest,lang):"");
  return (head===1?"":spellNumber(head,lang)+" ")+"mil"+(rest?" "+spellNumber(rest,lang):"");
}
