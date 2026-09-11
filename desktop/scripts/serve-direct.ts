import { resolve, sep } from "node:path";
import { buildDesktop } from "./build.ts";
export async function serveDirect(port = 0) {
  const root = await buildDesktop("direct");
  return Bun.serve({ hostname: "127.0.0.1", port, async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__direct_disposed" && ["GET", "HEAD"].includes(request.method)) return new Response(request.method === "HEAD" ? null : '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ghostget scenario disposed</title></head><body><p>Scenario disposed.</p></body></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'", "X-Content-Type-Options": "nosniff" } });
    const pathname = decodeURIComponent(url.pathname); const target = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(root + sep) || !["GET", "HEAD"].includes(request.method)) return new Response("Not found", { status: 404 });
    const file = Bun.file(target); return await file.exists() ? new Response(request.method === "HEAD" ? null : file, { headers: { "Content-Type": file.type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }) : new Response("Not found", { status: 404 });
  } });
}
if (import.meta.main) { const server = await serveDirect(Number(process.env.GHOSTGET_DIRECT_PORT ?? 4179)); process.stdout.write(`Ghostget Direct: http://127.0.0.1:${server.port}/\n`); }
