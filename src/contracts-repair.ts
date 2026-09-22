import { canonicalJson, sha256 } from "./canonical-json";
import {
  isInvalidCatalogAdapter,
  parseContractCatalog,
  type ContractCatalogAdapter,
  type ContractCatalogOperation,
} from "./contracts-catalog";
import { collectionPlanReads, parseCollectionPlan } from "./contracts-plan";
import { ContractParseError, parseShape, type Shape } from "./contracts-shape";
import {
  contractPatterns,
  contractStates,
  contractTransports,
  operationAuthorities,
  operationRisks,
  type ContractOperationRisk,
  type ContractState,
  type ContractTransport,
  type OperationAuthority,
} from "./contracts-vocabulary";
import { validateOperationInput } from "./model";

export type ContractRepairBinding = {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly manifestHash: string;
  readonly operationId: string;
  readonly transport: ContractTransport;
  readonly authority: OperationAuthority;
  readonly risk: ContractOperationRisk;
  readonly readOnly: boolean;
  readonly state: ContractState;
  readonly contractVersion: number;
  readonly contractHash: string;
};

export type ContractRepairReason = "capture-required" | "contract-drift";
export type ContractRepairSignal = {
  readonly contract: "ghostget.contract-repair-signal.v1";
  readonly id: string;
  readonly reason: ContractRepairReason;
  readonly binding: ContractRepairBinding;
};

const statuses = ["capture-required", "investigate", "update-candidate", "blocked", "unavailable"] as const;
type RepairStatus = (typeof statuses)[number];
const steps = [
  "reproduce-with-synthetic-fixture",
  "review-authorized-evidence",
  "propose-provider-patch",
  "run-provider-gates",
  "verify-current-contract",
  "propose-consumer-update",
  "run-consumer-gates",
  "review-authority-boundary",
  "inspect-installed-catalog",
] as const;
type RepairStep = (typeof steps)[number];

export type ContractRepairHandoff = {
  readonly contract: "ghostget.contract-repair.v1";
  readonly signal: ContractRepairSignal;
  readonly current: ContractRepairBinding | null;
  readonly status: RepairStatus;
  readonly steps: readonly RepairStep[];
  readonly consumerAction: "none" | "suggest-update-pr";
  readonly authority: {
    readonly recapture: false;
    readonly retry: false;
    readonly activate: false;
    readonly publish: false;
  };
};

const hash: Shape = { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 };
export const contractRepairBindingShape: Shape = {
  kind: "object",
  properties: {
    adapterId: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    adapterVersion: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
    manifestHash: hash,
    operationId: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    transport: { kind: "enum", values: contractTransports },
    authority: { kind: "enum", values: operationAuthorities },
    risk: { kind: "enum", values: operationRisks },
    readOnly: { kind: "boolean" },
    state: { kind: "enum", values: contractStates },
    contractVersion: { kind: "integer", minimum: 1, maximum: 1_000_000 },
    contractHash: hash,
  },
};
export const contractRepairSignalShape: Shape = {
  kind: "object",
  properties: {
    contract: { kind: "literal", value: "ghostget.contract-repair-signal.v1" },
    id: hash,
    reason: { kind: "enum", values: ["capture-required", "contract-drift"] },
    binding: contractRepairBindingShape,
  },
};
export const contractRepairShape: Shape = {
  kind: "object",
  properties: {
    contract: { kind: "literal", value: "ghostget.contract-repair.v1" },
    signal: contractRepairSignalShape,
    current: { kind: "union", variants: [contractRepairBindingShape, { kind: "null" }] },
    status: { kind: "enum", values: statuses },
    steps: { kind: "array", items: { kind: "enum", values: steps }, maxItems: steps.length },
    consumerAction: { kind: "enum", values: ["none", "suggest-update-pr"] },
    authority: {
      kind: "object",
      properties: {
        recapture: { kind: "literal", value: false },
        retry: { kind: "literal", value: false },
        activate: { kind: "literal", value: false },
        publish: { kind: "literal", value: false },
      },
    },
  },
};

function checkBinding(binding: ContractRepairBinding): void {
  if (binding.readOnly && binding.risk !== "R1") {
    throw new ContractParseError("repair.binding.readOnly", "requires R1");
  }
}

export function contractRepairBinding(
  adapter: Pick<ContractCatalogAdapter, "id" | "version" | "manifestHash">,
  operation: ContractCatalogOperation,
): ContractRepairBinding {
  const binding = parseShape<ContractRepairBinding>(contractRepairBindingShape, {
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    manifestHash: adapter.manifestHash,
    operationId: operation.id,
    transport: operation.transport,
    authority: operation.authority,
    risk: operation.risk,
    readOnly: operation.risk === "R1" && operation.sideEffect === "none",
    state: operation.state,
    contractVersion: operation.contractVersion,
    contractHash: operation.contractHash,
  }, "repair.binding");
  checkBinding(binding);
  return binding;
}

