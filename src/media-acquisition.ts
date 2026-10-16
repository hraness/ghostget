/** Local Bun SDK boundary. Acquisition never creates a retained media archive. */
export type {EphemeralMediaRequest, EphemeralMediaResult, EphemeralMediaManifest, EphemeralMediaFile, EphemeralStageReceipt, EphemeralCleanupResult, EphemeralMediaErrorCode, EphemeralSupervisorIdentity, EphemeralCleanupAcknowledgment} from './media/ephemeral-types';
import type {EphemeralMediaRequest, EphemeralMediaResult, EphemeralStageReceipt, EphemeralCleanupResult, EphemeralCleanupAcknowledgment} from './media/ephemeral-types';
export async function acquireEphemeralMedia(request: EphemeralMediaRequest): Promise<EphemeralMediaResult> {
  return (await import('./media/ephemeral-acquire')).acquireEphemeralMedia(request);
}
export async function cleanupEphemeralMedia(receipt: EphemeralStageReceipt, acknowledgment?: EphemeralCleanupAcknowledgment): Promise<EphemeralCleanupResult> {
  return (await import('./media/ephemeral-stage')).cleanupEphemeralStage(receipt, acknowledgment);
}
export async function inspectEphemeralMedia(receipt: EphemeralStageReceipt): Promise<{state: 'acquiring' | 'ready'}> {
  const marker = await (await import('./media/ephemeral-stage')).inspectEphemeralStage(receipt);
  return {state: marker.state};
}
