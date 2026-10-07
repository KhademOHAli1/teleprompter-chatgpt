---
name: teleprompter
description: Open a German teleprompter when the user wants to read an existing script on camera, rehearse a speech, or use a voice-following reader.
---

Call the bundled MCP tool **open_teleprompter** to open the interactive reader.
Pass the user's script exactly, including punctuation and stage directions.
Use an empty text when the user wants to paste privately in the app.
Do not invent, shorten, translate, or rewrite their script unless requested.

Explain that microphone capture starts only after the user presses Start.
The user can choose voice following or Auto-Scroll inside the app.
Microphone availability depends on host permissions. Browser recognition can
use the browser vendor's speech service; optional OpenAI recognition sends
audio directly to OpenAI and uses the operator's API account.

If the tool is unavailable, state that the MCP server must be running and
connected. Follow the repository's README for installation. Do not claim
that a plain browser preview is a verified ChatGPT integration.
