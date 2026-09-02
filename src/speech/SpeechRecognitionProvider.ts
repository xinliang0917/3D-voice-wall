import type { SpeechResult } from '../types/voice';
import type { SpeechStatus } from '../types/voice';

export interface SpeechRecognitionProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  onPartialResult(callback: (result: SpeechResult) => void): void;
  onFinalResult(callback: (result: SpeechResult) => void): void;
  onError(callback: (error: Error) => void): void;
  onStatusChange?(callback: (status: SpeechStatus) => void): void;
}
