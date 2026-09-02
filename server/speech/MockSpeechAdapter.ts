import type { SpeechAdapter, SpeechTranscriptionRequest, SpeechTranscriptionResult } from './types';
import { detectLanguageCode, getLanguageName } from './language';

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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class MockSpeechAdapter implements SpeechAdapter {
  readonly name = 'mock';

  async transcribe(_request: SpeechTranscriptionRequest): Promise<SpeechTranscriptionResult> {
    await delay(500 + Math.floor(Math.random() * 500));
    const phrase = MOCK_PHRASES[Math.floor(Math.random() * MOCK_PHRASES.length)];
    return {
      text: phrase.text,
      languageCode: phrase.languageCode,
      language: getLanguageName(phrase.languageCode),
      confidence: 0.9 + Math.random() * 0.08,
    };
  }
}
