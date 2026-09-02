export class SpeechError extends Error {
  constructor(
    message: string,
    readonly code?: 'mic' | 'media' | 'network' | 'timeout' | 'rate_limited' | 'auth' | 'protocol' | 'asr',
  ) {
    super(message);
    this.name = 'SpeechError';
  }
}
