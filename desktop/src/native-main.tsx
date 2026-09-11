import { createRoot } from "react-dom/client";
import { PanelModel } from "./model.ts";
import { ControlPanel } from "./panel.tsx";
import { nativePort } from "./native-port.ts";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Application root is missing");
const model = new PanelModel(nativePort);
const root = createRoot(container);
root.render(<ControlPanel model={model} />);
void model.refresh().then(() => {
  const discovery = model.getSnapshot().snapshot?.discovery;
  // The setting is chosen in the native app. Agent status and fixtures never scan.
  if (discovery?.enabled && discovery.status === "not-scanned") void model.command({ action: "discovery.refresh", expectedRevision: discovery.revision });
});
// Approval polling never rebuilds the catalog. Refresh external account and
// integration edits when returning to the app, after commands, or on demand.
const refreshTimer = setInterval(() => {
  if (document.visibilityState === "visible") void model.refreshAttention();
}, 4000);
const refreshOnReturn = () => {
  const state = model.getSnapshot();
  if (document.visibilityState === "visible" && !state.busy && !state.loading && !state.cancellingConnection) void model.refresh();
};
window.addEventListener("focus", refreshOnReturn);
document.addEventListener("visibilitychange", refreshOnReturn);
window.addEventListener("pagehide", () => { clearInterval(refreshTimer); window.removeEventListener("focus", refreshOnReturn); document.removeEventListener("visibilitychange", refreshOnReturn); root.unmount(); model.dispose(); }, { once: true });
