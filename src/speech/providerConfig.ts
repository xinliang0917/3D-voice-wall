export const SPEECH_PROVIDER =
  (import.meta.env.VITE_SPEECH_PROVIDER as 'cloud' | 'browser' | undefined) ?? 'cloud';

export function resolveCloudWebSocketUrl(): string {
  const configuredUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (configuredUrl) return configuredUrl;

  const configuredPath = (import.meta.env.VITE_WS_PATH as string | undefined)?.trim() || '/ws/speech';
  const wsPath = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${wsPath}`;
}
