import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/maps.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ethara_scaffold.dart';
import '../../core/widgets/status_chip.dart';
import '../../services/matchmaking_repository.dart';
import '../auth/auth_controller.dart';

final _homeMeetingsProvider = FutureProvider.autoDispose((ref) async {
  return ref.watch(matchmakingRepositoryProvider).listMeetings();
});

final _homeRequestsProvider = FutureProvider.autoDispose((ref) async {
  return ref.watch(matchmakingRepositoryProvider).listRequests();
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).user;
    final meetings = ref.watch(_homeMeetingsProvider);
    final requests = ref.watch(_homeRequestsProvider);
    final now = DateTime.now();

    return EtharaScaffold(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      body: RefreshIndicator(
        color: AppColors.accentDeep,
        onRefresh: () async {
          ref.invalidate(_homeMeetingsProvider);
          ref.invalidate(_homeRequestsProvider);
        },
        child: ListView(
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'GUEST & CLIENT',
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                              color: AppColors.muted,
                              letterSpacing: 1.4,
                              fontSize: 11,
                            ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Hello${auth != null ? ',' : ''}',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      if (auth != null)
                        Text(
                          auth.email,
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: AppColors.muted),
                        ),
                    ],
                  ),
                ),
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: AppColors.accentGradient,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.bolt_rounded, color: AppColors.ink),
                ),
              ],
            ),
            const SizedBox(height: 22),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: AppColors.heroGradient,
                borderRadius: BorderRadius.circular(28),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Making moments that matter',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Request meetings with free places, confirm schedules, and stay notified.',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.72),
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _QuickAction(
                        icon: Icons.auto_awesome_rounded,
                        label: 'Discover',
                        onTap: () => context.go('/discover'),
                      ),
                      _QuickAction(
                        icon: Icons.inbox_rounded,
                        label: 'Requests',
                        onTap: () => context.go('/requests'),
                      ),
                      _QuickAction(
                        icon: Icons.event_rounded,
                        label: 'Meetings',
                        onTap: () => context.go('/meetings'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text('Upcoming meetings', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            meetings.when(
              loading: () => const _SkeletonCards(),
              error: (e, _) => Text('$e'),
              data: (items) {
                final upcoming = items
                    .where((m) => m.startsAt.isAfter(now.subtract(const Duration(hours: 1))))
                    .take(4)
                    .toList();
                if (upcoming.isEmpty) {
                  return const _EmptyCard(
                    title: 'No upcoming meetings',
                    subtitle: 'Accept a request or discover partners to schedule.',
                  );
                }
                return Column(
                  children: upcoming
                      .map(
                        (m) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _MeetingTile(meeting: m),
                        ),
                      )
                      .toList(),
                );
              },
            ),
            const SizedBox(height: 18),
            Text('Open requests', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            requests.when(
              loading: () => const _SkeletonCards(count: 2),
              error: (e, _) => Text('$e'),
              data: (items) {
                final open = items
                    .where((r) => const {
                          'PENDING',
                          'INTEREST_ACCEPTED',
                          'AWAITING_CONFIRMATION',
                        }.contains(r.status))
                    .take(4)
                    .toList();
                if (open.isEmpty) {
                  return const _EmptyCard(
                    title: 'Inbox clear',
                    subtitle: 'New meeting requests will appear here.',
                  );
                }
                return Column(
                  children: open
                      .map(
                        (r) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _RequestTile(request: r),
                        ),
                      )
                      .toList(),
                );
              },
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: AppColors.accent),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MeetingTile extends StatelessWidget {
  const _MeetingTile({required this.meeting});
  final MeetingItem meeting;

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('EEE, MMM d · HH:mm');
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: AppColors.cardGradient,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${meeting.companyOrg.name} ↔ ${meeting.vendorOrg.name}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              StatusChip(meeting.status),
            ],
          ),
          const SizedBox(height: 8),
          Text(df.format(meeting.startsAt.toLocal()),
              style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.place_rounded, size: 16, color: AppColors.accentDeep),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Meeting place: ${meeting.placeLabel}',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ),
            ],
          ),
          if (mapsNavigateUri(
                place: meeting.place,
                fallbackLabel: meeting.placeLabel,
              ) !=
              null) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => openMapsForPlace(
                  place: meeting.place,
                  fallbackLabel: meeting.placeLabel,
                ),
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
        ],
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request});
  final MeetingRequestItem request;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${request.fromOrg.name} → ${request.toOrg.name}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              StatusChip(request.status),
            ],
          ),
          if (request.place != null) ...[
            const SizedBox(height: 8),
            Text(
              'Meeting place: ${request.place!.label}',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            if (mapsNavigateUri(place: request.place) != null) ...[
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => openMapsForPlace(place: request.place),
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
          ],
        ],
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        ],
      ),
    );
  }
}

class _SkeletonCards extends StatelessWidget {
  const _SkeletonCards({this.count = 3});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        count,
        (i) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          height: 84,
          decoration: BoxDecoration(
            color: AppColors.border.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
    );
  }
}
