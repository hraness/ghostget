/** Versioned temporary media acquisition. No result claims a retained archive. */
export interface EphemeralSupervisorIdentity {
  readonly requestId: string;
  readonly processGroupId: number;
  readonly processStartIdentity: string;
}
export interface EphemeralCleanupAcknowledgment {
  readonly custody: 'supervisor-reaped';
  readonly supervisor: EphemeralSupervisorIdentity;
}
export interface EphemeralStageReceipt {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly token: string;
  readonly device: number;
  readonly inode: number;
  readonly supervisor?: EphemeralSupervisorIdentity;
}
export interface EphemeralMediaFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly role: 'audio' | 'captions' | 'thumbnail';
}
export interface EphemeralMediaRequest {
  readonly url: string;
  /** Existing canonical private directory, owned by the consumer. */
  readonly stagingParent: string;
  /** Named saved Ghostget browser account; mutually exclusive with raw browser/context. */
  readonly accountId?: string;
  readonly browser?: string;
  readonly authContext?: string;
  readonly language?: string;
  /** Explicit local retranscription needs audio even when provider captions exist. */
  readonly preferAudio?: boolean;
  readonly maxBytes?: number;
  readonly maxDurationSeconds?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Inherit only under a supervisor which owns and reaps the complete process group. */
  readonly processGroup?: 'owned' | 'inherit';
  readonly supervisor?: EphemeralSupervisorIdentity;
  readonly onProgress?: (progress: {phase: 'probe' | 'captions' | 'audio' | 'verified'; bytes: number}) => void;
}
export type EphemeralMediaErrorCode = 'invalid-input' | 'unsupported' | 'permission-or-provider-failure' | 'unavailable' | 'limit-exceeded' | 'cancelled' | 'timeout' | 'integrity' | 'cleanup-required';
export interface EphemeralMediaManifest {
  readonly schemaVersion: 1;
  readonly kind: 'ephemeral-media';
  readonly retainedSourceArchive: false;
  readonly source: {
    readonly requestedUrlSha256: string;
    readonly accountFingerprint: string | null;
    readonly providerIdentitySha256: string;
    readonly durationSeconds: number;
    readonly title?: string;
    readonly author?: string;
  };
  readonly caption: {readonly source: 'manual' | 'automatic'; readonly language: string} | null;
  readonly files: readonly EphemeralMediaFile[];
  readonly warnings: readonly string[];
}
export type EphemeralMediaResult =
  | {readonly ok: true; readonly receipt: EphemeralStageReceipt; readonly manifest: EphemeralMediaManifest; readonly cleanup: 'pending'}
  | {readonly ok: false; readonly code: EphemeralMediaErrorCode; readonly cleanup: 'settled' | 'pending'; readonly receipt?: EphemeralStageReceipt};
export type EphemeralCleanupResult = {readonly status: 'settled' | 'pending'};
