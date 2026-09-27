import Foundation

/// Retry / HTTP classification (PASS IOS2) — match Android EchoVideoUploadRetry.
enum EchoVideoUploadRetry {
    static let retryDelaysMs: [UInt64] = [0, 1000, 3000, 5000, 10000]
    static let defaultChunkBytes: Int64 = 5 * 1024 * 1024
    static let ioBufferBytes = 64 * 1024
    static let progressThrottleMs: UInt64 = 400

    enum FailureClass {
        case retryable
        case auth
        case client
        case server
        case offsetConflict
        case cancelled
    }

    static func classifyHttpStatus(_ code: Int) -> FailureClass {
        if code == 401 || code == 403 { return .auth }
        if code == 409 { return .offsetConflict }
        if (500 ... 599).contains(code) { return .server }
        if (400 ... 499).contains(code) { return .client }
        return .retryable
    }

    static func isRetryable(_ cls: FailureClass) -> Bool {
        cls == .retryable || cls == .server
    }

    static func errorCode(for cls: FailureClass) -> String {
        switch cls {
        case .auth: return EchoVideoUploadErrorCodes.authFailed
        case .server: return EchoVideoUploadErrorCodes.serverFailed
        case .offsetConflict: return EchoVideoUploadErrorCodes.tusOffsetConflict
        case .cancelled: return EchoVideoUploadErrorCodes.cancelled
        case .client: return EchoVideoUploadErrorCodes.tusCreateFailed
        case .retryable: return EchoVideoUploadErrorCodes.networkFailed
        }
    }

    static func delayForAttempt(_ attemptIndexZeroBased: Int) -> UInt64 {
        if attemptIndexZeroBased < 0 { return retryDelaysMs[0] }
        if attemptIndexZeroBased >= retryDelaysMs.count {
            return retryDelaysMs[retryDelaysMs.count - 1]
        }
        return retryDelaysMs[attemptIndexZeroBased]
    }

    static func maxAttempts() -> Int { retryDelaysMs.count }

    static func progress01(uploaded: Int64, total: Int64) -> Double {
        guard total > 0 else { return 0 }
        let p = Double(uploaded) / Double(total)
        if p < 0 { return 0 }
        if p > 1 { return 1 }
        return p
    }

    static func clampChunkLength(offset: Int64, fileSize: Int64, chunkSize: Int64) -> Int64 {
        if offset < 0 || fileSize < 0 || offset > fileSize { return 0 }
        let remaining = fileSize - offset
        let size = chunkSize > 0 ? chunkSize : defaultChunkBytes
        return min(remaining, size)
    }
}
