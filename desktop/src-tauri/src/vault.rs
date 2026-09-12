//! A single-use native secret store. Only the packaged credential helper may
//! launch this protocol beneath the live GUI host; values never enter the
//! control or renderer protocol. The GUI host verifies its sealed bundle first.
//! Parent paths constrain the supported entry point, not hostile same-user code.
use serde::Deserialize;
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};

const PROTOCOL: &str = "ghostget.secret-store/1";
const MAX_REQUEST: usize = 32 * 1024;
const MAX_SECRET: usize = 16 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum Purpose {
    Credential,
    #[serde(rename = "1password-bootstrap")]
    Bootstrap,
}
impl Purpose {
    fn service(self) -> &'static str {
        match self {
            Self::Credential => "com.ghostget.desktop.credential.v1",
            Self::Bootstrap => "com.ghostget.desktop.1password-bootstrap.v1",
        }
    }
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Kind {
    Password,
    Token,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
enum Request {
    Create {
        protocol: String,
        purpose: Purpose,
        id: String,
        kind: Kind,
    },
    Read {
        protocol: String,
        purpose: Purpose,
        id: String,
    },
    Delete {
        protocol: String,
        purpose: Purpose,
        id: String,
    },
}
impl Request {
    fn identity(&self) -> (&str, Purpose, &str) {
        match self {
            Self::Create {
                protocol,
                purpose,
                id,
                ..
            }
            | Self::Read {
                protocol,
                purpose,
                id,
            }
            | Self::Delete {
                protocol,
                purpose,
                id,
            } => (protocol, *purpose, id),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
enum Error {
    Cancelled,
    Unavailable,
    Exists,
    NotFound,
    Invalid,
}
impl Error {
    fn code(self) -> &'static str {
        match self {
            Self::Cancelled => "CANCELLED",
            Self::Unavailable => "UNAVAILABLE",
            Self::Exists => "EXISTS",
            Self::NotFound => "NOT_FOUND",
            Self::Invalid => "INVALID",
        }
    }
}
fn uuid_v4(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                *b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(b)
            }
        })
        && bytes[14] == b'4'
        && b"89ab".contains(&bytes[19])
}
fn parse_request(bytes: &[u8]) -> Result<Request, Error> {
    if bytes.len() > MAX_REQUEST
        || bytes.last() != Some(&b'\n')
        || bytes[..bytes.len() - 1].contains(&b'\n')
    {
        return Err(Error::Invalid);
    }
    let request: Request = serde_json::from_slice(bytes).map_err(|_| Error::Invalid)?;
    let (protocol, _, id) = request.identity();
    if protocol != PROTOCOL
        || !uuid_v4(id)
        || matches!(
            request,
            Request::Create {
                purpose: Purpose::Bootstrap,
                kind: Kind::Password,
                ..
            }
        )
    {
        return Err(Error::Invalid);
    }
    Ok(request)
}
#[derive(Debug, PartialEq)]
struct NativePaths {
    credential: PathBuf,
    control: PathBuf,
    host: PathBuf,
}
fn native_paths(executable: &Path) -> Option<NativePaths> {
    if !executable.is_absolute()
        || executable.components().any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return None;
    }
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let helper = contents.parent()?;
    let helpers = helper.parent()?;
    let outer_contents = helpers.parent()?;
    let outer_bundle = outer_contents.parent()?;
    if executable.file_name()? != "ghostget-desktop"
        || macos.file_name()? != "MacOS"
        || contents.file_name()? != "Contents"
        || helper.file_name()? != "Ghostget Secure Entry.app"
        || helpers.file_name()? != "Helpers"
        || outer_contents.file_name()? != "Contents"
        || outer_bundle.extension()? != "app"
    {
        return None;
    }
    let runtime = outer_contents.join("Resources/ghostget-runtime");
    Some(NativePaths {
        credential: runtime.join("ghostget-credential-bun"),
        control: runtime.join("ghostget-bun"),
        host: outer_contents.join("MacOS/ghostget-desktop"),
    })
}
// This wrapper deliberately has no Debug, Display or Serialize implementation.
struct Secret(String);
impl Drop for Secret {
    fn drop(&mut self) {
        // Best-effort clearing of our Rust allocation. AppKit/Keychain and Bun
        // own other copies; their memory lifetime ends with these short processes.
        unsafe {
            for byte in self.0.as_bytes_mut() {
                std::ptr::write_volatile(byte, 0);
            }
        }
        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }
}
fn valid_secret(value: &str, purpose: Purpose) -> bool {
    !value.is_empty()
        && value.len() <= MAX_SECRET
        && !value.contains('\0')
        && (purpose != Purpose::Bootstrap
            || (value.starts_with("ops_")
                && value.len() > 4
                && value.bytes().all(|b| b.is_ascii_graphic())))
}
fn write_result(output: &mut impl Write, result: Result<Option<Secret>, Error>) -> Result<(), ()> {
    match result {
        Ok(None) => output.write_all(b"{\"ok\":true}\n").map_err(|_| ()),
        Ok(Some(value)) => {
            output
                .write_all(b"{\"ok\":true,\"value\":")
                .map_err(|_| ())?;
            serde_json::to_writer(&mut *output, &value.0).map_err(|_| ())?;
            output.write_all(b"}\n").map_err(|_| ())
        }
        Err(error) => {
            writeln!(output, "{{\"ok\":false,\"code\":\"{}\"}}", error.code()).map_err(|_| ())
        }
    }?;
    output.flush().map_err(|_| ())
}

