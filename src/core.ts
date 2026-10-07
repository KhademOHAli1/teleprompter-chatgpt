// SPDX-License-Identifier: MIT
export const MAX_TEXT = 50_000;
import { canonicalLocale, systemLocale, t } from "./i18n";
import { spellNumber } from "./numbers";
export function normalize(word: string, locale = systemLocale()): string {
  locale = canonicalLocale(locale);
  let value = word.toLocaleLowerCase(locale);
  if (/^\d+$/.test(value) && +value < 1_000_000) value = spellNumber(+value, new Intl.Locale(locale).language);
  value = value.replaceAll("ß", "ss").normalize("NFC");
  if (/\p{Script=Latin}/u.test(value)) value = value.normalize("NFD").replace(/\p{M}/gu, "");
  return value.replace(/[^\p{L}\p{N}\p{M}]/gu, "");
}
function wordSegments(text: string, locale: string) {
  return [...new Intl.Segmenter(canonicalLocale(locale), { granularity: "word" }).segment(text)].filter(segment => segment.isWordLike);
}
export function tokens(text: string, locale = systemLocale()): string[] {
  return wordSegments(text, locale).map(segment => normalize(segment.segment, locale)).filter(Boolean);
}
export interface Word { text: string; normalized: string; start: number; end: number; sentence: number }
export interface Script { text: string; locale: string; words: Word[]; sentenceStarts: number[] }
export function parseScript(text: string, locale = systemLocale()): Script {
  locale = canonicalLocale(locale);
  const words: Word[] = [], sentenceStarts: number[] = [];
  const spoken = text.replace(/\[[^\]]*\]/g, cue => " ".repeat(cue.length));
  const segments = new Intl.Segmenter(locale, { granularity: "sentence" }).segment(spoken);
  for (const segment of segments) {
    const matches = wordSegments(segment.segment, locale);
    if (!matches.length) continue;
    const sentence = sentenceStarts.length;
    sentenceStarts.push(words.length);
    for (const match of matches) {
      const start = segment.index + match.index;
      words.push({ text: text.slice(start, start + match.segment.length), normalized: normalize(match.segment, locale), start, end: start + match.segment.length, sentence });
    }
  }
  return { text, locale, words, sentenceStarts };
}
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > Math.max(2, Math.max(a.length, b.length) / 4)) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < b.length; j++) row.push(Math.min(row[j]! + 1, previous[j + 1]! + 1, previous[j]! + (a[i] === b[j] ? 0 : 1)));
    previous = row;
  }
  const score = 1 - previous[b.length]! / Math.max(a.length, b.length);
  return score >= 0.78 ? score : 0;
}
interface Cell { score: number; matches: number; exact: number; start: number; lastHeard: number; lastScript: number }
const emptyCell = (): Cell => ({ score: 0, matches: 0, exact: 0, start: -1, lastHeard: -1, lastScript: -1 });

