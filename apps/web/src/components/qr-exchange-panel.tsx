'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  MapPin,
  QrCode,
  ScanLine,
  Share2,
  Upload,
  Zap,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { MeetingSchedulePicker } from '@/components/meeting-schedule-picker';
import { RecommendationProfileModal } from '@/components/recommendation-profile-modal';

type NowWindow = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  confirmWithinMinutes: number;
  partiesFree: boolean;
  message: string | null;
  places: Array<{
    id: string;
    name: string;
    code: string;
    location: string | null;
  }>;
};

type MyQr = {
  organizationId: string;
  code: string;
  name: string;
  type: string;
  deepLink: string;
  mobileLink: string;
  pngDataUrl?: string | null;
};

type QrResolve = {
  relationship:
    | 'NONE'
    | 'OPEN_REQUEST'
    | 'SCHEDULED'
    | 'SELF'
    | 'INVALID'
    | 'SAME_TYPE';
  code: string;
  message?: string;
  canBook: boolean;
  fromOrgId?: string;
  toOrgId?: string;
  deepLink?: string;
  profile: {
    organizationId: string;
    name: string;
    type: string;
    industry: string | null;
    region?: string | null;
    website?: string | null;
    categories: string[];
    capabilities: string[];
    featured: boolean;
    formName: string | null;
    fields: Array<{
      key: string;
      label: string;
      type: string;
      value: unknown;
      sectionTitle: string | null;
    }>;
    sensitiveFieldsHidden: boolean;
  } | null;
  openRequest: {
    id: string;
    status: string;
    proposedStartsAt: string | null;
    place: { name: string; location: string | null } | null;
  } | null;
  meeting: {
    id: string;
    status: string;
    startsAt: string;
    place: { name: string; location: string | null } | null;
  } | null;
};

async function decodeQrFromFile(file: File): Promise<string | null> {
  const jsQR = (await import('jsqr')).default;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(image.data, image.width, image.height);
  return result?.data ?? null;
}

