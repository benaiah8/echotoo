import Foundation
import Capacitor

/**
 * Capacitor bridge for iOS native Bunny TUS streaming upload (PASS IOS2).
 * Same JS contract/events as Android EchoVideoUpload.
 * Does not call bunny-upload-init / Supabase — JS owns auth init + Publish wiring.
 */
@objc(EchoVideoUploadPlugin)
public class EchoVideoUploadPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EchoVideoUploadPlugin"
    public let jsName = "EchoVideoUpload"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startVideoUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelVideoUpload", returnType: CAPPluginReturnPromise),
    ]

    private let jobLock = NSLock()
    private var activeJobId: String?
    private var activeEngine: EchoVideoUploadEngine?

    @objc func getCapabilities(_ call: CAPPluginCall) {
        call.resolve([
            "available": true,
            "implementation": "ios-urlsession",
            "streaming": true,
        ])
    }

    @objc func startVideoUpload(_ call: CAPPluginCall) {
        if let validationError = validateStartOptions(call) {
            reject(call, code: EchoVideoUploadErrorCodes.invalidOptions, message: validationError)
            return
        }

        guard let jobId = call.getString("jobId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !jobId.isEmpty
        else {
            reject(call, code: EchoVideoUploadErrorCodes.invalidOptions, message: "jobId is required")
            return
        }

        jobLock.lock()
        if activeJobId != nil {
            let existing = activeJobId ?? ""
            jobLock.unlock()
            reject(
                call,
                code: EchoVideoUploadErrorCodes.jobConflict,
                message: "A video upload job is already active: \(existing)"
            )
            return
        }
        activeJobId = jobId
        jobLock.unlock()

        do {
            let fileSize = try readPositiveInt64(call, key: "fileSize")
            let resolved = try EchoVideoUploadPaths.resolveAndValidate(
                filePath: call.getString("filePath"),
                declaredFileSize: fileSize
            )

            guard let headers = call.getObject("headers"),
                  let metadata = call.getObject("metadata")
            else {
                clearActiveIf(jobId)
                reject(
                    call,
                    code: EchoVideoUploadErrorCodes.invalidOptions,
                    message: "headers and metadata are required"
                )
                return
            }

            var uploadUrlOpt = call.getString("uploadUrl")
            if let u = uploadUrlOpt?.trimmingCharacters(in: .whitespacesAndNewlines), u.isEmpty {
                uploadUrlOpt = nil
            }

            let authExpire = stringFromJS(headers, key: "AuthorizationExpire")
            let authSig = stringFromJS(headers, key: "AuthorizationSignature")
            let videoId = stringFromJS(headers, key: "VideoId")
            let libraryId = stringFromJS(headers, key: "LibraryId")
            let filetype = stringFromJS(metadata, key: "filetype")
            let title = stringFromJS(metadata, key: "title")

            let request = EchoVideoUploadEngine.RequestOptions(
                jobId: jobId,
                file: resolved.file,
                fileSize: fileSize,
                tusEndpoint: (call.getString("tusEndpoint") ?? "").trimmingCharacters(
                    in: .whitespacesAndNewlines
                ),
                authorizationSignature: authSig,
                authorizationExpire: authExpire,
                videoId: videoId,
                libraryId: libraryId,
                filetype: filetype,
                title: title,
                existingUploadUrl: uploadUrlOpt
            )

            let engine = EchoVideoUploadEngine(
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
        } catch let err as EchoVideoUploadPaths.PathValidationError {
            clearActiveIf(jobId)
            reject(call, code: err.code, message: err.message)
        } catch {
            clearActiveIf(jobId)
            reject(
                call,
                code: EchoVideoUploadErrorCodes.invalidOptions,
                message: error.localizedDescription
            )
        }
    }

    @objc func cancelVideoUpload(_ call: CAPPluginCall) {
        guard let jobId = call.getString("jobId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !jobId.isEmpty
        else {
            reject(call, code: EchoVideoUploadErrorCodes.invalidOptions, message: "jobId is required")
            return
        }

        jobLock.lock()
        let engine: EchoVideoUploadEngine?
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

    private func validateStartOptions(_ call: CAPPluginCall) -> String? {
        let jobId = call.getString("jobId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if jobId.isEmpty { return "jobId is required" }
        let filePath = call.getString("filePath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if filePath.isEmpty { return "filePath is required" }
        let tusEndpoint =
            call.getString("tusEndpoint")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if tusEndpoint.isEmpty { return "tusEndpoint is required" }

        guard let fileSize = call.getDouble("fileSize"), fileSize > 0, fileSize.isFinite else {
            return "fileSize must be a positive number"
        }

        guard let headers = call.getObject("headers") else { return "headers are required" }
        if stringFromJS(headers, key: "AuthorizationSignature").isEmpty {
            return "AuthorizationSignature is required"
        }
        if stringFromJS(headers, key: "AuthorizationExpire").isEmpty {
            return "AuthorizationExpire is required"
        }
        if stringFromJS(headers, key: "VideoId").isEmpty { return "VideoId is required" }
        if stringFromJS(headers, key: "LibraryId").isEmpty { return "LibraryId is required" }

        guard let metadata = call.getObject("metadata") else { return "metadata is required" }
        if stringFromJS(metadata, key: "filetype").isEmpty {
            return "metadata.filetype is required"
        }
        if stringFromJS(metadata, key: "title").isEmpty {
            return "metadata.title is required"
        }
        return nil
    }

    private func readPositiveInt64(_ call: CAPPluginCall, key: String) throws -> Int64 {
        guard let d = call.getDouble(key), d.isFinite, d > 0 else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.invalidOptions,
                message: "\(key) must be a positive number"
            )
        }
        return Int64(d)
    }

    private func stringFromJS(_ obj: JSObject, key: String) -> String {
        if let s = obj[key] as? String {
            return s.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let n = obj[key] as? NSNumber {
            return String(describing: n).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let v = obj[key] {
            return String(describing: v).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return ""
    }

    private func reject(_ call: CAPPluginCall, code: String, message: String) {
        call.reject(message, code, nil, [
            "code": code,
            "message": message,
        ])
    }

    private final class PluginEngineListener: EchoVideoUploadEngineListener {
        private weak var plugin: EchoVideoUploadPlugin?
        private let jobId: String

        init(plugin: EchoVideoUploadPlugin, jobId: String) {
            self.plugin = plugin
            self.jobId = jobId
        }

        func onCreated(_ uploadUrl: String) {
            plugin?.notifyListeners("uploadCreated", data: [
                "jobId": jobId,
                "uploadUrl": uploadUrl,
            ])
        }

        func onProgress(bytesUploaded: Int64, bytesTotal: Int64, progress01: Double) {
            plugin?.notifyListeners("uploadProgress", data: [
                "jobId": jobId,
                "bytesUploaded": bytesUploaded,
                "bytesTotal": bytesTotal,
                "progress": progress01,
            ])
        }

        func onCompleted(uploadUrl: String, bytesUploaded: Int64, bytesTotal: Int64) {
            plugin?.releaseActiveJob(jobId)
            plugin?.notifyListeners("uploadCompleted", data: [
                "jobId": jobId,
                "uploadUrl": uploadUrl,
                "bytesUploaded": bytesUploaded,
                "bytesTotal": bytesTotal,
            ])
        }

        func onFailed(code: String, message: String) {
            plugin?.releaseActiveJob(jobId)
            plugin?.notifyListeners("uploadFailed", data: [
                "jobId": jobId,
                "code": code,
                "message": message,
            ])
        }

        func onCancelled() {
            plugin?.releaseActiveJob(jobId)
            plugin?.notifyListeners("uploadCancelled", data: [
                "jobId": jobId,
            ])
        }
    }
}
