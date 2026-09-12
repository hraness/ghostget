import type { PanelModel } from "./model.ts";

/** Clipboard failure leaves a selectable copy, including in native WebKit. */
export async function copyForAgent(model: PanelModel, text: string): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    model.clearOutput();
    model.notice("Copied. Paste into your agent.");
  } catch {
    if (model.getSnapshot().output?.text !== text) model.showPrompt(text);
    model.notice("Select and copy the instructions below.");
  }
}
