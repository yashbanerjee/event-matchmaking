import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';

class PlaceBrief {
  const PlaceBrief({
    required this.id,
    required this.name,
    required this.code,
    this.location,
  });

  final String id;
  final String name;
  final String code;
  final String? location;

  String get label =>
      location == null || location!.isEmpty ? name : '$name · $location';

  factory PlaceBrief.fromJson(Map<String, dynamic> json) => PlaceBrief(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        code: json['code'] as String? ?? '',
        location: json['location'] as String?,
      );
}

class OrgBrief {
  const OrgBrief({required this.id, required this.name, this.type});
  final String id;
  final String name;
  final String? type;

  factory OrgBrief.fromJson(Map<String, dynamic> json) => OrgBrief(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        type: json['type'] as String?,
      );
}

class MeetingRequestItem {
  const MeetingRequestItem({
    required this.id,
    required this.status,
    required this.fromOrgId,
    required this.toOrgId,
    required this.fromOrg,
    required this.toOrg,
    this.message,
    this.proposedStartsAt,
    this.proposedEndsAt,
    this.proposedByOrgId,
    this.place,
  });

  final String id;
  final String status;
  final String fromOrgId;
  final String toOrgId;
  final OrgBrief fromOrg;
  final OrgBrief toOrg;
  final String? message;
  final DateTime? proposedStartsAt;
  final DateTime? proposedEndsAt;
  final String? proposedByOrgId;
  final PlaceBrief? place;

  factory MeetingRequestItem.fromJson(Map<String, dynamic> json) {
    return MeetingRequestItem(
      id: json['id'] as String,
      status: json['status'] as String? ?? '',
      fromOrgId: json['fromOrgId'] as String? ?? '',
      toOrgId: json['toOrgId'] as String? ?? '',
      fromOrg: OrgBrief.fromJson(json['fromOrg'] as Map<String, dynamic>),
      toOrg: OrgBrief.fromJson(json['toOrg'] as Map<String, dynamic>),
      message: json['message'] as String?,
      proposedStartsAt: _parseDate(json['proposedStartsAt']),
      proposedEndsAt: _parseDate(json['proposedEndsAt']),
      proposedByOrgId: json['proposedByOrgId'] as String?,
      place: json['place'] == null
          ? null
          : PlaceBrief.fromJson(json['place'] as Map<String, dynamic>),
    );
  }
}

class MeetingItem {
  const MeetingItem({
    required this.id,
    required this.status,
    required this.startsAt,
    required this.companyOrg,
    required this.vendorOrg,
    this.endsAt,
    this.location,
    this.place,
  });

  final String id;
  final String status;
  final DateTime startsAt;
  final DateTime? endsAt;
  final OrgBrief companyOrg;
  final OrgBrief vendorOrg;
  final String? location;
  final PlaceBrief? place;

  String get placeLabel =>
      location ?? place?.label ?? 'Meeting place TBA';

  factory MeetingItem.fromJson(Map<String, dynamic> json) {
    return MeetingItem(
      id: json['id'] as String,
      status: json['status'] as String? ?? '',
      startsAt: _parseDate(json['startsAt']) ?? DateTime.now(),
      endsAt: _parseDate(json['endsAt']),
      companyOrg: OrgBrief.fromJson(json['companyOrg'] as Map<String, dynamic>),
      vendorOrg: OrgBrief.fromJson(json['vendorOrg'] as Map<String, dynamic>),
      location: json['location'] as String?,
      place: json['place'] == null
          ? null
          : PlaceBrief.fromJson(json['place'] as Map<String, dynamic>),
    );
  }
}

class RecommendationItem {
  const RecommendationItem({
    required this.organizationId,
    required this.name,
    this.score,
    this.summary,
    this.reasons = const [],
    this.industry,
    this.type,
  });

  final String organizationId;
  final String name;
  final double? score;
  final String? summary;
  final List<String> reasons;
  final String? industry;
  final String? type;

