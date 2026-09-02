import { getLanguageMeta } from './language';
import { MAX_TEXT_WIDTH } from '../config';

const CJK_RANGE = /[\u2E80-\u2FDF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

function estimateCharacterWidth(char: string, languageCode: string): number {
  if (/\s/.test(char)) return 0.32;
  if (CJK_RANGE.test(char)) return 1;
  if (getLanguageMeta(languageCode).direction === 'rtl') return 0.62;
  return /[A-Z0-9]/.test(char) ? 0.68 : 0.54;
}

export function estimateTextWidth(text: string, languageCode: string, fontSize: number): number {
  let units = 0;
  for (const char of text) units += estimateCharacterWidth(char, languageCode);
  return units * fontSize;
}

export function estimateFontSize(text: string, languageCode: string): number {
  const short = text.length <= 8;
  const medium = text.length <= 18;
  let size = short ? 0.82 : medium ? 0.6 : 0.44;

  const estimated = estimateTextWidth(text, languageCode, size);
  if (estimated > MAX_TEXT_WIDTH) {
    size = (size * MAX_TEXT_WIDTH) / estimated;
  }
  return Math.max(0.3, Math.min(size, 0.9));
}
