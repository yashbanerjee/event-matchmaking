import 'package:url_launcher/url_launcher.dart';

import '../services/matchmaking_repository.dart';

Uri? mapsNavigateUri({
  PlaceBrief? place,
  String? fallbackLabel,
}) {
  if (place?.latitude != null && place?.longitude != null) {
    return Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${place!.latitude},${place.longitude}',
    );
  }
  final query = place?.mapAddress?.trim().isNotEmpty == true
      ? place!.mapAddress!.trim()
      : place?.location?.trim().isNotEmpty == true
          ? place!.location!.trim()
          : place?.name.trim().isNotEmpty == true
              ? place!.name.trim()
              : fallbackLabel?.trim();
  if (query == null || query.isEmpty) return null;
  return Uri.parse(
    'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(query)}',
  );
}

Future<bool> openMapsForPlace({
  PlaceBrief? place,
  String? fallbackLabel,
}) async {
  final uri = mapsNavigateUri(place: place, fallbackLabel: fallbackLabel);
  if (uri == null) return false;
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
