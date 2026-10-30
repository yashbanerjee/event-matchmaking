import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import 'matchmaking_repository.dart';

class MyQrPayload {
  const MyQrPayload({
    required this.organizationId,
    required this.code,
    required this.name,
    required this.type,
    required this.deepLink,
    required this.mobileLink,
  });

  final String organizationId;
  final String code;
  final String name;
  final String type;
  final String deepLink;
  final String mobileLink;

  factory MyQrPayload.fromJson(Map<String, dynamic> json) => MyQrPayload(
        organizationId: json['organizationId'] as String,
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? '',
        deepLink: json['deepLink'] as String? ?? '',
        mobileLink: json['mobileLink'] as String? ?? '',
      );
}

class QrResolveResult {
  const QrResolveResult({
    required this.relationship,
    required this.code,
    required this.canBook,
    this.message,
    this.fromOrgId,
    this.toOrgId,
    this.profile,
    this.openRequest,
    this.meeting,
  });

  final String relationship;
  final String code;
  final bool canBook;
  final String? message;
  final String? fromOrgId;
  final String? toOrgId;
  final OrgPublicProfile? profile;
  final Map<String, dynamic>? openRequest;
  final Map<String, dynamic>? meeting;

  factory QrResolveResult.fromJson(Map<String, dynamic> json) => QrResolveResult(
        relationship: json['relationship'] as String? ?? 'INVALID',
        code: json['code'] as String? ?? '',
        canBook: json['canBook'] as bool? ?? false,
        message: json['message'] as String?,
        fromOrgId: json['fromOrgId'] as String?,
        toOrgId: json['toOrgId'] as String?,
        profile: json['profile'] is Map<String, dynamic>
            ? OrgPublicProfile.fromJson(json['profile'] as Map<String, dynamic>)
            : null,
        openRequest: json['openRequest'] is Map<String, dynamic>
            ? Map<String, dynamic>.from(json['openRequest'] as Map)
            : null,
        meeting: json['meeting'] is Map<String, dynamic>
            ? Map<String, dynamic>.from(json['meeting'] as Map)
            : null,
      );
}

class QrRepository {
  QrRepository(this._api);
  final ApiClient _api;

  Future<MyQrPayload> myQr() => _api.get(
        '/qr/me',
        parse: (d) => MyQrPayload.fromJson(d as Map<String, dynamic>),
      );

  Future<QrResolveResult> resolve({String? code, String? url}) => _api.post(
        '/qr/resolve',
        body: {
          'code': ?code,
          'url': ?url,
        },
        parse: (d) => QrResolveResult.fromJson(d as Map<String, dynamic>),
      );
}

final qrRepositoryProvider = Provider<QrRepository>((ref) {
  return QrRepository(ref.watch(apiClientProvider));
});
