#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::{collections::HashMap, fs::{File, OpenOptions}, io::{BufRead, BufReader, Write}, os::unix::io::AsRawFd, path::{Path, PathBuf}, process::{Child, ChildStdin, Command, Stdio}, sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}, mpsc::{self, SyncSender}}, time::Duration};
use tauri::{Manager, State};
use desktop_foundation::{outputs::OutputsSection, Host, MenuItem, MenuModel, MenuNode, Options};

const PROTOCOL: &str = "ghostget.control/1";
const MAX_FRAME: usize = 4 * 1024 * 1024;
const ACTIONS: &[&str] = &["snapshot", "permission.enable", "permission.set", "approval.list", "approval.decide", "web.save", "activity.query", "interface.save", "interface.activate", "interface.export", "connection.begin", "connection.verify", "connection.commit", "connection.cancel", "connection.disconnect", "vault.import", "prompt"];
struct Pending { waiters: HashMap<String, SyncSender<Value>>, failed: bool }
#[derive(Clone)]
struct Helper { child: Arc<Mutex<Child>>, input: Arc<Mutex<Option<ChildStdin>>>, pending: Arc<Mutex<Pending>>, next_id: Arc<AtomicU64> }

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
impl Helper {
    /// `runtime` is the `ghostget-runtime` directory containing `ghostget-bun`
    /// and `package/` — bundled under the app resources, or staged at
    /// `desktop/out/runtime` for unbundled runs.
    fn spawn(runtime: &Path) -> Result<Self, ()> {
        let package = runtime.join("package"); let executable = runtime.join("ghostget-bun");
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
        Ok(Self { child, input: Arc::new(Mutex::new(Some(input))), pending, next_id: Arc::new(AtomicU64::new(1)) })
    }
    /// One bounded request round-trip. Called off the UI thread by both the
    /// webview command and the menu host; never from the event loop.
    fn request(&self, request: Value, timeout: Duration) -> Value {
        let id = format!("native-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let frame = match serde_json::to_vec(&json!({"id":id,"protocol":PROTOCOL,"request":request})) {
            Ok(mut frame) if frame.len() < MAX_FRAME => { frame.push(b'\n'); frame }
            _ => return json!({"ok":false,"code":"control-invalid","message":"The control request exceeds its size limit."}),
        };
        let (sender, receiver) = mpsc::sync_channel(1);
        { let mut pending = match self.pending.lock() { Ok(pending) => pending, Err(_) => return unavailable() };
          if pending.failed { return unavailable(); }
          if pending.waiters.len() >= 8 { return json!({"ok":false,"code":"control-busy","message":"The control service is busy. Wait for a request to finish."}); }
          pending.waiters.insert(id, sender);
        }
        let input = self.input.clone(); let pending = self.pending.clone(); let child = self.child.clone();
        // Pipe backpressure cannot block the event loop or postpone the deadline.
        // There are at most eight admitted writers; shutdown signals the child even
        // when a writer owns the stdin mutex, which releases a blocked pipe write.
        std::thread::spawn(move || {
            let written = (|| { let mut input = input.lock().map_err(|_| ())?; let stream = input.as_mut().ok_or(())?; stream.write_all(&frame).map_err(|_| ())?; stream.flush().map_err(|_| ()) })();
            if written.is_err() { fail_pending(&pending); stop_child(&child); }
        });
        match receiver.recv_timeout(timeout) { Ok(value) => value, Err(_) => { self.stop(); unavailable() } }
    }
    fn stop(&self) { if let Ok(mut input) = self.input.try_lock() { input.take(); } fail_pending(&self.pending); stop_child(&self.child); }
}

/// Resolves the `ghostget-runtime` directory: an explicit dev/installed
/// override, the bundled app resources, then the staged `desktop/out/runtime`
/// used by unbundled `cargo build` runs.
fn resolve_runtime(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(value) = std::env::var_os("GHOSTGET_RUNTIME") {
        let path = PathBuf::from(value);
        if path.join("ghostget-bun").is_file() { return Some(path); }
    }
    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("ghostget-runtime");
        if bundled.join("ghostget-bun").is_file() { return Some(bundled); }
    }
    let staged = Path::new(env!("CARGO_MANIFEST_DIR")).join("../out/runtime");
    if staged.join("ghostget-bun").is_file() { return Some(staged); }
    None
}

