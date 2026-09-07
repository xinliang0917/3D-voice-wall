import type { SpeechResult } from '../types/voice';
import { getLanguageMeta } from './language';

interface IdlePhrase {
  text: string;
  languageCode: string;
}

const IDLE_PHRASES: IdlePhrase[] = [
  { text: '我爱南宁', languageCode: 'zh-CN' },
  { text: 'I love Nanning', languageCode: 'en-US' },
  { text: '私は南寧が大好きです', languageCode: 'ja-JP' },
  { text: '저는 난닝을 사랑합니다', languageCode: 'ko-KR' },
  { text: "J'aime Nanning", languageCode: 'fr-FR' },
  { text: 'Amo Nanning', languageCode: 'es-ES' },
  { text: 'Ich liebe Nanning', languageCode: 'de-DE' },
  { text: 'Я люблю Наньнин', languageCode: 'ru-RU' },
  { text: 'أنا أحب ناننينغ', languageCode: 'ar-SA' },
  { text: 'ฉันรักหนานหนิง', languageCode: 'th-TH' },
  { text: 'Tôi yêu Nam Ninh', languageCode: 'vi-VN' },
  { text: 'Saya cinta Nanning', languageCode: 'id-ID' },
  { text: 'Saya sayang Nanning', languageCode: 'ms-MY' },
];

export function createIdleSpeechResult(): SpeechResult {
  const phrase = IDLE_PHRASES[Math.floor(Math.random() * IDLE_PHRASES.length)];
  const language = getLanguageMeta(phrase.languageCode);

  return {
    id: `idle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text: phrase.text,
    language: language.name,
    languageCode: phrase.languageCode,
    confidence: 1,
    isFinal: true,
    timestamp: Date.now(),
  };
}
