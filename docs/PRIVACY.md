# Data flow and privacy

This describes the source package. Deployers must document their own host,
logs, authentication and privacy policy before inviting users.

- A script supplied through the chat is processed by the chat host and the
  MCP server for that request. It is delivered to the iframe in tool-result
  metadata. It is not written to a database or file by this server.
- Text pasted directly in the app is held in the iframe's current memory.
  The app does not call a tool to save or send that draft back to the chat.
  This is not a security boundary against the host that embeds the iframe.
- The app does not save drafts or transcript histories to localStorage or
  widgetState. Reloading can lose edits. The chat host may retain original
  tool inputs/outputs under its own retention rules.
- In voice mode, microphone capture starts after Start and stops on Pause,
  editing, mode changes, page hiding, teardown, errors or the 30-minute limit.
- Browser speech recognition may transmit audio to the browser vendor.
  Its data handling depends on the browser and recognition implementation.
- Optional OpenAI mode sends microphone audio directly to OpenAI over
  WebRTC. The MCP server requests an ephemeral credential using its own
  permanent API key. The credential is hidden from model-visible content.
- OpenAI receives the audio and German transcription settings. This version
  does not send the script as a transcription prompt. Transcripts are held
  in bounded in-memory maps for alignment and are not returned to the chat.
- The server does not log script, audio, transcript, token or API-key values.
  Startup logs include only the local server address. Infrastructure access
  logs or host tool logs remain the deployer's responsibility.
- There are no analytics, advertising, external fonts, tracking pixels,
  audio recordings or automatic uploads in this source.

The microphone meter measures level and script match. It does not determine
whether a speaker has a disability or rate their accent or pronunciation.

Related documentation:
[OpenAI live transcription](https://developers.openai.com/api/docs/guides/realtime-transcription).
