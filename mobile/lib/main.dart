import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/deep_link_listener.dart';
import 'app/router.dart';
import 'core/config/app_config.dart';
import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'services/firebase_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  final firebase = FirebaseService();
  if (AppConfig.enableFirebase) {
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await firebase.init();
  }

  runApp(
    ProviderScope(
      overrides: [
        firebaseServiceProvider.overrideWithValue(firebase),
      ],
      child: const EtharaApp(),
    ),
  );
}

class EtharaApp extends ConsumerWidget {
  const EtharaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final booting = ref.watch(authControllerProvider).booting;

    return DeepLinkListener(
      child: MaterialApp.router(
        title: '${AppConfig.appName} ${AppConfig.productName}',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        routerConfig: router,
        builder: (context, child) {
          if (booting) {
            return Scaffold(
              body: Container(
                alignment: Alignment.center,
                decoration: const BoxDecoration(gradient: AppColors.heroGradient),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        gradient: AppColors.accentGradient,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: const Icon(
                        Icons.auto_awesome_rounded,
                        color: AppColors.ink,
                        size: 34,
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Ethara',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: AppColors.accent,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }
          return child ?? const SizedBox.shrink();
        },
      ),
    );
  }
}
