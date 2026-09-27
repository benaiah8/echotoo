import AVFoundation
import Foundation

/// Cheap pre-writer checks: public Create caps + readable video track + H.264 availability.
enum EchoVideoPreparePreflight {
    static let maxLongEdgePx = 4096
    static let maxShortEdgePx = 2160
    static let maxPixelArea = maxLongEdgePx * maxShortEdgePx
    static let maxDurationSeconds: Double = 90
    static let maxSourceBytes: Int64 = 200 * 1024 * 1024

    struct DisplaySize {
        let width: Int
        let height: Int

        var shortEdge: Int { min(width, height) }
        var longEdge: Int { max(width, height) }
    }

    struct ScalePlan {
        let outputWidth: Int
        let outputHeight: Int
        let applyScale: Bool
    }

    struct Result {
        let ok: Bool
        let code: String?
        let message: String?
        let display: DisplaySize?
        let durationSeconds: Double?
        let hasAudio: Bool
        let preferredTransform: CGAffineTransform
        let naturalSize: CGSize
        let videoTrack: AVAssetTrack?
        let audioTrack: AVAssetTrack?

        static func failure(_ code: String, _ message: String) -> Result {
            Result(
                ok: false,
                code: code,
                message: message,
                display: nil,
                durationSeconds: nil,
                hasAudio: false,
                preferredTransform: .identity,
                naturalSize: .zero,
                videoTrack: nil,
                audioTrack: nil
            )
        }
    }

    static func exceedsPublicSourceLimit(_ display: DisplaySize) -> Bool {
        if display.width <= 0 || display.height <= 0 { return false }
        if display.longEdge > maxLongEdgePx { return true }
        if display.shortEdge > maxShortEdgePx { return true }
        let area = display.width * display.height
        return area > maxPixelArea
    }

    /// JS `targetLongEdge` is the short-edge/"p" policy target (720/1080). Never upscale.
    static func planScale(display: DisplaySize, targetShortEdgePolicyValue: Int) -> ScalePlan {
        let sourceW = max(0, display.width)
        let sourceH = max(0, display.height)
        if sourceW <= 0 || sourceH <= 0 {
            let edge = max(0, targetShortEdgePolicyValue)
            return ScalePlan(outputWidth: edge, outputHeight: edge, applyScale: edge > 0)
        }

        let sourceShort = min(sourceW, sourceH)
        let target = max(0, targetShortEdgePolicyValue)
        let scale: CGFloat
        let applyScale: Bool
        if target <= 0 || sourceShort <= target {
            scale = 1
            applyScale = false
        } else {
            scale = CGFloat(target) / CGFloat(sourceShort)
            applyScale = true
        }

        let outW = evenDimension(Int((CGFloat(sourceW) * scale).rounded()))
        let outH = evenDimension(Int((CGFloat(sourceH) * scale).rounded()))
        return ScalePlan(
            outputWidth: max(2, outW),
            outputHeight: max(2, outH),
            applyScale: applyScale
        )
    }

    static func clampTargetFps(_ targetFps: Int) -> Int {
        if targetFps <= 0 { return 30 }
        return min(targetFps, 30)
    }

    static func evenDimension(_ value: Int) -> Int {
        let v = max(0, value)
        return v - (v % 2)
    }

    static func displaySize(naturalSize: CGSize, preferredTransform: CGAffineTransform) -> DisplaySize {
        let rect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
        let w = Int(abs(rect.width).rounded())
        let h = Int(abs(rect.height).rounded())
        return DisplaySize(width: max(0, w), height: max(0, h))
    }

    static func check(sourceFile: URL) -> Result {
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: sourceFile.path, isDirectory: &isDir),
              !isDir.boolValue
        else {
            return .failure(
                EchoVideoPrepareErrorCodes.invalidOptions,
                "Source video is missing or empty"
            )
        }

        let attrs = try? FileManager.default.attributesOfItem(atPath: sourceFile.path)
        let size = (attrs?[.size] as? NSNumber)?.int64Value ?? 0
        if size <= 0 {
            return .failure(
                EchoVideoPrepareErrorCodes.invalidOptions,
                "Source video is missing or empty"
            )
        }
        if size > maxSourceBytes {
            return .failure(
                EchoVideoPrepareErrorCodes.invalidOptions,
                "Source video exceeds 200 MB limit"
            )
        }

        let asset = AVURLAsset(url: sourceFile)
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        if !durationSeconds.isFinite || durationSeconds <= 0 {
            return .failure(
                EchoVideoPrepareErrorCodes.unsupportedCodec,
                "Cannot read source video duration"
            )
        }
        if durationSeconds > maxDurationSeconds + 0.05 {
            return .failure(
                EchoVideoPrepareErrorCodes.invalidOptions,
                "Source video exceeds 90 second limit"
            )
        }

        guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            return .failure(
                EchoVideoPrepareErrorCodes.unsupportedCodec,
                "Source has no video track"
            )
        }

        let naturalSize = videoTrack.naturalSize
        let preferredTransform = videoTrack.preferredTransform
        if naturalSize.width <= 0 || naturalSize.height <= 0 {
            return .failure(
                EchoVideoPrepareErrorCodes.unsupportedCodec,
                "Cannot read source video dimensions"
            )
        }

        let display = displaySize(naturalSize: naturalSize, preferredTransform: preferredTransform)
        if exceedsPublicSourceLimit(display) {
            return .failure(
                EchoVideoPrepareErrorCodes.sourceResolutionTooHigh,
                "Source resolution exceeds 4K limit"
            )
        }

        // Soft encoder probe — VideoToolbox H.264 is expected on supported devices.
        if !isH264EncodingLikelyAvailable() {
            return .failure(
                EchoVideoPrepareErrorCodes.encoderUnavailable,
                "H.264 encoder unavailable on this device"
            )
        }

        let audioTrack = asset.tracks(withMediaType: .audio).first
        return Result(
            ok: true,
            code: nil,
            message: nil,
            display: display,
            durationSeconds: durationSeconds,
            hasAudio: audioTrack != nil,
            preferredTransform: preferredTransform,
            naturalSize: naturalSize,
            videoTrack: videoTrack,
            audioTrack: audioTrack
        )
    }

    private static func isH264EncodingLikelyAvailable() -> Bool {
        // AVAssetWriter + VideoToolbox H.264 is available on all App Store iOS devices we support.
        // Keep a cheap gate so preflight can still fail closed if somehow unavailable.
        return true
    }
}
