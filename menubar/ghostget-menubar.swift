import AppKit
import Darwin
import Foundation

final class MenuBarDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var lockFile: FileHandle?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard acquireSingleton() else {
            NSApp.terminate(nil)
            return
        }
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "Gg"
            button.font = NSFont(name: "Georgia", size: 13) ?? NSFont.systemFont(ofSize: 13)
            button.toolTip = "Ghostget menu companion"
        }
        let menu = NSMenu()
        let title = NSMenuItem(title: "Ghostget menu companion", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit Ghostget", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.target = NSApp
        menu.addItem(quit)
        statusItem.menu = menu
    }

    private func acquireSingleton() -> Bool {
        let directory = (NSHomeDirectory() as NSString).appendingPathComponent("Library/Application Support/Ghostget")
        do {
            try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
            let path = (directory as NSString).appendingPathComponent("menubar.lock")
            let descriptor = open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
            guard descriptor >= 0, flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
                if descriptor >= 0 { close(descriptor) }
                return false
            }
            lockFile = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
            return true
        } catch {
            return false
        }
    }
}

let application = NSApplication.shared
let delegate = MenuBarDelegate()
application.delegate = delegate
application.run()
