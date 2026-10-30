import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ethara_scaffold.dart';
import '../../core/widgets/gradient_button.dart';
import '../../services/firebase_service.dart';
import '../../services/matchmaking_repository.dart';
import '../../services/qr_repository.dart';
import '../meetings/schedule_picker_sheet.dart';
import '../recommendations/profile_sheet.dart';
import '../requests/requests_screen.dart';

class QrScanScreen extends ConsumerStatefulWidget {
  const QrScanScreen({super.key, this.initialPayload});

  final String? initialPayload;

  @override
  ConsumerState<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends ConsumerState<QrScanScreen> {
  final _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
  );
  bool _handling = false;
  String? _error;
  QrResolveResult? _result;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialPayload;
    if (initial != null && initial.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _resolve(url: initial);
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _resolve({String? code, String? url}) async {
    if (_handling) return;
    setState(() {
      _handling = true;
      _error = null;
    });
    try {
      await _controller.stop();
      final result = await ref
          .read(qrRepositoryProvider)
          .resolve(code: code, url: url);
      await ref.read(firebaseServiceProvider).logEvent(
            'qr_scan',
            parameters: {'relationship': result.relationship},
          );
      if (!mounted) return;
      setState(() {
        _result = result;
        _handling = false;
      });
      if (result.profile != null &&
          result.relationship != 'SELF' &&
          result.relationship != 'INVALID') {
        await showRecommendationProfileSheet(
          context,
          organizationId: result.profile!.organizationId,
          counterpartName: result.profile!.name,
          onRequestMeeting: result.canBook
              ? () => _book(result)
              : null,
        );
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _handling = false;
      });
      await _controller.start();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _handling = false;
      });
      await _controller.start();
    }
  }

  Future<void> _book(QrResolveResult result) async {
    if (result.fromOrgId == null || result.toOrgId == null) return;
    await ref.read(firebaseServiceProvider).logEvent(
          'qr_book_started',
          parameters: {'code': result.code},
        );
    if (!mounted) return;
    final picked = await showSchedulePickerSheet(
      context,
      title: 'Request meeting · ${result.profile?.name ?? 'Partner'}',
      fromOrgId: result.fromOrgId,
      toOrgId: result.toOrgId,
      counterpartName: result.profile?.name,
    );
    if (picked == null || !mounted) return;
    try {
      await ref.read(matchmakingRepositoryProvider).createRequest(
            fromOrgId: result.fromOrgId!,
            toOrgId: result.toOrgId!,
            startsAt: picked.startsAt.toUtc().toIso8601String(),
            placeId: picked.placeId,
          );
      ref.invalidate(requestsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Meeting request sent')),
        );
        context.go('/requests');
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    }
  }

  Future<void> _pickGallery() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (file == null) return;
    final capture = await _controller.analyzeImage(file.path);
    final value = capture?.barcodes.firstOrNull?.rawValue;
    if (value == null || value.isEmpty) {
      setState(() => _error = 'No QR code found in that image.');
      return;
    }
    await _resolve(url: value);
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;

    return EtharaScaffold(
      title: 'Scan QR',
      body: ListView(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: AspectRatio(
              aspectRatio: 3 / 4,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  MobileScanner(
                    controller: _controller,
                    onDetect: (capture) {
                      final value = capture.barcodes.firstOrNull?.rawValue;
                      if (value == null || value.isEmpty) return;
                      _resolve(url: value);
                    },
                  ),
                  if (_handling)
                    Container(
                      color: Colors.black45,
                      alignment: Alignment.center,
                      child: const CircularProgressIndicator(
                        color: AppColors.accent,
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: _handling ? null : _pickGallery,
            icon: const Icon(Icons.photo_library_outlined),
            label: const Text('Upload from gallery'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ],
          if (result != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    result.profile?.name ?? 'QR result',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    result.message ?? result.relationship,
                    style: const TextStyle(color: AppColors.muted),
                  ),
                  if (result.meeting != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      DateFormat('EEE, MMM d · HH:mm').format(
                        DateTime.parse(result.meeting!['startsAt'] as String)
                            .toLocal(),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (result.profile != null &&
                          result.relationship != 'SELF')
                        OutlinedButton(
                          onPressed: () {
                            showRecommendationProfileSheet(
                              context,
                              organizationId: result.profile!.organizationId,
                              counterpartName: result.profile!.name,
                              onRequestMeeting:
                                  result.canBook ? () => _book(result) : null,
                            );
                          },
                          child: const Text('View profile'),
                        ),
                      if (result.canBook)
                        FilledButton(
                          onPressed: () => _book(result),
                          child: const Text('Book meeting'),
                        ),
                      if (result.relationship == 'OPEN_REQUEST')
                        FilledButton(
                          onPressed: () => context.go('/requests'),
                          child: const Text('Open requests'),
                        ),
                      if (result.relationship == 'SCHEDULED')
                        FilledButton(
                          onPressed: () => context.go('/meetings'),
                          child: const Text('Open meetings'),
                        ),
                      TextButton(
                        onPressed: () async {
                          setState(() => _result = null);
                          await _controller.start();
                        },
                        child: const Text('Scan again'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          GradientButton(
            label: 'My QR',
            icon: Icons.qr_code_2_rounded,
            onPressed: () => context.go('/qr'),
          ),
        ],
      ),
    );
  }
}
