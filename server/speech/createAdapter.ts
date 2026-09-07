import { serverConfig } from '../config';
import { CloudSpeechAdapter } from './CloudSpeechAdapter';
import { StreamingAsrAdapter } from './StreamingAsrAdapter';
import { MockSpeechAdapter } from './MockSpeechAdapter';
import type { SpeechAdapter, SpeechStreamingAdapter } from './types';

export type SpeechAdapterLike = SpeechAdapter | SpeechStreamingAdapter;

export function createSpeechAdapter(): SpeechAdapterLike {
  if (serverConfig.speechProvider === 'mock') {
    return new MockSpeechAdapter();
  }

  if (serverConfig.speechStreaming) {
    return new StreamingAsrAdapter({
      wsUrl: serverConfig.speechWsUrl,
      apiKey: serverConfig.speechApiKey,
      model: serverConfig.speechModel,
      timeoutMs: serverConfig.asrTimeoutMs,
      vendor: serverConfig.speechVendor,
    });
  }

  return new CloudSpeechAdapter({
    apiUrl: serverConfig.speechApiUrl,
    apiKey: serverConfig.speechApiKey,
    model: serverConfig.speechModel,
    timeoutMs: serverConfig.asrTimeoutMs,
    autoRetryZh: serverConfig.autoRetryZh,
    autoLanguages: serverConfig.speechAutoLanguages,
  });
}

export function isStreamingSpeechAdapter(
  adapter: SpeechAdapterLike,
): adapter is SpeechStreamingAdapter {
  return 'streaming' in adapter && adapter.streaming === true;
}
