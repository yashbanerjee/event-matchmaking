import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/forms/forms_screen.dart';
import '../features/home/home_screen.dart';
import '../features/meetings/meetings_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/qr/qr_hub_screen.dart';
import '../features/qr/qr_scan_screen.dart';
import '../features/recommendations/discover_screen.dart';
import '../features/requests/requests_screen.dart';
import '../features/shell/app_shell.dart';

final _rootKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/home',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      if (auth.booting) return null;
      final loggingIn = state.matchedLocation == '/login';
      final loc = state.matchedLocation;
      if (!auth.isAuthenticated && !loggingIn) {
        if (loc.startsWith('/qr')) {
          return '/login?next=${Uri.encodeComponent(state.uri.toString())}';
        }
        return '/login';
      }
      if (auth.isAuthenticated && loggingIn) {
        final next = state.uri.queryParameters['next'];
        if (next != null && next.startsWith('/')) return next;
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginScreen(
          nextPath: state.uri.queryParameters['next'],
        ),
      ),
      GoRoute(
        path: '/forms',
        builder: (context, state) => const FormsScreen(),
      ),
      GoRoute(
        path: '/qr',
        builder: (context, state) => QrHubScreen(
          initialCode: state.uri.queryParameters['code'],
        ),
      ),
      GoRoute(
        path: '/qr/scan',
        builder: (context, state) {
          final extra = state.extra;
          return QrScanScreen(
            initialPayload: extra is String ? extra : null,
          );
        },
      ),
      GoRoute(
        path: '/qr/:code',
        builder: (context, state) => QrHubScreen(
          initialCode: state.pathParameters['code'],
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/discover',
                builder: (context, state) => const DiscoverScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/requests',
                builder: (context, state) => const RequestsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/meetings',
                builder: (context, state) => const MeetingsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _ref.listen(authControllerProvider, (previous, next) => notifyListeners());
  }

  final Ref _ref;
}
