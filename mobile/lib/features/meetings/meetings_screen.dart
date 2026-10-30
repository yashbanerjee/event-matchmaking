import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/ethara_scaffold.dart';
import '../../core/widgets/status_chip.dart';
import '../../services/matchmaking_repository.dart';

final meetingsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(matchmakingRepositoryProvider).listMeetings();
});

class MeetingsScreen extends ConsumerWidget {
  const MeetingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(meetingsProvider);
    final df = DateFormat('EEE, MMM d · HH:mm');

    return EtharaScaffold(
      title: 'Meetings',
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (items) {
          if (items.isEmpty) {
            return const Center(child: Text('No meetings scheduled yet.'));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(meetingsProvider),
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final m = items[index];
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
                          Expanded(
                            child: Text(
                              '${m.companyOrg.name} ↔ ${m.vendorOrg.name}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                              ),
                            ),
                          ),
                          StatusChip(m.status),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const Icon(Icons.schedule_rounded,
                              size: 16, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Text(
                            df.format(m.startsAt.toLocal()),
                            style: const TextStyle(color: AppColors.muted),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.place_rounded,
                              size: 16, color: AppColors.accentDeep),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Meeting place: ${m.placeLabel}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
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
