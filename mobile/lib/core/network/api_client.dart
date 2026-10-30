import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../storage/token_store.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._tokens) {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBase,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokens.getAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401 &&
              error.requestOptions.extra['skipRefresh'] != true) {
            final refreshed = await _refresh();
            if (refreshed) {
              final req = error.requestOptions;
              final token = await _tokens.getAccessToken();
              req.headers['Authorization'] = 'Bearer $token';
              try {
                final response = await _dio.fetch(req);
                return handler.resolve(response);
              } catch (e) {
                return handler.next(error);
              }
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  final TokenStore _tokens;
  late final Dio _dio;
  Future<bool>? _refreshing;

  Dio get dio => _dio;

  Future<bool> _refresh() {
    return _refreshing ??= () async {
      try {
        final refresh = await _tokens.getRefreshToken();
        if (refresh == null || refresh.isEmpty) return false;
        final res = await _dio.post<Map<String, dynamic>>(
          '/auth/refresh',
          data: {'refreshToken': refresh},
          options: Options(extra: {'skipRefresh': true}),
        );
        final access = res.data?['accessToken'] as String?;
        final nextRefresh = res.data?['refreshToken'] as String?;
        if (access == null || nextRefresh == null) return false;
        await _tokens.saveTokens(
          accessToken: access,
          refreshToken: nextRefresh,
        );
        return true;
      } catch (_) {
        await _tokens.clear();
        return false;
      } finally {
        _refreshing = null;
      }
    }();
  }

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    T Function(dynamic data)? parse,
  }) async {
    try {
      final res = await _dio.get<dynamic>(path, queryParameters: query);
      return parse != null ? parse(res.data) : res.data as T;
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<T> post<T>(
    String path, {
    Object? body,
    T Function(dynamic data)? parse,
  }) async {
    try {
      final res = await _dio.post<dynamic>(path, data: body);
      return parse != null ? parse(res.data) : res.data as T;
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  ApiException _mapError(DioException e) {
    final data = e.response?.data;
    String message = e.message ?? 'Request failed';
    if (data is Map && data['message'] != null) {
      final m = data['message'];
      if (m is List && m.isNotEmpty) {
        message = m.first.toString();
      } else {
        message = m.toString();
      }
    }
    return ApiException(message, statusCode: e.response?.statusCode);
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(tokenStoreProvider));
});
