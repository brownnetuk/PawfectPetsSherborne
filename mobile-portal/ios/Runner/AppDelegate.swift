import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  // Channel to Dart for push: native -> Dart delivers the APNs device token
  // ("onToken"); Dart -> native asks us to request permission + register
  // ("start"). Set up defensively so nothing here can block app launch.
  private var pushChannel: FlutterMethodChannel?
  private var pendingToken: String?
  // A notification tap that arrived before the Flutter channel was ready
  // (e.g. a cold start from tapping a push) — flushed once the engine attaches.
  private var pendingTap: [String: Any]?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    UNUserNotificationCenter.current().delegate = self
    return result
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // Guarded (no force-unwrap) so a nil registrar can never crash launch.
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "PawfectPetsPush") else {
      return
    }
    let channel = FlutterMethodChannel(name: "pawfectpets/push", binaryMessenger: registrar.messenger())
    channel.setMethodCallHandler { [weak self] call, result in
      if call.method == "start" {
        self?.requestAndRegister()
        result(nil)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
    pushChannel = channel
    if let token = pendingToken {
      channel.invokeMethod("onToken", arguments: token)
      pendingToken = nil
    }
    if let tap = pendingTap {
      channel.invokeMethod("onNotificationTap", arguments: tap)
      pendingTap = nil
    }
  }

  // Extract our custom data keys (type/reference/title/body) from a
  // notification's payload, dropping the reserved "aps" dictionary.
  private func tapPayload(from userInfo: [AnyHashable: Any]) -> [String: Any] {
    var out: [String: Any] = [:]
    for (key, value) in userInfo {
      guard let k = key as? String, k != "aps" else { continue }
      out[k] = value
    }
    return out
  }

  private func requestAndRegister() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
      guard granted else { return }
      DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let token = deviceToken.map { String(format: "%02x", $0) }.joined()
    if let channel = pushChannel {
      channel.invokeMethod("onToken", arguments: token)
    } else {
      pendingToken = token
    }
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NSLog("APNs registration failed: \(error.localizedDescription)")
  }

  // Show reminders as a banner even when the app is in the foreground.
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }

  // The user tapped a notification (foreground banner or from the lock/home
  // screen, including a cold start) — forward its payload to Dart so the app
  // can route to Messages or show it in a modal.
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let payload = tapPayload(from: response.notification.request.content.userInfo)
    if let channel = pushChannel {
      channel.invokeMethod("onNotificationTap", arguments: payload)
    } else {
      pendingTap = payload
    }
    completionHandler()
  }
}
