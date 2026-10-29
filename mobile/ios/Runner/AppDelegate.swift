import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  // Channel to Dart for push: native -> Dart delivers the APNs device token
  // ("onToken") and taps on a notification ("onNotificationTap", with the
  // push's data: feed id, type and the link to what it's about); Dart ->
  // native asks us to request permission + register ("start"), set the app
  // icon badge ("setBadge"), and hands over a tap that launched the app
  // before Dart was listening ("takeLaunchTap"). Set up defensively so
  // nothing here can block app launch.
  private var pushChannel: FlutterMethodChannel?
  private var pendingToken: String?
  private var pendingTap: [String: String]?

  // The custom keys the backend puts in the push payload, as strings.
  private func tapPayload(from userInfo: [AnyHashable: Any]) -> [String: String] {
    var out: [String: String] = [:]
    for key in ["notificationId", "type", "linkKind", "linkId"] {
      if let value = userInfo[key] { out[key] = "\(value)" }
    }
    return out
  }

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
      switch call.method {
      case "start":
        self?.requestAndRegister()
        result(nil)
      case "setBadge":
        self?.setBadge((call.arguments as? Int) ?? 0)
        result(nil)
      case "takeLaunchTap":
        result(self?.pendingTap)
        self?.pendingTap = nil
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    pushChannel = channel
    if let token = pendingToken {
      channel.invokeMethod("onToken", arguments: token)
      pendingToken = nil
    }
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

  // The red count on the app icon (0 clears it), mirroring the unread
  // notifications count Dart reads from the server.
  private func setBadge(_ count: Int) {
    DispatchQueue.main.async {
      if #available(iOS 16.0, *) {
        UNUserNotificationCenter.current().setBadgeCount(count) { _ in }
      } else {
        UIApplication.shared.applicationIconBadgeNumber = count
      }
    }
  }

  // Show reminders as a banner even when the app is in the foreground, and
  // apply the badge the push carries (the unread count).
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound, .badge])
  }

  // Staff tapped a notification: tell Dart which feed item it was (so it's
  // marked read, clearing/decrementing the badge) and what it links to (so
  // the right screen opens). If Dart isn't listening yet (cold launch), keep
  // it for "takeLaunchTap".
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let payload = tapPayload(from: response.notification.request.content.userInfo)
    pendingTap = payload
    if let channel = pushChannel {
      channel.invokeMethod("onNotificationTap", arguments: payload) { [weak self] result in
        let handled = !(result is FlutterError) && (result as? NSObject) !== FlutterMethodNotImplemented
        if handled { self?.pendingTap = nil }
      }
    }
    completionHandler()
  }
}
