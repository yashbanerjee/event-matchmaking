import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/gradient_button.dart';
import '../../services/matchmaking_repository.dart';

class SchedulePickResult {
  const SchedulePickResult({
    required this.startsAt,
    required this.endsAt,
    required this.placeId,
    required this.place,
  });

  final DateTime startsAt;
  final DateTime endsAt;
  final String placeId;
  final PlaceBrief place;
}

Future<SchedulePickResult?> showSchedulePickerSheet(
  BuildContext context, {
  required String title,
  String? requestId,
  String? fromOrgId,
  String? toOrgId,
  String? counterpartName,
}) {
  return showModalBottomSheet<SchedulePickResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => SchedulePickerSheet(
      title: title,
      requestId: requestId,
      fromOrgId: fromOrgId,
      toOrgId: toOrgId,
      counterpartName: counterpartName,
    ),
  );
}

class SchedulePickerSheet extends ConsumerStatefulWidget {
  const SchedulePickerSheet({
    super.key,
    required this.title,
    this.requestId,
    this.fromOrgId,
    this.toOrgId,
    this.counterpartName,
  });

  final String title;
  final String? requestId;
  final String? fromOrgId;
  final String? toOrgId;
  final String? counterpartName;

  @override
  ConsumerState<SchedulePickerSheet> createState() =>
      _SchedulePickerSheetState();
}

class _SchedulePickerSheetState extends ConsumerState<SchedulePickerSheet> {
  DateTime _date = DateTime.now();
  ScheduleSlot? _slot;
  PlaceBrief? _place;
  List<ScheduleSlot> _slots = const [];
  List<PlaceBrief> _places = const [];
  bool _loadingSlots = false;
  bool _loadingPlaces = false;
  String? _error;
  int _step = 0;

  @override
  void initState() {
    super.initState();
    _loadSlots();
  }

  String get _dateKey => DateFormat('yyyy-MM-dd').format(_date);

  Future<void> _loadSlots() async {
    setState(() {
      _loadingSlots = true;
      _error = null;
      _slot = null;
      _place = null;
      _places = const [];
      _step = 0;
    });
    try {
      final slots = await ref.read(matchmakingRepositoryProvider).slots(
            date: _dateKey,
            requestId: widget.requestId,
            fromOrgId: widget.fromOrgId,
            toOrgId: widget.toOrgId,
          );
      if (!mounted) return;
      setState(() {
        _slots = slots;
        _loadingSlots = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingSlots = false;
        _error = e.toString();
        _slots = const [];
      });
    }
  }

  Future<void> _loadPlaces(ScheduleSlot slot) async {
    setState(() {
      _loadingPlaces = true;
      _place = null;
      _error = null;
      _step = 1;
    });
    try {
      final places = await ref.read(matchmakingRepositoryProvider).availablePlaces(
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            excludeRequestId: widget.requestId,
          );
      if (!mounted) return;
      setState(() {
        _places = places;
        _loadingPlaces = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingPlaces = false;
        _error = e.toString();
        _places = const [];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      margin: const EdgeInsets.only(top: 48),
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottom),
      decoration: const BoxDecoration(
        color: AppColors.stone,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
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
          Text(widget.title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(
            widget.counterpartName == null
                ? 'Only mutual free times and free places are shown.'
                : 'Only times when both you and ${widget.counterpartName} are free.',
            style: const TextStyle(color: AppColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          if (_step == 0) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Date'),
              subtitle: Text(DateFormat('EEE, MMM d yyyy').format(_date)),
              trailing: const Icon(Icons.calendar_month_rounded),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 120)),
                );
                if (picked == null) return;
                setState(() => _date = picked);
                await _loadSlots();
              },
            ),
            const SizedBox(height: 8),
            if (_loadingSlots)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_slots.isEmpty)
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'No mutual free slots on this day.',
                  style: TextStyle(color: AppColors.muted),
                ),
              )
            else
              SizedBox(
                height: 220,
                child: GridView.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 2.2,
                  ),
                  itemCount: _slots.length,
                  itemBuilder: (context, i) {
                    final slot = _slots[i];
                    return OutlinedButton(
                      onPressed: () {
                        setState(() => _slot = slot);
                        _loadPlaces(slot);
                      },
                      child: Text(
                        DateFormat('HH:mm').format(slot.startsAt.toLocal()),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    );
                  },
                ),
              ),
          ] else ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule_rounded, color: AppColors.accentDeep),
              title: Text(
                _slot == null
                    ? '—'
                    : DateFormat('EEE, MMM d · HH:mm').format(_slot!.startsAt.toLocal()),
              ),
              trailing: TextButton(
                onPressed: () => setState(() {
                  _step = 0;
                  _place = null;
                }),
                child: const Text('Change'),
              ),
            ),
            const Text(
              'Places already booked or held are hidden.',
              style: TextStyle(color: AppColors.muted, fontSize: 13),
            ),
            const SizedBox(height: 10),
            if (_loadingPlaces)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_places.isEmpty)
              const Text(
                'No free places for this slot. Pick another time.',
                style: TextStyle(color: AppColors.muted),
              )
            else
              SizedBox(
                height: 260,
                child: ListView.separated(
                  itemCount: _places.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final place = _places[i];
                    final selected = _place?.id == place.id;
                    return Material(
                      color: selected ? AppColors.accentSoft : AppColors.white,
                      borderRadius: BorderRadius.circular(16),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => setState(() => _place = place),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: selected
                                  ? AppColors.accent
                                  : AppColors.border,
                            ),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.place_rounded,
                                  color: AppColors.accentDeep),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      place.name,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    Text(
                                      place.location ?? 'Location TBA',
                                      style: const TextStyle(
                                        color: AppColors.muted,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                place.code,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.muted,
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
            const SizedBox(height: 16),
            GradientButton(
              label: 'Confirm place',
              icon: Icons.check_rounded,
              onPressed: _slot == null || _place == null
                  ? null
                  : () {
                      Navigator.of(context).pop(
                        SchedulePickResult(
                          startsAt: _slot!.startsAt,
                          endsAt: _slot!.endsAt,
                          placeId: _place!.id,
                          place: _place!,
                        ),
                      );
                    },
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ],
        ],
      ),
    );
  }
}
