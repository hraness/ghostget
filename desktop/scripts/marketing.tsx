import { mkdir, readdir, writeFile, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlPanel } from "../src/panel.tsx";
import { PanelModel, initialQuery } from "../src/model.ts";
import { activityPage, createPanelSession } from "../direct/definition.ts";
import { buildDesktop, desktopRoot } from "./build.ts";

export const marketingScenes = [
  { id: "accounts", scenario: "activity.history", section: "accounts", title: "Connected accounts", description: "The real Ghostget account screen, with fictional accounts." },
  { id: "capabilities", scenario: "capabilities.policy", section: "capabilities", title: "Operation permissions", description: "Inspect capabilities and choose an operation's permission." },
  { id: "activity", scenario: "activity.history", section: "activity", title: "Web activity", description: "A virtualized view of fictional gateway request metadata." },
  { id: "approvals", scenario: "approvals.pending", section: "approvals", title: "Human approval", description: "Review an exact proposed action before allowing it once." },
] as const;
export async function buildMarketing(): Promise<string> {
  const production = await buildDesktop("native"); const output = join(desktopRoot, "out", "marketing");
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const assets = (await readdir(production)).filter(name => /\.(css|woff2)$/u.test(name));
  for (const asset of assets) await copyFile(join(production, asset), join(output, asset));
  for (const scene of marketingScenes) {
    const created = createPanelSession({ kind: "scenario", scenario: scene.scenario }); if (!created.ok) throw new Error("Invalid marketing scene");
    const session = created.value;
    try {
      const snapshot = session.harness.model.getSnapshot().snapshot; if (!snapshot) throw new Error("Missing scene snapshot");
      const model = new PanelModel({ request: async () => { throw new Error("Inert rendering refuses IO"); } }, { snapshot, section: scene.section, ...(scene.section === "activity" ? { activity: activityPage(session.harness.rows, initialQuery) } : {}), now: () => session.clock.now(), locale: "en-US", timeZone: "UTC" });
      const markup = renderToStaticMarkup(<div inert><ControlPanel model={model} /></div>); model.dispose();
      const html = `<!doctype html><html lang="en" data-hraness-theme="paper"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; worker-src 'none'"><title>${scene.title} · fictional Ghostget example</title>${assets.filter(name => name.endsWith(".css")).map(name => `<link rel="stylesheet" href="./${name}">`).join("")}</head><body>${markup}</body></html>`;
      if (/<script\b|__direct|@tauri-apps|control_request/u.test(html)) throw new Error("Executable authority reached marketing scene");
      await writeFile(join(output, `${scene.id}.html`), html);
    } finally { session.dispose(); if (session.disposalErrors().length) throw new Error("Marketing session cleanup failed"); }
  }
  await writeFile(join(output, "scenes.json"), JSON.stringify({ version: 1, disclosure: "Real Ghostget interface, fictional accounts and requests. These examples cannot sign in, approve requests or change a machine.", scenes: marketingScenes.map(({ id, title, description }) => ({ id, title, description, path: `${id}.html` })) }, null, 2));
  for (const name of await readdir(output)) if (/\.(js|map)$/u.test(name)) throw new Error("Marketing output must be inert");
  return output;
}
if (import.meta.main) process.stdout.write(`${await buildMarketing()}\n`);
