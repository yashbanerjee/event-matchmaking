import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';

/// Listens for `ethara://qr/...` and https `/qr/...` links.
class DeepLinkListener extends ConsumerStatefulWidget {
  const DeepLinkListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<DeepLinkListener> createState() => _DeepLinkListenerState();
}

class _DeepLinkListenerState extends ConsumerState<DeepLinkListener> {
  StreamSubscription<Uri>? _sub;

  @override
  void initState() {
    super.initState();
    final appLinks = AppLinks();
    _sub = appLinks.uriLinkStream.listen(_handle);
    appLinks.getInitialLink().then((uri) {
      if (uri != null) _handle(uri);
    }).catchError((_) {});
  }

  void _handle(Uri uri) {
    final router = ref.read(routerProvider);
    String? code;
    if (uri.scheme == 'ethara' && uri.host == 'qr') {
      code = uri.pathSegments.isNotEmpty ? uri.pathSegments.first : null;
    } else {
      final parts = uri.pathSegments;
      final idx = parts.indexWhere((p) => p.toLowerCase() == 'qr');
      if (idx >= 0 && idx + 1 < parts.length) {
        code = parts[idx + 1];
      }
    }
    if (code == null || code.isEmpty) return;
    router.go('/qr/${Uri.encodeComponent(code)}');
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
