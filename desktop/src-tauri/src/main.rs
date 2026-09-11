#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::{collections::HashMap, io::{BufRead, BufReader, Write}, path::Path, process::{Child, ChildStdin, Command, Stdio}, sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}, mpsc::{self, SyncSender}}, time::Duration};
use tauri::{Manager, State};
mod vault;

const PROTOCOL: &str = "ghostget.control/1";
const MAX_FRAME: usize = 4 * 1024 * 1024;
const ACTIONS: &[&str] = &["snapshot", "setup.list", "setup.dismiss", "discovery.configure", "discovery.refresh", "permission.enable", "permission.set", "approval.list", "approval.decide", "web.save", "activity.query", "interface.save", "interface.activate", "interface.export", "connection.begin", "connection.verify", "connection.commit", "connection.cancel", "connection.disconnect", "vault.lock", "vault.local.add", "vault.connect", "vault.link", "vault.remove", "vault.grant", "vault.revoke", "vault.cleanup", "prompt"];
struct Pending { waiters: HashMap<String, SyncSender<Value>>, failed: bool }
struct Helper { child: Arc<Mutex<Child>>, input: Arc<Mutex<Option<ChildStdin>>>, pending: Arc<Mutex<Pending>>, next_id: AtomicU64 }

fn read_frame(reader: &mut impl BufRead) -> Result<Value, ()> {
    let mut bytes = Vec::new();
    loop {
        let available = reader.fill_buf().map_err(|_| ())?;
        if available.is_empty() { return Err(()); }
        let take = available.iter().position(|byte| *byte == b'\n').map_or(available.len(), |index| index + 1);
        if bytes.len() + take > MAX_FRAME { return Err(()); }
        let terminal = available[take - 1] == b'\n'; bytes.extend_from_slice(&available[..take]); reader.consume(take);
        if terminal { break; }
    }
    serde_json::from_slice(&bytes).map_err(|_| ())
}
fn checked_response(value: Value, id: &str) -> Result<Value, ()> {
    let object = value.as_object().ok_or(())?;
    if object.get("id").and_then(Value::as_str) != Some(id) || object.get("protocol").and_then(Value::as_str) != Some(PROTOCOL) { return Err(()); }
    let ok = object.get("ok").and_then(Value::as_bool).ok_or(())?;
    let expected = if ok { vec!["id", "protocol", "ok", "data"] } else { vec!["id", "protocol", "ok", "code", "message"] };
    if object.len() != expected.len() || expected.iter().any(|key| !object.contains_key(*key)) { return Err(()); }
    let mut response = object.clone(); response.remove("id"); response.remove("protocol"); Ok(Value::Object(response))
}
fn unavailable() -> Value { json!({"ok":false,"code":"control-unavailable","message":"The local control service is unavailable. Restart Ghostget and try again."}) }
fn fail_pending(pending: &Arc<Mutex<Pending>>) { if let Ok(mut state) = pending.lock() { state.failed = true; for (_, sender) in state.waiters.drain() { let _ = sender.send(unavailable()); } } }
fn stop_child(child: &Arc<Mutex<Child>>) {
    if let Ok(mut child) = child.lock() {
        if child.try_wait().ok().flatten().is_some() { return; }
        #[cfg(unix)] unsafe { libc::kill(child.id() as i32, libc::SIGTERM); }
        for _ in 0..40 { if child.try_wait().ok().flatten().is_some() { return; } std::thread::sleep(Duration::from_millis(50)); }
        let _ = child.kill(); let _ = child.wait();
    }
}
fn bundle_root(executable: &Path) -> Result<std::path::PathBuf, ()> {
    let macos = executable.parent().ok_or(())?;
    let contents = macos.parent().ok_or(())?;
    let bundle = contents.parent().ok_or(())?;
    if executable.file_name() != Some(std::ffi::OsStr::new("ghostget-desktop")) || macos.file_name() != Some(std::ffi::OsStr::new("MacOS")) || contents.file_name() != Some(std::ffi::OsStr::new("Contents")) || bundle.extension() != Some(std::ffi::OsStr::new("app")) { return Err(()); }
    Ok(bundle.to_owned())
}
fn wait_verifier(child: &mut Child, duration: Duration) -> Result<Option<std::process::ExitStatus>, ()> {
    let deadline = std::time::Instant::now() + duration;
    loop {
        match child.try_wait() { Ok(Some(status)) => return Ok(Some(status)), Err(_) => return Err(()), Ok(None) => {} }
        if std::time::Instant::now() >= deadline { return Ok(None); }
        std::thread::sleep(Duration::from_millis(20));
    }
}
/// Validate sealed installed resources before any interpreter receives app authority.
/// Valid ad hoc local builds are supported; publisher identity is a release gate.
fn verify_bundle(resources: &Path) -> Result<(), ()> {
    let executable = std::env::current_exe().and_then(|path| path.canonicalize()).map_err(|_| ())?;
    let bundle = bundle_root(&executable)?;
    let expected = bundle.join("Contents/Resources");
    if resources.canonicalize().ok().as_ref() != Some(&expected) { return Err(()); }
    let mut child = Command::new("/usr/bin/codesign").args(["--verify", "--deep", "--strict"]).arg(&bundle)
        .env_clear().env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_| ())?;
    // All descriptors are the null device; there are no unjoined output pipes.
    if let Some(status) = wait_verifier(&mut child, Duration::from_secs(15))? { return if status.success() { Ok(()) } else { Err(()) }; }
    #[cfg(unix)] unsafe { libc::kill(child.id() as i32, libc::SIGTERM); }
    if wait_verifier(&mut child, Duration::from_secs(1))?.is_some() { return Err(()); }
    let _ = child.kill();
    if wait_verifier(&mut child, Duration::from_secs(1))?.is_none() {
        // Keep custody of an exceptional unjoined verifier without hanging the
        // GUI. This app instance never starts its control helper after failure.
        std::thread::spawn(move || { let _ = child.wait(); });
    }
    Err(())
}
impl Helper {
    fn spawn(resources: &Path) -> Result<Self, ()> {
        verify_bundle(resources)?;
        let runtime = resources.join("ghostget-runtime"); let package = runtime.join("package"); let executable = runtime.join("ghostget-bun");
        if !executable.is_file() || !package.join("src/control/helper.ts").is_file() { return Err(()); }
        let mut command = Command::new(executable);
        command.current_dir(&package).args(["--no-env-file", "--no-install", "src/control/helper.ts"]);
        command.env_clear();
        for name in ["HOME", "TMPDIR", "USER", "LOGNAME", "GHOSTGET_STATE_HOME"] { if let Some(value) = std::env::var_os(name) { command.env(name, value); } }
        command.env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
        let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_| ())?;
        let input = child.stdin.take().ok_or(())?; let mut output = BufReader::new(child.stdout.take().ok_or(())?);
        let child = Arc::new(Mutex::new(child)); let pending = Arc::new(Mutex::new(Pending { waiters: HashMap::new(), failed: false }));
        let read_pending = pending.clone(); let read_child = child.clone();
        std::thread::spawn(move || {
            loop {
                let delivered = (|| {
                    let frame = read_frame(&mut output)?; let id = frame.get("id").and_then(Value::as_str).ok_or(())?.to_owned();
                    let response = checked_response(frame, &id)?;
                    let sender = read_pending.lock().map_err(|_| ())?.waiters.remove(&id).ok_or(())?;
                    // A dropped receiver is UI cancellation, not a malformed frame.
                    let _ = sender.send(response); Ok::<(), ()>(())
                })();
                if delivered.is_err() { fail_pending(&read_pending); stop_child(&read_child); break; }
            }
        });
        Ok(Self { child, input: Arc::new(Mutex::new(Some(input))), pending, next_id: AtomicU64::new(1) })
    }
    fn stop(&self) { if let Ok(mut input) = self.input.try_lock() { input.take(); } fail_pending(&self.pending); stop_child(&self.child); }
}
fn local_window(window: &tauri::WebviewWindow) -> bool {
    if window.label() != "main" { return false; }
    match window.url() { Ok(url) => (url.scheme() == "tauri" && url.host_str() == Some("localhost")) || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")), Err(_) => false }
}
#[tauri::command]
async fn control_request(window: tauri::WebviewWindow, state: State<'_, Option<Helper>>, request: Value) -> Result<Value, String> {
    if !local_window(&window) { return Err("This window has no control authority.".into()); }
    let helper = match state.inner().as_ref() { Some(helper) => helper, None => return Ok(unavailable()) };
    let action = request.get("action").and_then(Value::as_str).unwrap_or("");
    if !request.is_object() || !ACTIONS.contains(&action) { return Err("Invalid control request.".into()); }
    let timeout = match action { action if action.starts_with("vault.") => 125, "connection.verify" => 70, _ => 30 };
    let id = format!("native-{}", helper.next_id.fetch_add(1, Ordering::Relaxed));
    let mut frame = serde_json::to_vec(&json!({"id":id,"protocol":PROTOCOL,"request":request})).map_err(|_| "Invalid control request.")?;
    if frame.len() >= MAX_FRAME { return Err("Control request exceeds its size limit.".into()); } frame.push(b'\n');
    let (sender, receiver) = mpsc::sync_channel(1);
    { let mut pending = helper.pending.lock().map_err(|_| "Control service unavailable.")?;
      if pending.failed { return Ok(unavailable()); }
      if pending.waiters.len() >= 8 { return Ok(json!({"ok":false,"code":"control-busy","message":"The control service is busy. Wait for a request to finish."})); }
      pending.waiters.insert(id, sender);
    }
    let input = helper.input.clone(); let pending = helper.pending.clone(); let child = helper.child.clone();
    // Pipe backpressure cannot block the event loop or postpone the deadline.
    // There are at most eight admitted writers; shutdown signals the child even
    // when a writer owns the stdin mutex, which releases a blocked pipe write.
    std::thread::spawn(move || {
        let written = (|| { let mut input = input.lock().map_err(|_| ())?; let stream = input.as_mut().ok_or(())?; stream.write_all(&frame).map_err(|_| ())?; stream.flush().map_err(|_| ()) })();
        if written.is_err() { fail_pending(&pending); stop_child(&child); }
    });
    let response = tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(timeout))).await;
    match response { Ok(Ok(value)) => Ok(value), _ => { helper.stop(); Ok(unavailable()) } }
}
fn main() {
    // Secret storage has no Tauri window, renderer, control service or agent IPC.
    if std::env::args_os().nth(1).as_deref() == Some(std::ffi::OsStr::new("--vault-stdio")) {
        std::process::exit(vault::run());
    }
    let app = tauri::Builder::default().setup(|app| { let helper = app.path().resource_dir().ok().and_then(|path| Helper::spawn(&path).ok()); app.manage(helper); Ok(()) }).invoke_handler(tauri::generate_handler![control_request]).on_window_event(|window, event| { if matches!(event, tauri::WindowEvent::Destroyed) { if let Some(helper) = window.state::<Option<Helper>>().inner() { helper.stop(); } } }).build(tauri::generate_context!()).expect("Ghostget could not start");
    app.run(|app, event| { if matches!(event, tauri::RunEvent::Exit) { if let Some(helper) = app.state::<Option<Helper>>().inner() { helper.stop(); } } });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn verification_requires_the_fixed_installed_bundle_layout() {
        assert_eq!(bundle_root(Path::new("/tmp/Ghostget.app/Contents/MacOS/ghostget-desktop")), Ok(std::path::PathBuf::from("/tmp/Ghostget.app")));
        for path in ["/tmp/ghostget-desktop", "/tmp/Ghostget/Contents/MacOS/ghostget-desktop", "/tmp/Ghostget.app/Resources/MacOS/ghostget-desktop", "/tmp/Ghostget.app/Contents/MacOS/other"] { assert!(bundle_root(Path::new(path)).is_err()); }
    }
    #[test] fn frames_are_bounded_and_exact() {
        assert!(read_frame(&mut BufReader::new(&b"{}\n"[..])).is_ok());
        assert!(read_frame(&mut BufReader::new(&b"{}"[..])).is_err());
        assert!(read_frame(&mut BufReader::new(&vec![b'x'; MAX_FRAME + 1][..])).is_err());
        assert!(checked_response(json!({"id":"native-1","protocol":PROTOCOL,"ok":true,"data":{"kind":"success","message":"ok"}}), "native-1").is_ok());
        assert!(checked_response(json!({"id":"native-2","protocol":PROTOCOL,"ok":true,"data":{}}), "native-1").is_err());
        assert!(checked_response(json!({"id":"native-1","protocol":PROTOCOL,"ok":true,"data":{},"extra":0}), "native-1").is_err());
    }
    #[test] fn terminal_failure_rejects_every_waiter() {
        let (a, ar) = mpsc::sync_channel(1); let (b, br) = mpsc::sync_channel(1);
        let pending = Arc::new(Mutex::new(Pending { waiters: HashMap::from([("native-1".into(),a),("native-2".into(),b)]), failed: false }));
        fail_pending(&pending); assert_eq!(ar.recv().unwrap(), unavailable()); assert_eq!(br.recv().unwrap(), unavailable()); assert!(pending.lock().unwrap().failed);
    }
}