  factory RecommendationItem.fromJson(Map<String, dynamic> json) {
    final rawReasons = json['reasons'];
    final reasons = rawReasons is List
        ? rawReasons.map((e) => e.toString()).where((e) => e.isNotEmpty).toList()
        : <String>[];
    final explanation = json['summary'] as String? ??
        json['explanation'] as String? ??
        json['reason'] as String?;
    // Prefer structured reasons; otherwise strip technical score appendix.
    final fallbackReasons = reasons.isNotEmpty
        ? reasons
        : (explanation ?? '')
            .replaceAll(RegExp(r'\s*\(Score[\s\S]*$'), '')
            .split(' · ')
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList();
    return RecommendationItem(
      organizationId: (json['organizationId'] ?? json['id']) as String,
      name: json['name'] as String? ?? 'Organization',
      score: (json['score'] as num?)?.toDouble(),
      summary: explanation,
      reasons: fallbackReasons,
      industry: json['industry'] as String?,
      type: json['type'] as String?,
    );
  }
}

class PublicProfileField {
  const PublicProfileField({
    required this.key,
    required this.label,
    required this.type,
    required this.value,
    this.sectionTitle,
  });

  final String key;
  final String label;
  final String type;
  final dynamic value;
  final String? sectionTitle;

  String get displayValue {
    final v = value;
    if (v == null) return '—';
    if (v is bool) return v ? 'Yes' : 'No';
    if (v is List) {
      return v
          .map((item) {
            if (item is Map && item['label'] != null) return '${item['label']}';
            return '$item';
          })
          .where((s) => s.trim().isNotEmpty)
          .join(', ');
    }
    return '$v';
  }

  factory PublicProfileField.fromJson(Map<String, dynamic> json) {
    return PublicProfileField(
      key: json['key'] as String? ?? '',
      label: json['label'] as String? ?? '',
      type: json['type'] as String? ?? 'text',
      value: json['value'],
      sectionTitle: json['sectionTitle'] as String?,
    );
  }
}

class OrgPublicProfile {
  const OrgPublicProfile({
    required this.organizationId,
    required this.name,
    required this.type,
    required this.fields,
    this.industry,
    this.region,
    this.website,
    this.categories = const [],
    this.capabilities = const [],
    this.featured = false,
    this.formName,
  });

  final String organizationId;
  final String name;
  final String type;
  final String? industry;
  final String? region;
  final String? website;
  final List<String> categories;
  final List<String> capabilities;
  final bool featured;
  final String? formName;
  final List<PublicProfileField> fields;

