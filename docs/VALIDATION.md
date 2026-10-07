# Validation — 2026-10-07

Version 0.2.0. Local environment: macOS, Bun 1.4.2, TypeScript 7.0.2.

## Verified locally

- TypeScript type check and self-contained frontend build.
- Frozen installation, type check, build and all tests from the extracted
  source ZIP in a fresh directory whose name contains spaces. Bun's shared
  dependency cache was reused; the lockfile did not change.
- Portable plugin and MCP manifests validated against the published Agent
  Plugins 1.0.0 JSON schemas.
- 46 automated tests: German text/word alignment, meter and turn detection,
  microphone lifecycle/cancellation with test doubles, actual MCP SDK HTTP
  client/server calls, legacy initialization, UI resource metadata, schema
  bounds, authentication, Host/Origin guards and mocked OpenAI token creation.
- The same iframe widget in the Codex in-app browser, through the official
  MCP Apps AppBridge: empty editor, neutral sample text, centered reading,
  Auto-Scroll progression, Pause, reset, sentence navigation, expanded view
  and return to editing. Markup-like input was displayed literally rather
  than creating HTML elements.

## Hosted GitHub check

The [initial GitHub Actions run](https://github.com/KhademOHAli1/teleprompter-chatgpt/actions/runs/37688385232)
passed on Ubuntu 24.04. It performed a frozen Bun install, TypeScript checking,
frontend build, all 37 tests for the initial 0.1.0 source and source packaging.

OpenAI token tests use synthetic responses, not a real paid API account.
Voice lifecycle tests do not replace real microphone recordings.

## Remaining integration checks

- Real OpenAI WebRTC transcription using the operator's configured API key.
- Representative German speech with the intended microphone and environment.
- Browser speech recognition in each supported browser/desktop host.
- Actual ChatGPT or native Codex plugin installation, UI rendering and
  microphone permissions in those hosts.
- Public HTTPS deployment, OAuth/multi-user quotas where needed, published
  privacy information and directory submission/review.

The source package is suitable for review and local development.
These checks do not certify word accuracy, a latency target, compatibility
with every host, or completion of public directory publication.

## Multilingual update

The interface uses platform locale negotiation, with four complete 196-key
catalogues and localized permission strings in the native app. Language-specific
regression checks cover English/French/Spanish spoken numerals, Chinese/Japanese
word boundaries, Arabic tracking, Turkish case mapping, Hindi combining marks
and UTF-16 highlight offsets. Native validation includes 91 Swift checks and
eight Python tests; the MCP app includes 46 tests. Real microphone acceptance
for every added language remains separate from these deterministic tests.
