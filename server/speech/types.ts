export interface SpeechTranscriptionRequest {
  audio: Buffer;
  contentType: string;
  languageHint?: string;
}

export interface SpeechTranscriptionResult {
  text: string;
  language?: string;
  languageCode?: string;
  confidence?: number;
}

export interface SpeechAdapter {
  readonly name: string;
  transcribe(request: SpeechTranscriptionRequest): Promise<SpeechTranscriptionResult>;
}

export interface SpeechStreamingCallbacks {
  onPartial(result: SpeechTranscriptionResult): void;
  onFinal(result: SpeechTranscriptionResult): void;
  onError(error: Error): void;
}

export interface SpeechStreamingSession {
  feed(chunk: Buffer): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
}

export interface SpeechStreamingAdapter extends SpeechAdapter {
  readonly streaming: true;
  createSession(callbacks: SpeechStreamingCallbacks): SpeechStreamingSession;
}
