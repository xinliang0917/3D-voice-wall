import type { SpeechResult, SpeechStatus } from '../types/voice';
import type { SpeechRecognitionProvider } from './SpeechRecognitionProvider';

interface WebSocketAsrMessage {
  type?: 'partial' | 'final' | 'error' | 'status';
  status?: SpeechStatus;
  result?: SpeechResult;
  text: string;
  languageCode: string;
  confidence: number;
  isFinal: boolean;
  timestamp?: number;
  id?: string;
  code?: string;
  message?: string;
}

export class WebSocketSpeechProvider implements SpeechRecognitionProvider {
  readonly kind = 'websocket';

  private socket: WebSocket | null = null;
  private partialCallback: ((result: SpeechResult) => void) | null = null;
  private finalCallback: ((result: SpeechResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private statusCallback: ((status: SpeechStatus) => void) | null = null;
  private running = false;

  constructor(private readonly url: string) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      this.running = true;

      socket.onopen = () => {
        this.statusCallback?.('listening');
        resolve();
      };
      socket.onerror = () => reject(new Error(`Unable to connect to ${this.url}`));
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onclose = () => {
        if (this.running) {
          this.errorCallback?.(new Error(`Speech socket closed: ${this.url}`));
        }
      };
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.socket?.close();
    this.socket = null;
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

  private handleMessage(data: unknown): void {
    try {
      const message = JSON.parse(String(data)) as WebSocketAsrMessage;

      if (message.type === 'status' && message.status) {
        this.statusCallback?.(message.status);
        return;
      }
      if (message.type === 'error') {
        this.errorCallback?.(new Error(message.message ?? 'Speech recognition error'));
        return;
      }

      if (message.type === 'final' || message.type === 'partial') {
        const result = message.result;
        if (!result) {
          this.errorCallback?.(new Error('Speech result is missing'));
          return;
        }
        if (message.type === 'final') {
          this.finalCallback?.(result);
        } else {
          this.partialCallback?.(result);
        }
        return;
      }

      const result: SpeechResult = {
        id: message.id ?? `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        text: message.text,
        language: message.languageCode,
        languageCode: message.languageCode,
        confidence: message.confidence,
        isFinal: message.isFinal,
        timestamp: message.timestamp ?? Date.now(),
      };
      if (message.isFinal) {
        this.finalCallback?.(result);
      } else {
        this.partialCallback?.(result);
      }
    } catch (error) {
      this.errorCallback?.(error instanceof Error ? error : new Error('Invalid ASR message'));
    }
  }
}
