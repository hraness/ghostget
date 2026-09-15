import Darwin
import Foundation

func openPhysicalDirectory(_ path: String, privateTailCount: Int = 0) -> Int32? {
    guard path.hasPrefix("/"), !path.contains("\0") else { return nil }
    let components = path.split(separator: "/").map(String.init)
    guard !components.isEmpty, components.count <= 128, !components.contains("."), !components.contains("..") else { return nil }
    var descriptor = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC)
    guard descriptor >= 0 else { return nil }
    for (index, component) in components.enumerated() {
        let next = openat(descriptor, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        close(descriptor)
        guard next >= 0 else { return nil }
        descriptor = next
        var info = stat()
        guard fstat(descriptor, &info) == 0 else { close(descriptor); return nil }
        let trustedOwner = info.st_uid == 0 || info.st_uid == getuid()
        let stickyRoot = info.st_uid == 0 && (info.st_mode & S_ISVTX) != 0
        guard trustedOwner && ((info.st_mode & 0o022) == 0 || stickyRoot) else { close(descriptor); return nil }
        if index >= components.count - privateTailCount && (info.st_uid != getuid() || (info.st_mode & 0o777) != 0o700) {
            close(descriptor); return nil
        }
    }
    return descriptor
}

struct FileIdentity: Equatable {
    let device: dev_t
    let inode: ino_t
    let size: off_t
    let modified: timespec
    let mode: mode_t
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.device == rhs.device && lhs.inode == rhs.inode && lhs.size == rhs.size
            && lhs.modified.tv_sec == rhs.modified.tv_sec && lhs.modified.tv_nsec == rhs.modified.tv_nsec
            && lhs.mode == rhs.mode
    }
    init(_ value: stat) {
        device = value.st_dev; inode = value.st_ino; size = value.st_size
        modified = value.st_mtimespec; mode = value.st_mode
    }
}

struct OutputEntry {
    let name: String
    let identity: FileIdentity
    var title: String {
        let clean = name.unicodeScalars.filter {
            !CharacterSet.controlCharacters.contains($0) && !CharacterSet(charactersIn: "\u{202A}\u{202B}\u{202C}\u{202D}\u{202E}\u{2066}\u{2067}\u{2068}\u{2069}").contains($0)
        }
        let title = String(String.UnicodeScalarView(clean)).prefix(72).description
        return title.isEmpty ? "Unnamed output" : title
    }
    var canOpen: Bool {
        ["pdf", "txt", "md", "csv", "json", "png", "jpg", "jpeg", "gif", "webp", "tiff"].contains((name as NSString).pathExtension.lowercased())
    }
}

struct OutputsSnapshot {
    let entries: [OutputEntry]
    let directory: FileIdentity?
    let message: String?
    let truncated: Bool
}

/// Opens each directory component without following symlinks. The selected state
/// and output directories must be private and owned by the current user. Reads
/// are bounded and never create a state root or output directory.
final class OutputsStore {
    let path: String?
    init(path: String?) { self.path = path }

    private func openDirectory() -> Int32? {
        guard let path, path.hasPrefix("/"), !path.contains("\0") else { return nil }
        let components = path.split(separator: "/").map(String.init)
        guard components.count >= 2, components.last == "outputs", !components.contains("."), !components.contains("..") else { return nil }
        return openPhysicalDirectory(path, privateTailCount: 2)
    }

    private func entry(_ name: String, at descriptor: Int32) -> OutputEntry? {
        guard !name.hasPrefix("."), !name.contains("/"), !name.contains("\0") else { return nil }
        var info = stat()
        guard fstatat(descriptor, name, &info, AT_SYMLINK_NOFOLLOW) == 0,
              (info.st_mode & S_IFMT) == S_IFREG, info.st_uid == getuid(), (info.st_mode & 0o022) == 0 else { return nil }
        return OutputEntry(name: name, identity: FileIdentity(info))
    }

    func snapshot() -> OutputsSnapshot {
        guard let descriptor = openDirectory() else {
            return OutputsSnapshot(entries: [], directory: nil, message: "Outputs unavailable", truncated: false)
        }
        defer { close(descriptor) }
        var directoryInfo = stat()
        guard fstat(descriptor, &directoryInfo) == 0 else {
            return OutputsSnapshot(entries: [], directory: nil, message: "Outputs unavailable", truncated: false)
        }
        let copy = dup(descriptor)
        guard copy >= 0 else { return OutputsSnapshot(entries: [], directory: nil, message: "Outputs unavailable", truncated: false) }
        guard let stream = fdopendir(copy) else {
            close(copy)
            return OutputsSnapshot(entries: [], directory: nil, message: "Outputs unavailable", truncated: false)
        }
        defer { closedir(stream) }
        var entries: [OutputEntry] = []
        var inspected = 0
        while inspected < 512 {
            errno = 0
            guard let record = readdir(stream) else {
                if errno != 0 { return OutputsSnapshot(entries: [], directory: nil, message: "Outputs unavailable", truncated: false) }
                break
            }
            inspected += 1
            let name = withUnsafePointer(to: &record.pointee.d_name) {
                $0.withMemoryRebound(to: CChar.self, capacity: Int(record.pointee.d_namlen) + 1) { String(cString: $0) }
            }
            if let candidate = entry(name, at: descriptor) { entries.append(candidate) }
        }
        let truncated = inspected == 512 || entries.count > 12
        entries.sort {
            if $0.identity.modified.tv_sec != $1.identity.modified.tv_sec { return $0.identity.modified.tv_sec > $1.identity.modified.tv_sec }
            if $0.identity.modified.tv_nsec != $1.identity.modified.tv_nsec { return $0.identity.modified.tv_nsec > $1.identity.modified.tv_nsec }
            return $0.name < $1.name
        }
        guard let rechecked = openDirectory() else { return OutputsSnapshot(entries: [], directory: nil, message: "Outputs unavailable", truncated: false) }
        defer { close(rechecked) }
        var after = stat()
        guard fstat(rechecked, &after) == 0, after.st_dev == directoryInfo.st_dev, after.st_ino == directoryInfo.st_ino else {
            return OutputsSnapshot(entries: [], directory: nil, message: "Outputs unavailable", truncated: false)
        }
        return OutputsSnapshot(entries: Array(entries.prefix(12)), directory: FileIdentity(directoryInfo), message: entries.isEmpty ? "No output files" : nil, truncated: truncated)
    }

    /// Revalidate directory and file identity at dispatch. Opening a URL remains
    /// an OS handoff; this cannot eliminate races with the same user's processes.
    func validatedURL(for expected: OutputEntry, directory: FileIdentity) -> URL? {
        guard let path, let descriptor = openDirectory() else { return nil }
        defer { close(descriptor) }
        var info = stat()
        guard fstat(descriptor, &info) == 0, info.st_dev == directory.device, info.st_ino == directory.inode,
              let current = entry(expected.name, at: descriptor), current.identity == expected.identity else { return nil }
        return URL(fileURLWithPath: path).appendingPathComponent(expected.name)
    }
}
