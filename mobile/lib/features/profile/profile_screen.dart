import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ethara_scaffold.dart';
import '../../core/widgets/gradient_button.dart';
import '../auth/auth_controller.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;

    return EtharaScaffold(
      title: 'Profile',
      body: ListView(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: AppColors.heroGradient,
              borderRadius: BorderRadius.circular(28),
            ),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: AppColors.accentGradient,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(Icons.person_rounded, color: AppColors.ink, size: 30),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.email ?? 'Signed out',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        (user?.roles ?? const []).join(' · '),
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.7),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          _Tile(
            icon: Icons.qr_code_2_rounded,
            title: 'My QR code',
            subtitle: 'Save, share, or scan to book meetings',
            onTap: () => context.push('/qr'),
          ),
          _Tile(
            icon: Icons.qr_code_scanner_rounded,
            title: 'Scan partner QR',
            subtitle: 'Camera or gallery upload',
            onTap: () => context.push('/qr/scan'),
          ),
          _Tile(
            icon: Icons.description_outlined,
            title: 'Forms & onboarding',
            subtitle: 'Complete assigned forms',
            onTap: () => context.push('/forms'),
          ),
          _Tile(
            icon: Icons.notifications_active_outlined,
            title: 'Push notifications',
            subtitle: 'Firebase Cloud Messaging enabled',
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Push registration runs automatically after sign-in'),
                ),
              );
            },
          ),
          _Tile(
            icon: Icons.analytics_outlined,
            title: 'Analytics',
            subtitle: 'Firebase Analytics product events',
            onTap: () {},
          ),
          _Tile(
            icon: Icons.info_outline_rounded,
            title: AppConfig.appName,
            subtitle: '${AppConfig.productName} · ${AppConfig.tagline}',
            onTap: () {},
          ),
          const SizedBox(height: 24),
          GradientButton(
            label: 'Sign out',
            icon: Icons.logout_rounded,
            onPressed: () async {
              await ref.read(authControllerProvider.notifier).logout();
            },
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppColors.accentSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: AppColors.accentDeep),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(
                        subtitle,
                        style: const TextStyle(color: AppColors.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
