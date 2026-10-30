import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/gradient_button.dart';
import '../../services/firebase_service.dart';
import '../../services/matchmaking_repository.dart';

Future<bool> showMeetNowSheet(
  BuildContext context, {
  required String fromOrgId,
  required String toOrgId,
  String? counterpartName,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => MeetNowSheet(
      fromOrgId: fromOrgId,
      toOrgId: toOrgId,
      counterpartName: counterpartName,
    ),
  );
  return result == true;
}

class MeetNowSheet extends ConsumerStatefulWidget {
  const MeetNowSheet({
    super.key,
    required this.fromOrgId,
    required this.toOrgId,
    this.counterpartName,
  });

  final String fromOrgId;
  final String toOrgId;
  final String? counterpartName;

  @override
  ConsumerState<MeetNowSheet> createState() => _MeetNowSheetState();
}

class _MeetNowSheetState extends ConsumerState<MeetNowSheet> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  Map<String, dynamic>? _window;
  String? _placeId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ref.read(matchmakingRepositoryProvider).nowWindow(
            fromOrgId: widget.fromOrgId,
            toOrgId: widget.toOrgId,
          );
      if (!mounted) return;
      setState(() {
        _window = data;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final places = (_window?['places'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final partiesFree = _window?['partiesFree'] as bool? ?? false;
    final startsAt = _window?['startsAt'] as String?;
    final duration = _window?['durationMinutes'];
    final confirmMins = _window?['confirmWithinMinutes'] ?? 10;

    return Container(
      margin: const EdgeInsets.only(top: 48),
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      decoration: const BoxDecoration(
        color: AppColors.stone,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.75,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Meet now${widget.counterpartName != null ? ' · ${widget.counterpartName}' : ''}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 6),
            Text(
              startsAt == null
                  ? 'Loading free tables for the next slot…'
                  : 'Slot ${DateFormat('HH:mm').format(DateTime.parse(startsAt).toLocal())} · $duration min · confirm within $confirmMins min',
              style: const TextStyle(color: AppColors.muted, fontSize: 13),
            ),
            const SizedBox(height: 14),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Text(_error!, style: const TextStyle(color: AppColors.danger))
                      : !partiesFree
                          ? Text(
                              (_window?['message'] as String?) ??
                                  'One of you is busy right now. Schedule for later instead.',
                              style: const TextStyle(color: AppColors.muted),
                            )
                          : places.isEmpty
                              ? const Text(
                                  'No free tables in this slot. Try schedule for later.',
                                  style: TextStyle(color: AppColors.muted),
                                )
                              : ListView.separated(
                                  itemCount: places.length,
                                  separatorBuilder: (context, index) =>
                                      const SizedBox(height: 8),
                                  itemBuilder: (context, index) {
                                    final place = places[index];
                                    final id = place['id'] as String;
                                    final selected = _placeId == id;
                                    return Material(
                                      color: selected
                                          ? AppColors.accentSoft
                                          : AppColors.white,
                                      borderRadius: BorderRadius.circular(16),
                                      child: InkWell(
                                        borderRadius: BorderRadius.circular(16),
                                        onTap: () =>
                                            setState(() => _placeId = id),
                                        child: Container(
                                          padding: const EdgeInsets.all(14),
                                          decoration: BoxDecoration(
                                            borderRadius:
                                                BorderRadius.circular(16),
                                            border: Border.all(
                                              color: selected
                                                  ? AppColors.accent
                                                  : AppColors.border,
                                            ),
                                          ),
                                          child: Row(
                                            children: [
                                              const Icon(
                                                Icons.place_rounded,
                                                color: AppColors.accentDeep,
                                              ),
                                              const SizedBox(width: 10),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment:
                                                      CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      place['name'] as String? ??
                                                          '',
                                                      style: const TextStyle(
                                                        fontWeight:
                                                            FontWeight.w700,
                                                      ),
                                                    ),
                                                    Text(
                                                      (place['location']
                                                              as String?) ??
                                                          'Location TBA',
                                                      style: const TextStyle(
                                                        color: AppColors.muted,
                                                        fontSize: 12,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
            ),
            const SizedBox(height: 12),
            GradientButton(
              label: 'Send meet-now request',
              icon: Icons.bolt_rounded,
              loading: _submitting,
              onPressed: _placeId == null || !partiesFree || _submitting
                  ? null
                  : () async {
                      setState(() => _submitting = true);
                      try {
                        await ref
                            .read(matchmakingRepositoryProvider)
                            .createRequest(
                              fromOrgId: widget.fromOrgId,
                              toOrgId: widget.toOrgId,
                              placeId: _placeId!,
                              mode: 'NOW',
                            );
                        await ref.read(firebaseServiceProvider).logEvent(
                              'qr_meet_now',
                              parameters: {'step': 'created'},
                            );
                        if (!mounted) return;
                        Navigator.of(context).pop(true);
                      } on ApiException catch (e) {
                        if (mounted) {
                          setState(() {
                            _error = e.message;
                            _submitting = false;
                          });
                        }
                      } catch (e) {
                        if (mounted) {
                          setState(() {
                            _error = e.toString();
                            _submitting = false;
                          });
                        }
                      }
                    },
            ),
          ],
        ),
      ),
    );
  }
}
