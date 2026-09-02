import type { SpeechAdapter, SpeechTranscriptionRequest, SpeechTranscriptionResult } from './types';
import { detectLanguageCode, getLanguageName, normalizeLanguageCode } from './language';
import { isLikelyPinyin } from './pinyin';

export interface CloudSpeechOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  autoRetryZh: boolean;
  autoLanguages: string[];
}

interface CloudTranscriptionResponse {
  text?: unknown;
  language?: unknown;
}

function getFileExtension(contentType: string): string {
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('m4a') || contentType.includes('mp4')) return 'm4a';
  if (contentType.includes('mp3')) return 'mp3';
  return 'webm';
}

function parseText(payload: CloudTranscriptionResponse): string {
  return typeof payload.text === 'string' ? payload.text.trim() : '';
}

export class CloudSpeechAdapter implements SpeechAdapter {
  readonly name = 'cloud';

  constructor(private readonly options: CloudSpeechOptions) {}

  async transcribe(request: SpeechTranscriptionRequest): Promise<SpeechTranscriptionResult> {
    if (!this.options.apiUrl) {
      throw new Error('SPEECH_API_URL is not configured');
    }
    if (!this.options.apiKey) {
      throw new Error('SPEECH_API_KEY is not configured');
    }
    if (!this.options.model) {
      throw new Error('SPEECH_MODEL is not configured');
    }

    const explicitHint = request.languageHint?.split(/[-_]/)[0];
    let payload = await this.transcribeOnce(request, explicitHint);
    let text = parseText(payload);
    if (!text) {
      for (const language of this.options.autoLanguages) {
        try {
          const retryPayload = await this.transcribeOnce(request, language);
          const retryText = parseText(retryPayload);
          if (retryText) {
            console.log(`[speech] auto language fallback: ${language}`);
            payload = retryPayload;
            text = retryText;
            break;
          }
        } catch {
          // Try the next language hint.
        }
      }
      if (!text) {
        throw new Error('ASR returned empty transcription');
      }
    }

    const detectedCode = detectLanguageCode(text);
    const firstLanguageCode = normalizeLanguageCode(
      typeof payload.language === 'string' ? payload.language : detectedCode,
      detectedCode,
    );
    const shouldRetryZh =
      !explicitHint &&
      (isLikelyPinyin(text) || (firstLanguageCode === 'zh-CN' && !/[\u3400-\u9FFF]/.test(text)));

    if (this.options.autoRetryZh && shouldRetryZh) {
      try {
        const retryPayload = await this.transcribeOnce(request, 'zh');
        const retryText = parseText(retryPayload);
        if (retryText && retryText !== text && !isLikelyPinyin(retryText)) {
          payload = retryPayload;
          text = retryText;
        }
      } catch {
        // Keep the first result if the Chinese retry fails.
      }
    }

    const languageCode = normalizeLanguageCode(
      typeof payload.language === 'string' ? payload.language : detectedCode,
      detectedCode,
    );

    return {
      text,
      language: getLanguageName(languageCode),
      languageCode,
      confidence: 0.9,
    };
  }

  private async transcribeOnce(
    request: SpeechTranscriptionRequest,
    languageHint?: string,
  ): Promise<CloudTranscriptionResponse> {
    const form = new FormData();
    const audioBlob = new Blob([new Uint8Array(request.audio)], { type: request.contentType });
    const filename = `speech-${Date.now()}.${getFileExtension(request.contentType)}`;
    form.append('file', audioBlob, filename);
    form.append('model', this.options.model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    if (languageHint) {
      form.append('language', languageHint);
      if (languageHint === 'zh') {
        form.append('prompt', '以下是普通话的句子。');
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(this.options.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: form,
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new Error('ASR rate limited (HTTP 429)');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('ASR API key rejected (HTTP ' + response.status + ')');
      }
      if (!response.ok) {
        const error = new Error(`ASR request failed (HTTP ${response.status})`);
        (error as { code?: string }).code = 'asr';
        throw error;
      }

      return (await response.json()) as CloudTranscriptionResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}
