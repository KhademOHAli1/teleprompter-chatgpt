// SPDX-License-Identifier: MIT
import { App } from "@modelcontextprotocol/ext-apps";
import { MAX_TEXT, parseScript, WordTracker, meterState } from "./core";
import { VoiceSession, browserSpeechAvailable, type Token } from "./voice";

import { canonicalLocale, currentLocale, localizeDocument, number, setLocale, speechLocales, systemLocale, t, rtl } from "./i18n";
import { demo } from "./demos";
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const draft = el<HTMLTextAreaElement>("draft"), mode = el<HTMLSelectElement>("mode"), provider = el<HTMLSelectElement>("provider");
const language = el<HTMLSelectElement>("language"), customLanguage = el<HTMLInputElement>("custom-language");
function speechLocale() { return canonicalLocale(language.value === "system" ? currentLocale() : language.value === "other" ? customLanguage.value : language.value); }
const start = el<HTMLButtonElement>("start"), viewport = el("viewport"), scriptElement = el("script");
let script = parseScript(""), tracker = new WordTracker(script), spans: HTMLElement[] = [];
let running = false, starting = false, operation = 0, autoFrame = 0, lastMatchAt = -Infinity, connected = false, expanded = false;
const app = new App({ name: "Teleprompter", version: "0.2.0" }, {}, { autoResize: true });
function status(text: string, error = false) { el("status").textContent = text; el("status").classList.toggle("error", error); }
function stopped(message = t("Paused.")) {
  operation++; running = false; starting = false; cancelAnimationFrame(autoFrame);
  voice.stop(); language.disabled = customLanguage.disabled = false; start.textContent = t("Start"); start.disabled = false; status(message);
}
const voice = new VoiceSession({
  transcript(text, id) {
    tracker.consume(text, id);
    if (tracker.confidence > 0) lastMatchAt = performance.now();
    updateProgress();
    if (tracker.cursor >= script.words.length - 1) stopped(t("Script completed."));
  },
  level(rms, peak, recent) {
    const state = meterState(rms, peak, tracker.confidence, recent);
    el("meter-pointer").style.left = state.position + "%";
    el("meter").classList.toggle("neutral", !recent);
    el("meter-label").textContent = running || starting ? state.label : t("Microphone off");
    el("match-label").textContent = recent && performance.now() - lastMatchAt < 2000 ? state.matched ? t("Text matched") : t("Text uncertain") : "";
  },
  stopped(message) { stopped(message); status(message, true); }
});
function updateCount() {
  const count = parseScript(draft.value, speechLocale()).words.length;
  el("word-count").textContent = t("Words: {0} · about {1} min", number(count), number(Math.ceil(count / 130)));
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
  el("sentence").textContent = t("Sentence {0} / {1}", number((script.words[next]?.sentence ?? 0) + 1), number(script.sentenceStarts.length));
  el("progress-fill").style.width = (script.words.length ? (tracker.cursor + 1) / script.words.length * 100 : 0) + "%";
  const word = spans[next];
  if (word) {
    const top = viewport.scrollTop + word.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 120;
    viewport.scrollTo({ top: Math.max(0, top), behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
  }
}
function loadReading() {
  stopped();
  if (language.value === "other" && !canonicalLocale(customLanguage.value, "")) { status(t("Invalid language code."), true); return; }
  script = parseScript(draft.value, speechLocale()); tracker = new WordTracker(script); lastMatchAt = -Infinity;
  if (!script.words.length) { status(t("Paste a text with spoken words."), true); return; }
  scriptElement.dir = rtl(script.locale) ? "rtl" : "ltr";
  renderScript(); el("editor").hidden = true; el("reading").hidden = false; updateProgress(false);
  status(t("Ready. Click a word to choose the start position."));
}
function seekSentence(delta: number) {
  const current = script.words[Math.min(tracker.cursor + 1, script.words.length - 1)]?.sentence ?? 0;
  tracker.seek(script.sentenceStarts[Math.max(0, Math.min(current + delta, script.sentenceStarts.length - 1))] ?? 0);
  updateProgress(false);
}
async function getToken(): Promise<Token> {
  const result = await app.callServerTool({ name: "start_voice_session", arguments: { language: speechLocale(), uiLocale: currentLocale() } });
  if (result.isError) throw new Error(result.content.find(c => c.type === "text")?.text as string || t("Voice session failed."));
  const token = result._meta?.voice as Token | undefined;
  if (!token || typeof token.value !== "string" || typeof token.expiresAt !== "number") throw new Error(t("The host did not provide a valid session token."));
  return token;
}
async function toggleStart() {
  if (running || starting) { stopped(); return; }
  if (language.value === "other" && !canonicalLocale(customLanguage.value, "")) { status(t("Invalid language code."), true); return; }
  if (!script.words.length) return;
  if (tracker.cursor >= script.words.length - 1) tracker.seek(0);
  const currentOperation = ++operation;
  if (mode.value === "auto") {
    running = true; start.textContent = t("Pause"); status(t("Auto-Scroll active. Space pauses."));
    let last = performance.now(), accumulated = 0;
    const tick = (now: number) => {
      if (!running || currentOperation !== operation) return;
      accumulated += Math.min(now - last, 500); last = now;
      const interval = 60_000 / Number(el<HTMLInputElement>("pace").value);
      if (accumulated >= interval) {
        const steps = Math.floor(accumulated / interval); accumulated %= interval;
        tracker.seek(tracker.cursor + 1 + steps); updateProgress();
        if (tracker.cursor >= script.words.length - 1) { stopped(t("Script completed.")); return; }
      }
      autoFrame = requestAnimationFrame(tick);
    };
    autoFrame = requestAnimationFrame(tick); return;
  }
  if (!connected) { status(t("The app host is not connected yet."), true); return; }
  starting = true; language.disabled = customLanguage.disabled = true; start.textContent = t("Cancel"); status(t("Connecting microphone and speech recognition …"));
  try {
    await voice.start(provider.value === "openai" ? "openai" : "browser", getToken, speechLocale());
    if (currentOperation !== operation) return;
    starting = false; running = true; start.textContent = t("Pause");
    status(t("Speech active. Pauses hold the text."));
  } catch (error) {
    if (currentOperation !== operation) return;
    stopped();
    const denied = error instanceof DOMException && error.name === "NotAllowedError";
    status(denied ? t("Microphone access was denied. Use Auto-Scroll or allow the microphone in the host.") : error instanceof Error ? error.message : t("Could not start speech recognition."), true);
  }
}
el("read").onclick = loadReading;
el("example").onclick = () => { draft.value = demo(speechLocale()); updateCount(); };
draft.oninput = updateCount;
el("edit").onclick = () => {
  stopped();
  if (expanded && app.getHostContext()?.availableDisplayModes?.includes("inline")) void app.requestDisplayMode({ mode: "inline" }).catch(() => {});
  el("editor").hidden = false; el("reading").hidden = true;
  document.body.classList.remove("expanded"); expanded = false; draft.focus();
};
start.onclick = () => void toggleStart();
el("reset").onclick = () => { stopped(t("Back at the start.")); tracker.seek(0); updateProgress(false); };
el("back").onclick = () => { stopped(); seekSentence(-1); };
el("next").onclick = () => { stopped(); seekSentence(1); };
scriptElement.onclick = event => { const target = (event.target as HTMLElement).closest<HTMLElement>("[data-index]"); if (target) { stopped(t("Start position changed.")); tracker.seek(Number(target.dataset.index)); updateProgress(false); } };
mode.onchange = () => { stopped(); el("provider-control").hidden = mode.value === "auto"; el("pace-control").hidden = mode.value !== "auto"; };
provider.onchange = () => stopped();
for (const id of ["font", "width", "pace"]) {
  el<HTMLInputElement>(id).oninput = () => {
    const value = el<HTMLInputElement>(id).value;
    el(id + "-value").textContent = id === "pace" ? t("{0} words/min", number(Number(value))) : number(Number(value)) + " px";
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
document.addEventListener("visibilitychange", () => { if (document.hidden && (running || starting)) stopped(t("Paused because the app is hidden.")); });
window.addEventListener("pagehide", () => voice.stop());
app.onteardown = async () => { stopped(); return {}; };
app.ontoolcancelled = () => stopped(t("The call was cancelled."));
app.ontoolresult = result => {
  const data = result._meta?.draft as { text?: unknown; title?: unknown; language?: unknown } | undefined;
  if (typeof data?.text === "string") {
    stopped();
    if (typeof data.language === "string") selectLanguage(canonicalLocale(data.language));
    draft.value = data.text.slice(0, MAX_TEXT);
    if (typeof data.title === "string") el("title").textContent = data.title;
    el("editor").hidden = false; el("reading").hidden = true; updateCount();
    status(draft.value ? t("Text received from chat. Ready to read.") : t("Paste text and open the reader."));
  }
  const settings = result._meta?.settings as { openaiEnabled?: boolean } | undefined;
  if (settings) {
    provider.querySelector<HTMLOptionElement>('[value="openai"]')!.disabled = !settings.openaiEnabled;
    if (settings.openaiEnabled) provider.value = "openai";
    else if (!browserSpeechAvailable()) {
      mode.value = "auto"; el("provider-control").hidden = true; el("pace-control").hidden = false;
      status(t("Speech is unavailable in this host. Auto-Scroll is ready."));
    }
  }
};
function selectLanguage(locale: string) {
  if (![...language.options].some(option => option.value === locale)) language.add(new Option(new Intl.DisplayNames([currentLocale()], { type: "language" }).of(locale) || locale, locale));
  language.value = locale;
}
function refreshLocale(locale?: string) {
  setLocale(locale);
  localizeDocument();
  const selected = language.value || "system";
  const names = new Intl.DisplayNames([currentLocale()], { type: "language" });
  language.replaceChildren(new Option(t("System language · {0}", names.of(currentLocale()) || currentLocale()), "system"));
  for (const tag of speechLocales) language.add(new Option(names.of(tag) || tag, tag));
  language.add(new Option(t("Other language code"), "other"));
  if (!["system", "other"].includes(selected)) selectLanguage(selected); else language.value = selected;
  for (const id of ["font", "width", "pace"]) {
    const value = Number(el<HTMLInputElement>(id).value);
    el(id + "-value").textContent = id === "pace" ? t("{0} words/min", number(value)) : number(value) + " px";
  }
  updateCount();
  if (!el("reading").hidden && script.locale !== speechLocale()) {
    stopped(t("Script language changed. Read from the beginning."));
    script = parseScript(draft.value, speechLocale()); tracker = new WordTracker(script);
    scriptElement.dir = rtl(script.locale) ? "rtl" : "ltr"; renderScript(); updateProgress(false);
  }
  start.textContent = running ? t("Pause") : starting ? t("Cancel") : t("Start");
  el("connection").textContent = connected ? t("App connected") : t("Connecting …");
}
function changeLanguage() {
  stopped(t("Script language changed. Read from the beginning."));
  el("custom-language-control").hidden = language.value !== "other";
  if (language.value === "other" && !canonicalLocale(customLanguage.value, "")) { status(t("Invalid language code."), true); return; }
  updateCount();
  if (!el("reading").hidden) loadReading();
}
language.onchange = changeLanguage;
customLanguage.onchange = changeLanguage;
window.addEventListener("languagechange", () => refreshLocale(app.getHostContext()?.locale));
app.onhostcontextchanged = context => { if (context.locale) refreshLocale(context.locale); };
refreshLocale();
updateCount();
try {
  await app.connect();
  refreshLocale(app.getHostContext()?.locale);
  connected = true; el("connection").textContent = t("App connected");
} catch { el("connection").textContent = t("No app connection"); status(t("The app connection is unavailable. Auto-Scroll still works."), true); mode.value = "auto"; el("provider-control").hidden = true; el("pace-control").hidden = false; }
