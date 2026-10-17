// @bun
import {
  __require
} from "./index-z1w83f81.js";

// src/media-acquisition.ts
async function acquireEphemeralMedia(request) {
  return (await import("./ephemeral-acquire-x0m41f0f.js")).acquireEphemeralMedia(request);
}
async function cleanupEphemeralMedia(receipt, acknowledgment) {
  return (await import("./ephemeral-stage-ff8b277b.js")).cleanupEphemeralStage(receipt, acknowledgment);
}
async function inspectEphemeralMedia(receipt) {
  const marker = await (await import("./ephemeral-stage-ff8b277b.js")).inspectEphemeralStage(receipt);
  return { state: marker.state };
}
export {
  inspectEphemeralMedia,
  cleanupEphemeralMedia,
  acquireEphemeralMedia
};
