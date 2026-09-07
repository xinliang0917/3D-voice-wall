import 'dotenv/config';

export interface ServerConfig {
  port: number;
  wsPath: string;
  speechProvider: 'cloud' | 'mock';
  speechApiUrl: string;
  speechWsUrl: string;
  speechApiKey: string;
  speechModel: string;
  speechLanguageHint: string | null;
  asrTimeoutMs: number;
  maxSegmentBytes: number;
  autoRetryZh: boolean;
  speechAutoLanguages: string[];
  speechStreaming: boolean;
  speechVendor: 'dashscope' | 'unisound';
}

export const serverConfig: ServerConfig = {
  port: Number(process.env.PORT ?? 8787),
  wsPath: process.env.WS_PATH?.trim() || '/ws/speech',
  speechProvider: process.env.SPEECH_PROVIDER === 'mock' ? 'mock' : 'cloud',
  speechApiUrl: process.env.SPEECH_API_URL?.trim() ?? '',
  speechWsUrl: process.env.SPEECH_WS_URL?.trim() || process.env.SPEECH_API_URL?.trim() || '',
  speechApiKey: process.env.SPEECH_API_KEY?.trim() ?? '',
  speechModel: process.env.SPEECH_MODEL?.trim() ?? '',
  speechLanguageHint: process.env.SPEECH_LANGUAGE?.trim() || null,
  asrTimeoutMs: Number(process.env.ASR_TIMEOUT_MS ?? 15000),
  maxSegmentBytes: Number(process.env.MAX_SEGMENT_BYTES ?? 8 * 1024 * 1024),
  autoRetryZh: process.env.SPEECH_AUTO_RETRY_ZH !== 'false',
  speechAutoLanguages: (process.env.SPEECH_AUTO_LANGUAGES ?? 'ja,ko,th,fr,es,de,ru,ar,vi,id')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean),
  speechStreaming: process.env.SPEECH_STREAMING === 'true',
  speechVendor: process.env.SPEECH_VENDOR === 'unisound' ? 'unisound' : 'dashscope',
};
