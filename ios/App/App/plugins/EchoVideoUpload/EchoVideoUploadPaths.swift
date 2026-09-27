import Foundation

/// Path sandbox for create-drafts video files (PASS IOS2) — mirror Android EchoVideoUploadPaths.
enum EchoVideoUploadPaths {
    static let draftRootSegment = "create-drafts"

    private static let uuidRe = try! NSRegularExpression(
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
    )
    private static let sourceFileRe = try! NSRegularExpression(
        pattern: "^[A-Za-z0-9._-]{1,128}\\.(mp4|mov|MP4|MOV)$"
    )
    private static let preparedFileRe = try! NSRegularExpression(
        pattern: "^[A-Za-z0-9._-]{1,128}\\.prepared\\.mp4$"
    )

    struct ResolvedUploadFile {
        let file: URL
        let relativePath: String
    }

    struct PathValidationError: Error {
        let code: String
        let message: String
    }

    static func documentsDirectory() throws -> URL {
        guard let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.invalidOptions,
                message: "Cannot resolve Documents directory"
            )
        }
        return url.standardizedFileURL
    }

    static func draftRoot() throws -> URL {
        try documentsDirectory().appendingPathComponent(draftRootSegment, isDirectory: true)
            .standardizedFileURL
    }

    static func resolveAndValidate(filePath: String?, declaredFileSize: Int64) throws -> ResolvedUploadFile {
        let documents = try documentsDirectory()
        let root = try draftRoot()
        let file = try resolveUnderDraftRoot(documents: documents, draftRoot: root, rawPath: filePath)
        try assertAllowedDraftRelativePath(draftRoot: root, file: file)

        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir) else {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.fileMissing,
                message: "upload file missing"
            )
        }
        if isDir.boolValue {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "upload path is not a file"
            )
        }

        let attrs = try FileManager.default.attributesOfItem(atPath: file.path)
        let actual = (attrs[.size] as? NSNumber)?.int64Value ?? 0
        if actual <= 0 {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.fileEmpty,
                message: "upload file is empty"
            )
        }
        if declaredFileSize != actual {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.fileSizeMismatch,
                message: "declared fileSize does not match file length"
            )
        }

        let rootPath = root.path
        let abs = file.path
        var relative = draftRootSegment
        if abs.hasPrefix(rootPath) {
            relative += abs.dropFirst(rootPath.count)
        }
        relative = relative.replacingOccurrences(of: "\\", with: "/")
        while relative.contains("//") {
            relative = relative.replacingOccurrences(of: "//", with: "/")
        }

        return ResolvedUploadFile(file: file, relativePath: relative)
    }

    static func resolveUnderDraftRoot(
        documents: URL,
        draftRoot: URL,
        rawPath: String?
    ) throws -> URL {
        guard let trimmed = rawPath?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty
        else {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.invalidOptions,
                message: "filePath is required"
            )
        }
        if trimmed.contains("\0") || trimmed.contains("..") {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "filePath path traversal rejected"
            )
        }

        let candidate: URL
        if trimmed.hasPrefix("file:") {
            guard let url = URL(string: trimmed) else {
                throw PathValidationError(
                    code: EchoVideoUploadErrorCodes.pathNotAllowed,
                    message: "filePath is invalid"
                )
            }
            candidate = url
        } else if trimmed.hasPrefix("/") {
            candidate = URL(fileURLWithPath: trimmed)
        } else {
            var relative = trimmed.replacingOccurrences(of: "\\", with: "/")
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
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "filePath must be under app create-drafts storage"
            )
        }
        return canonical
    }

    static func assertAllowedDraftRelativePath(draftRoot: URL, file: URL) throws {
        let root = draftRoot.path
        let abs = file.path
        guard abs.hasPrefix(root + "/") else {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "filePath outside draft root"
            )
        }
        let rel = String(abs.dropFirst(root.count + 1)).replacingOccurrences(of: "\\", with: "/")
        let parts = rel.split(separator: "/").map(String.init)
        guard parts.count == 2 else {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "filePath must be create-drafts/{publishPostId}/{file}"
            )
        }
        let dir = parts[0]
        let name = parts[1]
        let dirRange = NSRange(dir.startIndex..<dir.endIndex, in: dir)
        guard uuidRe.firstMatch(in: dir, options: [], range: dirRange) != nil else {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "publishPostId segment invalid"
            )
        }
        let nameRange = NSRange(name.startIndex..<name.endIndex, in: name)
        let prepared = preparedFileRe.firstMatch(in: name, options: [], range: nameRange) != nil
        let source = sourceFileRe.firstMatch(in: name, options: [], range: nameRange) != nil
        if !prepared && !source {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "file name not an allowed draft source/prepared video"
            )
        }
        if name.lowercased().contains(".prepared.tmp.") {
            throw PathValidationError(
                code: EchoVideoUploadErrorCodes.pathNotAllowed,
                message: "temporary prepared files cannot be uploaded"
            )
        }
    }
}
