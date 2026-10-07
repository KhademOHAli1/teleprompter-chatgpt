// SPDX-License-Identifier: MIT
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { MAX_TEXT, parseScript } from "./core";
import { VoiceTokens } from "./tokens";

export const VERSION = "0.2.0";
export const UI_URI = "ui://teleprompter/v0.2.0.html";
export const localeSchema = z.string().max(100).refine(value => {
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}, "Invalid BCP 47 language tag");
export interface ServerOptions { html: string; tokens: VoiceTokens; widgetOrigin?: string }
export function promptResult(text: string, title = "Teleprompter", openaiEnabled = false, language?: string): CallToolResult {
  const script = parseScript(text, language);
  return {
    content: [{ type: "text", text: text ? title + ": " + script.words.length + " words. The teleprompter is open." : "The teleprompter is open. Paste your text in the app." }],
    structuredContent: { title, wordCount: script.words.length, sentenceCount: script.sentenceStarts.length, language: language ?? "system" },
    _meta: { draft: { text, title, ...(language ? { language } : {}) }, settings: { openaiEnabled } },
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
        "openai/widgetDescription": "A centered multilingual teleprompter with editable text, voice-following, manual controls and an audio level meter.",
      }
    }]
  }));
  registerAppTool(server, "open_teleprompter", {
    title: "Open Teleprompter",
    description: "Opens the interactive multilingual teleprompter. Pass the exact script provided by the user, or omit text so they can paste it in the app. Use the optional language parameter for the script language (BCP 47, such as en-US or fr-FR); otherwise the app follows the host language. Does not record audio, start the microphone, save files, or rewrite the script.",
    inputSchema: z.object({ text: z.string().max(MAX_TEXT).default(""), title: z.string().max(100).default("Teleprompter"), language: localeSchema.optional() }),
    outputSchema: z.object({ title: z.string(), wordCount: z.number(), sentenceCount: z.number(), language: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ["model", "app"] } },
  }, async ({ text, title, language }) => promptResult(text, title, options.tokens.enabled, language));
  registerAppTool(server, "start_voice_session", {
    title: "Connect OpenAI speech recognition",
    description: "Creates one short-lived OpenAI transcription credential after an explicit Start click in the app. Microphone audio goes directly from the browser to OpenAI. Uses the operator's configured API account and may incur costs. Never returns the permanent API key.",
    inputSchema: z.object({ language: localeSchema.default("en-US"), uiLocale: localeSchema.default("en-US") }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ["app"] } },
  }, async ({ language, uiLocale }) => options.tokens.mint(language, uiLocale));
  return server;
}
