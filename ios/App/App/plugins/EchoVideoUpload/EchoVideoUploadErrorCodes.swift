import Foundation

/// Internal native upload error codes (PASS IOS2) — match Android / JS ECHO_VIDEO_UPLOAD_ERROR.
enum EchoVideoUploadErrorCodes {
    static let invalidOptions = "invalid_options"
    static let fileMissing = "file_missing"
    static let fileEmpty = "file_empty"
    static let fileSizeMismatch = "file_size_mismatch"
    static let pathNotAllowed = "path_not_allowed"
    static let tusCreateFailed = "tus_create_failed"
    static let tusLocationMissing = "tus_location_missing"
    static let tusHeadFailed = "tus_head_failed"
    static let tusOffsetInvalid = "tus_offset_invalid"
    static let tusOffsetConflict = "tus_offset_conflict"
    static let networkFailed = "network_failed"
    static let authFailed = "auth_failed"
    static let serverFailed = "server_failed"
    static let cancelled = "cancelled"
    static let jobConflict = "job_conflict"
}