/// Mirrors `selectStateHome` in `src/storage.ts`: the first set of the state
/// environment variables wins, otherwise the first existing default of the
/// current and legacy names under the data root, else `ghostget`.
fn state_home() -> Option<PathBuf> {
    for name in ["GHOSTGET_STATE_HOME", "WRENCH_STATE_HOME", "OH_STATE_HOME", "IO_HOME"] {
        if let Some(value) = std::env::var_os(name) {
            if !value.is_empty() { return Some(PathBuf::from(value)); }
        }
    }
    let data = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))?;
    for name in ["ghostget", "wrench", "oh", "io"] {
        let candidate = data.join(name);
        if candidate.exists() { return Some(candidate); }
    }
    Some(data.join("ghostget"))
}

/// One control-panel instance per state home. The helper's own owner record
/// already enforces single control custody; this guard keeps a second launch
/// from registering a duplicate status item.
fn acquire_instance_lock() -> Option<File> {
    let control = state_home()?.join("control");
    std::fs::create_dir_all(&control).ok()?;
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(control.join("app.lock"))
        .ok()?;
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 { Some(file) } else { None }
}

fn local_window(window: &tauri::WebviewWindow) -> bool {
    if window.label() != "main" { return false; }
    match window.url() { Ok(url) => (url.scheme() == "tauri" && url.host_str() == Some("localhost")) || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")), Err(_) => false }
}
#[tauri::command]
async fn control_request(window: tauri::WebviewWindow, state: State<'_, Option<Helper>>, request: Value) -> Result<Value, String> {
    if !local_window(&window) { return Err("This window has no control authority.".into()); }
    let helper = match state.inner().as_ref() { Some(helper) => helper.clone(), None => return Ok(unavailable()) };
    let action = request.get("action").and_then(Value::as_str).unwrap_or("");
    if !request.is_object() || !ACTIONS.contains(&action) { return Err("Invalid control request.".to_owned()); }
    let timeout = match action { "vault.import" => 125, "connection.verify" => 70, _ => 30 };
    let response = tauri::async_runtime::spawn_blocking(move || helper.request(request, Duration::from_secs(timeout))).await;
    match response { Ok(value) => Ok(value), Err(_) => Ok(unavailable()) }
}

#[derive(Debug, PartialEq)]
enum ApprovalStatus {
    Known { count: usize, titles: Vec<String> },
    Unavailable,
}

fn approval_status(response: Option<&Value>) -> ApprovalStatus {
    let Some(response) = response else { return ApprovalStatus::Unavailable; };
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return ApprovalStatus::Unavailable;
    }
    let Some(data) = response.get("data") else { return ApprovalStatus::Unavailable; };
    if data.get("kind").and_then(Value::as_str) != Some("approvals") {
        return ApprovalStatus::Unavailable;
    }
    let Some(approvals) = data.get("approvals").and_then(Value::as_array) else {
        return ApprovalStatus::Unavailable;
    };
    // Match the approval-list bound in desktop/src/response.ts.
    if approvals.len() > 128 || approvals.iter().any(|approval| approval.get("title").and_then(Value::as_str).is_none()) {
        return ApprovalStatus::Unavailable;
    }
    ApprovalStatus::Known {
        count: approvals.len(),
        titles: approvals.iter().take(5).map(|approval| approval["title"].as_str().unwrap().chars().take(60).collect()).collect(),
    }
}

fn approval_menu(response: Option<&Value>) -> (Vec<MenuNode>, String) {
    let mut nodes = vec![MenuNode::disabled("Ghostget"), MenuNode::Separator];
    let tooltip = match approval_status(response) {
        ApprovalStatus::Known { count, titles } => {
            if count == 0 {
                nodes.push(MenuNode::disabled("No pending approvals"));
            } else {
                nodes.push(MenuNode::interactive(
                    MenuItem::action(desktop_foundation::WINDOW_SHOW_ACTION_ID, "Pending approvals")
                        .with_badge(count.to_string())
                        .with_shortcut("CmdOrCtrl+Shift+A"),
                ));
                for title in titles { nodes.push(MenuNode::show_window(format!("  {title}"))); }
            }
            format!("Ghostget — {count} pending approval{}", if count == 1 { "" } else { "s" })
        }
        ApprovalStatus::Unavailable => {
            nodes.push(MenuNode::disabled("Approval status unavailable"));
            "Ghostget — approval status unavailable".to_owned()
        }
    };
    nodes.push(MenuNode::Separator);
    nodes.push(MenuNode::show_window("Open Ghostget"));
    (nodes, tooltip)
}

