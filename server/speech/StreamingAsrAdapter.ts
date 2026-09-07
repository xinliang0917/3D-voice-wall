import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { detectLanguageCode, getLanguageName, normalizeLanguageCode } from './language';
import type {
  SpeechStreamingAdapter,
  SpeechStreamingCallbacks,
  SpeechStreamingSession,
  SpeechTranscriptionRequest,
  SpeechTranscriptionResult,
} from './types';

interface StreamingAsrOptions {
  wsUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  vendor: 'dashscope' | 'unisound';
}

const PCM_SAMPLE_RATE = 16000;
const MAX_PENDING_CHUNKS = 8192;
const MAX_PENDING_PCM_BYTES = 8 * 1024 * 1024;
const IDLE_FLUSH_MS = 1500;
const MAX_TASK_DURATION_MS = 20000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function removeEmoji(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function errorWithCode(message: string, code: string): Error {
  const error = new Error(message);
  (error as { code?: string }).code = code;
  return error;
}

interface DashScopeSentence {
  sentence_id?: number;
  text?: string;
  sentence_end?: boolean;
}

interface DashScopeMessage {
  header?: {
    event?: string;
    task_id?: string;
    error_message?: string;
  };
  payload?: {
    output?: {
      sentence?: DashScopeSentence;
    };
  };
}

interface UnisoundMessage {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  type?: string;
  text?: string;
  varText?: string;
  showText?: string;
  end?: boolean;
  language?: string;
}

const UNISOUND_LANGUAGES = new Set([
  'zh-CN',
  'en-US',
  'ar-SA',
  'de-DE',
  'es-MX',
  'fr-FR',
  'id-ID',
  'ja-JP',
  'ko-KR',
  'pt-BR',
  'ru-RU',
  'tr-TR',
  'vi-VN',
  'th-TH',
  'it-IT',
]);

function mapUnisoundLanguage(hint: string | null): string {
  if (!hint) return '';
  const normalized = hint.trim();
  if (UNISOUND_LANGUAGES.has(normalized)) return normalized;
  const base = normalized.split('-')[0].toLowerCase();
  for (const code of UNISOUND_LANGUAGES) {
    if (code.split('-')[0].toLowerCase() === base) return code;
  }
  return '';
}

class StreamingAsrSession implements SpeechStreamingSession {
  private readonly options: StreamingAsrOptions;
  private readonly callbacks: SpeechStreamingCallbacks;
  private languageHint: string | null = null;

  private cloudWs: WebSocket | null = null;
  private ffmpeg: ChildProcessWithoutNullStreams | null = null;
  private taskId: string | null = null;
  private taskStarted = false;
  private finishSent = false;
  private flushing = false;
  private stopped = false;
  private reportedError = false;
  private closing = false;
  private flushingPromise: Promise<void> | null = null;

  private pendingChunks: Buffer[] = [];
  private queuedChunks: Buffer[] = [];
  private pendingPcm: Buffer[] = [];
  private pendingPcmBytes = 0;
  private pumping = false;
  private pcmSending = false;
  private lastFinalSentenceId: number | null = null;

  private ensurePromise: Promise<void> | null = null;
  private ensureResolve: (() => void) | null = null;
  private ensureReject: ((error: Error) => void) | null = null;

  private ffmpegClosePromise: Promise<void> = Promise.resolve();
  private ffmpegCloseResolve: (() => void) | null = null;
  private taskFinishedPromise: Promise<void> = Promise.resolve();
  private taskFinishedResolve: (() => void) | null = null;
  private startTimeout: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private maxTaskTimer: NodeJS.Timeout | null = null;
  private finalEmittedForTask = false;

  constructor(options: StreamingAsrOptions, callbacks: SpeechStreamingCallbacks) {
    this.options = options;
    this.callbacks = callbacks;
  }

  setLanguageHint(languageHint: string | null): void {
    this.languageHint = languageHint;
  }

  feed(chunk: Buffer): void {
    if (this.stopped) return;
    this.scheduleIdleFlush();

    if (this.flushing) {
      this.queuedChunks.push(chunk);
      if (this.queuedChunks.length > MAX_PENDING_CHUNKS) {
        this.fail(errorWithCode('语音流数据积压过多', 'asr'));
      }
      return;
    }

    this.pendingChunks.push(chunk);
    if (this.pendingChunks.length > MAX_PENDING_CHUNKS) {
      this.fail(errorWithCode('语音流数据积压过多', 'asr'));
      return;
    }
    void this.ensureStarted();
  }

  async flush(): Promise<void> {
    if (this.flushingPromise) return this.flushingPromise;
    if (this.stopped) return;

    if (!this.ffmpeg && !this.cloudWs && this.pendingChunks.length === 0) {
      this.queuedChunks = [];
      return;
    }

    this.flushing = true;
    this.flushingPromise = this.doFlush().finally(() => {
      this.flushingPromise = null;
    });
    return this.flushingPromise;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearStartTimeout();
    this.clearIdleTimer();
    this.clearMaxTaskTimer();
    this.closeCloudSocket();
    this.disposeFfmpeg();
    this.pendingChunks = [];
    this.queuedChunks = [];
    this.ensureReject?.(errorWithCode('语音识别已停止', 'network'));
    this.ensureReject = null;
  }

  private async doFlush(): Promise<void> {
    this.clearIdleTimer();
    this.clearMaxTaskTimer();
    try {
      try {
        if (this.ensurePromise) await this.ensurePromise;
      } catch {
        // The streaming error has already been reported through callbacks.
      }

      this.pump();
      const drainStartedAt = Date.now();
      while (this.pendingChunks.length > 0) {
        this.pump();
        if (Date.now() - drainStartedAt > 15000) {
          this.pendingChunks = [];
          break;
        }
        await delay(10);
      }

      const ffmpeg = this.ffmpeg;
      if (ffmpeg && !ffmpeg.stdin.destroyed) {
        ffmpeg.stdin.end();
      }

      if (ffmpeg) {
        await Promise.race([this.ffmpegClosePromise, delay(15000)]);
      }

      await this.drainPcmQueue();

      if (this.taskStarted && !this.finishSent) {
        this.sendFinishTask();
      }

      await Promise.race([this.taskFinishedPromise, delay(15000)]);
    } finally {
      this.closeCloudSocket();
      this.disposeFfmpeg();
      this.resetForNextSegment();
    }
  }

  private ensureStarted(): Promise<void> {
    if (this.ensurePromise) return this.ensurePromise;
    if (this.stopped || this.flushing || this.taskStarted || this.pendingChunks.length === 0) {
      return Promise.resolve();
    }

    this.ensurePromise = new Promise<void>((resolve, reject) => {
      this.ensureResolve = resolve;
      this.ensureReject = reject;
      this.startTask();
    });
    this.ensurePromise.catch(() => undefined);
    return this.ensurePromise;
  }

  private startTask(): void {
    this.taskId = randomUUID().replace(/-/g, '').slice(0, 32);
    this.taskStarted = false;
    this.finishSent = false;
    this.finalEmittedForTask = false;
    this.spawnFfmpeg();
    this.openCloudSocket();
  }

  private buildStartMessage(): string {
    if (this.options.vendor === 'unisound') {
      const payload: Record<string, string> = {
        type: 'start',
        request_id: this.taskId ?? '',
        format: 'pcm',
        sample: '16k',
        enable_auto_lang: 'true',
        variable: 'true',
        punctuation: 'true',
        post_proc: 'true',
        server_vad: 'false',
        max_start_silence: '2000',
        max_end_silence: '500',
      };
      const language = mapUnisoundLanguage(this.languageHint);
      if (language) payload.language = language;
      return JSON.stringify(payload);
    }

    return JSON.stringify({
      header: {
        action: 'run-task',
        task_id: this.taskId,
        streaming: 'duplex',
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: this.options.model,
        parameters: {
          sample_rate: PCM_SAMPLE_RATE,
          format: 'pcm',
        },
        input: {},
      },
    });
  }

  private buildFinishMessage(): string {
    if (this.options.vendor === 'unisound') {
      return JSON.stringify({ type: 'end' });
    }

    return JSON.stringify({
      header: {
        action: 'finish-task',
        task_id: this.taskId,
        streaming: 'duplex',
      },
      payload: {
        input: {},
      },
    });
  }

  private markTaskStarted(): void {
    this.clearStartTimeout();
    this.taskStarted = true;
    this.scheduleMaxTaskTimer();
    this.ensureResolve?.();
    this.ensureResolve = null;
    this.ensureReject = null;
    this.pump();
  }

  private spawnFfmpeg(): void {
    this.ffmpegClosePromise = new Promise<void>((resolve) => {
      this.ffmpegCloseResolve = resolve;
    });

    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-f',
      's16le',
      '-ar',
      String(PCM_SAMPLE_RATE),
      '-ac',
      '1',
      '-acodec',
      'pcm_s16le',
      'pipe:1',
    ]);
    this.ffmpeg = child;

    child.stdout.on('data', (chunk: Buffer) => {
      this.pendingPcm.push(chunk);
      this.pendingPcmBytes += chunk.length;
      if (this.pendingPcmBytes > MAX_PENDING_PCM_BYTES) {
        this.fail(errorWithCode('音频缓冲区溢出', 'asr'));
        return;
      }
      this.pumpPcm();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const message = String(chunk).trim();
      if (message) console.warn('[ffmpeg]', message);
    });

    child.on('error', (error) => {
      this.fail(errorWithCode(`ffmpeg 启动失败: ${error.message}`, 'asr'));
    });

    child.on('close', (code) => {
      if (this.ffmpeg === child) this.ffmpeg = null;
      if (this.ffmpegCloseResolve) {
        this.ffmpegCloseResolve();
        this.ffmpegCloseResolve = null;
      }
      if (code !== 0 && !this.stopped) {
        this.fail(errorWithCode(`ffmpeg 退出码 ${code}`, 'asr'));
        return;
      }
    });
  }

  private openCloudSocket(): void {
    this.closing = false;
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.wsUrl, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
      });
    } catch {
      this.fail(errorWithCode('无法连接云端语音服务', 'network'));
      return;
    }
    this.cloudWs = socket;

    this.startTimeout = setTimeout(() => {
      if (!this.taskStarted) {
        this.fail(errorWithCode('云端语音任务启动超时', 'timeout'));
        socket.close();
      }
    }, 15000);

    socket.on('open', () => {
      socket.send(this.buildStartMessage());
      if (this.options.vendor === 'unisound') {
        this.markTaskStarted();
      }
    });

    socket.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString();
      this.handleCloudMessage(text);
    });

    socket.on('error', (error) => {
      this.clearStartTimeout();
      const message = error instanceof Error ? error.message : String(error);
      const code = /401|403/i.test(message)
        ? 'auth'
        : /timeout/i.test(message)
          ? 'timeout'
          : 'network';
      this.fail(errorWithCode(message || '云端语音连接错误', code));
    });

    socket.on('close', () => {
      this.clearStartTimeout();
      if (this.cloudWs !== socket) return;
      this.cloudWs = null;
      if (!this.stopped && !this.closing && !this.flushing && !this.reportedError) {
        this.fail(errorWithCode('云端语音连接断开', 'network'));
      }
    });
  }

  private handleCloudMessage(data: string): void {
    let message: DashScopeMessage | UnisoundMessage;
    try {
      message = JSON.parse(data) as DashScopeMessage | UnisoundMessage;
    } catch {
      return;
    }

    if (this.options.vendor === 'unisound') {
      this.handleUnisoundMessage(message as UnisoundMessage);
      return;
    }

    const dashscopeMessage = message as DashScopeMessage;
    const event = dashscopeMessage.header?.event;
    if (event === 'task-started') {
      this.markTaskStarted();
      return;
    }

    if (event === 'result-generated') {
      const sentence = dashscopeMessage.payload?.output?.sentence;
      const rawText = sentence?.text ?? '';
      const text = removeEmoji(rawText);
      if (!text) return;

      const sentenceId = sentence?.sentence_id ?? null;
      const isFinal = sentence?.sentence_end === true;
      const languageCode = detectLanguageCode(text);
      const result: SpeechTranscriptionResult = {
        text,
        languageCode,
        language: getLanguageName(languageCode),
        confidence: 0.95,
      };

      if (isFinal) {
        if (sentenceId !== null && this.lastFinalSentenceId === sentenceId) return;
        if (sentenceId !== null) this.lastFinalSentenceId = sentenceId;
        this.callbacks.onFinal(result);
      } else {
        this.callbacks.onPartial(result);
      }
      return;
    }

    if (event === 'task-finished') {
      this.taskFinishedResolve?.();
      this.taskFinishedResolve = null;
      return;
    }

    if (event === 'task-failed') {
      const rawMessage = dashscopeMessage.header?.error_message ?? '云端语音任务失败';
      const code = /timeout/i.test(rawMessage) ? 'timeout' : 'asr';
      this.fail(errorWithCode(rawMessage, code));
    }
  }

  private handleUnisoundMessage(message: UnisoundMessage): void {
    const statusCode = message.base_resp?.status_code ?? 0;
    if (statusCode !== 0) {
      const rawMessage = message.base_resp?.status_msg ?? `Unisound error ${statusCode}`;
      const code = /timeout/i.test(rawMessage) ? 'timeout' : 'asr';
      this.fail(errorWithCode(rawMessage, code));
      return;
    }

    const rawText = message.showText ?? message.text ?? '';
    const text = removeEmoji(rawText);
    const isEnd = message.end === true;
    const isFixed = message.type === 'fixed';

    if (text && isFixed && !this.finalEmittedForTask) {
      this.finalEmittedForTask = true;
      const languageCode = normalizeLanguageCode(
        message.language ?? '',
        detectLanguageCode(text),
      );
      this.callbacks.onFinal({
        text,
        languageCode,
        language: getLanguageName(languageCode),
        confidence: 0.95,
      });
    } else if (text && !isFixed) {
      const languageCode = detectLanguageCode(text);
      this.callbacks.onPartial({
        text,
        languageCode,
        language: getLanguageName(languageCode),
        confidence: 0.9,
      });
    }

    if (isEnd) {
      if (text && !this.finalEmittedForTask) {
        this.finalEmittedForTask = true;
        const languageCode = normalizeLanguageCode(
          message.language ?? '',
          detectLanguageCode(text),
        );
        this.callbacks.onFinal({
          text,
          languageCode,
          language: getLanguageName(languageCode),
          confidence: 0.95,
        });
      }
      this.taskFinishedResolve?.();
      this.taskFinishedResolve = null;
    }
  }

  private pumpPcm(): void {
    if (this.pendingPcm.length === 0) return;
    if (this.options.vendor !== 'unisound') {
      this.pumpPcmSync();
      return;
    }
    if (this.pcmSending) return;
    this.pcmSending = true;
    void this.pumpPcmUnisound();
  }

  private pumpPcmSync(): void {
    while (this.pendingPcm.length > 0) {
      if (!this.cloudWs || this.cloudWs.readyState !== WebSocket.OPEN || !this.taskStarted) return;
      const chunk = this.pendingPcm.shift()!;
      this.pendingPcmBytes -= chunk.length;
      this.cloudWs.send(chunk);
    }
  }

  private async pumpPcmUnisound(): Promise<void> {
    try {
      while (this.pendingPcm.length > 0) {
        if (!this.cloudWs || this.cloudWs.readyState !== WebSocket.OPEN || !this.taskStarted) return;
        const chunk = this.pendingPcm.shift()!;
        this.pendingPcmBytes -= chunk.length;
        const frameSize = 4096;
        for (let offset = 0; offset < chunk.length; offset += frameSize) {
          if (!this.cloudWs || this.cloudWs.readyState !== WebSocket.OPEN || !this.taskStarted) return;
          this.cloudWs.send(chunk.subarray(offset, Math.min(offset + frameSize, chunk.length)));
          await delay(20);
        }
      }
    } finally {
      this.pcmSending = false;
    }
  }

  private async drainPcmQueue(): Promise<void> {
    const drainStartedAt = Date.now();
    while (
      (this.pendingPcm.length > 0 || this.pcmSending) &&
      Date.now() - drainStartedAt < 20000
    ) {
      this.pumpPcm();
      await delay(10);
    }
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    this.pumpNext();
  }

  private pumpNext(): void {
    if (this.pendingChunks.length === 0 || !this.taskStarted || !this.ffmpeg) {
      this.pumping = false;
      return;
    }

    const chunk = this.pendingChunks.shift()!;
    if (this.ffmpeg.stdin.write(chunk)) {
      setImmediate(() => this.pumpNext());
    } else {
      this.ffmpeg.stdin.once('drain', () => this.pumpNext());
    }
  }

  private sendFinishTask(): void {
    if (this.finishSent || !this.cloudWs || this.cloudWs.readyState !== WebSocket.OPEN || !this.taskId) {
      return;
    }
    this.finishSent = true;
    this.taskFinishedPromise = new Promise<void>((resolve) => {
      this.taskFinishedResolve = resolve;
    });
    this.cloudWs.send(this.buildFinishMessage());
  }

  private resetForNextSegment(): void {
    this.cloudWs = null;
    this.ffmpeg = null;
    this.taskId = null;
    this.taskStarted = false;
    this.finishSent = false;
    this.finalEmittedForTask = false;
    this.lastFinalSentenceId = null;
    this.pendingPcm = [];
    this.pendingPcmBytes = 0;
    this.pendingChunks = this.queuedChunks;
    this.queuedChunks = [];
    this.flushing = false;
    this.ensurePromise = null;
    this.ensureResolve = null;
    this.ensureReject = null;
    if (this.pendingChunks.length > 0) {
      void this.ensureStarted();
      this.scheduleIdleFlush();
    }
  }

  private closeCloudSocket(): void {
    this.closing = true;
    if (this.cloudWs && this.cloudWs.readyState === WebSocket.OPEN) {
      this.cloudWs.close(1000, 'ok');
    }
    this.cloudWs = null;
    this.taskFinishedResolve = null;
  }

  private disposeFfmpeg(): void {
    const child = this.ffmpeg;
    this.ffmpeg = null;
    if (!child) return;
    if (!child.stdin.destroyed) child.stdin.destroy();
    child.kill();
  }

  private clearStartTimeout(): void {
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
  }

  private scheduleIdleFlush(): void {
    this.clearIdleTimer();
    if (this.stopped || this.flushing) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (
        !this.stopped &&
        !this.flushing &&
        (this.taskStarted || this.ensurePromise || this.pendingChunks.length > 0 || this.queuedChunks.length > 0)
      ) {
        void this.flush();
      }
    }, IDLE_FLUSH_MS);
  }

  private scheduleMaxTaskTimer(): void {
    this.clearMaxTaskTimer();
    if (this.stopped) return;
    this.maxTaskTimer = setTimeout(() => {
      this.maxTaskTimer = null;
      if (!this.stopped && !this.flushing && this.taskStarted) {
        void this.flush();
      }
    }, MAX_TASK_DURATION_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private clearMaxTaskTimer(): void {
    if (this.maxTaskTimer) {
      clearTimeout(this.maxTaskTimer);
      this.maxTaskTimer = null;
    }
  }

  private fail(error: Error): void {
    if (this.reportedError) return;
    this.reportedError = true;
    this.clearStartTimeout();
    this.clearIdleTimer();
    this.clearMaxTaskTimer();
    this.ensureReject?.(error);
    this.ensureReject = null;
    this.callbacks.onError(error);
    void this.stop();
  }
}

export class StreamingAsrAdapter implements SpeechStreamingAdapter {
  readonly name = 'cloud';
  readonly streaming = true as const;

  constructor(private readonly options: StreamingAsrOptions) {}

  async transcribe(_request: SpeechTranscriptionRequest): Promise<SpeechTranscriptionResult> {
    throw new Error('流式语音识别不支持一次性转写');
  }

  createSession(callbacks: SpeechStreamingCallbacks): SpeechStreamingSession {
    return new StreamingAsrSession(this.options, callbacks);
  }
}
