// SPDX-License-Identifier: MIT
import { App } from "@modelcontextprotocol/ext-apps";
import { DEMO, MAX_TEXT, parseScript, WordTracker, meterState } from "./core";
import { VoiceSession, browserSpeechAvailable, type Token } from "./voice";

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const draft = el<HTMLTextAreaElement>("draft"), mode = el<HTMLSelectElement>("mode"), provider = el<HTMLSelectElement>("provider");
const start = el<HTMLButtonElement>("start"), viewport = el("viewport"), scriptElement = el("script");
let script = parseScript(""), tracker = new WordTracker(script), spans: HTMLElement[] = [];
let running = false, starting = false, operation = 0, autoFrame = 0, lastMatchAt = -Infinity, connected = false, expanded = false;
const app = new App({ name: "Teleprompter", version: "0.1.0" }, {}, { autoResize: true });
function status(text: string, error = false) { el("status").textContent = text; el("status").classList.toggle("error", error); }
function stopped(message = "Pausiert.") {
  operation++; running = false; starting = false; cancelAnimationFrame(autoFrame);
  voice.stop(); start.textContent = "Start"; start.disabled = false; status(message);
}
const voice = new VoiceSession({
  transcript(text, id) {
    tracker.consume(text, id);
    if (tracker.confidence > 0) lastMatchAt = performance.now();
    updateProgress();
    if (tracker.cursor >= script.words.length - 1) stopped("Text vollständig gelesen.");
  },
  level(rms, peak, recent) {
    const state = meterState(rms, peak, tracker.confidence, recent);
    el("meter-pointer").style.left = state.position + "%";
    el("meter").classList.toggle("neutral", !recent);
    el("meter-label").textContent = running || starting ? state.label : "Mikrofon aus";
    el("match-label").textContent = recent && performance.now() - lastMatchAt < 2000 ? state.matched ? "Text erkannt" : "Text unsicher" : "";
  },
  stopped(message) { stopped(message); status(message, true); }
});
function updateCount() {
  const count = parseScript(draft.value).words.length;
  el("word-count").textContent = count + " Wörter · ca. " + Math.ceil(count / 130) + " Min.";
  el<HTMLButtonElement>("read").disabled = count === 0;
}
function renderScript() {
  scriptElement.replaceChildren(); spans = [];
  let offset = 0;
  const appendText = (text: string) => {
    let start = 0;
    for (const cue of text.matchAll(/\[[^\]]*\]/g)) {
      scriptElement.append(document.createTextNode(text.slice(start, cue.index)));
      const element = document.createElement("span"); element.className = "cue"; element.textContent = cue[0]; scriptElement.append(element);
      start = cue.index! + cue[0].length;
    }
    scriptElement.append(document.createTextNode(text.slice(start)));
  };
  script.words.forEach((word, index) => {
    appendText(script.text.slice(offset, word.start));
    const span = document.createElement("span"); span.className = "word"; span.textContent = word.text; span.dataset.index = String(index);
    scriptElement.append(span); spans.push(span); offset = word.end;
  });
  appendText(script.text.slice(offset));
}
function updateProgress(smooth = true) {
  const next = Math.min(tracker.cursor + 1, script.words.length - 1);
  spans.forEach((span, i) => { span.classList.toggle("spoken", i <= tracker.cursor); span.classList.toggle("current", i === next && tracker.cursor < script.words.length - 1); });
  el("sentence").textContent = "Satz " + ((script.words[next]?.sentence ?? 0) + 1) + " / " + script.sentenceStarts.length;
  el("progress-fill").style.width = (script.words.length ? (tracker.cursor + 1) / script.words.length * 100 : 0) + "%";
  const word = spans[next];
  if (word) {
    const top = viewport.scrollTop + word.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 120;
    viewport.scrollTo({ top: Math.max(0, top), behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
  }
}
function loadReading() {
  stopped();
  script = parseScript(draft.value); tracker = new WordTracker(script); lastMatchAt = -Infinity;
  if (!script.words.length) { status("Füge einen Text mit gesprochenen Wörtern ein.", true); return; }
  renderScript(); el("editor").hidden = true; el("reading").hidden = false; updateProgress(false);
  status("Bereit. Klicke auf ein Wort, um die Startposition zu wählen.");
}
function seekSentence(delta: number) {
  const current = script.words[Math.min(tracker.cursor + 1, script.words.length - 1)]?.sentence ?? 0;
  tracker.seek(script.sentenceStarts[Math.max(0, Math.min(current + delta, script.sentenceStarts.length - 1))] ?? 0);
  updateProgress(false);
}
async function getToken(): Promise<Token> {
  const result = await app.callServerTool({ name: "start_voice_session", arguments: {} });
  if (result.isError) throw new Error(result.content.find(c => c.type === "text")?.text as string || "Sprachsitzung fehlgeschlagen.");
  const token = result._meta?.voice as Token | undefined;
  if (!token || typeof token.value !== "string" || typeof token.expiresAt !== "number") throw new Error("Dieser Host hat kein gültiges Sitzungstoken geliefert.");
  return token;
}
async function toggleStart() {
  if (running || starting) { stopped(); return; }
  if (!script.words.length) return;
  if (tracker.cursor >= script.words.length - 1) tracker.seek(0);
  const currentOperation = ++operation;
  if (mode.value === "auto") {
    running = true; start.textContent = "Pause"; status("Auto-Scroll läuft. Leertaste pausiert.");
    let last = performance.now(), accumulated = 0;
    const tick = (now: number) => {
      if (!running || currentOperation !== operation) return;
      accumulated += Math.min(now - last, 500); last = now;
      const interval = 60_000 / Number(el<HTMLInputElement>("pace").value);
      if (accumulated >= interval) {
        const steps = Math.floor(accumulated / interval); accumulated %= interval;
        tracker.seek(tracker.cursor + 1 + steps); updateProgress();
        if (tracker.cursor >= script.words.length - 1) { stopped("Text vollständig gelesen."); return; }
      }
      autoFrame = requestAnimationFrame(tick);
    };
    autoFrame = requestAnimationFrame(tick); return;
  }
  if (!connected) { status("Die Verbindung zum App-Host ist noch nicht bereit.", true); return; }
  starting = true; start.textContent = "Abbrechen"; status("Mikrofon und Spracherkennung verbinden …");
  try {
    await voice.start(provider.value === "openai" ? "openai" : "browser", getToken);
    if (currentOperation !== operation) return;
    starting = false; running = true; start.textContent = "Pause";
    status("Sprache aktiv. Pausen halten den Text an.");
  } catch (error) {
    if (currentOperation !== operation) return;
    stopped();
    const denied = error instanceof DOMException && error.name === "NotAllowedError";
    status(denied ? "Mikrofonzugriff wurde nicht erlaubt. Nutze Auto-Scroll oder erlaube das Mikrofon im Host." : error instanceof Error ? error.message : "Spracherkennung konnte nicht starten.", true);
  }
}
el("read").onclick = loadReading;
el("example").onclick = () => { draft.value = DEMO; updateCount(); };
draft.oninput = updateCount;
el("edit").onclick = () => {
  stopped();
  if (expanded && app.getHostContext()?.availableDisplayModes?.includes("inline")) void app.requestDisplayMode({ mode: "inline" }).catch(() => {});
  el("editor").hidden = false; el("reading").hidden = true;
  document.body.classList.remove("expanded"); expanded = false; draft.focus();
};
start.onclick = () => void toggleStart();
el("reset").onclick = () => { stopped("Zurück am Anfang."); tracker.seek(0); updateProgress(false); };
el("back").onclick = () => { stopped(); seekSentence(-1); };
el("next").onclick = () => { stopped(); seekSentence(1); };
scriptElement.onclick = event => { const target = (event.target as HTMLElement).closest<HTMLElement>("[data-index]"); if (target) { stopped("Startposition geändert."); tracker.seek(Number(target.dataset.index)); updateProgress(false); } };
mode.onchange = () => { stopped(); el("provider-control").hidden = mode.value === "auto"; el("pace-control").hidden = mode.value !== "auto"; };
provider.onchange = () => stopped();
for (const id of ["font", "width", "pace"]) {
  el<HTMLInputElement>(id).oninput = () => {
    const value = el<HTMLInputElement>(id).value;
    el(id + "-value").textContent = value + (id === "pace" ? " Wörter/min" : " px");
    if (id !== "pace") { document.documentElement.style.setProperty(id === "font" ? "--font" : "--column", value + "px"); updateProgress(false); }
  };
}
el("expand").onclick = async () => {
  expanded = !expanded;
  try {
    if (app.getHostContext()?.availableDisplayModes?.includes("fullscreen")) await app.requestDisplayMode({ mode: expanded ? "fullscreen" : "inline" });
  } catch { /* The local expanded view remains usable when the host declines. */ }
  document.body.classList.toggle("expanded", expanded); updateProgress(false);
};
document.addEventListener("keydown", event => {
  if (["TEXTAREA", "INPUT", "SELECT", "BUTTON"].includes((event.target as HTMLElement).tagName) || el("reading").hidden) return;
  if (event.code === "Space") { event.preventDefault(); void toggleStart(); }
  else if (event.key === "ArrowRight") { stopped(); seekSentence(1); }
  else if (event.key === "ArrowLeft") { stopped(); seekSentence(-1); }
  else if (event.key === "Escape") stopped();
});
document.addEventListener("visibilitychange", () => { if (document.hidden && (running || starting)) stopped("Pausiert, weil die App nicht sichtbar ist."); });
window.addEventListener("pagehide", () => voice.stop());
app.onteardown = async () => { stopped(); return {}; };
app.ontoolcancelled = () => stopped("Der Aufruf wurde abgebrochen.");
app.ontoolresult = result => {
  const data = result._meta?.draft as { text?: unknown; title?: unknown } | undefined;
  if (typeof data?.text === "string") {
    stopped(); draft.value = data.text.slice(0, MAX_TEXT);
    if (typeof data.title === "string") el("title").textContent = data.title;
    el("editor").hidden = false; el("reading").hidden = true; updateCount();
    status(draft.value ? "Text aus dem Chat übernommen. Bereit zum Lesen." : "Text einfügen und Lesemodus öffnen.");
  }
  const settings = result._meta?.settings as { openaiEnabled?: boolean } | undefined;
  if (settings) {
    provider.querySelector<HTMLOptionElement>('[value="openai"]')!.disabled = !settings.openaiEnabled;
    if (settings.openaiEnabled) provider.value = "openai";
    else if (!browserSpeechAvailable()) {
      mode.value = "auto"; el("provider-control").hidden = true; el("pace-control").hidden = false;
      status("Spracherkennung ist in diesem Host nicht verfügbar. Auto-Scroll ist bereit.");
    }
  }
};
updateCount();
try {
  await app.connect();
  connected = true; el("connection").textContent = "App verbunden";
} catch { el("connection").textContent = "Ohne App-Verbindung"; status("Die App-Verbindung ist nicht verfügbar. Auto-Scroll funktioniert weiterhin.", true); mode.value = "auto"; el("provider-control").hidden = true; el("pace-control").hidden = false; }
