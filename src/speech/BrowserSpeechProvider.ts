import { detectLanguage, getLanguageMeta } from '../utils/language';
import type { SpeechResult, SpeechStatus } from '../types/voice';
import { SpeechError } from './SpeechError';
import type { SpeechRecognitionProvider } from './SpeechRecognitionProvider';

interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface RecognitionResult {
  isFinal: boolean;
  length: number;
  0: RecognitionAlternative;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface BrowserSpeechWindow extends Window {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
}

interface BrowserSpeechOptions {
  language: string;
  onAnalyser?: (analyser: AnalyserNode) => void;
}

export class BrowserSpeechProvider implements SpeechRecognitionProvider {
  readonly kind = 'browser';

  private readonly language: string;
  private readonly onAnalyser?: (analyser: AnalyserNode) => void;
  private recognition: BrowserSpeechRecognition | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private running = false;
  private lastResultIndex = 0;
  private finalizedResultIndices = new Set<number>();
  private partialCallback: ((result: SpeechResult) => void) | null = null;
  private finalCallback: ((result: SpeechResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private statusCallback: ((status: SpeechStatus) => void) | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: BrowserSpeechOptions) {
    this.language = options.language;
    this.onAnalyser = options.onAnalyser;
  }

  async start(): Promise<void> {
    const SpeechRecognition = this.getRecognitionConstructor();
    if (!SpeechRecognition) {
      throw new Error('This browser does not support the Web Speech API.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new SpeechError('无法访问麦克风，请允许浏览器使用麦克风', 'mic');
    }
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    this.onAnalyser?.(analyser);

    this.running = true;
    this.lastResultIndex = 0;
    this.finalizedResultIndices.clear();
    this.statusCallback?.('listening');
    const recognition = new SpeechRecognition();
    recognition.lang = this.language || 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => {
      if (this.running && event.error !== 'aborted' && event.error !== 'no-speech') {
        this.errorCallback?.(new Error(`Speech recognition error: ${event.error}`));
      }
    };
    recognition.onend = () => {
      if (this.running) {
        try {
          recognition.start();
        } catch {
          this.running = false;
        }
      }
    };

    this.recognition = recognition;
    recognition.start();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    try {
      this.recognition?.stop();
    } catch {
      this.recognition?.abort();
    }
    this.recognition = null;

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
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

  private getRecognitionConstructor(): (new () => BrowserSpeechRecognition) | null {
    const speechWindow = window as BrowserSpeechWindow;
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    let interim = '';
    let final = '';
    let confidence = 0.94;

    const startIndex = Math.min(this.lastResultIndex, event.resultIndex);
    for (let index = startIndex; index < event.results.length; index += 1) {
      if (this.finalizedResultIndices.has(index)) continue;
      const result = event.results[index];
      confidence = result[0].confidence || confidence;
      if (result.isFinal) {
        this.finalizedResultIndices.add(index);
        final += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }
    this.lastResultIndex = Math.max(this.lastResultIndex, event.results.length);

    const text = (final || interim).trim();
    if (!text) return;

    const languageCode = detectLanguage(text);
    const language = getLanguageMeta(languageCode).name;
    const isFinal = final.length > 0;
    const result: SpeechResult = {
      id: `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      language,
      languageCode,
      confidence,
      isFinal,
      timestamp: Date.now(),
    };

    if (isFinal) {
      this.statusCallback?.('processing');
      this.finalCallback?.(result);
      this.statusCallback?.('ready');
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = setTimeout(() => {
        if (this.running) this.statusCallback?.('listening');
      }, 900);
    } else {
      this.statusCallback?.('speaking');
      this.partialCallback?.(result);
    }
  }
}
