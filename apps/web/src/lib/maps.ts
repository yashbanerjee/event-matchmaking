export type MapPoint = {
  latitude?: number | null;
  longitude?: number | null;
  mapAddress?: string | null;
  location?: string | null;
  name?: string | null;
};

export function hasMapPoint(point?: MapPoint | null) {
  if (!point) return false;
  if (
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    !Number.isNaN(point.latitude) &&
    !Number.isNaN(point.longitude)
  ) {
    return true;
  }
  return Boolean(
    (point.mapAddress && point.mapAddress.trim()) ||
      (point.location && point.location.trim()) ||
      (point.name && point.name.trim()),
  );
}

/** Google Maps directions / search URL (works on web + mobile). */
export function mapsNavigateUrl(point: MapPoint) {
  if (
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    !Number.isNaN(point.latitude) &&
    !Number.isNaN(point.longitude)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;
  }
  const query =
    point.mapAddress?.trim() ||
    point.location?.trim() ||
    point.name?.trim() ||
    '';
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsViewUrl(point: MapPoint) {
  if (
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    !Number.isNaN(point.latitude) &&
    !Number.isNaN(point.longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
  }
  return mapsNavigateUrl(point);
}

export function formatPlaceLabel(point?: MapPoint | null) {
  if (!point) return null;
  const name = point.name?.trim();
  const location = point.location?.trim();
  const address = point.mapAddress?.trim();
  if (name && location) return `${name} · ${location}`;
  if (name && address) return `${name} · ${address}`;
  return name || location || address || null;
}
