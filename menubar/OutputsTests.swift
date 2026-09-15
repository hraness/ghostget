import Darwin
import Foundation

@main
struct OutputsTests {
    static func main() throws {
        let manager = FileManager.default
        guard let canonical = realpath(manager.temporaryDirectory.path, nil) else { fatalError("Temporary directory is unavailable") }
        let temporaryPath = String(cString: canonical)
        free(canonical)
        let root = URL(fileURLWithPath: temporaryPath).appendingPathComponent("ghostget-menu-test-\(UUID().uuidString)")
        try manager.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        defer { try? manager.removeItem(at: root) }
        let outputs = root.appendingPathComponent("outputs")
        let store = OutputsStore(path: outputs.path)
        precondition(store.snapshot().message == "Outputs unavailable")
        try manager.createDirectory(at: outputs, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        precondition(store.snapshot().message == "No output files")
        let file = outputs.appendingPathComponent("report.txt")
        try Data("hello".utf8).write(to: file)
        try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        let first = store.snapshot()
        precondition(first.entries.count == 1 && first.entries[0].canOpen)
        let entry = first.entries[0]
        precondition(store.validatedURL(for: entry, directory: first.directory!) == file)
        try Data("changed size".utf8).write(to: file)
        precondition(store.validatedURL(for: entry, directory: first.directory!) == nil)
        let alias = outputs.appendingPathComponent("alias.txt")
        try manager.createSymbolicLink(at: alias, withDestinationURL: file)
        precondition(store.snapshot().entries.count == 1)
        try manager.setAttributes([.posixPermissions: 0o666], ofItemAtPath: file.path)
        precondition(store.snapshot().entries.isEmpty)
        try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        let script = outputs.appendingPathComponent("unsafe.command")
        try Data("exit".utf8).write(to: script)
        precondition(store.snapshot().entries.first(where: { $0.name == "unsafe.command" })?.canOpen == false)
        let fresh = store.snapshot()
        let moved = root.appendingPathComponent("previous")
        try manager.moveItem(at: outputs, to: moved)
        try manager.createDirectory(at: outputs, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        precondition(store.validatedURL(for: fresh.entries[0], directory: fresh.directory!) == nil)
        for index in 0..<20 {
            try Data("value".utf8).write(to: outputs.appendingPathComponent("\(index).txt"))
        }
        let bounded = store.snapshot()
        precondition(bounded.entries.count == 12 && bounded.truncated)
        try manager.setAttributes([.posixPermissions: 0o777], ofItemAtPath: root.path)
        precondition(store.snapshot().message == "Outputs unavailable")
        try manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
        try manager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: outputs.path)
        precondition(store.snapshot().message == "Outputs unavailable")
        let aliasRoot = root.appendingPathComponent("alias")
        try manager.createSymbolicLink(at: aliasRoot, withDestinationURL: moved)
        precondition(OutputsStore(path: aliasRoot.appendingPathComponent("outputs").path).snapshot().directory == nil)
        let title = OutputEntry(name: "bad\n\u{202E}title.txt", identity: entry.identity).title
        precondition(title == "badtitle.txt")
        print("Ghostget menu output model: all privacy, bounds, identity, and presentation checks passed")
    }
}
