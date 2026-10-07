// SPDX-License-Identifier: MIT
import { describe, expect, test } from "bun:test";
import { normalize, parseScript, WordTracker, meterState, TurnGate } from "../src/core";

describe("German scripts", () => {
  test("empty and direction-only scripts have no spoken words", () => {
    expect(parseScript("").words).toHaveLength(0);
    expect(parseScript("[Ruhig. Pause.]").words).toHaveLength(0);
  });
  test("directions and Unicode offsets preserve the exact source", () => {
    const source = "[👋 Ruhig.] Grüße aus Köln. [Pause.] Wir bleiben hier!";
    const script = parseScript(source);
    expect(script.text).toBe(source);
    expect(script.words.map(w => source.slice(w.start, w.end))).toEqual(["Grüße", "aus", "Köln", "Wir", "bleiben", "hier"]);
    expect(script.sentenceStarts).toEqual([0, 3]);
  });
  test("umlauts, sharp s and German numerals normalize", () => {
    expect(normalize("Grüße")).toBe("grusse");
    for (const [digit, spoken] of [["12", "zwölf"], ["21", "einundzwanzig"], ["135", "einhundertfünfunddreißig"], ["2026", "zweitausendsechsundzwanzig"], ["100000", "einhunderttausend"]]) expect(normalize(digit!)).toBe(normalize(spoken!));
  });
});
describe("Word alignment", () => {
  const create = (text: string) => new WordTracker(parseScript(text));
  test("growing partials do not consume a repeated phrase twice", () => {
    const t = create("Wir wollen heute reden. Wir wollen heute reden.");
    expect(t.consume("Wir wollen", "a")).toBe(1);
    expect(t.consume("Wir wollen heute", "a")).toBe(2);
    expect(t.consume("Wir wollen heute reden", "a")).toBe(3);
    expect(t.consume("Wir wollen heute reden", "a")).toBeNull();
    expect(t.cursor).toBe(3);
    expect(t.consume("Wir wollen heute reden", "b")).toBe(7);
  });
  test("revised and delayed results never move backwards", () => {
    const t = create("Heute sprechen wir über eine bessere Zukunft. Danach kommen neue Fragen.");
    t.consume("Heute sprechen wir über eine bessere Zukunft", "a");
    t.consume("Danach kommen neue", "b");
    expect(t.consume("Heute sprechen wir über eine bessere Zukunft", "a")).toBeNull();
    expect(t.cursor).toBe(9);
  });
  test("fillers and skipped words preserve progress", () => {
    const t = create("Wir sprechen heute gemeinsam über dieses wichtige Thema.");
    expect(t.consume("Wir äh sprechen heute über dieses wichtige Thema", "a")).toBe(7);
    expect(t.confidence).toBeGreaterThan(0.65);
  });
  test("split and joined German compounds align", () => {
    const t = create("Die Spracherkennung folgt jedem Wort.");
    expect(t.consume("Die Sprach erkennung folgt", "a")).toBe(2);
    const joined = create("Wir gehen heute Abend nach Hause.");
    expect(joined.consume("Wir gehen heuteabend", "a")).toBe(3);
  });
  test("unrelated speech and isolated far matches do not advance", () => {
    const t = create("Wir reden über die Zukunft. Vielleicht kommt später ein neues Thema.");
    expect(t.consume("Ein rotes Fahrrad steht am Bahnhof", "a")).toBeNull();
    expect(t.consume("Thema", "b")).toBeNull();
    expect(t.cursor).toBe(-1);
  });
  test("blank speech clears match confidence", () => {
    const t = create("Heute reden wir.");
    t.consume("Heute reden", "a");
    t.consume("", "a");
    expect(t.confidence).toBe(0);
    expect(t.cursor).toBe(1);
  });
  test("seek resets utterance anchors", () => {
    const t = create("Wir wollen reden. Wir wollen reden.");
    t.consume("Wir wollen reden", "a");
    t.seek(0);
    expect(t.consume("Wir wollen", "a")).toBe(1);
  });
  test("long growing transcripts remain aligned after the 32 word window", () => {
    const text = Array.from({ length: 120 }, (_, i) => "Wort" + String(i).padStart(3, "0")).join(" ");
    const t = create(text), words = text.split(" ");
    for (let i = 3; i <= 120; i += 3) t.consume(words.slice(0, i).join(" "), "one");
    expect(t.cursor).toBe(119);
  });
});
describe("Voice meter and client turn detection", () => {
  test("silence is neutral", () => expect(meterState(0, 0, 1, false).level).toBe("neutral"));
  test("normal level is green and clipping is red", () => {
    expect(meterState(0.05, 0.3, 0.8, true).level).toBe("green");
    expect(meterState(0.05, 1, 0.8, true).level).toBe("red");
    expect(meterState(0.003, 0.005, 0.1, true).level).toBe("orange");
  });
  test("meter position is bounded", () => {
    expect(meterState(0, 0, 0, false).position).toBe(0);
    expect(meterState(2, 2, 0, true).position).toBe(100);
  });
  test("only a speech turn commits after silence", () => {
    const gate = new TurnGate();
    expect(gate.update(0, 0)).toBe(false);
    expect(gate.update(0.03, 10)).toBe(false);
    expect(gate.update(0.03, 300)).toBe(false);
    expect(gate.update(0, 900)).toBe(false);
    expect(gate.update(0, 1000)).toBe(true);
    expect(gate.update(0, 2000)).toBe(false);
  });
  test("continuous speech is bounded", () => {
    const gate = new TurnGate();
    gate.update(0.03, 0);
    expect(gate.update(0.03, 8100)).toBe(true);
  });
});
