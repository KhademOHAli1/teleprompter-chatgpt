# Security

Do not submit API keys, real transcripts or private scripts in public issues.
For an unresolved vulnerability, use the repository host's private security
advisory channel once the project is published. This source package has no
published maintainer contact yet.

Permanent OpenAI credentials belong in the server environment. The widget
receives only ephemeral credentials in hidden tool-result metadata.
The initial bearer authentication is suitable for private self-hosted
connections. Public multi-user operation requires a suitable authenticated
gateway or OAuth, per-user quotas and provider spending controls.

The app requests only microphone access. It uses the official MCP Apps
postMessage transport with source validation. User text is rendered as text,
never trusted as markup or instructions to the server.

Host, Origin and request-size guards protect the local server. Preview-only
routes are disabled for public bindings. Do not remove these guards to
work around a deployment problem; configure the actual origin instead.
