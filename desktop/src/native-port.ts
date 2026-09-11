import { invoke } from "@tauri-apps/api/core";
import type { ControlPanelPort, ControlRequest, ControlResponse } from "../../src/control/protocol.ts";
import { parseControlResponse } from "./response.ts";

export const nativePort: ControlPanelPort = {
  async request(request: ControlRequest, signal?: AbortSignal): Promise<ControlResponse> {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    // Renderer cancellation discards a reply. Consequential host work is cancelled
    // only by its explicit protocol action or host shutdown; never imply rollback.
    const value: unknown = await invoke("control_request", { request });
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    return parseControlResponse(value);
  },
};