export function QrExchangePanel({
  requestsHref,
  meetingsHref,
  initialCode,
}: {
  requestsHref: string;
  meetingsHref: string;
  /** When opened from /qr/[code] */
  initialCode?: string;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<QrResolve | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [meetNowOpen, setMeetNowOpen] = useState(false);
  const [nowWindow, setNowWindow] = useState<NowWindow | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [nowLoading, setNowLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimer = useRef<number | null>(null);

  function openBookingChoice() {
    if (!resolved?.canBook) return;
    trackEvent('qr_book_started', {
      code: resolved.code,
      toOrgId: resolved.toOrgId ?? '',
    });
    setScheduleError(null);
    setChoiceOpen(true);
  }

  async function openMeetNow() {
    if (!resolved?.fromOrgId || !resolved.toOrgId) return;
    setChoiceOpen(false);
    setMeetNowOpen(true);
    setNowLoading(true);
    setSelectedPlaceId(null);
    setScheduleError(null);
    try {
      const data = await apiFetch<NowWindow>(
        `/meeting-requests/now-window?fromOrgId=${encodeURIComponent(resolved.fromOrgId)}&toOrgId=${encodeURIComponent(resolved.toOrgId)}`,
        { token: getAccessToken() },
      );
      setNowWindow(data);
      trackEvent('qr_meet_now', { code: resolved.code, step: 'places' });
    } catch (err) {
      setScheduleError((err as Error).message);
      setNowWindow(null);
    } finally {
      setNowLoading(false);
    }
  }

  const myQr = useQuery({
    queryKey: ['qr-me'],
    queryFn: () =>
      apiFetch<MyQr>('/qr/me', { token: getAccessToken() }),
  });

  useEffect(() => {
    if (!myQr.data?.deepLink) return;
    let cancelled = false;
    trackEvent('qr_view', { code: myQr.data.code });
    setQrError(null);

    async function renderQr() {
      const payload = myQr.data;
      if (!payload) return;

      if (payload.pngDataUrl) {
        if (!cancelled) setDataUrl(payload.pngDataUrl);
        return;
      }

      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(payload.deepLink, {
          width: 512,
          margin: 2,
          color: { dark: '#0a0a0a', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) setDataUrl(url);
      } catch (err) {
        // Last-resort image so the user still gets a scannable code.
        const fallback = `https://quickchart.io/qr?text=${encodeURIComponent(payload.deepLink)}&size=512&margin=2`;
        if (!cancelled) {
          setDataUrl(fallback);
          setQrError(
            err instanceof Error
              ? err.message
              : 'Used fallback QR renderer',
          );
        }
      }
    }

    void renderQr();
    return () => {
      cancelled = true;
    };
  }, [myQr.data]);

  const resolve = useMutation({
    mutationFn: (input: { code?: string; url?: string }) =>
      apiFetch<QrResolve>('/qr/resolve', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      trackEvent('qr_scan', {
        relationship: data.relationship,
        code: data.code,
      });
      setResolved(data);
      // Preview peer profiles immediately; skip self (API blocks own public profile).
      if (
        data.profile &&
        !['INVALID', 'SELF'].includes(data.relationship)
      ) {
        setProfileOpen(true);
      }
    },
    onError: (err) => setScanError((err as Error).message),
  });

  const createRequest = useMutation({
    mutationFn: (input: {
      fromOrgId: string;
      toOrgId: string;
      startsAt?: string;
      placeId: string;
      mode?: 'SCHEDULED' | 'NOW';
    }) =>
      apiFetch('/meeting-requests', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify(input),
      }),
    onSuccess: async (_data, vars) => {
      setScheduleOpen(false);
      setMeetNowOpen(false);
      setChoiceOpen(false);
      setResolved(null);
      setProfileOpen(false);
      setNowWindow(null);
      if (vars.mode === 'NOW') {
        trackEvent('qr_meet_now', { code: 'sent', step: 'created' });
      }
      await qc.invalidateQueries({ queryKey: ['meeting-requests'] });
      await qc.invalidateQueries({ queryKey: ['recommendations'] });
    },
    onError: (err) => setScheduleError((err as Error).message),
  });

  useEffect(() => {
    if (!initialCode) return;
    resolve.mutate({ code: initialCode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const stopCamera = () => {
    if (detectTimer.current) {
      window.clearInterval(detectTimer.current);
      detectTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!scanOpen) {
      stopCamera();
      return;
    }
    let cancelled = false;
    (async () => {
      setScanError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (opts: {
              formats: string[];
            }) => {
              detect: (
                source: CanvasImageSource,
              ) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;

        if (Detector && videoRef.current) {
          const detector = new Detector({ formats: ['qr_code'] });
          detectTimer.current = window.setInterval(() => {
            void (async () => {
              if (!videoRef.current) return;
              try {
                const codes = await detector.detect(videoRef.current);
                const value = codes[0]?.rawValue;
                if (value) {
                  stopCamera();
                  setScanOpen(false);
                  resolve.mutate({ url: value });
                }
              } catch {
                // keep scanning
              }
            })();
          }, 700);
        }
      } catch {
        setScanError(
          'Camera unavailable. Upload a QR image from your gallery instead.',
        );
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen]);

  const statusLabel = useMemo(() => {
    if (!resolved) return null;
    switch (resolved.relationship) {
      case 'SELF':
        return 'Your QR';
      case 'SCHEDULED':
        return 'Meeting already booked';
      case 'OPEN_REQUEST':
        return 'Open request';
      case 'SAME_TYPE':
        return 'Same side';
      case 'INVALID':
        return 'Invalid QR';
      default:
        return 'Ready to book';
    }
  }, [resolved]);

  async function downloadPng() {
    if (!dataUrl || !myQr.data) return;
    trackEvent('qr_share', { method: 'download', code: myQr.data.code });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ethara-qr-${myQr.data.code}.png`;
    a.click();
  }

  async function shareQr() {
    if (!myQr.data) return;
    trackEvent('qr_share', { method: 'share', code: myQr.data.code });
    try {
      if (navigator.share) {
        const blob = dataUrl
          ? await (await fetch(dataUrl)).blob()
          : null;
        const files =
          blob != null
            ? [new File([blob], `ethara-qr-${myQr.data.code}.png`, { type: 'image/png' })]
            : undefined;
        await navigator.share({
          title: `${myQr.data.name} · Ethara`,
          text: `Scan to meet ${myQr.data.name} on Ethara`,
          url: myQr.data.deepLink,
          files,
        });
        return;
      }
    } catch {
      // fall through to clipboard
    }
    await navigator.clipboard.writeText(myQr.data.deepLink);
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                My QR
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                Share your meeting code
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Others scan this to view your public profile and request a
                meeting.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--accent-soft)] p-3 text-[var(--accent-hover)]">
              <QrCode className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 flex flex-col items-center gap-4">
            <div className="rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,#0a0a0a_0%,#12221f_100%)] p-5 shadow-[var(--shadow)]">
              <div className="rounded-2xl bg-white p-3">
                {dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dataUrl}
                    alt="Your Ethara meeting QR"
                    className="h-52 w-52"
                  />
                ) : (
                  <div className="flex h-52 w-52 items-center justify-center text-sm text-[var(--muted)]">
                    {myQr.isError
                      ? 'Unavailable'
                      : myQr.isLoading
                        ? 'Loading…'
                        : 'Generating…'}
                  </div>
                )}
              </div>
              <p className="mt-3 text-center text-xs font-semibold tracking-[0.14em] text-[var(--accent)]">
                ETHARA · {myQr.data?.code ?? '—'}
              </p>
            </div>
            <p className="text-center text-sm font-semibold">
              {myQr.isError
                ? 'Could not load your QR'
                : (myQr.data?.name ?? 'Loading…')}
            </p>
            {myQr.isError ? (
              <div className="w-full max-w-sm space-y-2 text-center">
                <p className="text-sm text-rose-700">
                  {(myQr.error as Error)?.message ||
                    'Failed to load your meeting QR code.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void myQr.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : null}
            {qrError && dataUrl ? (
              <p className="max-w-sm text-center text-xs text-[var(--muted)]">
                {qrError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void downloadPng()} disabled={!dataUrl}>
                <Download className="mr-2 h-4 w-4" />
                Save image
              </Button>
              <Button
                variant="outline"
                onClick={() => void shareQr()}
                disabled={!myQr.data}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Scan
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                Meet someone nearby
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Scan with your camera or upload a QR saved in the gallery.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--accent-soft)] p-3 text-[var(--accent-hover)]">
              <ScanLine className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {scanOpen ? (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[4/3] w-full object-cover"
                  muted
                  playsInline
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-elevated)] px-4 py-10 text-center text-sm text-[var(--muted)]">
                Camera preview appears when you start scanning.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setScanOpen((v) => !v)}
                variant={scanOpen ? 'outline' : 'default'}
              >
                <ScanLine className="mr-2 h-4 w-4" />
                {scanOpen ? 'Stop camera' : 'Scan with camera'}
              </Button>
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload from gallery
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  void (async () => {
                    setScanError(null);
                    const value = await decodeQrFromFile(file);
                    if (!value) {
                      setScanError('Could not read a QR code in that image.');
                      return;
                    }
                    resolve.mutate({ url: value });
                  })();
                }}
              />
            </div>

            {scanError ? (
              <p className="text-sm text-rose-700">{scanError}</p>
            ) : null}
            {resolve.isPending ? (
              <p className="text-sm text-[var(--muted)]">Checking QR…</p>
            ) : null}

            {resolved ? (
              <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{statusLabel}</Badge>
                  {resolved.profile ? (
                    <p className="font-semibold">{resolved.profile.name}</p>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {resolved.message}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {resolved.profile && resolved.relationship !== 'INVALID' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setProfileOpen(true)}
                    >
                      View profile
                    </Button>
                  ) : null}
                  {resolved.canBook ? (
                    <Button size="sm" onClick={openBookingChoice}>
                      Book meeting
                    </Button>
                  ) : null}
                  {resolved.relationship === 'OPEN_REQUEST' ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        window.location.href = requestsHref;
                      }}
                    >
                      Open requests
                    </Button>
                  ) : null}
                  {resolved.relationship === 'SCHEDULED' ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        window.location.href = meetingsHref;
                      }}
                    >
                      Open meetings
                    </Button>
                  ) : null}
                </div>
                {resolved.meeting ? (
                  <p className="mt-3 text-sm">
                    {new Date(resolved.meeting.startsAt).toLocaleString()}
                    {resolved.meeting.place
                      ? ` · ${resolved.meeting.place.name}`
                      : ''}
                  </p>
                ) : null}
                {resolved.openRequest ? (
                  <p className="mt-3 text-sm">
                    Status: {resolved.openRequest.status.replaceAll('_', ' ')}
                    {resolved.openRequest.place
                      ? ` · ${resolved.openRequest.place.name}`
                      : ''}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <RecommendationProfileModal
        organizationId={
          profileOpen && resolved?.profile
            ? resolved.profile.organizationId
            : null
        }
        open={profileOpen && Boolean(resolved?.profile)}
        onClose={() => setProfileOpen(false)}
        onRequestMeeting={
          resolved?.canBook
            ? () => {
                setProfileOpen(false);
                openBookingChoice();
              }
            : undefined
        }
      />

      <Modal
        open={choiceOpen}
        title={`Meet ${resolved?.profile?.name ?? 'partner'}?`}
        description="Start immediately at a free table, or schedule a time for later."
        onClose={() => setChoiceOpen(false)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4 text-left transition hover:border-[var(--accent)]"
            onClick={() => void openMeetNow()}
          >
            <Zap className="mb-2 h-5 w-5 text-[var(--accent-hover)]" />
            <p className="font-semibold">Meet now</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Pick a free table for the next slot. They confirm within 10
              minutes.
            </p>
          </button>
          <button
            type="button"
            className="rounded-2xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--accent)]"
            onClick={() => {
              setChoiceOpen(false);
              setScheduleOpen(true);
            }}
          >
            <ScanLine className="mb-2 h-5 w-5 text-[var(--muted)]" />
            <p className="font-semibold">Schedule for later</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Choose a mutual free date, time, and place.
            </p>
          </button>
        </div>
      </Modal>

      <Modal
        open={meetNowOpen}
        title="Meet now — free tables"
        description={
          nowWindow
            ? `Slot ${new Date(nowWindow.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${nowWindow.durationMinutes} min · confirm within ${nowWindow.confirmWithinMinutes} min`
            : 'Loading free tables for the next slot…'
        }
        onClose={() => {
          if (createRequest.isPending) return;
          setMeetNowOpen(false);
          setScheduleError(null);
        }}
        wide
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setMeetNowOpen(false)}
              disabled={createRequest.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !selectedPlaceId ||
                !nowWindow?.partiesFree ||
                createRequest.isPending
              }
              loading={createRequest.isPending}
              onClick={() => {
                if (!resolved?.fromOrgId || !resolved.toOrgId || !selectedPlaceId)
                  return;
                createRequest.mutate({
                  fromOrgId: resolved.fromOrgId,
                  toOrgId: resolved.toOrgId,
                  placeId: selectedPlaceId,
                  mode: 'NOW',
                });
              }}
            >
              Send meet-now request
            </Button>
          </div>
        }
      >
        {nowLoading ? (
          <p className="text-sm text-[var(--muted)]">Finding free tables…</p>
        ) : null}
        {scheduleError ? (
          <p className="mb-3 text-sm text-rose-700">{scheduleError}</p>
        ) : null}
        {nowWindow && !nowWindow.partiesFree ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-4 py-3 text-sm text-[var(--muted)]">
            {nowWindow.message ||
              'One of you is busy right now. Schedule for later instead.'}
          </p>
        ) : null}
        {nowWindow && nowWindow.partiesFree && nowWindow.places.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No free tables in this slot. Try schedule for later.
          </p>
        ) : null}
        {nowWindow && nowWindow.places.length > 0 ? (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {nowWindow.places.map((place) => {
              const selected = selectedPlaceId === place.id;
              return (
                <button
                  key={place.id}
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                  }`}
                  onClick={() => setSelectedPlaceId(place.id)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hover)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{place.name}</span>
                    <span className="mt-0.5 block text-sm text-[var(--muted)]">
                      {place.location || 'Location TBA'}
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    {place.code}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </Modal>

      <MeetingSchedulePicker
        open={scheduleOpen}
        title={`Request meeting${resolved?.profile ? ` · ${resolved.profile.name}` : ''}`}
        counterpartName={resolved?.profile?.name}
        fromOrgId={resolved?.fromOrgId}
        toOrgId={resolved?.toOrgId}
        submitting={createRequest.isPending}
        error={scheduleError}
        onClose={() => {
          if (createRequest.isPending) return;
          setScheduleOpen(false);
          setScheduleError(null);
        }}
        onConfirm={({ startsAt, placeId }) => {
          if (!resolved?.fromOrgId || !resolved.toOrgId) return;
          createRequest.mutate({
            fromOrgId: resolved.fromOrgId,
            toOrgId: resolved.toOrgId,
            startsAt,
            placeId,
            mode: 'SCHEDULED',
          });
        }}
      />
    </>
  );
}
