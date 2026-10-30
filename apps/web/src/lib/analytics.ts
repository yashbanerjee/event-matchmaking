/** Lightweight client analytics (console + optional dataLayer / gtag hooks). */

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, payload: AnalyticsPayload = {}) {
  if (typeof window === 'undefined') return;
  try {
    const detail = { name, ...payload, at: new Date().toISOString() };
    // eslint-disable-next-line no-console
    console.info('[analytics]', detail);
    const w = window as Window & {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    };
    w.dataLayer?.push({ event: name, ...payload });
    w.gtag?.('event', name, payload);
  } catch {
    // analytics is best-effort
  }
}
