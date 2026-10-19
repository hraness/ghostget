import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "../canonical-json";
import { captureProcessOwnerIdentity, processOwnerStatus, type ProcessOwnerIdentity, type ProcessOwnerStatus } from "../process-identity";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, readPrivateStateFileIfPresent, removePrivateStateFileIfUnchanged, writePrivateJsonIfUnchanged } from "../storage";
import { record, keys, integer, digest, identifier, ControlError } from "./validation";
import type { ControlEnvironment } from "./web-policy";

/** How the owner record identifies and checks processes; tests inject contenders. */
export type ControlOwnerProcesses = Readonly<{
  capture:()=>ProcessOwnerIdentity;
  status:(owner:ProcessOwnerIdentity)=>ProcessOwnerStatus;
}>;
const currentProcess:ControlOwnerProcesses={capture:()=>captureProcessOwnerIdentity(process.pid),status:processOwnerStatus};
/** What an owner inspection saw: the record it may replace, or none. */
export type ControlOwnerInspection = Readonly<{path:string;previous:string|null}>;

/**
 * Read the owner record and refuse unless it is absent or its owner is
 * verifiably gone. A live or unverifiable owner keeps custody.
 */
export function inspectControlOwner(environment:ControlEnvironment,processes:ControlOwnerProcesses=currentProcess):ControlOwnerInspection {
  const directory=join(ghostgetStateHome(environment),"control");ensurePrivateStateDirectory(directory,environment);
  const path=join(directory,"owner.json");const previous=readPrivateStateFileIfPresent(path,2048,"control owner",environment);
  if(previous!==null){const v=record(JSON.parse(previous));keys(v,["schema","pid","bootId","processStartId","generation"]);if(v.schema!==1)throw new Error("invalid owner");const owner={pid:integer(v.pid,1,2**31-1),bootId:digest(v.bootId),processStartId:digest(v.processStartId)};identifier(v.generation);if(processes.status(owner)!=="different-or-dead")throw new ControlError("CONTROL_ALREADY_RUNNING","Ghostget is already open for this state home, or its previous owner cannot be verified.");}
  return {path,previous};
}

/**
 * Replace exactly the record the inspection saw, or create one where none
 * was. Another writer in between makes this fail, so two contenders that saw
 * the same record cannot both take custody. The returned release removes the
 * record only while it is still this owner's.
 */
export function commitControlOwner(environment:ControlEnvironment,inspection:ControlOwnerInspection,processes:ControlOwnerProcesses=currentProcess):()=>void {
  const {path,previous}=inspection;
  const next={schema:1,...processes.capture(),generation:randomUUID()};
  const acquired=previous===null?createPrivateJsonIfAbsent(path,next,{environment}).created:writePrivateJsonIfUnchanged(path,next,{expectedCurrentContentSha256:sha256(previous)});
  if(!acquired)throw new ControlError("CONTROL_ALREADY_RUNNING","Another Ghostget app opened this state home.");
  const expectedCurrentContentSha256=sha256(`${canonicalJson(next)}\n`);
  return ()=>{removePrivateStateFileIfUnchanged(path,{expectedCurrentContentSha256},environment);};
}

