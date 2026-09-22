// Enregistre le plugin local (Capacitor 6). Dans Main.storyboard, classe du contrôleur : MainViewController.
import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TramActivityPlugin())
    }
}
