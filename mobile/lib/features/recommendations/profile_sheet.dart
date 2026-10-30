import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/gradient_button.dart';
import '../../services/matchmaking_repository.dart';

Future<void> showRecommendationProfileSheet(
  BuildContext context, {
  required String organizationId,
  String? counterpartName,
  VoidCallback? onRequestMeeting,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => RecommendationProfileSheet(
      organizationId: organizationId,
      counterpartName: counterpartName,
      onRequestMeeting: onRequestMeeting,
    ),
  );
}

class RecommendationProfileSheet extends ConsumerStatefulWidget {
  const RecommendationProfileSheet({
    super.key,
    required this.organizationId,
    this.counterpartName,
    this.onRequestMeeting,
  });

  final String organizationId;
  final String? counterpartName;
  final VoidCallback? onRequestMeeting;

  @override
  ConsumerState<RecommendationProfileSheet> createState() =>
      _RecommendationProfileSheetState();
}

class _RecommendationProfileSheetState
    extends ConsumerState<RecommendationProfileSheet> {
  OrgPublicProfile? _profile;
  String? _error;
  bool _loading = true;

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
      final profile = await ref
          .read(matchmakingRepositoryProvider)
          .publicProfile(widget.organizationId);
      if (!mounted) return;
      setState(() {
        _profile = profile;
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
    final profile = _profile;
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      margin: const EdgeInsets.only(top: 48),
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottom),
      decoration: const BoxDecoration(
        color: AppColors.stone,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.82,
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
              profile?.name ?? widget.counterpartName ?? 'Partner profile',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              'Sensitive form fields are hidden from this view.',
              style: const TextStyle(color: AppColors.muted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Text(_error!, style: const TextStyle(color: AppColors.danger))
                      : profile == null
                          ? const Text('Profile unavailable')
                          : ListView(
                              children: [
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    _Chip(profile.type),
                                    if (profile.industry != null)
                                      _Chip(profile.industry!),
                                    if (profile.region != null)
                                      _Chip(profile.region!),
                                    if (profile.featured)
                                      const _Chip('Admin pick', accent: true),
                                  ],
                                ),
                                if (profile.categories.isNotEmpty ||
                                    profile.capabilities.isNotEmpty) ...[
                                  const SizedBox(height: 14),
                                  Text(
                                    [...profile.categories, ...profile.capabilities]
                                        .join(' · '),
                                    style: const TextStyle(
                                      color: AppColors.muted,
                                      height: 1.4,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 18),
                                if (profile.fields.isEmpty)
                                  Container(
                                    padding: const EdgeInsets.all(16),
                                    decoration: BoxDecoration(
                                      color: AppColors.white,
                                      borderRadius: BorderRadius.circular(18),
                                      border: Border.all(color: AppColors.border),
                                    ),
                                    child: const Text(
                                      'No public profile fields are available yet.',
                                      style: TextStyle(color: AppColors.muted),
                                    ),
                                  )
                                else
                                  ..._groupFields(profile.fields).entries.map(
                                    (entry) => Padding(
                                      padding: const EdgeInsets.only(bottom: 16),
                                      child: _SectionCard(
                                        title: entry.key,
                                        fields: entry.value,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
            ),
            if (widget.onRequestMeeting != null) ...[
              const SizedBox(height: 12),
              GradientButton(
                label: 'Request meeting',
                icon: Icons.event_available_rounded,
                onPressed: () {
                  Navigator.of(context).pop();
                  widget.onRequestMeeting!();
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Map<String, List<PublicProfileField>> _groupFields(
    List<PublicProfileField> fields,
  ) {
    final map = <String, List<PublicProfileField>>{};
    for (final field in fields) {
      final key = field.sectionTitle ?? 'Profile details';
      map.putIfAbsent(key, () => []).add(field);
    }
    return map;
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, {this.accent = false});
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: accent ? AppColors.accentSoft : AppColors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: accent ? AppColors.accentDeep : AppColors.ink,
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.fields});
  final String title;
  final List<PublicProfileField> fields;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Text(
              title.toUpperCase(),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
                color: AppColors.muted,
              ),
            ),
          ),
          for (var i = 0; i < fields.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: AppColors.border),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fields[i].label,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.muted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    fields[i].displayValue,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
