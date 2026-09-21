import { loadAuthSnapshotIfPresent, type AuthSnapshot } from "../auth";
import { canonicalJson, sha256 } from "../canonical-json";
import { projectionAuthIdentityHash, readProjectionAuthIdentityHashesIfPresent, withSettledReadProjectionAuthAdmission } from "../read-projections";

/** An account editor revision binds both metadata and the exact account lifetime. */
export function connectionAccountRevision(snapshot: AuthSnapshot, environment: Readonly<Record<string, string | undefined>> = process.env): string {
  return withSettledReadProjectionAuthAdmission(snapshot.auth.id, environment, () => {
    const current = loadAuthSnapshotIfPresent(snapshot.auth.id, environment);
    if (current === null || current.contentSha256 !== snapshot.contentSha256) throw new Error("Account changed while its revision was being inspected.");
    return sha256(canonicalJson({
      schemaVersion: 1,
      metadata: snapshot.contentSha256,
      incarnation: projectionAuthIdentityHash(snapshot.auth.id, sha256(canonicalJson(snapshot.auth)), environment),
    }));
  });
}

/**
 * Snapshot listing revisions for every account in one bounded batch read: the
 * same digest inputs at the coherence listAuthSnapshots already provides,
 * without a settled admission per account. Authoritative comparisons still run
 * through connectionAccountRevision under admission, so a rotated or mid-write
 * incarnation fails the expected-revision check there. Accounts missing an
 * incarnation fall back so its one-time creation stays under admission.
 */
export function connectionAccountSnapshotRevisions(snapshots: readonly AuthSnapshot[], environment: Readonly<Record<string, string | undefined>> = process.env): ReadonlyMap<string, string> {
  const incarnations = readProjectionAuthIdentityHashesIfPresent(
    snapshots.map((snapshot) => ({ authId: snapshot.auth.id, exactAuthContentHash: sha256(canonicalJson(snapshot.auth)) })),
    environment,
  );
  const revisions = new Map<string, string>();
  for (const snapshot of snapshots) {
    const incarnation = incarnations.get(snapshot.auth.id);
    revisions.set(snapshot.auth.id, incarnation === undefined
      ? connectionAccountRevision(snapshot, environment)
      : sha256(canonicalJson({
          schemaVersion: 1,
          metadata: snapshot.contentSha256,
          incarnation,
        })));
  }
  return revisions;
}
