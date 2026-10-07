// SPDX-License-Identifier: MIT
export const MAX_TEXT = 50_000;
export const DEMO = "[Ruhig in die Kamera schauen.]\nWillkommen zu unserem kurzen Beispiel. Dieser Teleprompter folgt den gesprochenen Wörtern. Du kannst langsam lesen, eine Pause machen und danach weiterreden. Der Text bleibt in einer schmalen Spalte in der Mitte. So bleibt dein Blick nah an der Kamera. Viel Erfolg bei deiner Aufnahme!";

const units = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
function germanNumber(n: number): string {
  if (n < 10) return units[n]!;
  if (n < 20) return ["zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"][n - 10]!;
  if (n < 100) {
    const tens = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"][Math.floor(n / 10)]!;
    return (n % 10 ? (n % 10 === 1 ? "ein" : units[n % 10]) + "und" : "") + tens;
  }
  const base = n < 1000 ? 100 : 1000;
  const head = Math.floor(n / base);
  return (head === 1 ? "ein" : germanNumber(head)) + (base === 100 ? "hundert" : "tausend") + (n % base ? germanNumber(n % base) : "");
}

export function normalize(word: string): string {
  let value = word.toLocaleLowerCase("de");
  if (/^\d+$/.test(value) && +value < 1_000_000) value = germanNumber(+value);
  return value.replaceAll("ß", "ss").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}
export function tokens(text: string): string[] {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:[’'][\p{L}]+)?/gu)].map(m => normalize(m[0]));
}
export interface Word { text: string; normalized: string; start: number; end: number; sentence: number }
export interface Script { text: string; words: Word[]; sentenceStarts: number[] }
export function parseScript(text: string): Script {
  const words: Word[] = [], sentenceStarts: number[] = [];
  const spoken = text.replace(/\[[^\]]*\]/g, cue => " ".repeat(cue.length));
  const segments = new Intl.Segmenter("de", { granularity: "sentence" }).segment(spoken);
  for (const segment of segments) {
    const matches = [...segment.segment.matchAll(/[\p{L}\p{N}]+(?:[’'][\p{L}]+)?/gu)];
    if (!matches.length) continue;
    const sentence = sentenceStarts.length;
    sentenceStarts.push(words.length);
    for (const match of matches) {
      const start = segment.index + match.index!;
      words.push({ text: text.slice(start, start + match[0].length), normalized: normalize(match[0]), start, end: start + match[0].length, sentence });
    }
  }
  return { text, words, sentenceStarts };
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
    const all = tokens(transcript);
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
    const reference = this.script.words.slice(start, end).map(w => w.normalized);
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
      if (i >= 2 && heard[i - 2]! + heard[i - 1]! === reference[j - 1]) {
        const c = { ...table[i - 2]![j - 1]! };
        c.score += 5; c.matches += 2; c.exact += 2;
        if (c.start < 0) c.start = j - 1;
        c.lastHeard = i - 1; c.lastScript = j - 1; choices.push(c);
      }
      if (j >= 2 && reference[j - 2]! + reference[j - 1]! === heard[i - 1]) {
        const c = { ...table[i - 1]![j - 2]! };
        c.score += 4; c.matches++; c.exact++;
        if (c.start < 0) c.start = j - 2;
        c.lastHeard = i - 1; c.lastScript = j - 1; choices.push(c);
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
  const label = !recentSpeech ? "Warte auf Sprache" : level === "red" ? "Zu laut" : level === "orange" ? "Zu leise" : level === "yellow" ? "Pegel anpassen" : "Pegel gut";
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