pub fn run() -> i32 {
    #[cfg(target_os = "macos")]
    let result = native::execute();
    #[cfg(not(target_os = "macos"))]
    let result = Err(Error::Unavailable);
    let success = result.is_ok();
    if write_result(&mut std::io::stdout().lock(), result).is_ok() && success {
        0
    } else {
        1
    }
}

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use core_foundation::{
        array::{CFArray, CFArrayRef},
        base::{CFType, CFTypeRef, TCFType},
        boolean::CFBoolean,
        data::CFData,
        dictionary::{CFDictionary, CFDictionaryRef},
        string::{CFString, CFStringRef},
    };
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSAlert, NSApplication, NSApplicationActivationPolicy, NSSecureTextField};
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use std::{
        ffi::c_void,
        os::unix::ffi::OsStrExt,
        ptr,
        time::{Duration, Instant},
    };

    #[link(name = "Security", kind = "framework")]
    extern "C" {
        static kSecClass: CFStringRef;
        static kSecClassGenericPassword: CFStringRef;
        static kSecAttrAccount: CFStringRef;
        static kSecAttrService: CFStringRef;
        static kSecAttrAccess: CFStringRef;
        static kSecAttrSynchronizable: CFStringRef;
        static kSecValueData: CFStringRef;
        static kSecReturnData: CFStringRef;
        static kSecMatchLimit: CFStringRef;
        static kSecMatchLimitOne: CFStringRef;
        static kSecMatchSearchList: CFStringRef;
        static kSecUseKeychain: CFStringRef;
        fn SecItemAdd(query: CFDictionaryRef, result: *mut CFTypeRef) -> i32;
        fn SecItemCopyMatching(query: CFDictionaryRef, result: *mut CFTypeRef) -> i32;
        fn SecItemDelete(query: CFDictionaryRef) -> i32;
        fn SecAccessCreate(
            description: CFStringRef,
            trusted: CFArrayRef,
            result: *mut CFTypeRef,
        ) -> i32;
        fn SecKeychainCopyDefault(result: *mut CFTypeRef) -> i32;
        fn SecKeychainGetStatus(keychain: CFTypeRef, result: *mut u32) -> i32;
        fn SecKeychainSetUserInteractionAllowed(allowed: u8) -> i32;
    }
    extern "C" {
        fn proc_pidpath(pid: i32, buffer: *mut c_void, size: u32) -> i32;
    }
    fn status(code: i32) -> Result<(), Error> {
        match code {
            0 => Ok(()),
            -128 => Err(Error::Cancelled),
            -25299 => Err(Error::Exists),
            -25300 => Err(Error::NotFound),
            _ => Err(Error::Unavailable),
        }
    }
    unsafe fn cf(value: CFStringRef) -> CFType {
        CFType::wrap_under_get_rule(value.cast())
    }
    unsafe fn created(value: CFTypeRef) -> Result<CFType, Error> {
        if value.is_null() {
            Err(Error::Unavailable)
        } else {
            Ok(CFType::wrap_under_create_rule(value))
        }
    }

    // The constructor with an arbitrary Keychain reference is private, used only
    // by our disposable test fixture. Production always resolves the default.
    struct Store {
        keychain: CFType,
    }
    impl Store {
        fn default() -> Result<Self, Error> {
            let mut value = ptr::null();
            unsafe {
                // No global search-list changes, automatic unlock or ACL prompts.
                status(SecKeychainSetUserInteractionAllowed(0))?;
                status(SecKeychainCopyDefault(&mut value))?;
                let keychain = created(value)?;
                let mut state = 0;
                status(SecKeychainGetStatus(keychain.as_CFTypeRef(), &mut state))?;
                if state & 1 == 0 {
                    return Err(Error::Unavailable);
                }
                Ok(Self { keychain })
            }
        }
        fn identity(&self, purpose: Purpose, id: &str) -> Vec<(CFType, CFType)> {
            unsafe {
                vec![
                    (cf(kSecClass), cf(kSecClassGenericPassword)),
                    (
                        cf(kSecAttrService),
                        CFString::new(purpose.service()).as_CFType(),
                    ),
                    (cf(kSecAttrAccount), CFString::new(id).as_CFType()),
                    (
                        cf(kSecAttrSynchronizable),
                        CFBoolean::false_value().as_CFType(),
                    ),
                ]
            }
        }
        fn search(&self, purpose: Purpose, id: &str) -> Vec<(CFType, CFType)> {
            let mut query = self.identity(purpose, id);
            query.push(unsafe {
                (
                    cf(kSecMatchSearchList),
                    CFArray::from_CFTypes(&[self.keychain.clone()]).as_CFType(),
                )
            });
            query
        }
        fn create(&self, purpose: Purpose, id: &str, secret: &Secret) -> Result<(), Error> {
            if !uuid_v4(id) || !valid_secret(&secret.0, purpose) {
                return Err(Error::Invalid);
            }
            let mut access = ptr::null();
            let description = CFString::new("Ghostget private credential");
            unsafe {
                // NULL means only this native executable, never all applications.
                status(SecAccessCreate(
                    description.as_concrete_TypeRef(),
                    ptr::null(),
                    &mut access,
                ))?;
                let access = created(access)?;
                let mut query = self.identity(purpose, id);
                query.extend([
                    (cf(kSecUseKeychain), self.keychain.clone()),
                    (cf(kSecAttrAccess), access),
                    (
                        cf(kSecValueData),
                        CFData::from_buffer(secret.0.as_bytes()).as_CFType(),
                    ),
                ]);
                // Add-only: duplicate UUIDs cannot replace an existing credential.
                status(SecItemAdd(
                    CFDictionary::from_CFType_pairs(&query).as_concrete_TypeRef(),
                    ptr::null_mut(),
                ))
            }
        }
        fn read(&self, purpose: Purpose, id: &str) -> Result<Secret, Error> {
            if !uuid_v4(id) {
                return Err(Error::Invalid);
            }
            let mut query = self.search(purpose, id);
            let mut value = ptr::null();
            unsafe {
                query.extend([
                    (cf(kSecReturnData), CFBoolean::true_value().as_CFType()),
                    (cf(kSecMatchLimit), cf(kSecMatchLimitOne)),
                ]);
                status(SecItemCopyMatching(
                    CFDictionary::from_CFType_pairs(&query).as_concrete_TypeRef(),
                    &mut value,
                ))?;
                let value = created(value)?;
                let data = value.downcast::<CFData>().ok_or(Error::Unavailable)?;
                if data.len() < 1 || data.len() as usize > MAX_SECRET {
                    return Err(Error::Unavailable);
                }
                let secret = Secret(
                    std::str::from_utf8(data.bytes())
                        .map_err(|_| Error::Unavailable)?
                        .to_owned(),
                );
                if !valid_secret(&secret.0, purpose) {
                    return Err(Error::Unavailable);
                }
                Ok(secret)
            }
        }
        fn delete(&self, purpose: Purpose, id: &str) -> Result<(), Error> {
            if !uuid_v4(id) {
                return Err(Error::Invalid);
            }
            unsafe {
                status(SecItemDelete(
                    CFDictionary::from_CFType_pairs(&self.search(purpose, id))
                        .as_concrete_TypeRef(),
                ))
            }
        }
    }

    fn parent_path(pid: i32) -> Option<PathBuf> {
        let mut bytes = [0u8; 4096];
        let length = unsafe { proc_pidpath(pid, bytes.as_mut_ptr().cast(), bytes.len() as u32) };
        if length <= 0 || length as usize >= bytes.len() {
            return None;
        }
        let end = bytes.iter().position(|b| *b == 0)?;
        Some(PathBuf::from(std::ffi::OsStr::from_bytes(&bytes[..end])))
    }
    #[derive(Clone, PartialEq)]
    struct ProcessIdentity {
        pid: i32,
        parent: i32,
        started: (u64, u64),
        path: PathBuf,
    }
    fn process_identity(pid: i32) -> Option<ProcessIdentity> {
        fn info(pid: i32) -> Option<libc::proc_bsdinfo> {
            if pid <= 1 {
                return None;
            }
            let mut value = std::mem::MaybeUninit::<libc::proc_bsdinfo>::uninit();
            let size = std::mem::size_of::<libc::proc_bsdinfo>();
            let read = unsafe {
                libc::proc_pidinfo(
                    pid,
                    libc::PROC_PIDTBSDINFO,
                    0,
                    value.as_mut_ptr().cast(),
                    size as i32,
                )
            };
            if read != size as i32 {
                return None;
            }
            let value = unsafe { value.assume_init() };
            if value.pbi_pid != pid as u32
                || value.pbi_status == libc::SZOMB
                || value.pbi_uid != unsafe { libc::geteuid() }
                || value.pbi_ruid != unsafe { libc::getuid() }
            {
                return None;
            }
            Some(value)
        }
        let before = info(pid)?;
        let path = parent_path(pid)?;
        let after = info(pid)?;
        if (
            before.pbi_start_tvsec,
            before.pbi_start_tvusec,
            before.pbi_ppid,
        ) != (
            after.pbi_start_tvsec,
            after.pbi_start_tvusec,
            after.pbi_ppid,
        ) {
            return None;
        }
        Some(ProcessIdentity {
            pid,
            parent: after.pbi_ppid.try_into().ok()?,
            started: (after.pbi_start_tvsec, after.pbi_start_tvusec),
            path,
        })
    }
    #[derive(Clone)]
    struct OwnerGuard {
        credential: ProcessIdentity,
        control: ProcessIdentity,
        host: ProcessIdentity,
        deadline: Instant,
    }
    impl OwnerGuard {
        fn live(&self) -> bool {
            Instant::now() < self.deadline
                && unsafe { libc::getppid() } == self.credential.pid
                && self.credential.parent == self.control.pid
                && self.control.parent == self.host.pid
                && process_identity(self.credential.pid).as_ref() == Some(&self.credential)
                && process_identity(self.control.pid).as_ref() == Some(&self.control)
                && process_identity(self.host.pid).as_ref() == Some(&self.host)
        }
        fn check(&self) -> Result<(), Error> {
            if self.live() {
                Ok(())
            } else {
                Err(Error::Cancelled)
            }
        }
    }
    fn authorize_parent() -> Result<OwnerGuard, Error> {
        if std::env::args_os().count() != 2 {
            return Err(Error::Invalid);
        }
        let executable = std::env::current_exe()
            .and_then(|path| path.canonicalize())
            .map_err(|_| Error::Unavailable)?;
        let paths = native_paths(&executable).ok_or(Error::Unavailable)?;
        // The real GUI host launches only the fixed control helper. Interpreter
        // paths alone would admit arbitrary agent JS using the same Bun files.
        // The --vault-stdio branch cannot launch a control helper or forge this
        // third kernel parent. All three incarnations remain live throughout.
        for expected in [&paths.credential, &paths.control, &paths.host] {
            if expected.canonicalize().ok().as_ref() != Some(expected) {
                return Err(Error::Unavailable);
            }
        }
        let credential = process_identity(unsafe { libc::getppid() }).ok_or(Error::Unavailable)?;
        let control = process_identity(credential.parent).ok_or(Error::Unavailable)?;
        let host = process_identity(control.parent).ok_or(Error::Unavailable)?;
        if credential.path != paths.credential
            || control.path != paths.control
            || host.path != paths.host
        {
            return Err(Error::Unavailable);
        }
        let guard = OwnerGuard {
            credential,
            control,
            host,
            deadline: Instant::now() + Duration::from_secs(120),
        };
        guard.check()?;
        Ok(guard)
    }
    fn prompt(purpose: Purpose, kind: Kind) -> Result<Secret, Error> {
        let marker = MainThreadMarker::new().ok_or(Error::Unavailable)?;
        let app = NSApplication::sharedApplication(marker);
        app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
        let alert = NSAlert::new(marker);
        alert.setMessageText(&NSString::from_str(match (purpose, kind) {
            (Purpose::Bootstrap, _) => "Connect a dedicated 1Password vault",
            (_, Kind::Password) => "Save a password in Ghostget",
            _ => "Save an API token in Ghostget",
        }));
        alert.setInformativeText(&NSString::from_str(if purpose == Purpose::Bootstrap { "Enter the read-only service-account token for your dedicated Ghostget vault. It stays in macOS Keychain; Ghostget's agent API never returns it." } else { "Enter the secret to store in macOS Keychain. Ghostget uses it through the permissions you configure; Ghostget's agent API never returns this value." }));
        alert.addButtonWithTitle(&NSString::from_str("Save"));
        alert.addButtonWithTitle(&NSString::from_str("Cancel"));
        let field = NSSecureTextField::initWithFrame(
            NSSecureTextField::alloc(marker),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(360.0, 28.0)),
        );
        alert.setAccessoryView(Some(&field));
        alert.window().setInitialFirstResponder(Some(&field));
        #[allow(deprecated)]
        app.activateIgnoringOtherApps(true);
        let response = alert.runModal();
        let secret = if response == 1000 {
            Some(Secret(field.stringValue().to_string()))
        } else {
            None
        };
        field.setStringValue(&NSString::new());
        let secret = secret.ok_or(Error::Cancelled)?;
        if !valid_secret(&secret.0, purpose) {
            return Err(Error::Invalid);
        }
        Ok(secret)
    }
    pub(super) fn execute() -> Result<Option<Secret>, Error> {
        let owner = authorize_parent()?;
        let watched_owner = owner.clone();
        // AppKit modal input and a blocked stdin read must both end with their
        // owners. This watcher never accesses Keychain or writes a second reply.
        std::thread::spawn(move || loop {
            if !watched_owner.live() {
                unsafe {
                    libc::_exit(1);
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        });
        let mut bytes = Vec::new();
        std::io::stdin()
            .lock()
            .take((MAX_REQUEST + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| Error::Invalid)?;
        let request = parse_request(&bytes)?;
        owner.check()?;
        let store = Store::default()?;
        match request {
            Request::Create {
                purpose, id, kind, ..
            } => {
                let value = prompt(purpose, kind)?;
                owner.check()?;
                store.create(purpose, &id, &value)?;
                Ok(None)
            }
            Request::Read { purpose, id, .. } => {
                owner.check()?;
                let value = store.read(purpose, &id)?;
                owner.check()?;
                Ok(Some(value))
            }
            Request::Delete { purpose, id, .. } => {
                owner.check()?;
                store.delete(purpose, &id)?;
                Ok(None)
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[link(name = "Security", kind = "framework")]
        extern "C" {
            fn SecKeychainCreate(
                path: *const libc::c_char,
                length: u32,
                password: *const c_void,
                prompt: u8,
                access: CFTypeRef,
                result: *mut CFTypeRef,
            ) -> i32;
            fn SecKeychainDelete(keychain: CFTypeRef) -> i32;
            fn SecAccessCopyACLList(access: CFTypeRef, result: *mut CFArrayRef) -> i32;
            fn SecACLCopyAuthorizations(acl: CFTypeRef) -> CFArrayRef;
            fn SecACLCopyContents(
                acl: CFTypeRef,
                applications: *mut CFArrayRef,
                description: *mut CFStringRef,
                selector: *mut u16,
            ) -> i32;
            static kSecACLAuthorizationDecrypt: CFStringRef;
        }
        #[test]
        fn process_owner_is_bound_to_parent_path_and_monotonic_deadline() {
            let credential = process_identity(unsafe { libc::getppid() })
                .expect("test parent must be inspectable");
            let control =
                process_identity(credential.parent).expect("test ancestor must be inspectable");
            let host =
                process_identity(control.parent).expect("test host ancestor must be inspectable");
            let owner = OwnerGuard {
                credential,
                control,
                host,
                deadline: Instant::now() + Duration::from_secs(30),
            };
            assert!(owner.live());
            let mut stale = owner.clone();
            stale.deadline = Instant::now();
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.credential.pid = 1;
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.credential.path = PathBuf::from("/invalid-parent");
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.credential.started.1 += 1;
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.control.pid = 1;
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.control.path = PathBuf::from("/invalid-ancestor");
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.control.started.1 += 1;
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.control.parent = 1;
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.host.pid = 1;
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.host.path = PathBuf::from("/arbitrary-interpreter-host");
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.host.started.1 += 1;
            assert!(!stale.live());
            let mut stale = owner.clone();
            stale.host.parent = if owner.host.parent == 1 { 2 } else { 1 };
            assert!(!stale.live());
        }
        #[test]
        fn native_acl_trusts_only_the_calling_executable() {
            unsafe {
                let mut access = ptr::null();
                assert_eq!(
                    SecAccessCreate(
                        CFString::new("Ghostget test ACL").as_concrete_TypeRef(),
                        ptr::null(),
                        &mut access
                    ),
                    0
                );
                let access = created(access).unwrap();
                let mut list = ptr::null();
                assert_eq!(SecAccessCopyACLList(access.as_CFTypeRef(), &mut list), 0);
                let list = CFArray::<CFType>::wrap_under_create_rule(list);
                let mut found = 0;
                for acl in list.iter() {
                    let authorizations = CFArray::<CFType>::wrap_under_create_rule(
                        SecACLCopyAuthorizations(acl.as_CFTypeRef()),
                    );
                    if authorizations
                        .iter()
                        .any(|value| value.as_CFTypeRef() == kSecACLAuthorizationDecrypt.cast())
                    {
                        let mut applications = ptr::null();
                        let mut description = ptr::null();
                        let mut selector = 0;
                        assert_eq!(
                            SecACLCopyContents(
                                acl.as_CFTypeRef(),
                                &mut applications,
                                &mut description,
                                &mut selector
                            ),
                            0
                        );
                        assert!(!applications.is_null());
                        let applications = CFArray::<CFType>::wrap_under_create_rule(applications);
                        assert_eq!(applications.len(), 1);
                        if !description.is_null() {
                            let _ = CFString::wrap_under_create_rule(description);
                        }
                        found += 1;
                    }
                }
                assert_eq!(found, 1);
            }
        }
        // Explicit native qualification only: this fixture never opens, reads or
        // changes the user's default Keychain or its search list.
        #[test]
        #[ignore = "requires an admitted mac-native run with a disposable Keychain"]
        fn disposable_keychain_roundtrip_isolated_namespaces_and_no_overwrite() {
            let mut template = b"/private/tmp/ghostget-keychain-XXXXXX\0".to_vec();
            let directory = unsafe { libc::mkdtemp(template.as_mut_ptr().cast()) };
            assert!(!directory.is_null());
            let directory = PathBuf::from(std::ffi::OsStr::from_bytes(
                unsafe { std::ffi::CStr::from_ptr(directory) }.to_bytes(),
            ));
            struct Fixture {
                store: Store,
                directory: PathBuf,
            }
            impl Drop for Fixture {
                fn drop(&mut self) {
                    unsafe {
                        let _ = SecKeychainDelete(self.store.keychain.as_CFTypeRef());
                    }
                    let _ = std::fs::remove_dir_all(&self.directory);
                }
            }
            let path =
                std::ffi::CString::new(directory.join("fixture.keychain").as_os_str().as_bytes())
                    .unwrap();
            let password = b"ghostget-disposable-fixture-only";
            let mut keychain = ptr::null();
            unsafe {
                assert_eq!(SecKeychainSetUserInteractionAllowed(0), 0);
                assert_eq!(
                    SecKeychainCreate(
                        path.as_ptr(),
                        password.len() as u32,
                        password.as_ptr().cast(),
                        0,
                        ptr::null(),
                        &mut keychain
                    ),
                    0
                );
            }
            let fixture = Fixture {
                store: Store {
                    keychain: unsafe { created(keychain).unwrap() },
                },
                directory,
            };
            let id = "5abb6ea6-9de1-4c28-b70c-21a830972edd";
            let secret = Secret("fixture-secret-☃-only".into());
            assert_eq!(
                fixture.store.read(Purpose::Credential, id).err(),
                Some(Error::NotFound)
            );
            assert_eq!(
                fixture.store.create(Purpose::Credential, id, &secret),
                Ok(())
            );
            assert_eq!(
                fixture
                    .store
                    .create(Purpose::Credential, id, &Secret("replacement".into())),
                Err(Error::Exists)
            );
            assert_eq!(
                fixture.store.read(Purpose::Credential, id).unwrap().0,
                secret.0
            );
            assert_eq!(
                fixture.store.read(Purpose::Bootstrap, id).err(),
                Some(Error::NotFound)
            );
            assert_eq!(
                fixture
                    .store
                    .create(Purpose::Bootstrap, id, &Secret("ops_fixture-only".into())),
                Ok(())
            );
            assert_eq!(fixture.store.delete(Purpose::Credential, id), Ok(()));
            assert_eq!(
                fixture.store.read(Purpose::Credential, id).err(),
                Some(Error::NotFound)
            );
            assert_eq!(
                fixture.store.read(Purpose::Bootstrap, id).unwrap().0,
                "ops_fixture-only"
            );
            assert_eq!(
                fixture.store.delete(Purpose::Credential, id),
                Err(Error::NotFound)
            );
            assert_eq!(fixture.store.delete(Purpose::Bootstrap, id), Ok(()));
            let directory = fixture.directory.clone();
            drop(fixture);
            assert!(!directory.exists());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "5abb6ea6-9de1-4c28-b70c-21a830972edd";
    fn request(action: &str, extra: &str) -> Vec<u8> {
        format!("{{\"protocol\":\"{PROTOCOL}\",\"action\":\"{action}\",\"purpose\":\"credential\",\"id\":\"{ID}\"{extra}}}\n").into_bytes()
    }
    #[test]
    fn production_create_frame_survives_bun_stdin_transport() {
        const CHILD: &str = "GHOSTGET_NATIVE_FRAME_TEST_CHILD";
        // This branch exists only in the Rust test binary, never the installed app.
        if std::env::var_os(CHILD).is_some() {
            let mut bytes = Vec::new();
            std::io::stdin()
                .lock()
                .take((MAX_REQUEST + 1) as u64)
                .read_to_end(&mut bytes)
                .unwrap();
            let parsed = parse_request(&bytes).unwrap();
            assert!(matches!(
                parsed,
                Request::Create {
                    purpose: Purpose::Credential,
                    kind: Kind::Password,
                    ref id,
                    ..
                } if id == "4b65388b-eb18-4f9f-af6f-63c03d0ffcdb"
            ));
            println!("NATIVE_FRAME_ACCEPTED");
            return;
        }
        let script = r#"
const child = Bun.spawn([process.argv[1], '--exact', 'vault::tests::production_create_frame_survives_bun_stdin_transport', '--nocapture'], {
  env: { GHOSTGET_NATIVE_FRAME_TEST_CHILD: '1' }, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'
});
const joined = Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
const settled = joined.then(() => true, () => true);
const kill = () => { if (child.exitCode === null) { try { child.kill('SIGKILL'); } catch { /* Exit may win. */ } } };
const operation = (async () => {
  // Same serialization and delayed write as exchangeNativeCreate after receipt persistence.
  await Bun.sleep(100);
  const request = { id: '4b65388b-eb18-4f9f-af6f-63c03d0ffcdb', purpose: 'credential', kind: 'password' };
  child.stdin.write(`${JSON.stringify({ protocol: 'ghostget.secret-store/1', action: 'create', ...request })}\n`);
  await child.stdin.end();
  const [code, out, err] = await joined;
  if (code !== 0 || !out.includes('NATIVE_FRAME_ACCEPTED') || err !== '') throw new Error(`Native frame transport failed: ${out} ${err}`);
})();
let deadline;
try {
  await Promise.race([operation, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Native frame fixture exceeded its deadline')), 5000); })]);
} finally {
  kill();
  let joinDeadline;
  try {
    const complete = await Promise.race([settled, new Promise(resolve => { joinDeadline = setTimeout(() => resolve(false), 3000); })]);
    if (!complete) throw new Error('Native frame fixture custody could not be confirmed');
  } finally { clearTimeout(joinDeadline); clearTimeout(deadline); }
}
"#;
        let output = std::process::Command::new("bun")
            .args(["--no-env-file", "--no-install", "-e", script])
            .arg(std::env::current_exe().unwrap())
            .stdin(std::process::Stdio::null())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    #[test]
    fn protocol_rejects_ambiguous_or_expanded_authority() {
        assert!(parse_request(&request("create", ",\"kind\":\"password\"")).is_ok());
        for action in ["read", "delete"] {
            assert!(parse_request(&request(action, "")).is_ok());
            assert!(parse_request(&request(action, ",\"kind\":null")).is_err());
        }
        for (action, extra) in [
            ("create", ""),
            ("create", ",\"kind\":null"),
            ("read", ",\"value\":\"secret\""),
            ("read", ",\"id\":\"duplicate\""),
            ("read", ",\"purpose\":\"credential\""),
            ("read", ",\"action\":\"create\""),
            ("read", ",\"protocol\":\"ghostget.secret-store/1\""),
            ("list", ""),
            ("export", ""),
            ("update", ""),
        ] {
            assert!(parse_request(&request(action, extra)).is_err());
        }
        let valid = request("read", "");
        assert!(parse_request(&valid[..valid.len() - 1]).is_err());
        assert!(parse_request(&[valid.clone(), valid.clone()].concat()).is_err());
        assert!(parse_request(&[]).is_err());
        assert!(parse_request(&vec![b' '; MAX_REQUEST + 1]).is_err());
        for replacement in ["ghostget.secret-store/2", "unknown"] {
            assert!(parse_request(
                &String::from_utf8(valid.clone())
                    .unwrap()
                    .replace(PROTOCOL, replacement)
                    .into_bytes()
            )
            .is_err());
        }
        assert!(parse_request(
            &String::from_utf8(request("create", ",\"kind\":\"password\""))
                .unwrap()
                .replace("credential", "1password-bootstrap")
                .into_bytes()
        )
        .is_err());
    }
    #[test]
    fn identifiers_and_native_parent_paths_are_exact() {
        assert!(uuid_v4(ID));
        for value in [
            ID.to_uppercase(),
            ID.replace("4c28", "3c28"),
            ID.replace("b70c", "770c"),
            format!("../{ID}"),
            format!("{ID}x"),
        ] {
            assert!(!uuid_v4(&value));
        }
        let helper = Path::new("/Applications/Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop");
        let paths = native_paths(helper).unwrap();
        assert_eq!(paths, NativePaths {
            credential: PathBuf::from("/Applications/Ghostget.app/Contents/Resources/ghostget-runtime/ghostget-credential-bun"),
            control: PathBuf::from("/Applications/Ghostget.app/Contents/Resources/ghostget-runtime/ghostget-bun"),
            host: PathBuf::from("/Applications/Ghostget.app/Contents/MacOS/ghostget-desktop"),
        });
        assert_ne!(paths.host.as_path(), helper);
        assert!(native_paths(&paths.host).is_none());
        // An installed app can live outside /Applications; every role still
        // resolves within the same exact outer bundle, including paths with spaces.
        let moved = native_paths(Path::new("/Volumes/Local Preview/My Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop")).unwrap();
        assert_eq!(moved.host, PathBuf::from("/Volumes/Local Preview/My Ghostget.app/Contents/MacOS/ghostget-desktop"));
        assert_eq!(moved.credential, PathBuf::from("/Volumes/Local Preview/My Ghostget.app/Contents/Resources/ghostget-runtime/ghostget-credential-bun"));
        assert_eq!(moved.control, PathBuf::from("/Volumes/Local Preview/My Ghostget.app/Contents/Resources/ghostget-runtime/ghostget-bun"));
        for path in [
            "/tmp/ghostget-desktop",
            "/tmp/Ghostget/Contents/MacOS/ghostget-desktop",
            "/tmp/Ghostget.app/Resources/ghostget-desktop",
            "/Applications/Ghostget.app/Contents/MacOS/ghostget-desktop",
            "/Applications/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop",
            "/Applications/Ghostget.app/Contents/Helpers/Other.app/Contents/MacOS/ghostget-desktop",
            "/Applications/Ghostget/Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop",
            "/Applications/Ghostget.app/Contents/Resources/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop",
            "/Applications/Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/other",
            "/Applications/Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/MacOS/ghostget-desktop",
            "/Applications/Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/Contents/ghostget-desktop",
            "/Applications/../Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop",
            "Ghostget.app/Contents/Helpers/Ghostget Secure Entry.app/Contents/MacOS/ghostget-desktop",
        ] {
            assert!(native_paths(Path::new(path)).is_none(), "{path}");
        }
        assert_ne!(Purpose::Credential.service(), Purpose::Bootstrap.service());
    }
    #[test]
    fn secret_bounds_and_receipts_preserve_the_value_boundary() {
        assert!(valid_secret(&"x".repeat(MAX_SECRET), Purpose::Credential));
        for value in [
            String::new(),
            "x".repeat(MAX_SECRET + 1),
            "bad\0secret".into(),
        ] {
            assert!(!valid_secret(&value, Purpose::Credential));
        }
        for value in ["", "ops_", "personal-token", "ops_foo\n", " ops_foo"] {
            assert!(!valid_secret(value, Purpose::Bootstrap));
        }
        assert!(valid_secret("ops_fixture", Purpose::Bootstrap));
        for result in [
            Ok(None),
            Err(Error::Cancelled),
            Err(Error::Unavailable),
            Err(Error::Exists),
            Err(Error::NotFound),
            Err(Error::Invalid),
        ] {
            let mut out = vec![];
            write_result(&mut out, result).unwrap();
            let value: serde_json::Value = serde_json::from_slice(&out).unwrap();
            assert!(value.get("value").is_none());
        }
        let mut out = vec![];
        write_result(&mut out, Ok(Some(Secret("fixture-\"-☃".into())))).unwrap();
        let value: serde_json::Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(value.as_object().unwrap().len(), 2);
        assert_eq!(value["value"], "fixture-\"-☃");
        let mut maximum = vec![];
        write_result(&mut maximum, Ok(Some(Secret("\u{1}".repeat(MAX_SECRET))))).unwrap();
        assert!(maximum.len() < 100 * 1024);
    }
    #[test]
    fn identifier_character_law_and_arbitrary_frame_totality() {
        for index in 0..ID.len() {
            for byte in 0..=127u8 {
                let mut value = ID.as_bytes().to_vec();
                value[index] = byte;
                let expected = match index {
                    8 | 13 | 18 | 23 => byte == b'-',
                    14 => byte == b'4',
                    19 => b"89ab".contains(&byte),
                    _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte),
                };
                assert_eq!(uuid_v4(std::str::from_utf8(&value).unwrap()), expected);
            }
        }
        let mut seed = 0x72757374u32;
        for length in 0..256 {
            let mut bytes = vec![];
            for _ in 0..length {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                bytes.push((seed >> 24) as u8);
            }
            assert!(parse_request(&bytes).is_err());
            bytes.push(b'\n');
            assert!(parse_request(&bytes).is_err());
        }
    }
}
