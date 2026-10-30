import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final tone = _tone(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tone.bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.replaceAll('_', ' '),
        style: TextStyle(
          color: tone.fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  ({Color bg, Color fg}) _tone(String s) {
    switch (s.toUpperCase()) {
      case 'CONFIRMED':
      case 'SCHEDULED':
      case 'INTEREST_ACCEPTED':
        return (bg: const Color(0xFFD1FAE5), fg: AppColors.success);
      case 'PENDING':
      case 'AWAITING_CONFIRMATION':
        return (bg: const Color(0xFFFEF3C7), fg: AppColors.warning);
      case 'DECLINED':
      case 'CANCELLED':
      case 'REJECTED':
        return (bg: const Color(0xFFFEE2E2), fg: AppColors.danger);
      default:
        return (bg: AppColors.accentSoft, fg: AppColors.ink);
    }
  }
}
