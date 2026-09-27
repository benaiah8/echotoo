import Foundation

/// TUS Upload-Metadata + Location resolve (PASS IOS2).
enum EchoVideoUploadTusMetadata {
    static func encodeBase64Utf8(_ value: String) -> String {
        Data(value.utf8).base64EncodedString()
    }

    static func buildUploadMetadata(filetype: String, title: String) -> String {
        "filetype \(encodeBase64Utf8(filetype)),title \(encodeBase64Utf8(title))"
    }

    static func resolveUploadUrl(tusEndpoint: String, location: String?) throws -> String {
        guard let raw = location?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty
        else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusLocationMissing,
                message: "TUS Location header missing"
            )
        }
        if raw.hasPrefix("https://") || raw.hasPrefix("http://") {
            return raw
        }
        let endpoint = tusEndpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !endpoint.isEmpty, let base = URL(string: endpoint) else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.invalidOptions,
                message: "tusEndpoint required to resolve relative Location"
            )
        }
        guard let resolved = URL(string: raw, relativeTo: base)?.absoluteURL else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusLocationMissing,
                message: "Cannot resolve TUS Location"
            )
        }
        let out = resolved.absoluteString
        guard out.hasPrefix("https://") || out.hasPrefix("http://") else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusLocationMissing,
                message: "Resolved Location is not an absolute URL"
            )
        }
        return out
    }
}
