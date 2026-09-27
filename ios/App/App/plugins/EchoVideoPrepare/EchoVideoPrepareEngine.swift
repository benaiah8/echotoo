import AVFoundation
import CoreMedia
import Foundation

/// AVAssetReader + AVAssetWriter preparation session (PASS IOS1).
/// One instance per prepareVideo job. Bounded-memory sample processing.
final class EchoVideoPrepareEngine {
    protocol Listener: AnyObject {
        func onProgress(_ progress01: Double?)
        func onCompleted(_ output: OutputInfo)
        func onFailed(code: String, message: String)
        func onCancelled()
    }

    struct Request {
        let jobId: String
        let sourceFile: URL
        let temporaryFile: URL
        let destinationFile: URL
        let relativeDestinationPath: String
        let targetShortEdge: Int
        let targetVideoBitrate: Int
        let targetFps: Int
        let audioBitrate: Int
    }

    struct OutputInfo {
        let outputPath: String
        let sizeBytes: Int64
        let width: Int
        let height: Int
        let durationMs: Int64
        let mimeType: String
    }

    private static let progressIntervalMs: Int64 = 400
    private static let logTag = "[echotoo video prepare][ios]"

    private let request: Request
    private weak var listener: Listener?

    /// Owns the encode session lifecycle (may block on DispatchGroup.wait).
    private let sessionQueue = DispatchQueue(
        label: "com.experience.app.echovideoprepare.session",
        qos: .userInitiated
    )
    /// Pumps sample buffers; must not be the same queue blocked by group.wait.
    private let pumpQueue = DispatchQueue(
        label: "com.experience.app.echovideoprepare.pump",
        qos: .userInitiated
    )
    private let callbackQueue = DispatchQueue.main
    private let stateLock = NSLock()

    private var terminal = false
    private var cancelledFlag = false

    private var reader: AVAssetReader?
    private var writer: AVAssetWriter?
    private var lastEmittedProgress: Double = -1
    private var lastProgressEmitMs: Int64 = 0
    private var outputWidth = 0
    private var outputHeight = 0
    private var totalDurationSeconds: Double = 0
    /// Best-effort unblock for DispatchGroup.wait when cancel races pumping.
    private var unblockEncodeWait: (() -> Void)?

    init(request: Request, listener: Listener) {
        self.request = request
        self.listener = listener
    }

    func start() {
        sessionQueue.async { [weak self] in
            self?.run()
        }
    }

