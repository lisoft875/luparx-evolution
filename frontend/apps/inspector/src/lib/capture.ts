import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Camera and location, on a native build and in a browser, behind one shape.
 *
 * The officer's app ships as a Capacitor build for the street and runs in a browser all day during
 * development, so both have to work. The native plugins are reached through `registerPlugin`
 * rather than a compile-time import of `@capacitor/camera` / `@capacitor/geolocation`: those
 * packages are only present in a native build, and importing them unconditionally makes the web
 * bundle fail to resolve. `Capacitor.isPluginAvailable` answers whether the running container
 * actually implements them, which is the only honest test — `isNativePlatform()` says what kind of
 * shell we are in, not what it can do.
 *
 * Nothing here ever invents a value. A refused camera means no photograph; a refused or failed
 * location means no coordinates, and the citation still gets written and says so.
 */

/** What a caller gets back. `null` in `position` is a fact about the world, never a placeholder. */
export interface CapturedPhoto {
  blob: Blob;
  /** Best-effort local file name; the server decides the real type by reading the file's header. */
  fileName: string;
  /** When the shutter fired, as the device knows it. Sent alongside the bytes. */
  capturedAt: string;
  /** Coordinates of the photograph itself, when the device attached them. */
  latitude?: number;
  longitude?: number;
}

export interface CapturedPosition {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  capturedAt: string;
}

export type PermissionOutcome = 'granted' | 'denied' | 'unavailable';

interface NativeCameraPlugin {
  getPhoto(options: Record<string, unknown>): Promise<{ webPath?: string; dataUrl?: string; format?: string }>;
  checkPermissions?(): Promise<{ camera?: string }>;
  requestPermissions?(): Promise<{ camera?: string }>;
}

interface NativeGeolocationPlugin {
  getCurrentPosition(options?: Record<string, unknown>): Promise<{
    coords: { latitude: number; longitude: number; accuracy?: number };
    timestamp?: number;
  }>;
  checkPermissions?(): Promise<{ location?: string; coarseLocation?: string }>;
  requestPermissions?(): Promise<{ location?: string }>;
}

/**
 * Lazily bound, and bound at most once. `registerPlugin` on a container that does not implement the
 * plugin returns a proxy whose calls reject — which is why availability is checked separately
 * rather than inferred from the binding succeeding.
 */
let cameraPlugin: NativeCameraPlugin | null | undefined;
let geolocationPlugin: NativeGeolocationPlugin | null | undefined;

function nativeCamera(): NativeCameraPlugin | null {
  if (cameraPlugin === undefined) {
    cameraPlugin = Capacitor.isPluginAvailable('Camera')
      ? registerPlugin<NativeCameraPlugin>('Camera')
      : null;
  }
  return cameraPlugin;
}

function nativeGeolocation(): NativeGeolocationPlugin | null {
  if (geolocationPlugin === undefined) {
    geolocationPlugin = Capacitor.isPluginAvailable('Geolocation')
      ? registerPlugin<NativeGeolocationPlugin>('Geolocation')
      : null;
  }
  return geolocationPlugin;
}

export function hasNativeCamera(): boolean {
  return nativeCamera() !== null;
}

export function hasNativeGeolocation(): boolean {
  return nativeGeolocation() !== null;
}

/**
 * Asks for the camera, having already explained why.
 *
 * The explanation is the screen's job and happens before this is called (DESIGN_SYSTEM.md §5, and
 * plain decency): a permission sheet that appears with no context is the one people refuse. On the
 * web there is no separate camera permission for a file input with `capture`, so the answer is
 * `granted` and the real decision happens in the operating system's own picker.
 */
export async function requestCameraPermission(): Promise<PermissionOutcome> {
  const plugin = nativeCamera();
  if (!plugin?.requestPermissions) return 'granted';
  try {
    const result = await plugin.requestPermissions();
    return result.camera === 'granted' || result.camera === 'limited' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function requestLocationPermission(): Promise<PermissionOutcome> {
  const plugin = nativeGeolocation();
  if (plugin?.requestPermissions) {
    try {
      const result = await plugin.requestPermissions();
      return result.location === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unavailable';
  // The browser has no way to ask ahead of the first read; the prompt appears on `getCurrentPosition`.
  return 'granted';
}

/**
 * One photograph from the native camera.
 *
 * Returns `null` when the officer cancelled — cancelling is not an error and must not surface as
 * one. The web path is deliberately NOT here: on the browser a `<input type="file" capture>` is
 * the camera, and an input element belongs to the component that renders it, not to this module.
 */
export async function takeNativePhoto(): Promise<CapturedPhoto | null> {
  const plugin = nativeCamera();
  if (!plugin) return null;
  try {
    const photo = await plugin.getPhoto({
      // `quality: 100` and no `width`/`height`: the file the officer's camera produced is the
      // evidence. Asking Capacitor to resize it would silently alter what the officer saw, which is
      // exactly what a defence months later is entitled to argue about.
      quality: 100,
      allowEditing: false,
      resultType: 'uri',
      source: 'CAMERA',
      saveToGallery: false,
    });
    if (!photo.webPath && !photo.dataUrl) return null;
    const response = await fetch(photo.webPath ?? (photo.dataUrl as string));
    const blob = await response.blob();
    return {
      blob,
      fileName: `evidence.${photo.format ?? 'jpg'}`,
      capturedAt: new Date().toISOString(),
    };
  } catch {
    // Cancelled, or refused after the fact. Either way there is no photograph and no error to show.
    return null;
  }
}

/**
 * Whether location is ALREADY granted on this device — asked without prompting anybody.
 *
 * <p>This is what lets a plate lookup carry a position without turning the app into something that
 * asks for the satellite every time an officer types a plate. The permission is requested exactly
 * where it always was, on the citation form, with its sheet of explanation; the lookup only uses what
 * is already there.</p>
 *
 * <p>Answers `'granted'` only when it is certain. A browser that will not say, or a plugin that is
 * not there, reads as not granted — the honest default, and the one that never records a position
 * the officer did not agree to give.</p>
 */
export async function locationPermissionGranted(): Promise<boolean> {
  const plugin = nativeGeolocation();
  if (plugin && typeof plugin.checkPermissions === 'function') {
    try {
      const status = await plugin.checkPermissions();
      return status?.location === 'granted' || status?.coarseLocation === 'granted';
    } catch {
      return false;
    }
  }
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return false;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    // Some browsers refuse the query itself. Not knowing is not the same as knowing it is granted.
    return false;
  }
}

/**
 * The device's position, once.
 *
 * `enableHighAccuracy` because a citation places a car on a numbered bay, and a 500-metre fix is
 * worse than none: it looks like evidence and is not. The timeout is short on purpose — an officer
 * standing in the street cannot wait thirty seconds for a fix, and a citation without coordinates
 * is a perfectly valid citation.
 */
export async function takePosition(timeoutMs = 10_000): Promise<CapturedPosition | null> {
  const plugin = nativeGeolocation();
  if (plugin) {
    try {
      const result = await plugin.getCurrentPosition({ enableHighAccuracy: true, timeout: timeoutMs });
      return {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracyM: result.coords.accuracy ?? null,
        capturedAt: new Date(result.timestamp ?? Date.now()).toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise<CapturedPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          capturedAt: new Date(position.timestamp).toISOString(),
        }),
      // Refused, unavailable or timed out — three different causes, one honest outcome: no
      // coordinates. The screen says so; it never falls back to a last-known or a zone centroid.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
