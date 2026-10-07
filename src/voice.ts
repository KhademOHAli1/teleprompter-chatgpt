// SPDX-License-Identifier: MIT
import { TurnGate } from "./core";
export type Provider = "browser" | "openai";
type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
}
type RecognitionClass = new () => Recognition;
function speechClass(): RecognitionClass | undefined {
  const browser = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}
export const browserSpeechAvailable = () => Boolean(speechClass());
export interface VoiceCallbacks {
  transcript(text: string, id: string): void;
  level(rms: number, peak: number, recent: boolean): void;
  stopped(message: string): void;
}
export interface Token { value: string; expiresAt: number }
export class VoiceSession {
  private generation = 0;
  private stream?: MediaStream;
  private context?: AudioContext;
  private recognition?: Recognition;
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private abort?: AbortController;
  private raf = 0;
  private limit?: ReturnType<typeof setTimeout>;
  private active = false;
  constructor(private callbacks: VoiceCallbacks) {}
  async start(provider: Provider, getToken: () => Promise<Token>) {
    this.stop();
    const generation = this.generation;
    const policy = (document as unknown as { permissionsPolicy?: { allowsFeature(feature: string): boolean } }).permissionsPolicy;
    if (policy && !policy.allowsFeature("microphone")) throw new Error("Dieser Host erlaubt der App keinen Mikrofonzugriff. Nutze Auto-Scroll oder die native Mac-App.");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Mikrofonzugriff ist hier nicht verfügbar. Nutze Auto-Scroll.");
    if (provider === "browser" && !speechClass()) throw new Error("Dieser Browser bietet keine Spracherkennung. Wähle OpenAI oder Auto-Scroll.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    stream.getAudioTracks()[0]!.onended = () => this.fail("Das Mikrofon wurde getrennt.");
    try {
      this.context = new AudioContext();
      await this.context.resume();
    } catch (error) { if (generation === this.generation) this.stop(); throw error; }
    if (generation !== this.generation) return;
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 1024;
    this.context.createMediaStreamSource(stream).connect(analyser);
    this.active = true;
    const data = new Float32Array(analyser.fftSize), gate = new TurnGate();
    let lastSpeech = -Infinity, clippedUntil = 0;
    const frame = () => {
      if (!this.active || generation !== this.generation) return;
      analyser.getFloatTimeDomainData(data);
      let sum = 0, peak = 0;
      for (const sample of data) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
      const rms = Math.sqrt(sum / data.length), now = performance.now();
      if (rms > 0.009) lastSpeech = now;
      if (peak >= 0.98) clippedUntil = now + 750;
      this.callbacks.level(rms, clippedUntil > now ? 1 : peak, now - lastSpeech < 800);
      if (gate.update(rms, now) && this.dc?.readyState === "open") this.dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    try {
      if (provider === "browser") this.startBrowser(generation);
      else await this.startOpenAI(generation, stream, getToken);
      if (generation === this.generation) this.limit = setTimeout(() => this.fail("Die Sprachsitzung wurde nach 30 Minuten beendet. Du kannst erneut starten."), 30 * 60_000);
    } catch (error) { if (generation === this.generation) this.stop(); throw error; }
  }
  private startBrowser(generation: number) {
    let session = 0, restarts = 0, restartWindow = performance.now();
    const start = () => {
      if (!this.active || generation !== this.generation) return;
      const Recognition = speechClass()!;
      const recognition = new Recognition();
      this.recognition = recognition;
      recognition.lang = "de-DE"; recognition.continuous = true; recognition.interimResults = true;
      const prefix = "browser-" + generation + "-" + (++session) + "-";
      recognition.onresult = event => {
        if (!this.active || generation !== this.generation) return;
        for (let i = event.resultIndex; i < event.results.length; i++) this.callbacks.transcript(event.results[i]![0].transcript, prefix + i);
      };
      recognition.onerror = event => {
        if (!this.active || generation !== this.generation || ["no-speech", "aborted"].includes(event.error)) return;
        this.fail(event.error === "not-allowed" || event.error === "service-not-allowed" ? "Spracherkennung wurde nicht erlaubt. Nutze Auto-Scroll." : "Browser-Spracherkennung unterbrochen (" + event.error + "). Bitte erneut starten.");
      };
      recognition.onend = () => {
        if (!this.active || generation !== this.generation) return;
        const now = performance.now();
        if (now - restartWindow > 10_000) { restarts = 0; restartWindow = now; }
        if (++restarts > 3) { this.fail("Die Browser-Spracherkennung beendet sich wiederholt. Wähle OpenAI oder Auto-Scroll."); return; }
        setTimeout(start, 200);
      };
      recognition.start();
    };
    start();
  }
  private async startOpenAI(generation: number, stream: MediaStream, getToken: () => Promise<Token>) {
    const token = await getToken();
    if (generation !== this.generation) return;
    if (token.expiresAt * 1000 <= Date.now()) throw new Error("Die Sprachsitzung ist abgelaufen. Bitte erneut starten.");
    const pc = new RTCPeerConnection(); this.pc = pc;
    stream.getAudioTracks().forEach(track => pc.addTrack(track, stream));
    const dc = pc.createDataChannel("oai-events"); this.dc = dc;
    const transcripts = new Map<string, string>();
    dc.onmessage = event => {
      if (generation !== this.generation) return;
      try {
        const data = JSON.parse(String(event.data)) as { type: string; item_id?: string; delta?: string; transcript?: string };
        if (data.type === "error" || data.type === "conversation.item.input_audio_transcription.failed") { this.fail("OpenAI hat die Sprachsitzung unterbrochen. Bitte erneut starten."); return; }
        if (!data.item_id) return;
        if (data.type === "conversation.item.input_audio_transcription.delta") {
          const text = (transcripts.get(data.item_id) || "") + (data.delta || "");
          transcripts.set(data.item_id, text);
          if (transcripts.size > 80) transcripts.delete(transcripts.keys().next().value!);
          this.callbacks.transcript(text, data.item_id);
        } else if (data.type === "conversation.item.input_audio_transcription.completed") {
          this.callbacks.transcript(data.transcript || "", data.item_id);
          // Keep the completed value to tolerate a delayed final event without changing its anchor.
          transcripts.set(data.item_id, data.transcript || "");
          if (transcripts.size > 80) transcripts.delete(transcripts.keys().next().value!);
        }
      } catch { /* Ignore malformed transport events; never render them as HTML. */ }
    };
    pc.onconnectionstatechange = () => { if (generation === this.generation && ["failed", "disconnected"].includes(pc.connectionState)) this.fail("Die Sprachverbindung wurde unterbrochen. Bitte erneut starten."); };
    this.abort = new AbortController();
    const connected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("OpenAI-Verbindung dauert zu lange. Bitte erneut starten.")), 15_000);
      dc.onopen = () => { clearTimeout(timer); resolve(); };
      dc.onclose = () => {
        clearTimeout(timer);
        if (this.active && generation === this.generation) this.fail("Die Sprachverbindung wurde geschlossen. Bitte erneut starten.");
        reject(new Error("Die Sprachverbindung wurde geschlossen."));
      };
      this.abort!.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Start abgebrochen.")); }, { once: true });
    });
    // Attach a rejection handler immediately while the SDP request is in flight.
    void connected.catch(() => {});
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST", headers: { Authorization: "Bearer " + token.value, "Content-Type": "application/sdp" },
      body: offer.sdp, signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) throw new Error("OpenAI-Verbindung fehlgeschlagen (HTTP " + response.status + ").");
    if (generation !== this.generation) return;
    await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
    await connected;
  }
  private fail(message: string) { this.stop(); this.callbacks.stopped(message); }
  stop() {
    this.generation++;
    this.active = false;
    clearTimeout(this.limit); this.limit = undefined;
    cancelAnimationFrame(this.raf);
    this.abort?.abort(); this.abort = undefined;
    if (this.recognition) {
      this.recognition.onend = null; this.recognition.onerror = null; this.recognition.onresult = null;
      this.recognition.abort(); this.recognition = undefined;
    }
    this.dc?.close(); this.dc = undefined;
    if (this.pc) { this.pc.onconnectionstatechange = null; this.pc.close(); this.pc = undefined; }
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = undefined;
    void this.context?.close().catch(() => {}); this.context = undefined;
    this.callbacks.level(0, 0, false);
  }
}
