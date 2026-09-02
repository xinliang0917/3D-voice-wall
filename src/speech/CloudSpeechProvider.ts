import type { SpeechResult, SpeechStatus } from '../types/voice';
import { SpeechError } from './SpeechError';
import type { SpeechRecognitionProvider } from './SpeechRecognitionProvider';

interface CloudSpeechOptions {
  url: string;
  languageHint?: string;
  streaming?: boolean;
  onAnalyser?: (analyser: AnalyserNode) => void;
}

interface CloudServerMessage {
  type?: string;
  status?: SpeechStatus;
  result?: SpeechResult;
  code?: string;
  message?: string;
}

const ACTIVITY_INTERVAL_MS = 70;
const SILENCE_FLUSH_MS = 500;
const SPEECH_RMS_THRESHOLD = 0.04;

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export class CloudSpeechProvider implements SpeechRecognitionProvider {
  readonly kind = 'cloud';

  private readonly url: string;
  private readonly languageHint?: string;
  private readonly streaming: boolean;
  private readonly onAnalyser?: (analyser: AnalyserNode) => void;

  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private mimeType = '';
  private currentChunks: Blob[] = [];
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private connecting = false;
  private stopping = false;
  private wasSpeaking = false;
  private silenceMs = 0;
  private pendingFlush = false;
  private recordedSinceFlush = false;

  private partialCallback: ((result: SpeechResult) => void) | null = null;
  private finalCallback: ((result: SpeechResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private statusCallback: ((status: SpeechStatus) => void) | null = null;

  constructor(options: CloudSpeechOptions) {
    this.url = options.url;
    this.languageHint = options.languageHint;
    this.streaming = options.streaming === true;
    this.onAnalyser = options.onAnalyser;
  }

  connect(): Promise<void> {
    return this.start();
  }

  disconnect(): void {
    void this.stop();
  }

  async start(): Promise<void> {
    this.running = true;
    this.stopping = false;
    this.pendingFlush = false;
    this.recordedSinceFlush = false;
    this.currentChunks = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new SpeechError('无法访问麦克风，请允许浏览器使用麦克风', 'mic');
    }
    this.stream = stream;

    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      this.audioContext = audioContext;
      this.analyser = analyser;
      this.onAnalyser?.(analyser);
    } catch {
      this.cleanupStream();
      throw new SpeechError('无法初始化音频处理', 'media');
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      this.cleanupStream();
      throw new SpeechError('当前浏览器不支持音频录制', 'media');
    }
    this.mimeType = mimeType;

    try {
      this.startRecorder();
    } catch {
      this.cleanupStream();
      throw new SpeechError('无法启动音频录制', 'media');
    }

    try {
      await this.connectWebSocket(mimeType);
    } catch (error) {
      this.running = false;
      this.cleanupStream();
      throw error;
    }

    this.startActivityMonitor();
    this.statusCallback?.('listening');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.running = false;
    this.wasSpeaking = false;
    this.silenceMs = 0;
    this.pendingFlush = false;
    this.recordedSinceFlush = false;
    this.currentChunks = [];

    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }

    this.sendJson({ type: 'stop' });
    try {
      this.socket?.close();
    } catch {
      // Socket may already be closed.
    }
    this.socket = null;

    try {
      this.recorder?.stop();
    } catch {
      // Recorder may already be stopped.
    }
    this.recorder = null;
    this.cleanupStream();
    this.stopping = false;
  }

  sendAudio(chunk: ArrayBuffer | Blob): void {
    if (!this.running || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.recordedSinceFlush = true;
    this.socket.send(chunk);
  }

  onPartialResult(callback: (result: SpeechResult) => void): void {
    this.partialCallback = callback;
  }

  onFinalResult(callback: (result: SpeechResult) => void): void {
    this.finalCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onStatusChange(callback: (status: SpeechStatus) => void): void {
    this.statusCallback = callback;
  }

  private connectWebSocket(contentType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      this.connecting = true;

      const timeout = setTimeout(() => {
        if (!this.connecting) return;
        this.connecting = false;
        this.stopping = true;
        this.socket = null;
        reject(new SpeechError('语音服务连接超时', 'timeout'));
        try {
          socket.close();
        } catch {
          // Socket may already be closed.
        }
      }, 6000);

      socket.onopen = () => {
        clearTimeout(timeout);
        if (!this.connecting) {
          try {
            socket.close();
          } catch {
            // Socket may already be closed.
          }
          return;
        }
        this.connecting = false;
        socket.send(
          JSON.stringify({
            type: 'start',
            languageHint: this.languageHint,
            contentType,
          }),
        );
        resolve();
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        if (this.connecting) {
          this.connecting = false;
          this.stopping = true;
          reject(new SpeechError('语音服务连接失败', 'network'));
        }
      };

      socket.onmessage = (event) => this.handleMessage(event.data);

      socket.onclose = () => {
        if (this.running && !this.stopping && !this.connecting) {
          this.errorCallback?.(new SpeechError('语音服务连接断开', 'network'));
        }
      };
    });
  }

  private handleMessage(data: unknown): void {
    let message: CloudServerMessage;
    try {
      message = JSON.parse(String(data)) as CloudServerMessage;
    } catch {
      this.errorCallback?.(new SpeechError('语音服务返回无效消息', 'protocol'));
      return;
    }

    if (message.type === 'partial' && message.result) {
      this.partialCallback?.(message.result);
      return;
    }

    if (message.type === 'final' && message.result) {
      this.pendingFlush = false;
      this.wasSpeaking = false;
      this.silenceMs = 0;
      this.finalCallback?.(message.result);
      this.statusCallback?.('ready');
      this.scheduleListening(900);
      return;
    }

    if (message.type === 'status' && message.status === 'processing') {
      this.statusCallback?.('processing');
      return;
    }

    if (message.type === 'error') {
      this.pendingFlush = false;
      this.wasSpeaking = false;
      this.silenceMs = 0;
      const code = message.code === 'timeout' ? 'timeout' : message.code === 'rate_limited' ? 'rate_limited' : 'asr';
      this.errorCallback?.(new SpeechError(message.message ?? '语音识别失败', code));
      if (code === 'timeout') {
        this.scheduleListening(1400);
      }
    }
  }

  private startActivityMonitor(): void {
    this.activityTimer = setInterval(() => {
      const analyser = this.analyser;
      if (!analyser || !this.running) return;

      const timeData = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (const value of timeData) {
        const delta = (value - 128) / 128;
        sum += delta * delta;
      }
      const rms = Math.sqrt(sum / timeData.length);

      if (rms > SPEECH_RMS_THRESHOLD) {
        this.silenceMs = 0;
        if (!this.wasSpeaking) {
          this.wasSpeaking = true;
          this.statusCallback?.('speaking');
        }
        return;
      }

      if (!this.wasSpeaking) return;
      this.silenceMs += ACTIVITY_INTERVAL_MS;
      if (
        this.silenceMs >= SILENCE_FLUSH_MS &&
        !this.pendingFlush &&
        this.recordedSinceFlush
      ) {
        this.finalizeSegment();
      }
    }, ACTIVITY_INTERVAL_MS);
  }

  private startRecorder(): void {
    if (!this.running || !this.stream) return;
    const recorder = new MediaRecorder(
      this.stream,
      this.mimeType ? { mimeType: this.mimeType } : undefined,
    );
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedSinceFlush = true;
        if (this.streaming) {
          this.sendAudio(event.data);
        } else {
          this.currentChunks.push(event.data);
        }
      }
    };
    recorder.onstop = () => this.handleRecorderStopped();
    recorder.start(250);
    this.recorder = recorder;
  }

  private finalizeSegment(): void {
    const recorder = this.recorder;
    if (
      !recorder ||
      recorder.state !== 'recording' ||
      (!this.streaming && this.currentChunks.length === 0)
    ) {
      this.pendingFlush = false;
      return;
    }

    this.pendingFlush = true;
    this.statusCallback?.('processing');
    try {
      recorder.stop();
    } catch {
      this.pendingFlush = false;
      this.errorCallback?.(new SpeechError('无法结束音频片段', 'media'));
    }
  }

  private handleRecorderStopped(): void {
    if (!this.running || !this.pendingFlush) {
      this.recorder = null;
      return;
    }

    const segment = new Blob(this.currentChunks, { type: this.mimeType });
    this.currentChunks = [];
    this.recordedSinceFlush = false;
    this.recorder = null;

    try {
      this.startRecorder();
    } catch {
      this.errorCallback?.(new SpeechError('无法重新开始录音', 'media'));
    }

    if (this.streaming) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.pendingFlush = false;
        this.errorCallback?.(new SpeechError('语音服务连接断开', 'network'));
        return;
      }
      this.pendingFlush = false;
      this.socket.send(JSON.stringify({ type: 'flush' }));
      return;
    }

    void segment.arrayBuffer().then((buffer) => {
      if (!this.running || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.pendingFlush = false;
        this.errorCallback?.(new SpeechError('语音服务连接断开', 'network'));
        return;
      }
      this.socket.send(buffer);
      this.socket.send(JSON.stringify({ type: 'flush' }));
    });
  }

  private scheduleListening(delayMs: number): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = setTimeout(() => {
      if (this.running && !this.pendingFlush) {
        this.statusCallback?.('listening');
      }
    }, delayMs);
  }

  private sendJson(payload: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private cleanupStream(): void {
    try {
      this.recorder?.stop();
    } catch {
      // Recorder may already be stopped.
    }
    this.recorder = null;
    this.currentChunks = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.analyser = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }
}
