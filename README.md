# Teleprompter for ChatGPT and Codex

A small German teleprompter implemented as an MCP App. An assistant can open
your script in a centered reader, and you can also paste text directly into
the embedded UI. Licensed under MIT.

[Deutsche Anleitung](README.de.md) · [Privacy](docs/PRIVACY.md) · [Validation](docs/VALIDATION.md)

## Run locally

Requires Bun 1.4.2 or newer.

    bun install --frozen-lockfile
    bun run check
    bun run start

Open **http://127.0.0.1:4317** for the local iframe preview.
The MCP endpoint is **http://127.0.0.1:4317/mcp**.
On macOS, you can double-click **start.command**.
The preview uses the official MCP Apps AppBridge with the same bundled UI
served to real hosts. It is a development host, not ChatGPT itself.

## What it does

- Exact script transfer from the chat, or direct paste into the app.
- Narrow centered text, adjustable font and column width.
- German word alignment using interim transcription results.
- Manual sentence navigation, word selection, pause and Auto-Scroll.
- Audio level and script-match indicators.
- Stage directions in square brackets remain visible and do not advance voice tracking.
- Browser speech recognition, and optional OpenAI streaming transcription.

Microphone access is requested only when Start is clicked in voice mode.
Pausing, editing, switching mode, hiding the page, or closing the app stops
microphone capture. Arrow keys select sentences; Space pauses/resumes when
focus is in the reading area; Escape pauses.

The meter indicates microphone level and recent script matches. It is not
a pronunciation assessment, and script-match confidence is not an ASR
confidence score. Accuracy and latency depend on the provider, microphone,
network, text and host. No fixed latency or perfect recognition is promised.

## Connect to Codex

Keep the server running. Add its URL to your MCP settings, or open this
directory as a trusted project and use the included local plugin marketplace.
The portable plugin consists of **plugin.json**, **mcp.json** and
**skills/teleprompter/SKILL.md**.

The bundled MCP configuration targets loopback. An MCP Apps-capable host
renders the reader when **open_teleprompter** is called. Text-only clients
receive its text summary. UI rendering and microphone permissions must be
verified in the particular desktop/web host.

Local plugin discovery can require restarting the desktop app. The source
package does not modify your global Codex settings or restart your app.
See [connection and deployment](docs/CONNECT.md).

## Connect to ChatGPT

ChatGPT must be able to reach the MCP server through an HTTPS endpoint or
Secure MCP Tunnel. Loopback alone is insufficient for the cloud connection.
After connecting the server as a custom plugin, ask:

> Open the Teleprompter with this script: …

For public plugin distribution, deploy a stable HTTPS endpoint, update
**mcp.json**, configure a unique widget origin and public privacy information,
then complete OpenAI's submission/review process.
See [connection and deployment](docs/CONNECT.md).

## Optional OpenAI voice

Copy **.env.example** to **.env** and configure **OPENAI_API_KEY** on your
own server. Bun loads the local environment file. The app then enables OpenAI
in its provider menu. No permanent key is entered in the widget.

The server mints a token with a 60-second connection window. The browser
connects directly to OpenAI over WebRTC using **gpt-live-transcribe**,
German language hints and the **minimal** delay setting. Client-side silence
detection commits turns; continuous turns are bounded to eight seconds.
Sessions stop after 30 minutes and may be restarted. Token creation is limited
to 12 attempts per hour per server instance.

For remote paid voice, configure **MCP_AUTH_TOKEN** and authentication in
your MCP client. The bundled bearer guard supports private/self-hosted use.
A public multi-user release needs OAuth or another suitable authenticated
gateway, per-user quotas, and the operator's budget and privacy configuration.
Do not publish an unprotected token minting service.

Without an OpenAI key, supported browsers can use their own speech service.
That service may send audio to the browser vendor. If microphone access or
recognition is unavailable, use Auto-Scroll or the native macOS Teleprompter.

## Development

    bun run check
    bun run archive

No frontend framework, CDN, analytics, database, permanent audio recording,
or script file storage is required. Generated bundles and local credentials
are excluded from the source archive.

The native Swift version is a separate project. This app does not include
private scripts, native preferences or Keychain credentials from that app.

See [architecture](docs/ARCHITECTURE.md), [contributing](CONTRIBUTING.md)
and [security](SECURITY.md).
