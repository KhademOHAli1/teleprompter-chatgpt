// SPDX-License-Identifier: MIT
import type { CallToolResult } from "@modelcontextprotocol/server";

export const transcriptionSession = () => ({
  type: "transcription",
  audio: { input: {
    noise_reduction: { type: "near_field" },
    transcription: { model: "gpt-live-transcribe", languages: ["de"], delay: "minimal" },
    turn_detection: null,
  } }
});
const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export class VoiceTokens {
  private timestamps: number[] = [];
  get enabled() { return Boolean(this.key); }
  constructor(private key?: string, private fetcher: Fetcher = fetch, private now: () => number = Date.now) {}
  async mint(): Promise<CallToolResult> {
    if (!this.key) return failure("OpenAI ist auf diesem Server nicht eingerichtet. Nutze Browser-Sprache oder Auto-Scroll.");
    const now = this.now();
    this.timestamps = this.timestamps.filter(t => now - t < 3_600_000);
    if (this.timestamps.length >= 12) return failure("Das Sitzungslimit ist erreicht. Versuche es später erneut.");
    this.timestamps.push(now);
    try {
      const response = await this.fetcher("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: { Authorization: "Bearer " + this.key, "Content-Type": "application/json" },
        body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 60 }, session: transcriptionSession() }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return failure("OpenAI konnte keine Sprachsitzung erstellen (HTTP " + response.status + "). Prüfe die Serverkonfiguration.");
      const data = await response.json() as { value?: unknown; expires_at?: unknown };
      if (typeof data.value !== "string" || typeof data.expires_at !== "number") return failure("OpenAI hat eine unerwartete Sitzung geliefert.");
      return {
        content: [{ type: "text", text: "Kurzlebige Sprachsitzung erstellt." }],
        _meta: { voice: { value: data.value, expiresAt: data.expires_at } },
      };
    } catch { return failure("Die Verbindung zu OpenAI ist fehlgeschlagen. Bitte erneut starten."); }
  }
}