  factory OrgPublicProfile.fromJson(Map<String, dynamic> json) {
    return OrgPublicProfile(
      organizationId: json['organizationId'] as String,
      name: json['name'] as String? ?? '',
      type: json['type'] as String? ?? '',
      industry: json['industry'] as String?,
      region: json['region'] as String?,
      website: json['website'] as String?,
      categories: (json['categories'] as List? ?? const [])
          .map((e) => e.toString())
          .toList(),
      capabilities: (json['capabilities'] as List? ?? const [])
          .map((e) => e.toString())
          .toList(),
      featured: json['featured'] as bool? ?? false,
      formName: json['formName'] as String?,
      fields: (json['fields'] as List? ?? const [])
          .map((e) => PublicProfileField.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ScheduleSlot {
  const ScheduleSlot({required this.startsAt, required this.endsAt});
  final DateTime startsAt;
  final DateTime endsAt;

  factory ScheduleSlot.fromJson(Map<String, dynamic> json) => ScheduleSlot(
        startsAt: DateTime.parse(json['startsAt'] as String),
        endsAt: DateTime.parse(json['endsAt'] as String),
      );
}

DateTime? _parseDate(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  return DateTime.tryParse(value.toString());
}

class MatchmakingRepository {
  MatchmakingRepository(this._api);
  final ApiClient _api;

  Future<List<MeetingRequestItem>> listRequests() async {
    final data = await _api.get<Map<String, dynamic>>(
      '/meeting-requests',
      parse: (d) => d as Map<String, dynamic>,
    );
    final items = (data['items'] as List? ?? const []);
    return items
        .map((e) => MeetingRequestItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<MeetingItem>> listMeetings() async {
    final data = await _api.get<Map<String, dynamic>>(
      '/meetings',
      parse: (d) => d as Map<String, dynamic>,
    );
    final items = (data['items'] as List? ?? const []);
    return items
        .map((e) => MeetingItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<RecommendationItem>> recommendations({int limit = 12}) async {
    final data = await _api.get<Map<String, dynamic>>(
      '/recommendations',
      query: {'limit': limit},
      parse: (d) => d as Map<String, dynamic>,
    );
    final featured = (data['featured'] as List? ?? const []);
    final items = (data['items'] as List? ?? const []);
    final merged = [...featured, ...items];
    final seen = <String>{};
    return merged
        .map((e) => RecommendationItem.fromJson(e as Map<String, dynamic>))
        .where((e) => seen.add(e.organizationId))
        .toList();
  }

  Future<OrgPublicProfile> publicProfile(String organizationId) {
    return _api.get<OrgPublicProfile>(
      '/recommendations/$organizationId/profile',
      parse: (d) => OrgPublicProfile.fromJson(d as Map<String, dynamic>),
    );
  }

  Future<List<ScheduleSlot>> slots({
    required String date,
    String? requestId,
    String? fromOrgId,
    String? toOrgId,
  }) async {
    final data = await _api.get<Map<String, dynamic>>(
      '/meeting-requests/slots',
      query: {
        'date': date,
        'requestId': ?requestId,
        'fromOrgId': ?fromOrgId,
        'toOrgId': ?toOrgId,
      },
      parse: (d) => d as Map<String, dynamic>,
    );
    return (data['slots'] as List? ?? const [])
        .map((e) => ScheduleSlot.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<PlaceBrief>> availablePlaces({
    required DateTime startsAt,
    required DateTime endsAt,
    String? excludeRequestId,
  }) async {
    final list = await _api.get<List<dynamic>>(
      '/places/available',
      query: {
        'startsAt': startsAt.toUtc().toIso8601String(),
        'endsAt': endsAt.toUtc().toIso8601String(),
        'excludeRequestId': ?excludeRequestId,
      },
      parse: (d) => d as List<dynamic>,
    );
    return list
        .map((e) => PlaceBrief.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> nowWindow({
    required String fromOrgId,
    required String toOrgId,
  }) {
    return _api.get<Map<String, dynamic>>(
      '/meeting-requests/now-window',
      query: {'fromOrgId': fromOrgId, 'toOrgId': toOrgId},
      parse: (d) => d as Map<String, dynamic>,
    );
  }

  Future<void> createRequest({
    required String fromOrgId,
    required String toOrgId,
    required String placeId,
    String? startsAt,
    String? message,
    String mode = 'SCHEDULED',
  }) {
    return _api.post(
      '/meeting-requests',
      body: {
        'fromOrgId': fromOrgId,
        'toOrgId': toOrgId,
        'placeId': placeId,
        'mode': mode,
        'startsAt': ?startsAt,
        'message': ?message,
      },
    );
  }

  Future<void> acceptRequest(String id) =>
      _api.post('/meeting-requests/$id/accept', body: {});

  Future<void> declineRequest(String id, {String reason = 'Declined'}) =>
      _api.post('/meeting-requests/$id/decline', body: {'reason': reason});

  Future<void> confirmRequest(String id) =>
      _api.post('/meeting-requests/$id/confirm', body: {});

  Future<void> proposeSchedule({
    required String id,
    required String startsAt,
    required String placeId,
  }) {
    return _api.post(
      '/meeting-requests/$id/propose',
      body: {'startsAt': startsAt, 'placeId': placeId},
    );
  }

  Future<List<Map<String, dynamic>>> onboardingForms() async {
    try {
      final data = await _api.get<dynamic>('/forms/onboarding/me');
      if (data is Map && data['items'] is List) {
        return (data['items'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (data is List) {
        return data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    } catch (_) {}
    return const [];
  }
}

final matchmakingRepositoryProvider = Provider<MatchmakingRepository>((ref) {
  return MatchmakingRepository(ref.watch(apiClientProvider));
});
