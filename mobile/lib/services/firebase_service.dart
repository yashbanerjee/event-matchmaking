import 'dart:io';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/app_config.dart';
import '../core/network/api_client.dart';

/// Handles Firebase Analytics + FCM. Safe no-op when Firebase is not configured.
class FirebaseService {
  FirebaseService();

  bool _ready = false;
  FirebaseAnalytics? _analytics;
  FirebaseMessaging? _messaging;

  bool get isReady => _ready;

  Future<void> init() async {
    if (!AppConfig.enableFirebase) return;
    try {
      await Firebase.initializeApp();
      _analytics = FirebaseAnalytics.instance;
      _messaging = FirebaseMessaging.instance;
      await _messaging!.setAutoInitEnabled(true);

      final settings = await _messaging!.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      debugPrint('FCM permission: ${settings.authorizationStatus}');

      FirebaseMessaging.onMessage.listen((message) {
        debugPrint('FCM foreground: ${message.notification?.title}');
      });

      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        debugPrint('FCM opened: ${message.data}');
      });

      _ready = true;
      await logEvent('app_open');
    } catch (e, st) {
      // Missing google-services / GoogleService-Info is expected until prod keys
      // are added. The rest of the app still runs.
      debugPrint('Firebase init skipped: $e');
      debugPrint('$st');
      _ready = false;
    }
  }

  Future<void> logEvent(
    String name, {
    Map<String, Object>? parameters,
  }) async {
    if (!_ready || _analytics == null) return;
    try {
      await _analytics!.logEvent(name: name, parameters: parameters);
    } catch (_) {}
  }

  Future<void> setUserId(String? userId) async {
    if (!_ready || _analytics == null) return;
    try {
      await _analytics!.setUserId(id: userId);
    } catch (_) {}
  }

  Future<String?> getFcmToken() async {
    if (!_ready || _messaging == null) return null;
    try {
      return await _messaging!.getToken();
    } catch (_) {
      return null;
    }
  }

  /// Registers the device token with the API (web-push compatible store).
  Future<void> registerPushToken(ApiClient api) async {
    final token = await getFcmToken();
    if (token == null || token.isEmpty) return;
    final platform = Platform.isIOS ? 'ios' : 'android';
    try {
      await api.post(
        '/users/me/push-subscriptions',
        body: {
          'endpoint': 'fcm:$platform:$token',
          'keys': {'p256dh': platform, 'auth': 'fcm'},
          'userAgent': 'ethara-mobile/$platform',
        },
      );
      await logEvent('push_token_registered', parameters: {'platform': platform});
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  debugPrint('FCM background: ${message.messageId}');
}

final firebaseServiceProvider = Provider<FirebaseService>((ref) {
  return FirebaseService();
});
