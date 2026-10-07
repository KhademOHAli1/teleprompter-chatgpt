// SPDX-License-Identifier: MIT
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startServer, readConfig, authorize } from "../src/server";
import { VoiceTokens, transcriptionSession, type Fetcher } from "../src/tokens";
import { UI_URI } from "../src/mcp";
let server: Awaited<ReturnType<typeof startServer>>, url: string, client: Client;
beforeAll(async () => {
  server = await startServer({ host: "127.0.0.1", port: 0 });
  url = "http://127.0.0.1:" + server.port;
  client = new Client({ name: "teleprompter-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url + "/mcp")));
});
afterAll(async () => { await client?.close(); server?.stop(true); });

test("MCP lists the UI tool with correct annotations and app-only voice", async () => {
  const result = await client.listTools();
  const open = result.tools.find(t => t.name === "open_teleprompter")!;
  expect(open.annotations?.readOnlyHint).toBe(true);
  expect(open._meta?.ui).toMatchObject({ resourceUri: UI_URI });
  const voice = result.tools.find(t => t.name === "start_voice_session")!;
  expect(voice._meta?.ui).toMatchObject({ visibility: ["app"] });
  expect(voice.annotations?.openWorldHint).toBe(true);
});
test("legacy MCP initialization remains compatible with existing hosts", async () => {
  const response = await fetch(url + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "legacy-host-test", version: "1.0.0" } } }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ result: { serverInfo: { name: "teleprompter" } } });
});
test("MCP transfers the exact script privately to the UI", async () => {
  const text = "[Pause.] Grüße aus Köln. Wir bleiben hier.";
  const result = await client.callTool({ name: "open_teleprompter", arguments: { text, title: "Test" } });
  expect(result._meta?.draft).toEqual({ text, title: "Test" });
  expect(result.structuredContent).toMatchObject({ wordCount: 6, sentenceCount: 2 });
  expect(JSON.stringify(result.structuredContent)).not.toContain(text);
});
test("MCP validates oversized scripts", async () => {
  const result = await client.callTool({ name: "open_teleprompter", arguments: { text: "x".repeat(50_001) } });
  expect(result.isError).toBe(true);
});
test("MCP resource is bundled and declares microphone and network domains", async () => {
  const result = await client.readResource({ uri: UI_URI });
  const resource = result.contents[0]!;
  expect(resource.mimeType).toBe("text/html;profile=mcp-app");
  expect(resource._meta?.ui).toMatchObject({ permissions: { microphone: {} }, csp: { connectDomains: ["https://api.openai.com"], resourceDomains: [] } });
  expect("text" in resource && resource.text).toContain("Dein Text. Dein Tempo.");
  expect("text" in resource && resource.text.includes("/*__JS__*/")).toBe(false);
});
test("missing OpenAI configuration returns an actionable error", async () => {
  const result = await client.callTool({ name: "start_voice_session", arguments: {} });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).not.toContain("Bearer");
});
test("HTTP rejects cross-origin requests", async () => {
  const response = await fetch(url + "/preview/voice", { method: "POST", headers: { Origin: "https://untrusted.example" } });
  expect(response.status).toBe(403);
});
test("HTTP rejects untrusted Host headers", async () => {
  const response = await fetch(url + "/health", { headers: { Host: "untrusted.example" } });
  expect(response.status).toBe(403);
});
test("preview credential endpoint requires an explicit same-origin POST", async () => {
  expect((await fetch(url + "/preview/voice", { method: "POST" })).status).toBe(403);
  const response = await fetch(url + "/preview/voice", { method: "POST", headers: { Origin: url } });
  expect(response.status).toBe(200);
  expect((await response.json() as { isError: boolean }).isError).toBe(true);
});
test("preview is served and sensitive routes are not available", async () => {
  expect((await fetch(url)).status).toBe(200);
  expect((await fetch(url + "/.env")).status).toBe(404);
  expect((await fetch(url + "/src/tokens.ts")).status).toBe(404);
});
test("bearer comparison rejects missing and incorrect credentials", () => {
  expect(authorize(null, "test-token")).toBe(false);
  expect(authorize("Bearer wrong", "test-token")).toBe(false);
  expect(authorize("Bearer test-token", "test-token")).toBe(true);
});
test("public paid-voice configuration requires authentication", () => {
  expect(() => readConfig({ HOST: "0.0.0.0" })).toThrow("PUBLIC_ORIGIN");
  expect(() => readConfig({ HOST: "0.0.0.0", PUBLIC_ORIGIN: "https://test.example", OPENAI_API_KEY: "fake-test-key" })).toThrow("MCP_AUTH_TOKEN");
  expect(() => readConfig({ PUBLIC_ORIGIN: "https://test.example", OPENAI_API_KEY: "fake-test-key" })).toThrow("MCP_AUTH_TOKEN");
  expect(readConfig({ HOST: "0.0.0.0", PUBLIC_ORIGIN: "https://test.example" }).publicOrigin).toBe("https://test.example");
});
test("HTTP bearer protection applies before MCP initialization", async () => {
  const protectedServer = await startServer({ host: "127.0.0.1", port: 0, authToken: "private-test-token" });
  const endpoint = "http://127.0.0.1:" + protectedServer.port;
  const authorizedClient = new Client({ name: "auth-test", version: "1.0.0" });
  try {
    expect((await fetch(endpoint + "/mcp", { method: "POST" })).status).toBe(401);
    await authorizedClient.connect(new StreamableHTTPClientTransport(new URL(endpoint + "/mcp"), { requestInit: { headers: { Authorization: "Bearer private-test-token" } } }));
    expect((await authorizedClient.listTools()).tools.some(t => t.name === "open_teleprompter")).toBe(true);
  } finally { await authorizedClient.close(); protectedServer.stop(true); }
});
test("client secret stays out of model-visible content and the permanent key never leaves the backend", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const mock: Fetcher = async (_url, init) => {
    requestBody = JSON.parse(String(init.body));
    return Response.json({ value: "ephemeral-test-value", expires_at: 1_900_000_000 });
  };
  const result = await new VoiceTokens("fake-permanent-test-key", mock).mint();
  expect(JSON.stringify(result.content)).not.toContain("ephemeral-test-value");
  expect(result._meta?.voice).toEqual({ value: "ephemeral-test-value", expiresAt: 1_900_000_000 });
  expect(JSON.stringify(result)).not.toContain("fake-permanent-test-key");
  expect(requestBody).toMatchObject({ expires_after: { seconds: 60 }, session: transcriptionSession() });
});
test("upstream errors do not expose provider response bodies", async () => {
  const mock: Fetcher = async () => new Response("sensitive upstream error", { status: 403 });
  const result = await new VoiceTokens("fake-test-key", mock).mint();
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).not.toContain("sensitive upstream");
});
test("credential creation has a bounded hourly budget", async () => {
  const mock: Fetcher = async () => Response.json({ value: "ephemeral-test-value", expires_at: 1_900_000_000 });
  const tokens = new VoiceTokens("fake-test-key", mock, () => 1000);
  for (let i = 0; i < 12; i++) expect((await tokens.mint()).isError).toBeUndefined();
  expect((await tokens.mint()).isError).toBe(true);
});
