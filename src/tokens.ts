// SPDX-License-Identifier: MIT
import type { CallToolResult } from "@modelcontextprotocol/server";

import { apiLanguage, translate } from "./i18n";
export const transcriptionSession = (locale = "en-US") => ({
  type: "transcription",
  audio: { input: {
    noise_reduction: { type: "near_field" },
    transcription: { model: "gpt-live-transcribe", languages: [apiLanguage(locale)], delay: "minimal" },
    turn_detection: null,
  } }
});
const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export class VoiceTokens {
  private timestamps: number[] = [];
  get enabled() { return Boolean(this.key); }
  constructor(private key?: string, private fetcher: Fetcher = fetch, private now: () => number = Date.now) {}
  async mint(language = "en-US", uiLocale = "en-US"): Promise<CallToolResult> {
    const t = (key: Parameters<typeof translate>[0], ...args: (number | string)[]) => translate(key, uiLocale, ...args);
    if (!this.key) return failure(t("OpenAI is not configured on this server. Use browser speech or Auto-Scroll."));
    const now = this.now();
    this.timestamps = this.timestamps.filter(t => now - t < 3_600_000);
    if (this.timestamps.length >= 12) return failure(t("Session limit reached. Try again later."));
    this.timestamps.push(now);
    try {
      const response = await this.fetcher("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: { Authorization: "Bearer " + this.key, "Content-Type": "application/json" },
        body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 60 }, session: transcriptionSession(language) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return failure(t("OpenAI could not create a session (HTTP {0}). Check server configuration.", response.status));
      const data = await response.json() as { value?: unknown; expires_at?: unknown };
      if (typeof data.value !== "string" || typeof data.expires_at !== "number") return failure(t("OpenAI returned an unexpected session."));
      return {
        content: [{ type: "text", text: t("Short-lived voice session created.") }],
        _meta: { voice: { value: data.value, expiresAt: data.expires_at } },
      };
    } catch { return failure(t("Could not connect to OpenAI. Start again.")); }
  }
}
