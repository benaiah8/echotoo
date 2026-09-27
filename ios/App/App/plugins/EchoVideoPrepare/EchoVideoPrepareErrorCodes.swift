import Foundation

/// Internal native preparation error codes (shared with JS + Android).
enum EchoVideoPrepareErrorCodes {
    static let unsupportedCodec = "unsupported_codec"
    static let encoderUnavailable = "encoder_unavailable"
    static let decodeFailed = "decode_failed"
    static let encodeFailed = "encode_failed"
    static let outputInvalid = "output_invalid"
    static let cancelled = "cancelled"
    static let storageFailed = "storage_failed"
    static let jobConflict = "job_conflict"
    static let invalidOptions = "invalid_options"
    static let notImplemented = "not_implemented"
    static let sourceResolutionTooHigh = "source_resolution_too_high"
}
