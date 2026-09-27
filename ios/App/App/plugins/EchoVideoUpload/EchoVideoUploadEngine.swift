import Foundation

/// Callbacks from EchoVideoUploadEngine to the Capacitor plugin (PASS IOS2).
protocol EchoVideoUploadEngineListener: AnyObject {
    func onCreated(_ uploadUrl: String)
    func onProgress(bytesUploaded: Int64, bytesTotal: Int64, progress01: Double)
    func onCompleted(uploadUrl: String, bytesUploaded: Int64, bytesTotal: Int64)
    func onFailed(code: String, message: String)
    func onCancelled()
}

/**
 * Bunny TUS streaming upload session (PASS IOS2).
 * Streams disk bytes via URLSession + bounded FileHandle windows —
 * never loads the full video into memory.
 */
final class EchoVideoUploadEngine {
    private static let logTag = "echotoo video upload"
    private static let tusVersion = "1.0.0"

    struct RequestOptions {
        let jobId: String
        let file: URL
        let fileSize: Int64
        let tusEndpoint: String
        let authorizationSignature: String
        let authorizationExpire: String
        let videoId: String
        let libraryId: String
        let filetype: String
        let title: String
        let existingUploadUrl: String?
    }

    private let request: RequestOptions
    private weak var listener: EchoVideoUploadEngineListener?

    private let worker = DispatchQueue(label: "com.experience.app.echovideoupload.worker")
    private let session: URLSession

    private let lock = NSLock()
    private var terminal = false
    private var cancelled = false
    private var activeTask: URLSessionTask?
    private var lastProgressEmitMs: UInt64 = 0

    init(request: RequestOptions, listener: EchoVideoUploadEngineListener) {
        self.request = request
        self.listener = listener
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 600
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        // Foreground streaming only — no URLSession background upload architecture (IOS2).
        self.session = URLSession(configuration: config)
    }

    func start() {
        worker.async { [weak self] in
            self?.runUpload()
        }
    }

    func cancel() {
        lock.lock()
        cancelled = true
        let task = activeTask
        activeTask = nil
        let shouldEmit = !terminal
        if shouldEmit { terminal = true }
        lock.unlock()

        task?.cancel()
        session.invalidateAndCancel()

        if shouldEmit {
            DispatchQueue.main.async { [weak self] in
                self?.listener?.onCancelled()
            }
            logDev("cancelled")
        }
    }

    private func runUpload() {
        do {
            if isCancelled() {
                finishCancelled()
                return
            }

            var uploadUrl = request.existingUploadUrl?.trimmingCharacters(in: .whitespacesAndNewlines)
            if uploadUrl == nil || uploadUrl?.isEmpty == true {
                guard let created = try createUpload() else { return }
                uploadUrl = created
                let createdUrl = created
                DispatchQueue.main.async { [weak self] in
                    guard let self, !self.isTerminal() else { return }
                    self.listener?.onCreated(createdUrl)
                }
                logDev("create-ok")
            } else {
                logDev("resume-url")
            }

            guard let uploadUrl else { return }

            var offset = try headOffset(uploadUrl)
            if isCancelled() {
                finishCancelled()
                return
            }
            if offset < 0 || offset > request.fileSize {
                fail(EchoVideoUploadErrorCodes.tusOffsetInvalid, "Upload-Offset out of range")
                return
            }
            logDev("resume-offset=\(offset)")

            emitProgress(uploaded: offset, total: request.fileSize, force: true)

            while offset < request.fileSize {
                if isCancelled() {
                    finishCancelled()
                    return
                }
                let chunkLen = EchoVideoUploadRetry.clampChunkLength(
                    offset: offset,
                    fileSize: request.fileSize,
                    chunkSize: EchoVideoUploadRetry.defaultChunkBytes
                )
                if chunkLen <= 0 { break }

                let nextOffset = try patchChunkWithRetries(
                    uploadUrl: uploadUrl,
                    offset: offset,
                    chunkLen: chunkLen
                )
                if nextOffset < 0 { return }
                if nextOffset < offset {
                    fail(
                        EchoVideoUploadErrorCodes.tusOffsetInvalid,
                        "Server offset moved backwards"
                    )
                    return
                }
                offset = nextOffset
                emitProgress(uploaded: offset, total: request.fileSize, force: false)
            }

            if isCancelled() {
                finishCancelled()
                return
            }

            lock.lock()
            let already = terminal
            if !already { terminal = true }
            lock.unlock()
            if already { return }

            let doneUrl = uploadUrl
            let total = request.fileSize
            DispatchQueue.main.async { [weak self] in
                self?.listener?.onCompleted(
                    uploadUrl: doneUrl,
                    bytesUploaded: total,
                    bytesTotal: total
                )
            }
            logDev("completed bytes=\(total)")
            session.finishTasksAndInvalidate()
        } catch let err as EchoVideoUploadPaths.PathValidationError {
            fail(err.code, err.message)
        } catch {
            if isCancelled() {
                finishCancelled()
            } else {
                fail(EchoVideoUploadErrorCodes.networkFailed, safeMessage(error))
            }
        }
    }

