import Foundation
import Capacitor

/**
 * Capacitor bridge for iOS AVFoundation video preparation (PASS IOS1).
 * Same JS contract/events as Android EchoVideoPrepare.
 */
@objc(EchoVideoPreparePlugin)
public class EchoVideoPreparePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EchoVideoPreparePlugin"
    public let jsName = "EchoVideoPrepare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelPreparation", returnType: CAPPluginReturnPromise),
    ]

    private static let defaultAudioBitrate = 128_000
    private static let logTag = "[echotoo video prepare][ios]"

    private let jobLock = NSLock()
    private var activeJobId: String?
    private var activeEngine: EchoVideoPrepareEngine?

    @objc func getCapabilities(_ call: CAPPluginCall) {
        call.resolve([
            "available": true,
            "implementation": "ios-avfoundation",
            "encoderImplemented": true,
        ])
    }

    @objc func prepareVideo(_ call: CAPPluginCall) {
        if let validationError = validatePrepareOptions(call) {
            reject(call, code: EchoVideoPrepareErrorCodes.invalidOptions, message: validationError)
            return
        }

        guard let jobId = call.getString("jobId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !jobId.isEmpty
        else {
            reject(call, code: EchoVideoPrepareErrorCodes.invalidOptions, message: "jobId is required")
            return
        }

        jobLock.lock()
        if activeJobId != nil {
            let existing = activeJobId ?? ""
            jobLock.unlock()
            reject(
                call,
                code: EchoVideoPrepareErrorCodes.jobConflict,
                message: "A preparation job is already active: \(existing)"
            )
            return
        }
        activeJobId = jobId
        jobLock.unlock()

        do {
            let paths = try EchoVideoPreparePaths.resolveAndValidate(
                sourcePath: call.getString("sourcePath"),
                destinationPath: call.getString("destinationPath"),
                temporaryPath: call.getString("temporaryPath")
            )

            let preflight = EchoVideoPreparePreflight.check(sourceFile: paths.sourceFile)
            if !preflight.ok {
                clearActiveIf(jobId)
                reject(
                    call,
                    code: preflight.code ?? EchoVideoPrepareErrorCodes.encodeFailed,
                    message: preflight.message ?? "preflight failed"
                )
                return
            }

            let targetLongEdge = call.getInt("targetLongEdge") ?? 0
            let targetVideoBitrate = call.getInt("targetVideoBitrate") ?? 0
            let targetFps = call.getInt("targetFps") ?? 30
            let audioBitrateOpt = call.getInt("audioBitrate") ?? 0
            let audioBitrate = audioBitrateOpt > 0 ? audioBitrateOpt : Self.defaultAudioBitrate

            let request = EchoVideoPrepareEngine.Request(
                jobId: jobId,
                sourceFile: paths.sourceFile,
                temporaryFile: paths.temporaryFile,
                destinationFile: paths.destinationFile,
                relativeDestinationPath: paths.relativeDestinationPath,
                targetShortEdge: targetLongEdge,
                targetVideoBitrate: targetVideoBitrate,
                targetFps: targetFps,
                audioBitrate: audioBitrate
            )

            let engine = EchoVideoPrepareEngine(
                request: request,
                listener: PluginEngineListener(plugin: self, jobId: jobId)
            )

            jobLock.lock()
            activeEngine = engine
            jobLock.unlock()

            call.resolve([
                "jobId": jobId,
                "accepted": true,
            ])

            engine.start()
        } catch let err as EchoVideoPreparePaths.PathValidationError {
            clearActiveIf(jobId)
            reject(call, code: err.code, message: err.message)
        } catch {
            clearActiveIf(jobId)
            reject(
                call,
                code: EchoVideoPrepareErrorCodes.encodeFailed,
                message: error.localizedDescription
            )
        }
    }

    @objc func cancelPreparation(_ call: CAPPluginCall) {
        guard let jobId = call.getString("jobId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !jobId.isEmpty
        else {
            reject(call, code: EchoVideoPrepareErrorCodes.invalidOptions, message: "jobId is required")
            return
        }

        jobLock.lock()
        let engine: EchoVideoPrepareEngine?
        if activeJobId == jobId {
            engine = activeEngine
        } else {
            engine = nil
        }
        jobLock.unlock()

        guard let engine else {
            call.resolve(["cancelled": false])
            return
        }

        NSLog("%@ cancel request id=%@", Self.logTag, jobId)
        engine.cancel()
        call.resolve(["cancelled": true])
    }

    fileprivate func releaseActiveJob(_ jobId: String) {
        jobLock.lock()
        if activeJobId == jobId {
            activeJobId = nil
            activeEngine = nil
        }
        jobLock.unlock()
    }

    private func clearActiveIf(_ jobId: String) {
        releaseActiveJob(jobId)
    }

    private func validatePrepareOptions(_ call: CAPPluginCall) -> String? {
        let jobId = call.getString("jobId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if jobId.isEmpty { return "jobId is required" }
        let sourcePath = call.getString("sourcePath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if sourcePath.isEmpty { return "sourcePath is required" }
        let destinationPath =
            call.getString("destinationPath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if destinationPath.isEmpty { return "destinationPath is required" }
        let temporaryPath =
            call.getString("temporaryPath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if temporaryPath.isEmpty { return "temporaryPath is required" }
        let targetLongEdge = call.getInt("targetLongEdge") ?? 0
        if targetLongEdge <= 0 { return "targetLongEdge must be > 0" }
        let targetVideoBitrate = call.getInt("targetVideoBitrate") ?? 0
        if targetVideoBitrate <= 0 { return "targetVideoBitrate must be > 0" }
        let targetFps = call.getInt("targetFps") ?? 0
        if targetFps <= 0 { return "targetFps must be > 0" }
        return nil
    }

    private func reject(_ call: CAPPluginCall, code: String, message: String) {
        call.reject(message, code, nil, [
            "code": code,
            "message": message,
        ])
    }

    private final class PluginEngineListener: EchoVideoPrepareEngine.Listener {
        private weak var plugin: EchoVideoPreparePlugin?
        private let jobId: String

        init(plugin: EchoVideoPreparePlugin, jobId: String) {
            self.plugin = plugin
            self.jobId = jobId
        }

        func onProgress(_ progress01: Double?) {
            var event: [String: Any] = ["jobId": jobId]
            if let progress01 {
                event["progress"] = progress01
            } else {
                event["progress"] = NSNull()
            }
            plugin?.notifyListeners("prepareProgress", data: event)
        }

        func onCompleted(_ output: EchoVideoPrepareEngine.OutputInfo) {
            plugin?.releaseActiveJob(jobId)
            plugin?.notifyListeners("prepareCompleted", data: [
                "jobId": jobId,
                "outputPath": output.outputPath,
                "sizeBytes": output.sizeBytes,
                "width": output.width,
                "height": output.height,
                "durationMs": output.durationMs,
                "mimeType": output.mimeType,
            ])
        }

        func onFailed(code: String, message: String) {
            plugin?.releaseActiveJob(jobId)
            plugin?.notifyListeners("prepareFailed", data: [
                "jobId": jobId,
                "code": code,
                "message": message,
            ])
        }

        func onCancelled() {
            plugin?.releaseActiveJob(jobId)
            plugin?.notifyListeners("prepareCancelled", data: [
                "jobId": jobId,
            ])
        }
    }
}
