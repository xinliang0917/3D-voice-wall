export interface LanguageMeta {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  font: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文', direction: 'ltr', font: 'noto-sans-sc-chinese-simplified-700-normal.otf' },
  { code: 'en-US', name: 'English', nativeName: 'English', direction: 'ltr', font: 'noto-sans-latin-700-normal.woff2' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', direction: 'ltr', font: 'noto-sans-jp-japanese-700-normal.woff2' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어', direction: 'ltr', font: 'noto-sans-kr-korean-700-normal.woff2' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français', direction: 'ltr', font: 'noto-sans-latin-700-normal.woff2' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español', direction: 'ltr', font: 'noto-sans-latin-700-normal.woff2' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch', direction: 'ltr', font: 'noto-sans-latin-700-normal.woff2' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский', direction: 'ltr', font: 'noto-sans-cyrillic-700-normal.woff2' },
  { code: 'ar-SA', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', font: 'noto-sans-arabic-arabic-700-normal.woff2' },
  { code: 'th-TH', name: 'Thai', nativeName: 'ไทย', direction: 'ltr', font: 'noto-sans-thai-thai-700-normal.woff2' },
  { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr', font: 'noto-sans-latin-700-normal.woff2' },
  { code: 'id-ID', name: 'Indonesian', nativeName: 'Indonesia', direction: 'ltr', font: 'noto-sans-latin-700-normal.woff2' },
  { code: 'ms-MY', name: 'Malay', nativeName: 'Bahasa Melayu', direction: 'ltr', font: 'noto-sans-latin-700-normal.woff2' },
];

const LATIN_LANGUAGE_HINTS: Array<{ code: string; words: string[] }> = [
  {
    code: 'fr-FR',
    words: ['bonjour', 'bienvenue', 'monde', 'merci', 'salut', 'le', 'la', 'les', 'et', 'est', 'une', 'des', 'je', 'vous', 'tout'],
  },
  {
    code: 'es-ES',
    words: ['hola', 'bienvenido', 'bienvenida', 'gracias', 'amigos', 'todos', 'todas', 'los', 'las', 'y', 'es', 'un', 'una'],
  },
  {
    code: 'de-DE',
    words: ['hallo', 'zusammen', 'willkommen', 'danke', 'guten', 'der', 'die', 'das', 'und', 'ist', 'ein', 'eine'],
  },
  {
    code: 'id-ID',
    words: ['selamat', 'datang', 'terima', 'kasih', 'dan', 'yang', 'ini', 'itu', 'untuk', 'dengan', 'semua'],
  },
  {
    code: 'ms-MY',
    words: ['selamat', 'datang', 'terima', 'kasih', 'dan', 'yang', 'ini', 'itu', 'untuk', 'dengan', 'semua'],
  },
];

const LANGUAGE_MAP = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]));

export function getLanguageMeta(code: string): LanguageMeta {
  const exact = LANGUAGE_MAP.get(code);
  if (exact) return exact;
  const normalized = code.split('-')[0];
  for (const language of SUPPORTED_LANGUAGES) {
    if (language.code.startsWith(normalized)) return language;
  }
  return LANGUAGE_MAP.get('en-US') ?? SUPPORTED_LANGUAGES[1];
}

export function detectLanguage(text: string): string {
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)) return 'ar-SA';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th-TH';
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text)) return 'ko-KR';
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(text)) return 'ja-JP';
  if (/[\u3400-\u4DBF\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
  if (/[\u1EA0-\u1EF9]/.test(text)) return 'vi-VN';
  if (/[ñáéíóúü¿¡]/i.test(text)) return 'es-ES';
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(text)) return 'fr-FR';

  const words = new Set(text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? []);
  let bestCode = 'en-US';
  let bestScore = 0;
  for (const hint of LATIN_LANGUAGE_HINTS) {
    let score = 0;
    for (const word of hint.words) {
      if (words.has(word)) score += word.length >= 5 ? 2 : 1;
    }
    if (score > bestScore) {
      bestCode = hint.code;
      bestScore = score;
    }
  }
  return bestCode;
}