    private func createUpload() throws -> String? {
        let metadata = EchoVideoUploadTusMetadata.buildUploadMetadata(
            filetype: request.filetype,
            title: request.title
        )
        guard let url = URL(string: request.tusEndpoint) else {
            fail(EchoVideoUploadErrorCodes.invalidOptions, "tusEndpoint invalid")
            return nil
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Self.tusVersion, forHTTPHeaderField: "Tus-Resumable")
        req.setValue(String(request.fileSize), forHTTPHeaderField: "Upload-Length")
        req.setValue(metadata, forHTTPHeaderField: "Upload-Metadata")
        req.httpBody = Data()
        applyBunnyHeaders(&req)

        let response = try executeWithRetry(req)
        guard let response else { return nil }
        let (http, _) = response
        if http.statusCode < 200 || http.statusCode >= 300 {
            let cls = EchoVideoUploadRetry.classifyHttpStatus(http.statusCode)
            fail(EchoVideoUploadRetry.errorCode(for: cls), "TUS create HTTP \(http.statusCode)")
            return nil
        }
        let location = http.value(forHTTPHeaderField: "Location")
        return try EchoVideoUploadTusMetadata.resolveUploadUrl(
            tusEndpoint: request.tusEndpoint,
            location: location
        )
    }

    private func headOffset(_ uploadUrl: String) throws -> Int64 {
        guard let url = URL(string: uploadUrl) else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusHeadFailed,
                message: "TUS HEAD URL invalid"
            )
        }
        var req = URLRequest(url: url)
        req.httpMethod = "HEAD"
        req.setValue(Self.tusVersion, forHTTPHeaderField: "Tus-Resumable")
        applyBunnyHeaders(&req)

        guard let response = try executeWithRetry(req) else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusHeadFailed,
                message: "TUS HEAD failed"
            )
        }
        let (http, _) = response
        if http.statusCode < 200 || http.statusCode >= 300 {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusHeadFailed,
                message: "TUS HEAD HTTP \(http.statusCode)"
            )
        }
        guard let offsetHeader = http.value(forHTTPHeaderField: "Upload-Offset")?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !offsetHeader.isEmpty
        else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusOffsetInvalid,
                message: "Upload-Offset missing"
            )
        }
        guard let value = Int64(offsetHeader) else {
            throw EchoVideoUploadPaths.PathValidationError(
                code: EchoVideoUploadErrorCodes.tusOffsetInvalid,
                message: "Upload-Offset not a number"
            )
        }
        return value
    }

    /// Returns confirmed server offset after PATCH, or -1 if terminal failure already reported.
    private func patchChunkWithRetries(uploadUrl: String, offset: Int64, chunkLen: Int64) throws -> Int64 {
        var attempts = 0
        while attempts < EchoVideoUploadRetry.maxAttempts() {
            if isCancelled() { return -1 }
            let delay = EchoVideoUploadRetry.delayForAttempt(attempts)
            if delay > 0 {
                Thread.sleep(forTimeInterval: Double(delay) / 1000.0)
            }
            attempts += 1

            let tempChunk = try Self.writeChunkTempFile(
                from: request.file,
                offset: offset,
                length: chunkLen
            )
            defer { try? FileManager.default.removeItem(at: tempChunk) }

            do {
                guard let url = URL(string: uploadUrl) else {
                    fail(EchoVideoUploadErrorCodes.networkFailed, "PATCH URL invalid")
                    return -1
                }
                var req = URLRequest(url: url)
                req.httpMethod = "PATCH"
                req.setValue(Self.tusVersion, forHTTPHeaderField: "Tus-Resumable")
                req.setValue(String(offset), forHTTPHeaderField: "Upload-Offset")
                req.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
                req.setValue(String(chunkLen), forHTTPHeaderField: "Content-Length")
                applyBunnyHeaders(&req)

                let (http, _) = try performUploadFromFile(req, fileURL: tempChunk)
                let code = http.statusCode
                if (200 ..< 300).contains(code) {
                    if let newOffsetHeader = http.value(forHTTPHeaderField: "Upload-Offset")?
                        .trimmingCharacters(in: .whitespacesAndNewlines),
                        !newOffsetHeader.isEmpty,
                        let confirmed = Int64(newOffsetHeader)
                    {
                        if confirmed < offset || confirmed > request.fileSize {
                            fail(
                                EchoVideoUploadErrorCodes.tusOffsetInvalid,
                                "PATCH returned invalid Upload-Offset"
                            )
                            return -1
                        }
                        return confirmed
                    }
                    return offset + chunkLen
                }

                let cls = EchoVideoUploadRetry.classifyHttpStatus(code)
                if cls == .offsetConflict {
                    logDev("offset-conflict HEAD resync")
                    do {
                        let synced = try headOffset(uploadUrl)
                        if synced >= 0 && synced <= request.fileSize {
                            return synced
                        }
                        fail(
                            EchoVideoUploadErrorCodes.tusOffsetConflict,
                            "Conflict resync invalid"
                        )
                        return -1
                    } catch let err as EchoVideoUploadPaths.PathValidationError {
                        fail(err.code, err.message)
                        return -1
                    }
                }

                if !EchoVideoUploadRetry.isRetryable(cls)
                    || attempts >= EchoVideoUploadRetry.maxAttempts()
                {
                    fail(EchoVideoUploadRetry.errorCode(for: cls), "TUS PATCH HTTP \(code)")
                    return -1
                }
                logDev("retry category=\(cls) attempt=\(attempts)")
            } catch {
                if isCancelled() { return -1 }
                if attempts >= EchoVideoUploadRetry.maxAttempts() {
                    fail(EchoVideoUploadErrorCodes.networkFailed, safeMessage(error))
                    return -1
                }
                logDev("retry network attempt=\(attempts)")
                do {
                    let synced = try headOffset(uploadUrl)
                    if synced >= offset && synced <= request.fileSize {
                        return synced
                    }
                } catch {
                    // continue retry from same offset
                }
            }
        }
        fail(EchoVideoUploadErrorCodes.networkFailed, "TUS PATCH retries exhausted")
        return -1
    }

    private func executeWithRetry(_ httpRequest: URLRequest) throws -> (HTTPURLResponse, Data)? {
        var attempts = 0
        var lastError: Error?
        while attempts < EchoVideoUploadRetry.maxAttempts() {
            if isCancelled() { return nil }
            let delay = EchoVideoUploadRetry.delayForAttempt(attempts)
            if delay > 0 {
                Thread.sleep(forTimeInterval: Double(delay) / 1000.0)
            }
            attempts += 1
            do {
                let (data, response) = try performData(httpRequest)
                guard let http = response as? HTTPURLResponse else {
                    throw URLError(.badServerResponse)
                }
                let code = http.statusCode
                if (200 ..< 300).contains(code) {
                    return (http, data)
                }
                let cls = EchoVideoUploadRetry.classifyHttpStatus(code)
                if !EchoVideoUploadRetry.isRetryable(cls)
                    || attempts >= EchoVideoUploadRetry.maxAttempts()
                {
                    fail(EchoVideoUploadRetry.errorCode(for: cls), "HTTP \(code)")
                    return nil
                }
                logDev("retry http=\(code) attempt=\(attempts)")
            } catch {
                lastError = error
                if isCancelled() { return nil }
                if attempts >= EchoVideoUploadRetry.maxAttempts() {
                    throw error
                }
                logDev("retry io attempt=\(attempts)")
            }
        }
        if let lastError { throw lastError }
        return nil
    }

    private func performData(_ request: URLRequest) throws -> (Data, URLResponse) {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<(Data, URLResponse), Error>!
        let task = session.dataTask(with: request) { data, response, error in
            if let error {
                result = .failure(error)
            } else if let data, let response {
                result = .success((data, response))
            } else {
                result = .failure(URLError(.badServerResponse))
            }
            semaphore.signal()
        }
        setActiveTask(task)
        task.resume()
        semaphore.wait()
        setActiveTask(nil)
        return try result.get()
    }

    private func performUploadFromFile(_ request: URLRequest, fileURL: URL) throws -> (HTTPURLResponse, Data) {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<(HTTPURLResponse, Data), Error>!
        let task = session.uploadTask(with: request, fromFile: fileURL) { data, response, error in
            if let error {
                result = .failure(error)
            } else if let response = response as? HTTPURLResponse {
                result = .success((response, data ?? Data()))
            } else {
                result = .failure(URLError(.badServerResponse))
            }
            semaphore.signal()
        }
        setActiveTask(task)
        task.resume()
        semaphore.wait()
        setActiveTask(nil)
        return try result.get()
    }

    /// Copy a bounded range to a temp file using a 64 KiB buffer (never whole-video Data).
    static func writeChunkTempFile(from file: URL, offset: Int64, length: Int64) throws -> URL {
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("echovideo-upload-\(UUID().uuidString).chunk")
        FileManager.default.createFile(atPath: tmp.path, contents: nil)
        let input = try FileHandle(forReadingFrom: file)
        let output = try FileHandle(forWritingTo: tmp)
        defer {
            try? input.close()
            try? output.close()
        }
        try input.seek(toOffset: UInt64(offset))
        var remaining = length
        let bufSize = EchoVideoUploadRetry.ioBufferBytes
        while remaining > 0 {
            let n = Int(min(Int64(bufSize), remaining))
            guard let data = try input.read(upToCount: n), !data.isEmpty else {
                throw NSError(
                    domain: "EchoVideoUpload",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Unexpected EOF while streaming upload"]
                )
            }
            try output.write(contentsOf: data)
            remaining -= Int64(data.count)
        }
        return tmp
    }

    private func applyBunnyHeaders(_ request: inout URLRequest) {
        request.setValue(self.request.authorizationSignature, forHTTPHeaderField: "AuthorizationSignature")
        request.setValue(self.request.authorizationExpire, forHTTPHeaderField: "AuthorizationExpire")
        request.setValue(self.request.videoId, forHTTPHeaderField: "VideoId")
        request.setValue(self.request.libraryId, forHTTPHeaderField: "LibraryId")
    }

    private func emitProgress(uploaded: Int64, total: Int64, force: Bool) {
        let now = UInt64(Date().timeIntervalSince1970 * 1000)
        if !force
            && now &- lastProgressEmitMs < EchoVideoUploadRetry.progressThrottleMs
            && uploaded < total
        {
            return
        }
        lastProgressEmitMs = now
        let p = EchoVideoUploadRetry.progress01(uploaded: uploaded, total: total)
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.isTerminal(), !self.isCancelled() else { return }
            self.listener?.onProgress(bytesUploaded: uploaded, bytesTotal: total, progress01: p)
        }
    }

    private func fail(_ code: String, _ message: String) {
        lock.lock()
        if terminal {
            lock.unlock()
            return
        }
        terminal = true
        let wasCancelled = cancelled
        lock.unlock()

        if wasCancelled {
            DispatchQueue.main.async { [weak self] in
                self?.listener?.onCancelled()
            }
            session.invalidateAndCancel()
            return
        }
        logDev("error code=\(code)")
        DispatchQueue.main.async { [weak self] in
            self?.listener?.onFailed(code: code, message: message)
        }
        session.finishTasksAndInvalidate()
    }

    private func finishCancelled() {
        lock.lock()
        let shouldEmit = !terminal
        if shouldEmit { terminal = true }
        lock.unlock()
        if shouldEmit {
            DispatchQueue.main.async { [weak self] in
                self?.listener?.onCancelled()
            }
            logDev("cancelled")
        }
        session.invalidateAndCancel()
    }

    private func setActiveTask(_ task: URLSessionTask?) {
        lock.lock()
        activeTask = task
        lock.unlock()
    }

    private func isCancelled() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }

    private func isTerminal() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return terminal
    }

    private static func safeMessage(_ error: Error) -> String {
        let msg = error.localizedDescription
        return msg.isEmpty ? "network failed" : msg
    }

    private static func logDev(_ msg: String) {
        NSLog("%@: %@", logTag, msg)
    }
}