/** Growing/revised ASR results keep one anchor; repeated phrases cannot replay progress. */
export class WordTracker {
  cursor = -1;
  confidence = 0;
  private utterances = new Map<string, { anchor: number; last: string }>();
  constructor(readonly script: Script) {}
  seek(nextWord: number) {
    this.cursor = Math.max(-1, Math.min(nextWord - 1, this.script.words.length - 1));
    this.confidence = 0;
    this.utterances.clear();
  }
  consume(transcript: string, id: string): number | null {
    const all = tokens(transcript, this.script.locale);
    if (!all.length || !this.script.words.length) { this.confidence = 0; return null; }
    if (!this.utterances.has(id)) {
      this.utterances.set(id, { anchor: this.cursor + 1, last: "" });
      if (this.utterances.size > 80) this.utterances.delete(this.utterances.keys().next().value!);
    }
    const utterance = this.utterances.get(id)!;
    const key = all.join(" ");
    if (key === utterance.last) return null;
    utterance.last = key;
    const heard = all.slice(-32);
    const expected = Math.min(this.script.words.length - 1, utterance.anchor + all.length - 1);
    const start = Math.max(0, Math.min(this.cursor - 18, expected - heard.length - 12));
    const end = Math.min(this.script.words.length, Math.max(this.cursor + 72, expected + 32));
    const referenceWords = this.script.words.slice(start, end);
    const reference = referenceWords.map(w => w.normalized);
    const numerals = referenceWords.map(w => /^\p{N}+$/u.test(w.text));
    const english = new Intl.Locale(this.script.locale).language === "en";
    const n = heard.length, m = reference.length;
    const table = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, emptyCell));
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const match = similarity(heard[i - 1]!, reference[j - 1]!);
      const diagonal = { ...table[i - 1]![j - 1]! };
      diagonal.score += match ? 3 * match : -2.4;
      if (match) {
        diagonal.matches++; diagonal.exact += match === 1 ? 1 : 0;
        if (diagonal.start < 0) diagonal.start = j - 1;
        diagonal.lastHeard = i - 1; diagonal.lastScript = j - 1;
      }
      const choices = [emptyCell(), diagonal,
        { ...table[i - 1]![j]!, score: table[i - 1]![j]!.score - 1.2 },
        { ...table[i]![j - 1]!, score: table[i]![j - 1]!.score - 1.7 }];
      for (let length=2; length<=Math.min(8,i); length++) {
        const span=heard.slice(i-length,i), numeral=numerals[j-1];
        const englishNumber=numeral && english && span.filter(word => word!=="and").join("")===reference[j-1];
        if (span.join("")!==reference[j-1] && !englishNumber) continue;
        const c={...table[i-length]![j-1]!};
        c.score+=length*3-1; c.matches+=length; c.exact+=length;
        if (c.start<0) c.start=j-1;
        c.lastHeard=i-1; c.lastScript=j-1; choices.push(c);
      }
      for (let length=2; length<=Math.min(8,j); length++) {
        if (reference.slice(j-length,j).join("")!==heard[i-1]) continue;
        const c={...table[i-1]![j-length]!};
        c.score+=length+2; c.matches++; c.exact++;
        if(c.start<0)c.start=j-length;
        c.lastHeard=i-1;c.lastScript=j-1;choices.push(c);
      }
      table[i]![j] = choices.reduce((a, b) => b.score > a.score ? b : a);
    }
    let best: { index: number; quality: number; rank: number } | undefined;
    for (let j = 1; j <= m; j++) {
      const c = table[n]![j]!, candidate = start + c.lastScript, quality = c.matches / n, jump = candidate - this.cursor;
      if (c.lastScript !== j - 1 || c.lastHeard < n - 2 || !c.matches || candidate < this.cursor || quality < 0.48) continue;
      if ((jump > 3 && c.exact < 2) || (jump > 12 && c.exact < 3) || (jump > 35 && c.exact < 5) || (n === 1 && jump > 2)) continue;
      const rank = c.score - 0.12 * Math.abs(candidate - expected);
      if (!best || rank > best.rank) best = { index: candidate, quality, rank };
    }
    if (!best) { this.confidence = 0; return null; }
    this.confidence = Math.min(1, best.quality);
    if (best.index <= this.cursor) return null;
    this.cursor = best.index;
    return this.cursor;
  }
}

export function meterState(rms: number, peak: number, match: number, recentSpeech: boolean) {
  const db = Math.max(-70, 20 * Math.log10(Math.max(0.00001, rms)));
  const position = Math.max(0, Math.min(100, (db + 55) / 55 * 100));
  const level = !recentSpeech ? "neutral" : peak >= 0.98 || db > -8 ? "red" : db < -40 ? "orange" : db < -34 || db > -12 ? "yellow" : "green";
  const label = t(!recentSpeech ? "Waiting for speech" : level === "red" ? "Too loud" : level === "orange" ? "Too quiet" : level === "yellow" ? "Adjust level" : "Level good");
  return { db, position, level, label, matched: recentSpeech && match >= 0.65 };
}

/** Client VAD commits once per turn and bounds continuous speech to eight seconds. */
export class TurnGate {
  private active = false;
  private started = 0;
  private lastVoice = 0;
  update(rms: number, now: number): boolean {
    if (rms > 0.009) {
      if (!this.active) { this.active = true; this.started = now; }
      this.lastVoice = now;
    }
    if (this.active && now - this.started >= 250 && (now - this.lastVoice > 650 || now - this.started > 8000)) {
      this.active = false; return true;
    }
    return false;
  }
}
