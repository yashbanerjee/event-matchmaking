import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/storage/token_store.dart';
import '../../services/firebase_service.dart';
import 'auth_models.dart';

class AuthState {
  const AuthState({
    this.user,
    this.booting = true,
    this.busy = false,
    this.error,
  });

  final AuthUser? user;
  final bool booting;
  final bool busy;
  final String? error;

  bool get isAuthenticated => user != null;

  AuthState copyWith({
    AuthUser? user,
    bool? booting,
    bool? busy,
    String? error,
    bool clearUser = false,
    bool clearError = false,
  }) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      booting: booting ?? this.booting,
      busy: busy ?? this.busy,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._api, this._tokens, this._firebase)
      : super(const AuthState()) {
    _bootstrap();
  }

  final ApiClient _api;
  final TokenStore _tokens;
  final FirebaseService _firebase;

  Future<void> _bootstrap() async {
    try {
      final access = await _tokens.getAccessToken();
      if (access == null || access.isEmpty) {
        state = state.copyWith(booting: false, clearUser: true);
        return;
      }
      final me = await _api.get<AuthUser>(
        '/auth/me',
        parse: (data) => AuthUser.fromJson(data as Map<String, dynamic>),
      );
      state = state.copyWith(user: me, booting: false, clearError: true);
      await _firebase.registerPushToken(_api);
      await _firebase.logEvent('session_restored');
    } catch (_) {
      await _tokens.clear();
      state = state.copyWith(booting: false, clearUser: true);
    }
  }

  Future<bool> login({
    required String email,
    required String password,
  }) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      final result = await _api.post<LoginResult>(
        '/auth/login',
        body: {'email': email.trim(), 'password': password},
        parse: (data) => LoginResult.fromJson(data as Map<String, dynamic>),
      );
      await _tokens.saveTokens(
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      );
      final me = await _api.get<AuthUser>(
        '/auth/me',
        parse: (data) => AuthUser.fromJson(data as Map<String, dynamic>),
      );
      state = state.copyWith(user: me, busy: false, clearError: true);
      await _firebase.registerPushToken(_api);
      await _firebase.logEvent('login', parameters: {'method': 'password'});
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(busy: false, error: e.message);
      return false;
    } catch (e) {
      state = state.copyWith(busy: false, error: e.toString());
      return false;
    }
  }

  Future<void> logout() async {
    try {
      final refresh = await _tokens.getRefreshToken();
      if (refresh != null) {
        await _api.post('/auth/logout', body: {'refreshToken': refresh});
      }
    } catch (_) {}
    await _tokens.clear();
    await _firebase.logEvent('logout');
    state = const AuthState(booting: false);
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(
    ref.watch(apiClientProvider),
    ref.watch(tokenStoreProvider),
    ref.watch(firebaseServiceProvider),
  );
});
