// SPDX-License-Identifier: MIT
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { MAX_TEXT, parseScript } from "./core";
import { VoiceTokens } from "./tokens";

export const VERSION = "0.1.0";
export const UI_URI = "ui://teleprompter/v0.1.0.html";
export interface ServerOptions { html: string; tokens: VoiceTokens; widgetOrigin?: string }
export function promptResult(text: string, title = "Teleprompter", openaiEnabled = false): CallToolResult {
  const script = parseScript(text);
  return {
    content: [{ type: "text", text: text ? title + ": " + script.words.length + " Wörter. Die Teleprompter-App ist geöffnet." : "Die Teleprompter-App ist geöffnet. Füge deinen Text ein." }],
    structuredContent: { title, wordCount: script.words.length, sentenceCount: script.sentenceStarts.length, language: "de" },
    _meta: { draft: { text, title }, settings: { openaiEnabled } },
  };
}
export function createMcpServer(options: ServerOptions) {
  const server = new McpServer({ name: "teleprompter", version: VERSION }, {
    instructions: "Open a teleprompter with open_teleprompter when the user wants to read a script on camera. Preserve their wording exactly. Pass an empty text to let the user paste privately in the app. Stage directions in square brackets are displayed but excluded from voice tracking. Microphone capture begins only after the user presses Start in the app."
  });
  registerAppResource(server, "teleprompter", UI_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{
      uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: options.html,
      _meta: {
        ui: {
          prefersBorder: true,
          ...(options.widgetOrigin ? { domain: options.widgetOrigin } : {}),
          permissions: { microphone: {} },
          csp: { connectDomains: ["https://api.openai.com"], resourceDomains: [] },
        },
        "openai/widgetDescription": "A centered German teleprompter with editable text, voice-following, manual controls and an audio level meter.",
      }
    }]
  }));
  registerAppTool(server, "open_teleprompter", {
    title: "Teleprompter öffnen",
    description: "Opens the interactive German teleprompter. Pass the exact script provided by the user, or omit text so they can paste it in the app. Does not record audio, start the microphone, save files, or rewrite the script.",
    inputSchema: z.object({ text: z.string().max(MAX_TEXT).default(""), title: z.string().max(100).default("Teleprompter") }),
    outputSchema: z.object({ title: z.string(), wordCount: z.number(), sentenceCount: z.number(), language: z.literal("de") }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ["model", "app"] } },
  }, async ({ text, title }) => promptResult(text, title, options.tokens.enabled));
  registerAppTool(server, "start_voice_session", {
    title: "OpenAI-Spracherkennung verbinden",
    description: "Creates one short-lived OpenAI transcription credential after an explicit Start click in the app. Microphone audio goes directly from the browser to OpenAI. Uses the operator's configured API account and may incur costs. Never returns the permanent API key.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ["app"] } },
  }, async () => options.tokens.mint());
  return server;
}
