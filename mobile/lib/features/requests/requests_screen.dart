import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/maps.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ethara_scaffold.dart';
import '../../core/widgets/status_chip.dart';
import '../../services/matchmaking_repository.dart';
import '../auth/auth_controller.dart';
import '../meetings/schedule_picker_sheet.dart';

final requestsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(matchmakingRepositoryProvider).listRequests();
});

class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(requestsProvider);
    final user = ref.watch(authControllerProvider).user;
    final myOrgs = user?.organizationIds.toSet() ?? {};
    final isAdmin = user?.isAdmin ?? false;

    return EtharaScaffold(
      title: 'Meeting requests',
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Text('No requests yet. Discover partners to send one.'),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(requestsProvider),
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final req = items[index];
                return _RequestCard(
                  request: req,
                  canActAsRecipient: isAdmin || myOrgs.contains(req.toOrgId),
                  canActAsParty:
                      isAdmin || myOrgs.contains(req.fromOrgId) || myOrgs.contains(req.toOrgId),
                  isOpponentConfirmer: isAdmin ||
                      (req.proposedByOrgId != null &&
                          ((req.proposedByOrgId == req.fromOrgId &&
                                  myOrgs.contains(req.toOrgId)) ||
                              (req.proposedByOrgId == req.toOrgId &&
                                  myOrgs.contains(req.fromOrgId)))),
                  onChanged: () => ref.invalidate(requestsProvider),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _RequestCard extends ConsumerStatefulWidget {
  const _RequestCard({
    required this.request,
    required this.canActAsRecipient,
    required this.canActAsParty,
    required this.isOpponentConfirmer,
    required this.onChanged,
  });

  final MeetingRequestItem request;
  final bool canActAsRecipient;
  final bool canActAsParty;
  final bool isOpponentConfirmer;
  final VoidCallback onChanged;

  @override
  ConsumerState<_RequestCard> createState() => _RequestCardState();
}

class _RequestCardState extends ConsumerState<_RequestCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      widget.onChanged();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Updated')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final req = widget.request;
    final df = DateFormat('MMM d, yyyy · HH:mm');
    final repo = ref.read(matchmakingRepositoryProvider);
    final hasSchedule =
        req.proposedStartsAt != null && req.place != null;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: AppColors.cardGradient,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${req.fromOrg.name} → ${req.toOrg.name}',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
              ),
              StatusChip(req.status),
            ],
          ),
          if (req.message != null &&
              req.message!.startsWith('Meet now')) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.accentSoft,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppColors.accent.withValues(alpha: 0.35)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.bolt_rounded, size: 14, color: AppColors.accentDeep),
                  SizedBox(width: 4),
                  Text(
                    'Meet now — confirm within 10 min',
                    style: TextStyle(
                      color: AppColors.accentDeep,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ] else if (req.message != null && req.message!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(req.message!, style: const TextStyle(color: AppColors.muted)),
          ],
          const SizedBox(height: 12),
          Text(
            req.proposedStartsAt == null
                ? 'Time not proposed yet'
                : df.format(req.proposedStartsAt!.toLocal()),
            style: const TextStyle(fontSize: 13, color: AppColors.muted),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.place_rounded, size: 16, color: AppColors.accentDeep),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  req.place == null
                      ? 'Meeting place not selected yet'
                      : 'Meeting place: ${req.place!.label}',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ),
            ],
          ),
          if (mapsNavigateUri(place: req.place) != null) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => openMapsForPlace(place: req.place),
                icon: const Icon(Icons.navigation_rounded, size: 16),
                label: const Text('Navigate'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.accentDeep,
                  padding: EdgeInsets.zero,
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (req.status == 'PENDING' && widget.canActAsRecipient) ...[
                _ActionBtn(
                  label: 'Accept',
                  filled: true,
                  loading: _busy,
                  onPressed: () => _run(() => repo.acceptRequest(req.id)),
                ),
                _ActionBtn(
                  label: 'Decline',
                  loading: _busy,
                  onPressed: () => _run(() => repo.declineRequest(req.id)),
                ),
              ],
              if ((req.status == 'AWAITING_CONFIRMATION' ||
                      (req.status == 'INTEREST_ACCEPTED' && hasSchedule)) &&
                  widget.isOpponentConfirmer) ...[
                _ActionBtn(
                  label: 'Accept',
                  filled: true,
                  loading: _busy,
                  onPressed: () => _run(() => repo.confirmRequest(req.id)),
                ),
                _ActionBtn(
                  label: 'Decline',
                  loading: _busy,
                  onPressed: () => _run(() => repo.declineRequest(req.id)),
                ),
              ],
              if (req.status == 'INTEREST_ACCEPTED' &&
                  !hasSchedule &&
                  widget.canActAsParty)
                _ActionBtn(
                  label: 'Pick time & place',
                  filled: true,
                  loading: _busy,
                  onPressed: () async {
                    final result = await showSchedulePickerSheet(
                      context,
                      title: 'Pick time & meeting place',
                      requestId: req.id,
                      fromOrgId: req.fromOrgId,
                      toOrgId: req.toOrgId,
                    );
                    if (result == null) return;
                    await _run(
                      () => repo.proposeSchedule(
                        id: req.id,
                        startsAt: result.startsAt.toUtc().toIso8601String(),
                        placeId: result.placeId,
                      ),
                    );
                  },
                ),
              if (const {
                    'PENDING',
                    'INTEREST_ACCEPTED',
                    'AWAITING_CONFIRMATION',
                  }.contains(req.status) &&
                  widget.canActAsParty &&
                  !(req.status == 'PENDING' && widget.canActAsRecipient) &&
                  !(req.status == 'AWAITING_CONFIRMATION' &&
                      widget.isOpponentConfirmer))
                _ActionBtn(
                  label: 'Decline',
                  loading: _busy,
                  onPressed: () => _run(() => repo.declineRequest(req.id)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({
    required this.label,
    required this.onPressed,
    this.filled = false,
    this.loading = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool filled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (filled) {
      return FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 40),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          backgroundColor: AppColors.ink,
        ),
        child: loading
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : Text(label),
      );
    }
    return OutlinedButton(
      onPressed: loading ? null : onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 40),
        padding: const EdgeInsets.symmetric(horizontal: 16),
      ),
      child: Text(label),
    );
  }
}
