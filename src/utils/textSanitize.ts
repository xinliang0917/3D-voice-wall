import { getLanguageMeta } from './language';

const ASCII_PUNCTUATION = /[.,;:!?'"()[\]{}<>/\\|`~@#$%^&*+=_-]/g;
const SCRIPT_LANGUAGES = new Set(['zh-CN', 'ja-JP', 'ko-KR', 'ar-SA', 'th-TH', 'ru-RU']);

const FULLWIDTH_PUNCTUATION: Record<string, string> = {
  '\u00a0': ' ',
  '\u202f': ' ',
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2026': '...',
  '\u3000': ' ',
  '\u3001': ',',
  '\u3002': '.',
  '\uff01': '!',
  '\uff02': '"',
  '\uff03': '#',
  '\uff04': '$',
  '\uff05': '%',
  '\uff06': '&',
  '\uff07': "'",
  '\uff08': '(',
  '\uff09': ')',
  '\uff0a': '*',
  '\uff0b': '+',
  '\uff0c': ',',
  '\uff0d': '-',
  '\uff0e': '.',
  '\uff0f': '/',
  '\uff1a': ':',
  '\uff1b': ';',
  '\uff1c': '<',
  '\uff1d': '=',
  '\uff1e': '>',
  '\uff1f': '?',
  '\uff20': '@',
  '\uff3b': '[',
  '\uff3c': '\\',
  '\uff3d': ']',
  '\uff3e': '^',
  '\uff3f': '_',
  '\uff40': '`',
  '\uff5b': '{',
  '\uff5c': '|',
  '\uff5d': '}',
  '\uff5e': '~',
};

const FULLWIDTH_PUNCTUATION_PATTERN =
  /[\u00a0\u202f\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u3000-\u3002\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff5e]/g;

const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2764}\u{2B50}\u{00A9}\u{00AE}\u{2194}-\u{21AA}\u{231A}\u{231B}\u{23E9}-\u{23F3}\u{25AA}-\u{25FE}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}]/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

function stripVietnameseDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function sanitizeTextForFont(text: string, languageCode: string): string {
  const language = getLanguageMeta(languageCode);
  let output = text.normalize('NFC');

  if (SCRIPT_LANGUAGES.has(language.code)) {
    output = output.replace(ASCII_PUNCTUATION, ' ');
  } else {
    output = output.replace(
      FULLWIDTH_PUNCTUATION_PATTERN,
      (char) => FULLWIDTH_PUNCTUATION[char] ?? ' ',
    );
  }

  if (language.code === 'vi-VN') {
    output = stripVietnameseDiacritics(output);
  }

  return output.replace(/\s+/g, ' ').trim();
}

export function normalizePunctuationForDisplay(
  text: string,
  languageCode: string,
): string {
  const language = getLanguageMeta(languageCode);
  if (SCRIPT_LANGUAGES.has(language.code)) return text;
  return text.replace(
    FULLWIDTH_PUNCTUATION_PATTERN,
    (char) => FULLWIDTH_PUNCTUATION[char] ?? char,
  );
}
