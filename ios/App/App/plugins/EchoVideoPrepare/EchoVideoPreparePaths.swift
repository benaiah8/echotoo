import Foundation

/// Resolves and validates app-owned draft video paths under Capacitor Directory.Data
/// (iOS Documents) `create-drafts/`.
enum EchoVideoPreparePaths {
    static let draftRootSegment = "create-drafts"

    struct ResolvedPaths {
        let sourceFile: URL
        let temporaryFile: URL
        let destinationFile: URL
        let relativeDestinationPath: String
    }

    struct PathValidationError: Error {
        let code: String
        let message: String
    }

    static func documentsDirectory() throws -> URL {
        guard
            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.storageFailed,
                message: "Cannot resolve Documents directory"
            )
        }
        return url.standardizedFileURL
    }

    static func draftRoot() throws -> URL {
        try documentsDirectory().appendingPathComponent(draftRootSegment, isDirectory: true)
            .standardizedFileURL
    }

    static func resolveAndValidate(
        sourcePath: String?,
        destinationPath: String?,
        temporaryPath: String?
    ) throws -> ResolvedPaths {
        let documents = try documentsDirectory()
        let root = try draftRoot()

        let source = try resolveUnderDraftRoot(
            documents: documents,
            draftRoot: root,
            rawPath: sourcePath,
            fieldName: "sourcePath"
        )
        let temporary = try resolveUnderDraftRoot(
            documents: documents,
            draftRoot: root,
            rawPath: temporaryPath,
            fieldName: "temporaryPath"
        )
        let destination = try resolveUnderDraftRoot(
            documents: documents,
            draftRoot: root,
            rawPath: destinationPath,
            fieldName: "destinationPath"
        )

        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: source.path, isDirectory: &isDir), !isDir.boolValue
        else {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "source file missing"
            )
        }

        let attrs = try? FileManager.default.attributesOfItem(atPath: source.path)
        let size = (attrs?[.size] as? NSNumber)?.int64Value ?? 0
        if size <= 0 {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "source file is empty"
            )
        }

        let sourceParent = source.deletingLastPathComponent().standardizedFileURL
        let tmpParent = temporary.deletingLastPathComponent().standardizedFileURL
        let destParent = destination.deletingLastPathComponent().standardizedFileURL
        if tmpParent != sourceParent {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "temporaryPath must share the source draft directory"
            )
        }
        if destParent != sourceParent {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "destinationPath must share the source draft directory"
            )
        }

        if destination.standardizedFileURL == source.standardizedFileURL
            || temporary.standardizedFileURL == source.standardizedFileURL
        {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "output paths must not equal sourcePath"
            )
        }

        return ResolvedPaths(
            sourceFile: source,
            temporaryFile: temporary,
            destinationFile: destination,
            relativeDestinationPath: normalizeRelative(destinationPath)
        )
    }

    static func resolveUnderDraftRoot(
        documents: URL,
        draftRoot: URL,
        rawPath: String?,
        fieldName: String
    ) throws -> URL {
        guard let raw = rawPath?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty
        else {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "\(fieldName) is required"
            )
        }
        if raw.contains("\0") {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "\(fieldName) is invalid"
            )
        }

        let candidate: URL
        if raw.hasPrefix("file:") {
            guard let url = URL(string: raw) else {
                throw PathValidationError(
                    code: EchoVideoPrepareErrorCodes.invalidOptions,
                    message: "\(fieldName) is invalid"
                )
            }
            candidate = url
        } else if raw.hasPrefix("/") {
            candidate = URL(fileURLWithPath: raw)
        } else {
            var relative = raw.replacingOccurrences(of: "\\", with: "/")
            while relative.hasPrefix("./") {
                relative = String(relative.dropFirst(2))
            }
            if relative.hasPrefix("/") {
                relative = String(relative.dropFirst())
            }
            candidate = documents.appendingPathComponent(relative)
        }

        let canonical = candidate.standardizedFileURL
        let rootPath = draftRoot.path
        let filePath = canonical.path
        if filePath != rootPath && !filePath.hasPrefix(rootPath + "/") {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "\(fieldName) must be under app create-drafts storage"
            )
        }
        if filePath.contains("/../") || filePath.hasSuffix("/..") {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.invalidOptions,
                message: "\(fieldName) path traversal rejected"
            )
        }
        return canonical
    }

    static func normalizeRelative(_ path: String?) -> String {
        guard let path else { return "" }
        let t = path.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\", with: "/")
        if t.hasPrefix("file:") {
            return t
        }
        return t
    }

    static func deleteQuietly(_ url: URL?) {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }

    static func ensureParentDirectory(for file: URL) throws {
        let parent = file.deletingLastPathComponent()
        do {
            try FileManager.default.createDirectory(
                at: parent,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            throw PathValidationError(
                code: EchoVideoPrepareErrorCodes.storageFailed,
                message: "Cannot create draft directory"
            )
        }
    }
}
