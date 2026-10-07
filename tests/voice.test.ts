// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, expect, test } from "bun:test";
import { VoiceSession } from "../src/voice";
type SavedDescriptor = [string, PropertyDescriptor | undefined];
let saved: SavedDescriptor[] = [], stoppedTracks = 0, closedContexts = 0, transcriptCount = 0, abortCount = 0;
let micAllowed = true, media: () => Promise<MediaStream>, resume: () => Promise<void>;
let recognition: FakeRecognition | undefined;
class FakeRecognition {
  lang = ""; continuous = false; interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() { recognition = this; }
  abort() { abortCount++; }
}
class FakeContext {
  resume() { return resume(); }
  close() { closedContexts++; return Promise.resolve(); }
  createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(data: Float32Array) { data.fill(0); } }; }
  createMediaStreamSource() { return { connect() {} }; }
}
function fakeStream(): MediaStream {
  const track = { onended: null, stop() { stoppedTracks++; } };
  return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
}
function replace(name: string, value: unknown) {
  saved.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
beforeEach(() => {
  stoppedTracks = closedContexts = transcriptCount = abortCount = 0; recognition = undefined; micAllowed = true;
  media = async () => fakeStream(); resume = async () => {};
  replace("window", { SpeechRecognition: FakeRecognition });
  replace("document", { permissionsPolicy: { allowsFeature: () => micAllowed } });
  replace("navigator", { mediaDevices: { getUserMedia: () => media() } });
  replace("AudioContext", FakeContext);
  replace("requestAnimationFrame", () => 1);
  replace("cancelAnimationFrame", () => {});
});
afterEach(() => {
  for (const [name, descriptor] of saved.reverse()) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  saved = [];
});
const callbacks = () => ({ transcript() { transcriptCount++; }, level() {}, stopped() {} });
const token = async () => ({ value: "ephemeral-test-value", expiresAt: 1_900_000_000 });
test("host-denied microphone fails before capture or credential creation", async () => {
  micAllowed = false;
  let microphoneCalls = 0, tokenCalls = 0;
  media = async () => { microphoneCalls++; return fakeStream(); };
  const voice = new VoiceSession(callbacks());
  await expect(voice.start("openai", async () => { tokenCalls++; return token(); })).rejects.toThrow("does not allow microphone access");
  expect(microphoneCalls).toBe(0); expect(tokenCalls).toBe(0);
});
test("cancelling a pending microphone prompt stops the late stream", async () => {
  let release!: (stream: MediaStream) => void;
  media = () => new Promise(resolve => { release = resolve; });
  const voice = new VoiceSession(callbacks());
  const pending = voice.start("browser", token);
  voice.stop(); release(fakeStream()); await pending;
  expect(stoppedTracks).toBe(1); expect(recognition).toBeUndefined();
});
test("audio initialization failure releases the microphone", async () => {
  resume = async () => { throw new Error("Audio failure"); };
  const voice = new VoiceSession(callbacks());
  await expect(voice.start("browser", token)).rejects.toThrow("Audio failure");
  expect(stoppedTracks).toBe(1); expect(closedContexts).toBe(1);
});
test("pausing browser recognition releases all capture resources", async () => {
  const voice = new VoiceSession(callbacks());
  await voice.start("browser", token);
  const oldHandler = recognition!.onresult!;
  oldHandler({ resultIndex: 0, results: [{ 0: { transcript: "Heute reden wir" }, isFinal: false }] });
  expect(transcriptCount).toBe(1);
  voice.stop();
  oldHandler({ resultIndex: 0, results: [{ 0: { transcript: "Heute reden wir weiter" }, isFinal: true }] });
  expect(transcriptCount).toBe(1); expect(stoppedTracks).toBe(1); expect(closedContexts).toBe(1); expect(abortCount).toBe(1);
});
test("cancelling token creation cannot create a late OpenAI connection", async () => {
  let release!: (value: Awaited<ReturnType<typeof token>>) => void;
  let requested!: () => void;
  const tokenRequested = new Promise<void>(resolve => { requested = resolve; });
  const voice = new VoiceSession(callbacks());
  const pending = voice.start("openai", () => { requested(); return new Promise(resolve => { release = resolve; }); });
  await tokenRequested; voice.stop(); release(await token()); await pending;
  expect(stoppedTracks).toBe(1); expect(closedContexts).toBe(1);
});

test("browser recognition uses the selected regional speech locale", async () => {
  const voice = new VoiceSession(callbacks());
  await voice.start("browser", token, "en-GB");
  expect(recognition!.lang).toBe("en-GB");
  voice.stop();
  await voice.start("browser", token, "fr-CA");
  expect(recognition!.lang).toBe("fr-CA");
  voice.stop();
});
