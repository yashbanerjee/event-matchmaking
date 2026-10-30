import 'package:flutter/material.dart';

/// Ethara brand tokens — turquoise accent on deep black / soft stone.
abstract final class AppColors {
  static const ink = Color(0xFF0A0A0A);
  static const inkSoft = Color(0xFF1C1C1C);
  static const stone = Color(0xFFF4F4F2);
  static const stoneElevated = Color(0xFFFAFAF8);
  static const white = Color(0xFFFFFFFF);
  static const border = Color(0xFFE2E0DB);
  static const muted = Color(0xFF6B6B66);
  static const accent = Color(0xFF26E2C6);
  static const accentDeep = Color(0xFF1BC4AB);
  static const accentSoft = Color(0xFFD8FAF3);
  static const danger = Color(0xFFBE123C);
  static const success = Color(0xFF047857);
  static const warning = Color(0xFFB45309);

  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color(0xFF0A0A0A),
      Color(0xFF141A1A),
      Color(0xFF0F2F2A),
      Color(0xFF0A0A0A),
    ],
    stops: [0.0, 0.35, 0.7, 1.0],
  );

  static const accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF26E2C6), Color(0xFF12B8A0), Color(0xFF0A8F7C)],
  );

  static const softGlow = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0x3326E2C6), Color(0x00F4F4F2)],
  );

  static const cardGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFFFFFF), Color(0xFFF7FBFD)],
  );
}
