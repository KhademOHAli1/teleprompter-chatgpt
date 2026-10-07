// SPDX-License-Identifier: MIT
// Development host for the same SDK bridge used by ChatGPT and other MCP Apps hosts.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { canonicalLocale, localizeDocument, setLocale, systemLocale, t } from "./i18n";
const locale = canonicalLocale(new URLSearchParams(location.search).get("locale") || systemLocale());
setLocale(locale); localizeDocument();
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
const initial = await fetch("/preview/initial").then(r => r.json());
const bridge = new AppBridge(null, { name: "Local preview", version: "0.2.0" }, { serverTools: {}, updateModelContext: {}, logging: {} }, {
  hostContext: { theme: "light", locale, displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] }
});
bridge.oncalltool = async params => {
  if (params.name !== "start_voice_session") return { isError: true, content: [{ type: "text", text: "Unsupported preview tool" }] };
  return fetch("/preview/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params.arguments) }).then(r => r.json());
};
bridge.oninitialized = () => { void bridge.sendToolResult(initial); document.querySelector("#state")!.textContent = t("MCP Apps Bridge connected"); };
bridge.onsizechange = params => { frame.style.height = Math.max(540, Math.min(1300, params.height ?? 700)) + "px"; };
bridge.onrequestdisplaymode = async params => { document.body.classList.toggle("fullscreen", params.mode === "fullscreen"); return { mode: params.mode }; };
await bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
frame.src = "/widget";
