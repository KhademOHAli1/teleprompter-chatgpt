# Connection and deployment

The package is an MCP server with optional MCP Apps UI. It does not use a
custom GPT action or inject a webpage into ChatGPT.

## Local Codex

Start the server and connect **http://127.0.0.1:4317/mcp** through the MCP
settings in a compatible local client.
Alternatively open this source directory as a trusted project. Its local
marketplace advertises the root plugin under **teleprompter-local**.
Install/enable it through the host's Plugins UI; a desktop restart may be
needed for discovery. Do not overwrite an existing global marketplace.

For a Codex config example:

    [mcp_servers.teleprompter]
    url = "http://127.0.0.1:4317/mcp"

If bearer auth is enabled, configure the client's bearer token environment
variable. Keep the value out of checked-in configuration.

## ChatGPT development connection

Use an HTTPS development tunnel or OpenAI Secure MCP Tunnel to reach the
running **/mcp** endpoint. The local browser preview route is intended for
loopback testing and is disabled when the server binds publicly.

For a localhost-only setup, use **Secure MCP Tunnel**. It forwards requests
through an outbound connection while this server remains bound to loopback.
The tunnel client needs a tunnel ID, a runtime API key and permission to use
the target OpenAI organization/workspace. These are separate from optional
OpenAI voice credentials. They must be configured locally or in the tunnel
client's secret environment, never pasted into the chat or committed.
The package does not create a tunnel or change account permissions.
Follow the [official Secure MCP Tunnel setup](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

In ChatGPT Plugins, choose the plus button, then **Add custom MCP server**.
Enter the name Teleprompter and the **/mcp** HTTPS URL, or select the configured
Secure MCP Tunnel. Configure authentication, review the displayed warning,
then **Create as a plugin**. Install the plugin and select it with **@** in
a new conversation. Ask to open a neutral test script.

Test script transfer, UI rendering, microphone permissions, transcription
and Pause in that host. Refresh the connection after metadata changes.
The browser preview and automated MCP client tests do not replace these checks.

## Stable HTTPS deployment

Use a host that runs Bun, behind an HTTPS reverse proxy:

    bun install --frozen-lockfile
    bun run build

Set **HOST=0.0.0.0**, **PORT** and **PUBLIC_ORIGIN** to your actual
HTTPS origin. Start with **bun run start** and route **/mcp** and **/health**
to that process. Keep environment secrets in your host's secret manager.
The server validates Host and browser Origin headers and limits request size.
Add operator rate limits and uptime monitoring as appropriate.

For paid OpenAI voice, configure **OPENAI_API_KEY** and **MCP_AUTH_TOKEN**.
All **/mcp** requests then require bearer authentication.
Private bearer connections depend on client support. For public directory
distribution, add OAuth discovery and a suitable authentication gateway.
This initial source package does not implement user accounts or OAuth.

Update **mcp.json** to use the deployed HTTPS address.
Configure **WIDGET_ORIGIN** with a unique component origin for submission.
Serve a public privacy policy that accurately describes your deployment;
the included privacy document is a source-level description, not an account
of an unspecified hosting provider.

Submit the remote HTTPS endpoint and plugin through OpenAI's review process.
A local or temporary tunnel alone does not qualify as public deployment.

## Official references

- [OpenAI MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [MCP Apps microphone permissions](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiResourcePermissions.html)
- [Private localhost connection with Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

Documentation checked on 2026-10-07. Hosts can decline microphone permissions
even when the app requests them.
