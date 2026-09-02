import type { SpeechResult, SpeechStatus } from '../types/voice';
import type { SpeechRecognitionProvider } from './SpeechRecognitionProvider';
import { subscribeStoneResting } from '../three/ImpactEffects';

interface MockPhrase {
  text: string;
  languageCode: string;
}

const MOCK_PHRASES: MockPhrase[] = [
  { text: '你好，很高兴认识大家', languageCode: 'zh-CN' },
  { text: 'Hello everyone', languageCode: 'en-US' },
  { text: 'こんにちは、ようこそ', languageCode: 'ja-JP' },
  { text: '안녕하세요, 환영합니다', languageCode: 'ko-KR' },
  { text: 'Bonjour tout le monde', languageCode: 'fr-FR' },
  { text: 'Hola a todos', languageCode: 'es-ES' },
  { text: 'Hallo zusammen', languageCode: 'de-DE' },
  { text: 'مرحباً بالجميع', languageCode: 'ar-SA' },
  { text: 'สวัสดีทุกคน', languageCode: 'th-TH' },
  { text: 'Xin chào mọi người', languageCode: 'vi-VN' },
  { text: 'Selamat datang', languageCode: 'id-ID' },
  { text: 'Привет всем', languageCode: 'ru-RU' },
];

export class MockSpeechProvider implements SpeechRecognitionProvider {
  readonly kind = 'mock';

  private running = false;
  private partialCallback: ((result: SpeechResult) => void) | null = null;
  private finalCallback: ((result: SpeechResult) => void) | null = null;
  private statusCallback: ((status: SpeechStatus) => void) | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private waitingUnsubscribe: (() => void) | null = null;

  start(): Promise<void> {
    this.running = true;
    this.waitingUnsubscribe = null;
    this.statusCallback?.('listening');
    this.scheduleNext();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.running = false;
    if (this.waitingUnsubscribe) {
      this.waitingUnsubscribe();
      this.waitingUnsubscribe = null;
    }
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
    return Promise.resolve();
  }

  onPartialResult(callback: (result: SpeechResult) => void): void {
    this.partialCallback = callback;
  }

  onFinalResult(callback: (result: SpeechResult) => void): void {
    this.finalCallback = callback;
  }

  onError(_callback: (error: Error) => void): void {
    // Mock provider never produces runtime errors.
  }

  onStatusChange(callback: (status: SpeechStatus) => void): void {
    this.statusCallback = callback;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const phrase = MOCK_PHRASES[Math.floor(Math.random() * MOCK_PHRASES.length)];
    const id = `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = Date.now();
    const confidence = 0.9 + Math.random() * 0.08;

    this.timers.push(
      setTimeout(() => {
        if (!this.running) return;
        this.statusCallback?.('speaking');
        this.partialCallback?.({
          id,
          text: phrase.text,
          language: phrase.languageCode,
          languageCode: phrase.languageCode,
          confidence,
          isFinal: false,
          timestamp,
        });
      }, 220),
    );

    this.timers.push(
      setTimeout(() => {
        if (!this.running) return;
        this.statusCallback?.('processing');
      }, 520),
    );

    this.timers.push(
      setTimeout(() => {
        if (!this.running) return;
        this.finalCallback?.({
          id,
          text: phrase.text,
          language: phrase.languageCode,
          languageCode: phrase.languageCode,
          confidence,
          isFinal: true,
          timestamp,
        });
        this.statusCallback?.('ready');
        this.waitForLandingThenNext();
      }, 760),
    );
  }

  private waitForLandingThenNext(): void {
    if (!this.running) return;
    this.waitingUnsubscribe?.();
    const timeout = setTimeout(() => {
      this.waitingUnsubscribe?.();
      this.waitingUnsubscribe = null;
      if (this.running) this.scheduleNext();
    }, 9000);
    this.timers.push(timeout);
    this.waitingUnsubscribe = subscribeStoneResting(() => {
      clearTimeout(timeout);
      this.waitingUnsubscribe?.();
      this.waitingUnsubscribe = null;
      if (this.running) this.scheduleNext();
    });
  }
}
