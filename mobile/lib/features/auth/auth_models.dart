class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.roles,
    required this.permissions,
    required this.organizationIds,
  });

  final String id;
  final String email;
  final List<String> roles;
  final List<String> permissions;
  final List<String> organizationIds;

  bool get isVendor => roles.contains('VENDOR_USER');
  bool get isCompany => roles.contains('COMPANY_USER');
  bool get isAdmin =>
      roles.any((r) => const {'SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'}.contains(r));

  String get primaryOrgId =>
      organizationIds.isNotEmpty ? organizationIds.first : '';

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      email: json['email'] as String? ?? '',
      roles: (json['roles'] as List? ?? const []).map((e) => e.toString()).toList(),
      permissions: (json['permissions'] as List? ?? const [])
          .map((e) => e.toString())
          .toList(),
      organizationIds: (json['organizationIds'] as List? ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

class LoginResult {
  const LoginResult({
    required this.accessToken,
    required this.refreshToken,
  });

  final String accessToken;
  final String refreshToken;

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    return LoginResult(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}
