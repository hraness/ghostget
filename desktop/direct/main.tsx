import { createRoot } from "react-dom/client";
import { installDirectBrowser } from "@hraness/direct/web";
import { createPanelSession } from "./definition.ts";
import { ControlPanel } from "../src/panel.tsx";
import "../src/styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing workbench root");
const created = createPanelSession({ kind: "query", source: window.location.search });
if (!created.ok) { container.textContent = "This scenario could not be opened. Use an exact scenario from the checked catalog."; container.setAttribute("role", "alert"); }
else {
  const session = created.value;
  const installed = installDirectBrowser({ session, reset: () => { throw new Error("Reload the selected scenario to reset its state"); }, firewall: { onBlocked: session.harness.recordViolation, onActivityError: session.harness.recordViolation } });
  if (!installed.ok) throw new Error("Workbench browser boundary failed");
  const root = createRoot(container); root.render(<ControlPanel model={session.harness.model} />);
  const error = () => session.harness.recordViolation();
  window.addEventListener("error", error); window.addEventListener("unhandledrejection", error); window.addEventListener("securitypolicyviolation", error);
  session.onDispose(() => { window.removeEventListener("error", error); window.removeEventListener("unhandledrejection", error); window.removeEventListener("securitypolicyviolation", error); root.unmount(); });
  void session.harness.model.refresh();
  if (session.harness.model.getSnapshot().section === "activity") void session.harness.model.loadActivity(false);
  window.addEventListener("pagehide", () => {
    // An owned verifier nonce binds teardown evidence to this exact fixture session.
    // No receipt is used as a substitute for the canonical live bridge/probe.
    const nonce = sessionStorage.getItem("ghostget.direct.disposal-nonce");
    session.dispose();
    if (nonce !== null) {
      sessionStorage.removeItem("ghostget.direct.disposal-nonce");
      sessionStorage.setItem("ghostget.direct.disposal-receipt", JSON.stringify({ schema: "ghostget.direct-disposal/1", nonce, activationHash: session.manifest.active.activationHash, disposed: session.isDisposed(), errors: session.disposalErrors().length }));
    }
  }, { once: true });
}
