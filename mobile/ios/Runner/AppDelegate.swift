import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  // Method channel to the Dart side for push. Native -> Dart delivers the
  // APNs device token ("onToken"); Dart -> native asks us to request
  // permission and register ("start").
  private var pushChannel: FlutterMethodChannel?
  private var pendingToken: String?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let messenger = engineBridge.pluginRegistry
      .registrar(forPlugin: "PawfectPetsPush")!
      .messenger()
    let channel = FlutterMethodChannel(name: "pawfectpets/push", binaryMessenger: messenger)
    channel.setMethodCallHandler { [weak self] call, result in
      if call.method == "start" {
        self?.requestAndRegister()
        result(nil)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
    pushChannel = channel
    // If the token arrived before the channel existed, deliver it now.
    if let token = pendingToken {
      channel.invokeMethod("onToken", arguments: token)
      pendingToken = nil
    }
  }

  // Ask for notification permission, then register with APNs on grant.
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
}
