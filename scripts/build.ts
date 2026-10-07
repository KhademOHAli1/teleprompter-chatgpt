// SPDX-License-Identifier: MIT
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url), dist = new URL("dist/", root);
await mkdir(dist, { recursive: true });
async function bundle(file: string) {
  const result = await Bun.build({ entrypoints: [fileURLToPath(new URL("src/" + file, root))], target: "browser", minify: true });
  if (!result.success) throw new Error(result.logs.join("\n"));
  return result.outputs[0]!.text();
}
const js = await bundle("app.ts");
const css = await Bun.file(new URL("src/style.css", root)).text();
const template = await Bun.file(new URL("src/widget.html", root)).text();
const html = template.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js.replaceAll("</script", "<\\/script"));
await Bun.write(new URL("widget.html", dist), html);
await Bun.write(new URL("preview.js", dist), await bundle("preview.ts"));
await Bun.write(new URL("preview.html", dist), Bun.file(new URL("src/preview.html", root)));
console.log("Built self-contained MCP Apps widget and local preview.");
