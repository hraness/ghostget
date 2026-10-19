import { Database, constants as sqlite } from "bun:sqlite";
import { closeSync, constants, fstatSync, lstatSync, openSync } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { ensurePrivateStateDirectory, ghostgetStateHome, snapshotPrivateStateDirectory } from "../storage";
import { canonicalJson, sha256 } from "../canonical-json";
import type { ActivityPage, ActivityQuery, ActivityRow } from "./protocol";
import { ControlError, parseActivityQuery } from "./validation";
import type { ControlEnvironment } from "./web-policy";

type StoredRow={seq:number;id:string;started_at:string;finished_at:string|null;duration_ms:number|null;method:"GET"|"HEAD";origin:string|null;rule_id:string|null;endpoint:string|null;decision:ActivityRow["decision"];outcome:ActivityRow["outcome"];http_status:number|null;response_bytes:number;error_code:string|null};
const projection=(r:StoredRow):ActivityRow=>({id:r.id,sequence:r.seq,startedAt:r.started_at,finishedAt:r.finished_at,durationMs:r.duration_ms,method:r.method,origin:r.origin,ruleId:r.rule_id,endpoint:r.endpoint,decision:r.decision,outcome:r.outcome,httpStatus:r.http_status,responseBytes:r.response_bytes,errorCode:r.error_code});
const COLUMNS="seq,id,started_at,finished_at,duration_ms,method,origin,rule_id,endpoint,decision,outcome,http_status,response_bytes,error_code";

