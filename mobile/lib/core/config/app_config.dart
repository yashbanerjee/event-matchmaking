/// Runtime configuration. Override with `--dart-define`.
class AppConfig {
  AppConfig._();

  /// Example: `--dart-define=API_BASE=https://api.example.com/api/v1`
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:4000/api/v1',
  );

  static const appName = 'Ethara';
  static const productName = 'Event Matchmaking';
  static const tagline = 'Making moments that matter';

  /// Set false in CI/unit tests if Firebase configs are absent.
  static const enableFirebase = bool.fromEnvironment(
    'ENABLE_FIREBASE',
    defaultValue: true,
  );
}
