import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gal/gal.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ethara_scaffold.dart';
import '../../core/widgets/gradient_button.dart';
import '../../services/firebase_service.dart';
import '../../services/qr_repository.dart';

final myQrProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(qrRepositoryProvider).myQr();
});

class QrHubScreen extends ConsumerStatefulWidget {
  const QrHubScreen({super.key, this.initialCode});

  final String? initialCode;

  @override
  ConsumerState<QrHubScreen> createState() => _QrHubScreenState();
}

class _QrHubScreenState extends ConsumerState<QrHubScreen> {
  final _qrKey = GlobalKey();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(firebaseServiceProvider).logEvent('qr_view');
      final code = widget.initialCode;
      if (code != null && code.isNotEmpty) {
        context.push('/qr/scan', extra: code);
      }
    });
  }

  Future<File?> _exportQrPng(String code) async {
    final boundary =
        _qrKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return null;
    final image = await boundary.toImage(pixelRatio: 3);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return null;
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/ethara-qr-$code.png');
    await file.writeAsBytes(bytes.buffer.asUint8List());
    return file;
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myQrProvider);

    return EtharaScaffold(
      title: 'QR exchange',
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (qr) {
          return ListView(
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: AppColors.heroGradient,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Column(
                  children: [
                    const Text(
                      'Your meeting QR',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Save to gallery or share. Partners scan to book with you.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.72),
                      ),
                    ),
                    const SizedBox(height: 18),
                    RepaintBoundary(
                      key: _qrKey,
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Column(
                          children: [
                            QrImageView(
                              data: qr.deepLink,
                              size: 220,
                              backgroundColor: Colors.white,
                              eyeStyle: const QrEyeStyle(
                                eyeShape: QrEyeShape.square,
                                color: AppColors.ink,
                              ),
                              dataModuleStyle: const QrDataModuleStyle(
                                dataModuleShape: QrDataModuleShape.square,
                                color: AppColors.ink,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'ETHARA · ${qr.code}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.2,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              qr.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GradientButton(
                label: _busy ? 'Working…' : 'Save to gallery',
                icon: Icons.download_rounded,
                loading: _busy,
                onPressed: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        try {
                          final file = await _exportQrPng(qr.code);
                          if (file == null) throw Exception('Could not render QR');
                          await Gal.putImage(file.path, album: 'Ethara');
                          await ref.read(firebaseServiceProvider).logEvent(
                                'qr_share',
                                parameters: {'method': 'gallery'},
                              );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Saved to gallery')),
                            );
                          }
                        } on ApiException catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(e.message)),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('$e')),
                            );
                          }
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        try {
                          final file = await _exportQrPng(qr.code);
                          await ref.read(firebaseServiceProvider).logEvent(
                                'qr_share',
                                parameters: {'method': 'share'},
                              );
                          await SharePlus.instance.share(
                            ShareParams(
                              text: 'Meet me on Ethara: ${qr.deepLink}',
                              subject: '${qr.name} · Ethara QR',
                              files: file == null ? null : [XFile(file.path)],
                            ),
                          );
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
                icon: const Icon(Icons.ios_share_rounded),
                label: const Text('Share QR'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => context.push('/qr/scan'),
                icon: const Icon(Icons.qr_code_scanner_rounded),
                label: const Text('Scan or upload QR'),
              ),
            ],
          );
        },
      ),
    );
  }
}
