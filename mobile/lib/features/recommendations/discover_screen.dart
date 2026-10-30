import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ethara_scaffold.dart';
import '../../core/widgets/gradient_button.dart';
import '../../services/matchmaking_repository.dart';
import '../auth/auth_controller.dart';
import '../meetings/schedule_picker_sheet.dart';
import '../requests/requests_screen.dart';
import 'profile_sheet.dart';

final recommendationsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(matchmakingRepositoryProvider).recommendations();
});

class DiscoverScreen extends ConsumerWidget {
  const DiscoverScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(recommendationsProvider);
    final fromOrgId = ref.watch(authControllerProvider).user?.primaryOrgId;

    return EtharaScaffold(
      title: 'Discover',
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Text('No recommendations yet. Complete your profile filters.'),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(recommendationsProvider),
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final item = items[index];
                return Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: AppColors.cardGradient,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              gradient: AppColors.accentGradient,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(
                              Icons.apartment_rounded,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.name,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                  ),
                                ),
                                if (item.score != null)
                                  Text(
                                    'Match ${item.score!.toStringAsFixed(0)}%',
                                    style: const TextStyle(
                                      color: AppColors.accentDeep,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      if (item.reasons.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        const Text(
                          'WHY A GOOD MATCH',
                          style: TextStyle(
                            color: AppColors.accentDeep,
                            fontWeight: FontWeight.w800,
                            fontSize: 11,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 6),
                        ...item.reasons.take(3).map(
                              (reason) => Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      '•  ',
                                      style: TextStyle(
                                        color: AppColors.accentDeep,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    Expanded(
                                      child: Text(
                                        reason,
                                        style: const TextStyle(
                                          color: AppColors.muted,
                                          height: 1.35,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                      ] else if (item.summary != null &&
                          item.summary!.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(
                          item.summary!,
                          style: const TextStyle(
                            color: AppColors.muted,
                            height: 1.35,
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () {
                                showRecommendationProfileSheet(
                                  context,
                                  organizationId: item.organizationId,
                                  counterpartName: item.name,
                                  reasons: item.reasons,
                                  onRequestMeeting:
                                      fromOrgId == null || fromOrgId.isEmpty
                                          ? null
                                          : () => _requestMeeting(
                                                context,
                                                ref,
                                                fromOrgId: fromOrgId,
                                                item: item,
                                              ),
                                );
                              },
                              child: const Text('View profile'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: GradientButton(
                              label: 'Request',
                              icon: Icons.event_available_rounded,
                              onPressed: fromOrgId == null || fromOrgId.isEmpty
                                  ? null
                                  : () => _requestMeeting(
                                        context,
                                        ref,
                                        fromOrgId: fromOrgId,
                                        item: item,
                                      ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

Future<void> _requestMeeting(
  BuildContext context,
  WidgetRef ref, {
  required String fromOrgId,
  required RecommendationItem item,
}) async {
  final picked = await showSchedulePickerSheet(
    context,
    title: 'Request meeting · ${item.name}',
    fromOrgId: fromOrgId,
    toOrgId: item.organizationId,
    counterpartName: item.name,
  );
  if (picked == null) return;
  try {
    await ref.read(matchmakingRepositoryProvider).createRequest(
          fromOrgId: fromOrgId,
          toOrgId: item.organizationId,
          startsAt: picked.startsAt.toUtc().toIso8601String(),
          placeId: picked.placeId,
        );
    ref.invalidate(requestsProvider);
    ref.invalidate(recommendationsProvider);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Meeting request sent with place & time'),
        ),
      );
    }
  } on ApiException catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }
}
