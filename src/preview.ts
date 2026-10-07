// SPDX-License-Identifier: MIT
// Development host for the same SDK bridge used by ChatGPT and other MCP Apps hosts.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
const initial = await fetch("/preview/initial").then(r => r.json());
const bridge = new AppBridge(null, { name: "Local preview", version: "0.1.0" }, { serverTools: {}, updateModelContext: {}, logging: {} }, {
  hostContext: { theme: "light", locale: "de-DE", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] }
});
bridge.oncalltool = async params => {
  if (params.name !== "start_voice_session") return { isError: true, content: [{ type: "text", text: "Unsupported preview tool" }] };
  return fetch("/preview/voice", { method: "POST" }).then(r => r.json());
};
bridge.oninitialized = () => { void bridge.sendToolResult(initial); document.querySelector("#state")!.textContent = "MCP Apps Bridge verbunden"; };
bridge.onsizechange = params => { frame.style.height = Math.max(540, Math.min(1300, params.height ?? 700)) + "px"; };
bridge.onrequestdisplaymode = async params => { document.body.classList.toggle("fullscreen", params.mode === "fullscreen"); return { mode: params.mode }; };
await bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
frame.src = "/widget";
