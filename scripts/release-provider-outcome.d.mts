/** Pure release admissions consumed by the typed desktop distribution pipeline.
 * Runtime validators continue to parse provider payloads from unknown. */
export interface PublishedReleaseAdmission {
  readonly repository: string;
  readonly value: unknown;
  readonly verifiedSha: string;
  readonly verifiedTag: string;
}
export function releaseWorkflowRunIdFromPublishedRelease(
  input: PublishedReleaseAdmission,
  label?: string,
): string;

export interface ReleaseWorkflowRunAdmission extends PublishedReleaseAdmission {
  readonly workflowRunId: string;
  readonly expectedRunAttempt?: string;
  /** Complete receipt-attempt jobs are required when the later npm job failed. */
  readonly canonicalJobs?: unknown;
}
export function exactReleaseWorkflowRun(
  input: ReleaseWorkflowRunAdmission,
  label?: string,
): Record<string, unknown>;
