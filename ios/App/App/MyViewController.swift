import UIKit
import Capacitor

/// Registers local native Capacitor plugins (PASS IOS1 / IOS2).
class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(EchoVideoPreparePlugin())
        bridge?.registerPluginInstance(EchoVideoUploadPlugin())
    }
}
