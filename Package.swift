// swift-tools-version: 5.9
import PackageDescription

#if !os(macOS)
fatalError("Ghostget's native menu build requires macOS.")
#endif

// CodeQL discovers this package and builds the same runtime sources as swiftc.
// The normal build remains scripts/build-menubar.ts; neither creates an app.
let package = Package(
    name: "GhostgetMenu",
    products: [.executable(name: "ghostget-menubar", targets: ["GhostgetMenu"])],
    targets: [
        .executableTarget(
            name: "GhostgetMenu",
            path: "menubar",
            exclude: ["OutputsTests.swift"],
            sources: ["Outputs.swift", "ghostget-menubar.swift"],
            linkerSettings: [.linkedFramework("AppKit")]
        )
    ]
)