export function createContractRepairSignal(
  reason: ContractRepairReason,
  bindingValue: ContractRepairBinding,
): ContractRepairSignal {
  const binding = parseShape<ContractRepairBinding>(contractRepairBindingShape, bindingValue, "repair.binding");
  const identity = { contract: "ghostget.contract-repair-signal.v1" as const, reason, binding };
  return parseContractRepairSignal({ ...identity, id: sha256(canonicalJson(identity)) });
}

export function parseContractRepairSignal(value: unknown): ContractRepairSignal {
  const signal = parseShape<ContractRepairSignal>(contractRepairSignalShape, value, "repair.signal");
  checkBinding(signal.binding);
  const { id, ...identity } = signal;
  if (id !== sha256(canonicalJson(identity))) {
    throw new ContractParseError("repair.signal.id", "does not bind the exact signal");
  }
  if ((signal.reason === "capture-required") !== (signal.binding.state === "capture-required")) {
    throw new ContractParseError("repair.signal.reason", "does not match the contract state");
  }
  return signal;
}

function assessment(signal: ContractRepairSignal, current: ContractRepairBinding | null): RepairStatus {
  if (current === null) return "unavailable";
  const previous = signal.binding;
  if (current.adapterId !== previous.adapterId || current.operationId !== previous.operationId) {
    throw new ContractParseError("repair.current", "does not match the signal route");
  }
  checkBinding(current);
  if (!previous.readOnly || !current.readOnly || current.risk !== previous.risk
    || current.transport !== previous.transport || current.authority !== previous.authority
    || current.transport === "reviewed-template-api" || current.contractVersion < previous.contractVersion) return "blocked";
  if (current.state === "capture-required") return "capture-required";
  if (current.contractHash !== previous.contractHash || current.contractVersion !== previous.contractVersion) {
    return "update-candidate";
  }
  return signal.reason === "capture-required" ? "blocked" : "investigate";
}

function nextSteps(status: RepairStatus): readonly RepairStep[] {
  if (status === "blocked") return ["review-authority-boundary"];
  if (status === "unavailable") return ["inspect-installed-catalog"];
  if (status === "update-candidate") return ["verify-current-contract", "propose-consumer-update", "run-consumer-gates"];
  return ["reproduce-with-synthetic-fixture", "review-authorized-evidence", "propose-provider-patch", "run-provider-gates"];
}

export function parseContractRepairHandoff(value: unknown): ContractRepairHandoff {
  const handoff = parseShape<ContractRepairHandoff>(contractRepairShape, value, "repair");
  const signal = parseContractRepairSignal(handoff.signal);
  const status = assessment(signal, handoff.current);
  if (handoff.status !== status || canonicalJson(handoff.steps) !== canonicalJson(nextSteps(status))
    || handoff.consumerAction !== (status === "update-candidate" ? "suggest-update-pr" : "none")) {
    throw new ContractParseError("repair", "assessment or next steps are inconsistent");
  }
  return handoff;
}

export function createContractRepairHandoff(signalValue: unknown, catalogValue: unknown): ContractRepairHandoff {
  const signal = parseContractRepairSignal(signalValue);
  const catalog = parseContractCatalog(catalogValue);
  const adapter = catalog.adapters.find(entry => entry.id === signal.binding.adapterId);
  const operation = adapter === undefined || isInvalidCatalogAdapter(adapter)
    ? undefined : adapter.operations.find(entry => entry.id === signal.binding.operationId);
  const current = adapter === undefined || isInvalidCatalogAdapter(adapter) || operation === undefined
    ? null : contractRepairBinding(adapter, operation);
  const status = assessment(signal, current);
  return parseContractRepairHandoff({
    contract: "ghostget.contract-repair.v1",
    signal,
    current,
    status,
    steps: nextSteps(status),
    consumerAction: status === "update-candidate" ? "suggest-update-pr" : "none",
    authority: { recapture: false, retry: false, activate: false, publish: false },
  });
}

export function contractRepairSignalsForPlan(planValue: unknown, catalogValue: unknown): readonly ContractRepairSignal[] {
  const plan = parseCollectionPlan(planValue);
  const catalog = parseContractCatalog(catalogValue);
  const signals = new Map<string, ContractRepairSignal>();
  for (const { read } of collectionPlanReads(plan)) {
    const adapter = catalog.adapters.find(entry => entry.id === read.adapter);
    if (adapter === undefined || isInvalidCatalogAdapter(adapter)) continue;
    const operation = adapter.operations.find(entry => entry.id === read.operation);
    if (operation === undefined || operation.state !== "capture-required"
      || operation.risk !== "R1" || operation.sideEffect !== "none"
      || operation.authority !== read.authority.kind
      || !validateOperationInput(operation.input, read.input, adapter.origins).ok) continue;
    const signal = createContractRepairSignal("capture-required", contractRepairBinding(adapter, operation));
    signals.set(signal.id, signal);
  }
  return Object.freeze([...signals.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

export class ContractCaptureRequiredError extends Error {
  readonly signal: ContractRepairSignal;

  constructor(message: string, signal: ContractRepairSignal) {
    super(message);
    this.name = "ContractCaptureRequiredError";
    this.signal = parseContractRepairSignal(signal);
  }
}