/** One native helper owns this store. It contains metadata only and grants no authority. */
export class ActivityStore {
  private readonly db:Database;
  private readonly cursorKey=randomBytes(32);
  private readonly directory:string;
  private readonly identity:ReturnType<typeof ensurePrivateStateDirectory>;
  private readonly fileIdentity:{dev:number;ino:number};
  private closed=false;
  private readonly startedMonotonic=new Map<string,number>();
  constructor(private readonly environment:ControlEnvironment=process.env, private readonly now:()=>number=Date.now,private readonly monotonic:()=>number=()=>performance.now()) {
    this.directory=join(ghostgetStateHome(environment),"control","activity");
    this.identity=ensurePrivateStateDirectory(this.directory,environment);
    const path=join(this.directory,"requests.sqlite");
    const fd=openSync(path,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
    try { const stat=fstatSync(fd); if(!stat.isFile() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o600 || stat.nlink!==1) throw new Error("unsafe activity file"); this.fileIdentity={dev:stat.dev,ino:stat.ino}; } finally {closeSync(fd);}
    this.checkFiles();
    this.db=new Database(path,sqlite.SQLITE_OPEN_READWRITE|sqlite.SQLITE_OPEN_NOFOLLOW);
    try {
      this.db.exec("PRAGMA busy_timeout=250; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA max_page_count=32768; PRAGMA trusted_schema=OFF;");
      const version=this.db.query<{user_version:number},[]>("PRAGMA user_version").get()?.user_version;
      if(version!==0&&version!==1) throw new Error("unsupported activity schema");
      this.db.exec("CREATE TABLE IF NOT EXISTS requests (seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,started_at TEXT NOT NULL,finished_at TEXT,duration_ms INTEGER,method TEXT NOT NULL CHECK(method IN ('GET','HEAD')),origin TEXT,rule_id TEXT,endpoint TEXT,decision TEXT NOT NULL CHECK(decision IN ('allow','deny','ask')),outcome TEXT NOT NULL CHECK(outcome IN ('started','succeeded','denied','failed','cancelled','interrupted')),http_status INTEGER,response_bytes INTEGER NOT NULL DEFAULT 0,error_code TEXT); CREATE INDEX IF NOT EXISTS requests_method ON requests(method,seq); CREATE INDEX IF NOT EXISTS requests_outcome ON requests(outcome,seq); CREATE INDEX IF NOT EXISTS requests_origin ON requests(origin,seq); CREATE INDEX IF NOT EXISTS requests_time ON requests(started_at,seq); PRAGMA user_version=1;");
      this.db.query("UPDATE requests SET outcome='interrupted',finished_at=?,error_code='PROCESS_INTERRUPTED' WHERE outcome='started'").run(new Date(now()).toISOString());
      this.prune(); this.checkFiles();
    } catch { this.db.close(); throw new ControlError("ACTIVITY_UNAVAILABLE","Local request history could not be opened safely."); }
  }
  private checkFiles():void {
    snapshotPrivateStateDirectory(this.directory,this.environment,this.identity);
    for(const name of ["requests.sqlite","requests.sqlite-journal","requests.sqlite-wal","requests.sqlite-shm"]) {
      let stat:ReturnType<typeof lstatSync>; try {stat=lstatSync(join(this.directory,name));} catch(error) {if((error as NodeJS.ErrnoException).code==="ENOENT"&&name!=="requests.sqlite") continue; throw error;}
      if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.nlink!==1||name.endsWith("-wal")||name.endsWith("-shm")) throw new ControlError("ACTIVITY_UNSAFE","Local request history has unsafe filesystem state.");
      if(name==="requests.sqlite"&&(stat.dev!==this.fileIdentity.dev||stat.ino!==this.fileIdentity.ino)) throw new ControlError("ACTIVITY_REPLACED","Local request history changed. Restart Ghostget.");
    }
  }
  private ready():void { if(this.closed) throw new ControlError("ACTIVITY_CLOSED","Local request history is closed."); this.checkFiles(); }
  private prune():void {
    // Audit retention never authorizes retries; provider dispatch journals are separate.
    this.db.query("DELETE FROM requests WHERE outcome != 'started' AND (started_at < ? OR seq < COALESCE((SELECT seq FROM requests WHERE outcome != 'started' ORDER BY seq DESC LIMIT 1 OFFSET 9999),0))").run(new Date(this.now()-30*86400_000).toISOString());
  }
  start(row:Pick<ActivityRow,"id"|"method"|"origin"|"ruleId"|"endpoint"|"decision">):void {
    this.ready();
    this.db.transaction(()=>{
      this.prune();
      const count=this.db.query<{n:number},[]>("SELECT COUNT(*) AS n FROM requests").get()!.n;
      if(count>=10_128) throw new ControlError("ACTIVITY_FULL","Request history is at capacity. Wait for active requests to finish.");
      this.db.query("INSERT INTO requests(id,started_at,method,origin,rule_id,endpoint,decision,outcome) VALUES(?,?,?,?,?,?,?,'started')").run(row.id,new Date(this.now()).toISOString(),row.method,row.origin,row.ruleId,row.endpoint,row.decision);
    }).immediate();
    this.startedMonotonic.set(row.id,this.monotonic());
    this.checkFiles();
  }
  finish(id:string,result:Pick<ActivityRow,"outcome"|"httpStatus"|"responseBytes"|"errorCode">):void {
    this.ready();
    if(result.outcome==="started") throw new Error("activity finish must be terminal");
    const started=this.startedMonotonic.get(id);
    const duration=started===undefined?null:Math.max(0,Math.round(this.monotonic()-started));
    const r=this.db.query("UPDATE requests SET outcome=?,finished_at=?,duration_ms=?,http_status=?,response_bytes=?,error_code=? WHERE id=? AND outcome='started'").run(result.outcome,new Date(this.now()).toISOString(),duration,result.httpStatus,result.responseBytes,result.errorCode,id);
    if(r.changes!==1) throw new ControlError("ACTIVITY_CONFLICT","Request history could not record this result.");
    this.startedMonotonic.delete(id);
    this.prune();
    this.checkFiles();
  }
  query(raw:ActivityQuery):ActivityPage {
    this.ready(); const q=parseActivityQuery(raw); const fingerprint=sha256(canonicalJson({...q,cursor:null}));
    const maximum=this.db.query<{n:number},[]>("SELECT COALESCE(MAX(seq),0) AS n FROM requests").get()!.n;
    let upper=maximum; let after:number|null=null;
    if(q.cursor!==null) {
      try {
        const parts=q.cursor.split("."); if(parts.length!==2) throw new Error();
        const payload=parts[0]!; const mac=Buffer.from(parts[1]!,"hex"); const expected=createHmac("sha256",this.cursorKey).update(payload).digest();
        if(mac.length!==expected.length||!timingSafeEqual(mac,expected)) throw new Error();
        const v=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {f?:unknown;u?:unknown;a?:unknown};
        if(v.f!==fingerprint||!Number.isSafeInteger(v.u)||!Number.isSafeInteger(v.a)||typeof v.u!=="number"||typeof v.a!=="number"||v.u<0||v.a<1||v.a>v.u||v.u>maximum) throw new Error();
        upper=v.u; after=v.a;
      } catch {throw new ControlError("STALE_CURSOR","The activity view expired. Refresh to continue.");}
    }
    const where=["seq <= ?"]; const args:(number|string)[]=[upper];
    if(q.method!=="all"){where.push("method = ?");args.push(q.method);}
    if(q.outcome!=="all"){where.push("outcome = ?");args.push(q.outcome);}
    if(q.origin!==null){where.push("origin = ?");args.push(q.origin);}
    if(q.since!==null){where.push("started_at >= ?");args.push(q.since);}
    if(q.search.trim()) {where.push("(COALESCE(origin,'') || ' ' || COALESCE(rule_id,'') || ' ' || COALESCE(endpoint,'') || ' ' || method || ' ' || outcome || ' ' || COALESCE(error_code,'')) LIKE ? ESCAPE '\\'"); args.push(`%${q.search.trim().replace(/[\\%_]/gu,"\\$&")}%`);}
    const matchingCount=this.db.query<{n:number},(number|string)[]>(`SELECT COUNT(*) AS n FROM requests WHERE ${where.join(" AND ")}`).get(...args)!.n;
    if(after!==null){where.push(`seq ${q.order==="newest"?"<":">"} ?`);args.push(after);}
    const rows=this.db.query<StoredRow,(number|string)[]>(`SELECT ${COLUMNS} FROM requests WHERE ${where.join(" AND ")} ORDER BY seq ${q.order==="newest"?"DESC":"ASC"} LIMIT ?`).all(...args,q.limit+1);
    const more=rows.length>q.limit; const selected=rows.slice(0,q.limit); let nextCursor:string|null=null;
    if(more){const payload=Buffer.from(JSON.stringify({f:fingerprint,u:upper,a:selected.at(-1)!.seq})).toString("base64url");nextCursor=`${payload}.${createHmac("sha256",this.cursorKey).update(payload).digest("hex")}`;}
    return {rows:selected.map(projection),nextCursor,snapshotSequence:upper,matchingCount,newerCount:this.db.query<{n:number},[number]>("SELECT COUNT(*) AS n FROM requests WHERE seq > ?").get(upper)!.n};
  }
  close():void {if(this.closed)return;this.closed=true;this.db.close();}
}