    func cancel() {
        stateLock.lock()
        cancelledFlag = true
        let unblock = unblockEncodeWait
        stateLock.unlock()
        // Cancel reader/writer immediately; terminal emit may race with sessionQueue.
        reader?.cancelReading()
        writer?.cancelWriting()
        unblock?()
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.markTerminal() {
                EchoVideoPreparePaths.deleteQuietly(self.request.temporaryFile)
                self.emitCancelled()
            }
        }
    }

    func isCancelled() -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return cancelledFlag
    }

    private func run() {
        do {
            try EchoVideoPreparePaths.ensureParentDirectory(for: request.temporaryFile)
            EchoVideoPreparePaths.deleteQuietly(request.temporaryFile)

            let preflight = EchoVideoPreparePreflight.check(sourceFile: request.sourceFile)
            guard preflight.ok,
                  let display = preflight.display,
                  let videoTrack = preflight.videoTrack,
                  let durationSeconds = preflight.durationSeconds
            else {
                fail(
                    code: preflight.code ?? EchoVideoPrepareErrorCodes.encodeFailed,
                    message: preflight.message ?? "preflight failed"
                )
                return
            }

            if isCancelled() {
                cancelCleanup()
                return
            }

            let scalePlan = EchoVideoPreparePreflight.planScale(
                display: display,
                targetShortEdgePolicyValue: request.targetShortEdge
            )
            let fps = EchoVideoPreparePreflight.clampTargetFps(request.targetFps)
            outputWidth = scalePlan.outputWidth
            outputHeight = scalePlan.outputHeight
            totalDurationSeconds = durationSeconds

            NSLog(
                "%@ job start id=%@ display=%dx%d targetShort=%d out=%dx%d fps=%d vbitrate=%d",
                Self.logTag,
                request.jobId,
                display.width,
                display.height,
                request.targetShortEdge,
                outputWidth,
                outputHeight,
                fps,
                request.targetVideoBitrate
            )

            let asset = AVURLAsset(url: request.sourceFile)
            let reader = try AVAssetReader(asset: asset)

            let composition = try buildVideoComposition(
                asset: asset,
                videoTrack: videoTrack,
                preferredTransform: preflight.preferredTransform,
                naturalSize: preflight.naturalSize,
                renderWidth: outputWidth,
                renderHeight: outputHeight,
                fps: fps
            )

            let videoReaderOutput = AVAssetReaderVideoCompositionOutput(
                videoTracks: [videoTrack],
                videoSettings: [
                    kCVPixelBufferPixelFormatTypeKey as String:
                        kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
                ]
            )
            videoReaderOutput.alwaysCopiesSampleData = false
            videoReaderOutput.videoComposition = composition
            guard reader.canAdd(videoReaderOutput) else {
                fail(
                    code: EchoVideoPrepareErrorCodes.decodeFailed,
                    message: "Cannot attach video reader output"
                )
                return
            }
            reader.add(videoReaderOutput)

            var audioReaderOutput: AVAssetReaderTrackOutput?
            if let audioTrack = preflight.audioTrack {
                let audioOut = AVAssetReaderTrackOutput(
                    track: audioTrack,
                    outputSettings: [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVLinearPCMIsBigEndianKey: false,
                        AVLinearPCMIsFloatKey: false,
                        AVLinearPCMBitDepthKey: 16,
                    ]
                )
                audioOut.alwaysCopiesSampleData = false
                if reader.canAdd(audioOut) {
                    reader.add(audioOut)
                    audioReaderOutput = audioOut
                }
            }

            let writer = try AVAssetWriter(
                outputURL: request.temporaryFile,
                fileType: .mp4
            )

            let videoSettings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: outputWidth,
                AVVideoHeightKey: outputHeight,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: request.targetVideoBitrate,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                    AVVideoExpectedSourceFrameRateKey: fps,
                    AVVideoMaxKeyFrameIntervalKey: max(1, fps * 2),
                ] as [String: Any],
            ]
            let videoWriterInput = AVAssetWriterInput(
                mediaType: .video,
                outputSettings: videoSettings
            )
            videoWriterInput.expectsMediaDataInRealTime = false
            // Composition already bakes orientation into upright pixels.
            videoWriterInput.transform = .identity
            guard writer.canAdd(videoWriterInput) else {
                fail(
                    code: EchoVideoPrepareErrorCodes.encoderUnavailable,
                    message: "Cannot attach H.264 writer input"
                )
                return
            }
            writer.add(videoWriterInput)

            var audioWriterInput: AVAssetWriterInput?
            if audioReaderOutput != nil {
                let sampleRate: Double = 44_100
                let audioSettings: [String: Any] = [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVNumberOfChannelsKey: 2,
                    AVSampleRateKey: sampleRate,
                    AVEncoderBitRateKey: max(32_000, request.audioBitrate),
                ]
                let input = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
                input.expectsMediaDataInRealTime = false
                if writer.canAdd(input) {
                    writer.add(input)
                    audioWriterInput = input
                } else {
                    // Keep source without inventing audio if AAC input cannot be attached.
                    audioReaderOutput = nil
                }
            }

            guard writer.startWriting() else {
                fail(
                    code: EchoVideoPrepareErrorCodes.encodeFailed,
                    message: writer.error?.localizedDescription ?? "Writer failed to start"
                )
                return
            }
            guard reader.startReading() else {
                fail(
                    code: EchoVideoPrepareErrorCodes.decodeFailed,
                    message: reader.error?.localizedDescription ?? "Reader failed to start"
                )
                return
            }

            writer.startSession(atSourceTime: .zero)
            self.reader = reader
            self.writer = writer

            let group = DispatchGroup()
            let finishLock = NSLock()
            var videoDone = false
            var audioDone = audioWriterInput == nil

            func markVideoDone() {
                finishLock.lock()
                defer { finishLock.unlock() }
                guard !videoDone else { return }
                videoDone = true
                group.leave()
            }

            func markAudioDone() {
                finishLock.lock()
                defer { finishLock.unlock() }
                guard !audioDone else { return }
                audioDone = true
                group.leave()
            }

            group.enter()
            if audioWriterInput != nil {
                group.enter()
            }

            stateLock.lock()
            unblockEncodeWait = {
                markVideoDone()
                markAudioDone()
            }
            stateLock.unlock()
            defer {
                stateLock.lock()
                unblockEncodeWait = nil
                stateLock.unlock()
            }

            videoWriterInput.requestMediaDataWhenReady(on: pumpQueue) { [weak self] in
                guard let self else { return }
                while videoWriterInput.isReadyForMoreMediaData {
                    if self.isCancelled() {
                        videoWriterInput.markAsFinished()
                        markVideoDone()
                        return
                    }
                    if let sample = videoReaderOutput.copyNextSampleBuffer() {
                        self.emitProgressFromSample(sample)
                        if !videoWriterInput.append(sample) {
                            videoWriterInput.markAsFinished()
                            markVideoDone()
                            return
                        }
                    } else {
                        videoWriterInput.markAsFinished()
                        markVideoDone()
                        return
                    }
                }
            }

            if let audioWriterInput, let audioReaderOutput {
                audioWriterInput.requestMediaDataWhenReady(on: pumpQueue) { [weak self] in
                    guard let self else { return }
                    while audioWriterInput.isReadyForMoreMediaData {
                        if self.isCancelled() {
                            audioWriterInput.markAsFinished()
                            markAudioDone()
                            return
                        }
                        if let sample = audioReaderOutput.copyNextSampleBuffer() {
                            if !audioWriterInput.append(sample) {
                                audioWriterInput.markAsFinished()
                                markAudioDone()
                                return
                            }
                        } else {
                            audioWriterInput.markAsFinished()
                            markAudioDone()
                            return
                        }
                    }
                }
            }

            group.wait()

            if isCancelled() {
                cancelCleanup()
                return
            }

            if reader.status == .failed {
                fail(
                    code: EchoVideoPrepareErrorCodes.decodeFailed,
                    message: reader.error?.localizedDescription ?? "Reader failed"
                )
                return
            }
            if writer.status == .failed {
                fail(
                    code: EchoVideoPrepareErrorCodes.encodeFailed,
                    message: writer.error?.localizedDescription ?? "Writer failed"
                )
                return
            }

            let finishGroup = DispatchGroup()
            finishGroup.enter()
            writer.finishWriting { [weak self] in
                defer { finishGroup.leave() }
                guard let self else { return }
                if self.isCancelled() {
                    self.cancelCleanup()
                    return
                }
                if writer.status != .completed {
                    self.fail(
                        code: EchoVideoPrepareErrorCodes.encodeFailed,
                        message: writer.error?.localizedDescription ?? "Writer did not complete"
                    )
                    return
                }
                self.handleCompleted()
            }
            finishGroup.wait()
        } catch let err as EchoVideoPreparePaths.PathValidationError {
            fail(code: err.code, message: err.message)
        } catch {
            fail(
                code: EchoVideoPrepareErrorCodes.encodeFailed,
                message: error.localizedDescription
            )
        }
    }

    private func buildVideoComposition(
        asset: AVAsset,
        videoTrack: AVAssetTrack,
        preferredTransform: CGAffineTransform,
        naturalSize: CGSize,
        renderWidth: Int,
        renderHeight: Int,
        fps: Int
    ) throws -> AVMutableVideoComposition {
        let composition = AVMutableVideoComposition()
        composition.renderSize = CGSize(width: renderWidth, height: renderHeight)
        composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(1, fps)))

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)

        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        let transform = uprightScaledTransform(
            naturalSize: naturalSize,
            preferredTransform: preferredTransform,
            renderWidth: renderWidth,
            renderHeight: renderHeight
        )
        layer.setTransform(transform, at: .zero)
        instruction.layerInstructions = [layer]
        composition.instructions = [instruction]
        return composition
    }

    /// Map coded pixels + preferredTransform into upright display pixels at render size.
    private func uprightScaledTransform(
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderWidth: Int,
        renderHeight: Int
    ) -> CGAffineTransform {
        let rect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
        let displayW = abs(rect.width)
        let displayH = abs(rect.height)
        guard displayW > 0, displayH > 0 else {
            return preferredTransform
        }

        var t = preferredTransform
        t = t.concatenating(
            CGAffineTransform(translationX: -rect.origin.x, y: -rect.origin.y)
        )
        let sx = CGFloat(renderWidth) / displayW
        let sy = CGFloat(renderHeight) / displayH
        t = t.concatenating(CGAffineTransform(scaleX: sx, y: sy))
        return t
    }

    private func emitProgressFromSample(_ sample: CMSampleBuffer) {
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        let seconds = CMTimeGetSeconds(pts)
        guard seconds.isFinite, totalDurationSeconds > 0 else {
            emitProgress(nil)
            return
        }
        let raw = max(0, min(1, seconds / totalDurationSeconds))
        emitProgress(raw)
    }

    private func emitProgress(_ progress01: Double?) {
        let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
        if let progress01 {
            if progress01 + 0.0001 < lastEmittedProgress {
                return
            }
            if lastEmittedProgress >= 0,
               nowMs - lastProgressEmitMs < Self.progressIntervalMs,
               progress01 < 0.999
            {
                return
            }
            lastEmittedProgress = progress01
            lastProgressEmitMs = nowMs
        } else if nowMs - lastProgressEmitMs < Self.progressIntervalMs {
            return
        } else {
            lastProgressEmitMs = nowMs
        }

        callbackQueue.async { [weak self] in
            self?.listener?.onProgress(progress01)
        }
    }

    private func handleCompleted() {
        do {
            let output = try validateAndPromote()
            guard markTerminal() else { return }
            NSLog(
                "%@ completion id=%@ size=%lld %dx%d durationMs=%lld",
                Self.logTag,
                request.jobId,
                output.sizeBytes,
                output.width,
                output.height,
                output.durationMs
            )
            callbackQueue.async { [weak self] in
                self?.listener?.onCompleted(output)
            }
        } catch let err as EchoVideoPreparePaths.PathValidationError {
            EchoVideoPreparePaths.deleteQuietly(request.temporaryFile)
            fail(code: err.code, message: err.message)
        } catch {
            EchoVideoPreparePaths.deleteQuietly(request.temporaryFile)
            fail(
                code: EchoVideoPrepareErrorCodes.outputInvalid,
                message: error.localizedDescription
            )
        }
    }

    private func validateAndPromote() throws -> OutputInfo {
        let tmp = request.temporaryFile
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: tmp.path, isDirectory: &isDir),
              !isDir.boolValue
        else {
            throw EchoVideoPreparePaths.PathValidationError(
                code: EchoVideoPrepareErrorCodes.outputInvalid,
                message: "temporary output missing"
            )
        }
        let tmpAttrs = try FileManager.default.attributesOfItem(atPath: tmp.path)
        let tmpSize = (tmpAttrs[.size] as? NSNumber)?.int64Value ?? 0
        if tmpSize <= 0 {
            EchoVideoPreparePaths.deleteQuietly(tmp)
            throw EchoVideoPreparePaths.PathValidationError(
                code: EchoVideoPrepareErrorCodes.outputInvalid,
                message: "temporary output is empty"
            )
        }

        let meta = try readOutputMeta(url: tmp)
        if meta.width <= 0 || meta.height <= 0 {
            EchoVideoPreparePaths.deleteQuietly(tmp)
            throw EchoVideoPreparePaths.PathValidationError(
                code: EchoVideoPrepareErrorCodes.outputInvalid,
                message: "output missing video dimensions"
            )
        }
        if meta.durationMs <= 0 {
            EchoVideoPreparePaths.deleteQuietly(tmp)
            throw EchoVideoPreparePaths.PathValidationError(
                code: EchoVideoPrepareErrorCodes.outputInvalid,
                message: "output missing duration"
            )
        }

        let dest = request.destinationFile
        EchoVideoPreparePaths.deleteQuietly(dest)
        do {
            try FileManager.default.moveItem(at: tmp, to: dest)
        } catch {
            do {
                try FileManager.default.copyItem(at: tmp, to: dest)
                EchoVideoPreparePaths.deleteQuietly(tmp)
            } catch {
                EchoVideoPreparePaths.deleteQuietly(tmp)
                EchoVideoPreparePaths.deleteQuietly(dest)
                throw EchoVideoPreparePaths.PathValidationError(
                    code: EchoVideoPrepareErrorCodes.storageFailed,
                    message: "Cannot promote temporary output"
                )
            }
        }

        let destAttrs = try FileManager.default.attributesOfItem(atPath: dest.path)
        let destSize = (destAttrs[.size] as? NSNumber)?.int64Value ?? 0
        if destSize <= 0 {
            EchoVideoPreparePaths.deleteQuietly(dest)
            throw EchoVideoPreparePaths.PathValidationError(
                code: EchoVideoPrepareErrorCodes.outputInvalid,
                message: "final output invalid after promote"
            )
        }

        return OutputInfo(
            outputPath: request.relativeDestinationPath,
            sizeBytes: destSize,
            width: meta.width,
            height: meta.height,
            durationMs: meta.durationMs,
            mimeType: "video/mp4"
        )
    }

    private struct OutputMeta {
        let width: Int
        let height: Int
        let durationMs: Int64
    }

    private func readOutputMeta(url: URL) throws -> OutputMeta {
        let asset = AVURLAsset(url: url)
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        let durationMs = durationSeconds.isFinite && durationSeconds > 0
            ? Int64((durationSeconds * 1000).rounded())
            : 0
        guard let track = asset.tracks(withMediaType: .video).first else {
            return OutputMeta(width: 0, height: 0, durationMs: durationMs)
        }
        let display = EchoVideoPreparePreflight.displaySize(
            naturalSize: track.naturalSize,
            preferredTransform: track.preferredTransform
        )
        return OutputMeta(width: display.width, height: display.height, durationMs: durationMs)
    }

    private func cancelCleanup() {
        guard markTerminal() else { return }
        EchoVideoPreparePaths.deleteQuietly(request.temporaryFile)
        NSLog("%@ cancel id=%@", Self.logTag, request.jobId)
        emitCancelled()
    }

    private func fail(code: String, message: String) {
        if isCancelled() {
            cancelCleanup()
            return
        }
        guard markTerminal() else { return }
        EchoVideoPreparePaths.deleteQuietly(request.temporaryFile)
        NSLog("%@ failure id=%@ code=%@", Self.logTag, request.jobId, code)
        callbackQueue.async { [weak self] in
            self?.listener?.onFailed(code: code, message: message)
        }
    }

    private func emitCancelled() {
        callbackQueue.async { [weak self] in
            self?.listener?.onCancelled()
        }
    }

    private func markTerminal() -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        if terminal { return false }
        terminal = true
        return true
    }
}
