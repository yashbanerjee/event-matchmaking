import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

/** Registers a browser push subscription when supported (VAPID key optional later). */
export async function ensurePushSubscription() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!getAccessToken()) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (!registration) return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      // Without a VAPID public key we still record a placeholder endpoint for ops.
      // Real web-push delivery can attach when keys are configured in settings.
      subscription = await registration.pushManager
        .subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined,
        })
        .catch(() => null);
    }
    if (!subscription) return;

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    await apiFetch('/users/me/push-subscriptions', {
      method: 'POST',
      token: getAccessToken(),
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      }),
    });
  } catch {
    // Push is best-effort; email remains the primary channel.
  }
}
