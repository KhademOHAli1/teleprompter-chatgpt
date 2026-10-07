# Architecture

**src/mcp.ts** exposes open_teleprompter and the app-only start_voice_session
tool. The reader is associated through standard **_meta.ui.resourceUri**.
The versioned resource uses **text/html;profile=mcp-app**, requests microphone
permission and permits connections only to **https://api.openai.com**.

**src/server.ts** serves stateless Streamable HTTP through the official MCP
SDK and Bun. A new MCP server/transport is created per request. Token quotas
are shared by the process, not reset by per-request server creation.
The local preview uses the official AppBridge; it does not mimic private
ChatGPT internals. Its credential endpoint requires same-origin POST and is
unavailable on public bindings.

**src/app.ts** handles editing, centered reading, sentence navigation and
Auto-Scroll. Script text is rendered through DOM text nodes. It never becomes
HTML markup. Tool results only replace the draft when they carry draft
metadata; a voice-session response cannot overwrite the current script.

**src/core.ts** segments German sentences with Intl.Segmenter and excludes
bracketed cues from spoken tokens. A bounded local sequence alignment follows
up to 32 heard tokens against nearby script words. Growing ASR revisions
share an utterance anchor, progress is monotonic, and far jumps require
several exact matches. German numbers, diacritics and compounds are normalized.
The tracker stores at most 80 utterance anchors.

**src/voice.ts** feature-detects browser recognition and microphone permission.
OpenAI mode negotiates WebRTC with an ephemeral credential and consumes
incremental transcript events. The client commits turns after speech ends or
after eight seconds of continuous speech. Capture and transport are closed
on pause and teardown, including cancelled async initialization.

**src/tokens.ts** keeps the permanent API key server-side. Credentials are
returned only in widget metadata and expire for new connections after
60 seconds. Paid public voice requires bearer protection; a directory-ready
multi-user deployment needs additional authentication and operating controls.

**scripts/build.ts** bundles dependencies and UI into one HTML resource.
There are no external frontend assets. The preview bridge is a separate bundle.
The Bun lockfile fixes transitive dependency versions.
