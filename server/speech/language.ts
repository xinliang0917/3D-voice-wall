interface LanguageEntry {
  code: string;
  name: string;
  base: string;
}

const LANGUAGE_ENTRIES: LanguageEntry[] = [
  { code: 'zh-CN', name: 'Chinese', base: 'zh' },
  { code: 'en-US', name: 'English', base: 'en' },
  { code: 'ja-JP', name: 'Japanese', base: 'ja' },
  { code: 'ko-KR', name: 'Korean', base: 'ko' },
  { code: 'th-TH', name: 'Thai', base: 'th' },
  { code: 'fr-FR', name: 'French', base: 'fr' },
  { code: 'es-ES', name: 'Spanish', base: 'es' },
  { code: 'de-DE', name: 'German', base: 'de' },
  { code: 'ru-RU', name: 'Russian', base: 'ru' },
  { code: 'ar-SA', name: 'Arabic', base: 'ar' },
  { code: 'vi-VN', name: 'Vietnamese', base: 'vi' },
  { code: 'id-ID', name: 'Indonesian', base: 'id' },
  { code: 'ms-MY', name: 'Malay', base: 'ms' },
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

const BASE_MAP = new Map(LANGUAGE_ENTRIES.map((entry) => [entry.base, entry]));

export function normalizeLanguageCode(code: string, fallbackCode?: string): string {
  const normalized = code.trim().toLowerCase();
  const exact = LANGUAGE_ENTRIES.find((entry) => entry.code.toLowerCase() === normalized);
  if (exact) return exact.code;
  const exactName = LANGUAGE_ENTRIES.find((entry) => entry.name.toLowerCase() === normalized);
  if (exactName) return exactName.code;

  const base = normalized.split(/[-_]/)[0];
  const mapped = BASE_MAP.get(base);
  if (mapped) return mapped.code;

  return fallbackCode ?? detectLanguageCode(normalized);
}

export function detectLanguageCode(text: string): string {
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

export function getLanguageName(code: string): string {
  const exact = LANGUAGE_ENTRIES.find((entry) => entry.code === code);
  return exact?.name ?? 'English';
}
