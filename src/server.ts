// SPDX-License-Identifier: MIT
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { createMcpServer, promptResult, localeSchema, VERSION } from "./mcp";
import { VoiceTokens } from "./tokens";
import { timingSafeEqual } from "node:crypto";

export interface Config { host: string; port: number; publicOrigin?: string; authToken?: string; apiKey?: string; widgetOrigin?: string }
const loopback = (host: string) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
export function readConfig(env: Record<string, string | undefined>): Config {
  const host = env.HOST || "127.0.0.1", port = Number(env.PORT || 4317);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be 0..65535.");
  const publicOrigin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : undefined;
  if (!loopback(host) && (!publicOrigin || !publicOrigin.startsWith("https://"))) throw new Error("Public binding requires a HTTPS PUBLIC_ORIGIN.");
  if ((!loopback(host) || publicOrigin) && env.OPENAI_API_KEY && !env.MCP_AUTH_TOKEN) throw new Error("Public OpenAI voice requires MCP_AUTH_TOKEN.");
  return { host, port, publicOrigin, authToken: env.MCP_AUTH_TOKEN, apiKey: env.OPENAI_API_KEY, widgetOrigin: env.WIDGET_ORIGIN ? new URL(env.WIDGET_ORIGIN).origin : undefined };
}
export function authorize(header: string | null, token?: string) {
  if (!token) return true;
  const provided = Buffer.from(header || ""), expected = Buffer.from("Bearer " + token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
export async function startServer(config: Config) {
  const dist = new URL("../dist/", import.meta.url);
  const html = await Bun.file(new URL("widget.html", dist)).text();
  const tokens = new VoiceTokens(config.apiKey);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]", ...(config.publicOrigin ? [new URL(config.publicOrigin).hostname] : [])]);
  const fail = (status: number, text: string) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const server = Bun.serve({
    hostname: config.host, port: config.port, maxRequestBodySize: 1_048_576,
    async fetch(request) {
      const url = new URL(request.url);
      if (!allowedHosts.has(url.hostname)) return fail(403, "Invalid host");
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin && origin !== config.publicOrigin) return fail(403, "Invalid origin");
      if (url.pathname === "/health") return Response.json({ status: "ok", version: VERSION });
      if (url.pathname === "/mcp") {
        if (!authorize(request.headers.get("Authorization"), config.authToken)) return fail(401, "Bearer authentication required");
        const mcp = createMcpServer({ html, tokens, widgetOrigin: config.widgetOrigin });
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        await mcp.connect(transport);
        try { return await transport.handleRequest(request); }
        finally { await mcp.close(); }
      }
      // The development host is deliberately loopback-only.
      if (!loopback(config.host) || !loopback(url.hostname)) return fail(404, "Not found");
      if (url.pathname === "/preview/voice" && request.method === "POST") {
        if (origin !== url.origin) return fail(403, "Same-origin POST required");
        const body = await request.json().catch(() => ({})) as { language?: unknown; uiLocale?: unknown };
        const language = localeSchema.safeParse(body.language ?? "en-US"), uiLocale = localeSchema.safeParse(body.uiLocale ?? "en-US");
        if (!language.success || !uiLocale.success) return fail(400, "Invalid language code");
        return Response.json(await tokens.mint(language.data, uiLocale.data), { headers: { "Cache-Control": "no-store" } });
      }
      if (url.pathname === "/preview/initial" && request.method === "GET") return Response.json(promptResult("", "Teleprompter", tokens.enabled));
      const files: Record<string, string> = { "/": "preview.html", "/widget": "widget.html", "/preview.js": "preview.js" };
      if (request.method !== "GET" || !files[url.pathname]) return fail(404, "Not found");
      return new Response(Bun.file(new URL(files[url.pathname]!, dist)), {
        headers: {
          "Content-Type": url.pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
        },
      });
    },
    error() { return fail(500, "Server request failed"); }
  });
  return server;
}
if (import.meta.main) {
  const server = await startServer(readConfig(process.env));
  console.log("Teleprompter: http://" + server.hostname + ":" + server.port);
  console.log("MCP endpoint: /mcp");
  process.on("SIGINT", () => { server.stop(true); process.exit(0); });
  process.on("SIGTERM", () => { server.stop(true); process.exit(0); });
}