struct GhostgetHost { helper: Mutex<Option<Helper>>, outputs: OutputsSection }

impl Host for GhostgetHost {
    fn started(&self, app: &tauri::AppHandle) {
        let helper = resolve_runtime(app).and_then(|runtime| Helper::spawn(&runtime).ok());
        *self.helper.lock().unwrap_or_else(|e| e.into_inner()) = helper.clone();
        app.manage(helper);
    }
    fn snapshot(&self) -> MenuModel {
        let helper = self.helper.lock().ok().and_then(|guard| guard.clone());
        let response = helper.map(|helper| helper.request(json!({"action":"approval.list"}), Duration::from_secs(10)));
        let (mut nodes, tooltip) = approval_menu(response.as_ref());
        nodes.push(MenuNode::Separator);
        nodes.extend(self.outputs.nodes());
        nodes.push(MenuNode::Separator);
        nodes.push(MenuNode::quit("Quit Ghostget"));
        MenuModel { title: Some("Ghostget".to_owned()), tooltip: Some(tooltip), icon: None, nodes }
    }
    fn dispatch(&self, id: &str) {
        self.outputs.dispatch(id);
    }
    fn stopping(&self) {
        if let Some(helper) = self.helper.lock().ok().and_then(|guard| guard.clone()) { helper.stop(); }
    }
}

fn main() {
    let _instance = match acquire_instance_lock() {
        Some(lock) => lock,
        None => return,
    };
    let outputs = state_home().map(|home| OutputsSection::new(home.join("outputs")))
        .unwrap_or_else(|| OutputsSection::new(PathBuf::from("outputs")));
    let _ = std::fs::create_dir_all(outputs.dir());
    let host = Arc::new(GhostgetHost { helper: Mutex::new(None), outputs });
    let options = Options { refresh: Duration::from_secs(5), companion_window: true };
    desktop_foundation::run(
        tauri::generate_context!(),
        host,
        options,
        |builder| builder.invoke_handler(tauri::generate_handler![control_request]),
    ).expect("Ghostget could not start");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn approval_errors_never_look_like_an_empty_queue() {
        for response in [None, Some(json!({"ok":false,"code":"control-unavailable"})), Some(json!({"ok":true,"data":{}})), Some(json!({"ok":true,"data":{"kind":"approvals","approvals":[{}]}}))] {
            assert_eq!(approval_status(response.as_ref()), ApprovalStatus::Unavailable);
            let (nodes, tooltip) = approval_menu(response.as_ref());
            assert!(tooltip.contains("unavailable"));
            assert!(!tooltip.contains("0 pending"));
            assert!(nodes.iter().any(|node| matches!(node, MenuNode::Item { id: Some(id), title, .. } if id == desktop_foundation::WINDOW_SHOW_ACTION_ID && title == "Open Ghostget")));
        }
    }
    #[test] fn approval_counts_are_known_only_for_valid_lists() {
        let empty = json!({"ok":true,"data":{"kind":"approvals","approvals":[]}});
        assert_eq!(approval_status(Some(&empty)), ApprovalStatus::Known { count: 0, titles: vec![] });
        let (_, tooltip) = approval_menu(Some(&empty));
        assert_eq!(tooltip, "Ghostget — 0 pending approvals");
        let pending = json!({"ok":true,"data":{"kind":"approvals","approvals":[{"title":"First request"},{"title":"Second request"}]}});
        let (nodes, _) = approval_menu(Some(&pending));
        assert!(nodes.iter().any(|node| matches!(node, MenuNode::Interactive { item } if item.title == "Pending approvals" && item.badge.as_deref() == Some("2"))));
        assert!(!nodes.iter().any(|node| matches!(node, MenuNode::Interactive { item } if item.title.contains("2"))));
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
