import AppKit
import Darwin
import Foundation

private final class OutputAction {
    let entry: OutputEntry
    let directory: FileIdentity
    let kind: String
    init(_ entry: OutputEntry, _ directory: FileIdentity, _ kind: String) {
        self.entry = entry; self.directory = directory; self.kind = kind
    }
}

final class MenuBarDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private var lockFile: FileHandle?
    private var timer: Timer?
    private let outputs: OutputsStore
    private var snapshot = OutputsSnapshot(entries: [], directory: nil, message: "Loading outputs…", truncated: false)
    private var refreshing = false
    private var tracking = false
    private var notice: String?

    init(outputsPath: String?) { outputs = OutputsStore(path: outputsPath) }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard acquireSingleton() else { NSApp.terminate(nil); return }
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "Gg"
            button.font = NSFont(name: "Georgia", size: 13) ?? NSFont.systemFont(ofSize: 13)
            button.toolTip = "Ghostget · outputs and CLI help"
            button.setAccessibilityLabel("Ghostget menu")
        }
        rebuildMenu()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in self?.refresh() }
    }

    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate() }
    func menuWillOpen(_ menu: NSMenu) { tracking = true }
    func menuDidClose(_ menu: NSMenu) { tracking = false; rebuildMenu(); refresh() }

    private func disabled(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func action(_ title: String, _ selector: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: key)
        item.target = self
        return item
    }

    private func rebuildMenu() {
        guard !tracking else { return }
        let menu = NSMenu()
        menu.autoenablesItems = false
        menu.delegate = self
        menu.addItem(disabled("Ghostget"))
        menu.addItem(.separator())
        menu.addItem(disabled("Outputs"))
        if let notice { menu.addItem(disabled(notice)) }
        if let message = snapshot.message { menu.addItem(disabled(message)) }
        if let directory = snapshot.directory {
            for entry in snapshot.entries {
                let parent = NSMenuItem(title: entry.title, action: nil, keyEquivalent: "")
                let submenu = NSMenu()
                submenu.autoenablesItems = false
                let size = ByteCountFormatter.string(fromByteCount: Int64(entry.identity.size), countStyle: .file)
                let date = Date(timeIntervalSince1970: TimeInterval(entry.identity.modified.tv_sec))
                let modified = DateFormatter.localizedString(from: date, dateStyle: .short, timeStyle: .short)
                submenu.addItem(disabled("\(size) · \(modified)"))
                if entry.canOpen {
                    let open = action("Open file", #selector(outputAction(_:)))
                    open.representedObject = OutputAction(entry, directory, "open")
                    submenu.addItem(open)
                }
                for (title, kind) in [("Reveal in Finder", "reveal"), ("Copy file path", "copy")] {
                    let item = action(title, #selector(outputAction(_:)))
                    item.representedObject = OutputAction(entry, directory, kind)
                    submenu.addItem(item)
                }
                parent.submenu = submenu
                menu.addItem(parent)
            }
        }
        if snapshot.truncated { menu.addItem(disabled("Showing up to 12 files from a bounded scan")) }
        menu.addItem(action(refreshing ? "Refreshing outputs…" : "Refresh outputs", #selector(refreshClicked), key: "r"))
        menu.addItem(.separator())
        menu.addItem(action("Open Ghostget documentation", #selector(openDocumentation), key: "?"))
        let help = NSMenuItem(title: "Copy CLI command", action: nil, keyEquivalent: "")
        let commands = NSMenu()
        for (title, command) in [("CLI help", "ghostget --help"), ("Menu-bar help", "ghostget menubar --help"), ("Menu-bar installation status", "ghostget menubar status")] {
            let item = action(title, #selector(copyCommand(_:)))
            item.representedObject = command
            commands.addItem(item)
        }
        help.submenu = commands
        menu.addItem(help)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit Ghostget", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.target = NSApp
        menu.addItem(quit)
        statusItem.menu = menu
    }

    private func refresh() {
        guard !refreshing else { return }
        refreshing = true
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else { return }
            let next = self.outputs.snapshot()
            DispatchQueue.main.async {
                self.snapshot = next
                self.refreshing = false
                self.rebuildMenu()
            }
        }
    }

    @objc private func refreshClicked() { notice = nil; refresh() }
    @objc private func openDocumentation() {
        if let url = URL(string: "https://ghostget.com/getting-started") { _ = NSWorkspace.shared.open(url) }
    }
    @objc private func copyCommand(_ sender: NSMenuItem) {
        guard let command = sender.representedObject as? String else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(command, forType: .string)
    }
    @objc private func outputAction(_ sender: NSMenuItem) {
        guard let action = sender.representedObject as? OutputAction,
              let url = outputs.validatedURL(for: action.entry, directory: action.directory) else {
            notice = "File changed or unavailable; refresh outputs"
            refresh()
            return
        }
        switch action.kind {
        case "open":
            if !NSWorkspace.shared.open(url) { notice = "File could not be opened" }
        case "reveal": NSWorkspace.shared.activateFileViewerSelecting([url])
        case "copy":
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(url.path, forType: .string)
        default: return
        }
    }

    private func acquireSingleton() -> Bool {
        let parent = (NSHomeDirectory() as NSString).appendingPathComponent("Library/Application Support")
        guard let directory = openPhysicalDirectory(parent) else {
            fputs("Ghostget menu-bar support directory is unavailable or unsafe.\n", stderr)
            exit(1)
        }
        defer { close(directory) }
        if mkdirat(directory, "Ghostget", 0o700) != 0 && errno != EEXIST {
            fputs("Ghostget menu-bar support directory could not be created.\n", stderr)
            exit(1)
        }
        let state = openat(directory, "Ghostget", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard state >= 0 else { fputs("Ghostget menu-bar state directory is unsafe.\n", stderr); exit(1) }
        defer { close(state) }
        var info = stat()
        guard fstat(state, &info) == 0, info.st_uid == getuid(), (info.st_mode & 0o777) == 0o700 else {
            fputs("Ghostget menu-bar state directory must be private.\n", stderr)
            exit(1)
        }
        let lock = openat(state, "menubar.lock", O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC | O_EXLOCK | O_NONBLOCK, S_IRUSR | S_IWUSR)
        guard lock >= 0 else {
            if errno == EWOULDBLOCK { return false }
            fputs("Ghostget menu-bar lock is unavailable.\n", stderr)
            exit(1)
        }
        var lockInfo = stat()
        guard fstat(lock, &lockInfo) == 0, (lockInfo.st_mode & S_IFMT) == S_IFREG,
              lockInfo.st_uid == getuid(), (lockInfo.st_mode & 0o777) == 0o600 else {
            close(lock)
            fputs("Ghostget menu-bar lock is unsafe.\n", stderr)
            exit(1)
        }
        lockFile = FileHandle(fileDescriptor: lock, closeOnDealloc: true)
        return true
    }
}

@main
struct GhostgetMenu {
    static func main() {
        let arguments = Array(CommandLine.arguments.dropFirst())
        guard arguments.isEmpty || (arguments.count == 2 && arguments[0] == "--outputs-directory" && arguments[1].hasPrefix("/")) else {
            fputs("Usage: ghostget-menubar [--outputs-directory /absolute/state/outputs]\n", stderr)
            exit(1)
        }
        let application = NSApplication.shared
        let delegate = MenuBarDelegate(outputsPath: arguments.count == 2 ? arguments[1] : nil)
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}
