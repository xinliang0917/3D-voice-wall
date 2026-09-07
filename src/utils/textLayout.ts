import { getLanguageMeta } from './language';

export const MAX_CHARS_PER_LINE = 16;
export const MAX_LINES_PER_MESSAGE = 4;

export type TextFontLevel = 1 | 2 | 3 | 4;

export interface VoiceTextLinePlan {
  text: string;
  level: TextFontLevel;
  visualLength: number;
}

export interface TextPlanOptions {
  lineVisualLimit?: number;
  maxLines?: number;
}

interface TextSegment {
  text: string;
  whitespace: boolean;
}

interface SegmenterSegment {
  segment: string;
  isWordLike: boolean;
}

interface SegmenterLike {
  segment(input: string): Iterable<SegmenterSegment>;
}

type SegmenterConstructor = new (
  locale: string,
  options: { granularity: 'word' },
) => SegmenterLike;

const SegmenterCtor = (
  Intl as unknown as {
    Segmenter?: SegmenterConstructor;
  }
).Segmenter;

const CJK_PATTERN =
  /[\u1100-\u11FF\u2E80-\u303F\u3040-\u30FF\u3100-\u312F\u3130-\u318F\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;
const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const THAI_PATTERN = /[\u0E00-\u0E7F]/;
const CYRILLIC_PATTERN = /[\u0400-\u04FF\u0500-\u052F]/;
const COMBINING_PATTERN = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/;

function characterWidth(char: string, languageCode: string): number {
  if (/\s/.test(char)) return 0.32;
  if (COMBINING_PATTERN.test(char)) return 0;
  if (CJK_PATTERN.test(char)) return 1;
  if (ARABIC_PATTERN.test(char)) return 0.64;
  if (THAI_PATTERN.test(char)) return 0.84;
  if (CYRILLIC_PATTERN.test(char)) return 0.58;
  if (/[A-Z0-9]/.test(char)) return 0.72;
  if (/[a-z]/.test(char)) return 0.56;
  if (getLanguageMeta(languageCode).direction === 'rtl') return 0.64;
  return 0.58;
}

/**
 * Unified visual text length. CJK characters count as one visual unit,
 * while Latin and other scripts are estimated by their actual glyph width.
 */
export function getTextLength(
  text: string,
  languageCode = 'en-US',
): number {
  let width = 0;
  for (const char of text.normalize('NFC')) {
    width += characterWidth(char, languageCode);
  }
  return width;
}

function toVisualCount(
  text: string,
  languageCode: string,
): number {
  return Math.max(1, Math.round(getTextLength(text, languageCode)));
}

export function getTextFontLevel(
  text: string,
  languageCode = 'en-US',
): TextFontLevel {
  const visualCount = toVisualCount(text, languageCode);
  const rawCount = Array.from(text).length;
  if (visualCount <= 5 && rawCount <= 5) return 1;
  if (visualCount <= 10 && rawCount <= 10) return 2;
  if (visualCount <= 15 && rawCount <= 15) return 3;
  return 4;
}

function localeFor(languageCode: string): string {
  const language = getLanguageMeta(languageCode);
  if (language.code === 'zh-CN') return 'zh-CN';
  if (language.code === 'ar-SA') return 'ar-SA';
  return language.code;
}

function tokenizeSegments(
  text: string,
  languageCode: string,
): TextSegment[] {
  if (SegmenterCtor) {
    try {
      const segmenter = new SegmenterCtor(localeFor(languageCode), {
        granularity: 'word',
      });
      return Array.from(segmenter.segment(text)).map((segment) => ({
        text: segment.segment,
        whitespace: /^\s+$/.test(segment.segment),
      }));
    } catch {
      // Fall through to the plain whitespace tokenizer.
    }
  }
  return (text.match(/\s+|\S+/g) ?? []).map((segment) => ({
    text: segment,
    whitespace: /^\s+$/.test(segment),
  }));
}

function splitLongSegment(segment: string, maxRaw: number): string[] {
  const chars = Array.from(segment);
  if (chars.length <= maxRaw) return [segment];

  const pieces: string[] = [];
  for (let start = 0; start < chars.length; start += maxRaw) {
    pieces.push(chars.slice(start, start + maxRaw).join(''));
  }
  return pieces;
}

const HAN_CHAR_PATTERN =
  /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

function canHardSplitSegment(
  segment: string,
  languageCode: string,
  maxRaw: number,
): boolean {
  const code = getLanguageMeta(languageCode).code;
  if (code === 'zh-CN' && Array.from(segment).every((char) => HAN_CHAR_PATTERN.test(char))) {
    return true;
  }

  const rawCount = Array.from(segment).length;
  const visualWidth = getTextLength(segment, languageCode);
  if (rawCount <= maxRaw || visualWidth <= maxRaw * 1.1) return false;

  // Scripts that often run without spaces, plus very long single tokens,
  // should hard-break instead of being squeezed into an unreadable thin slab.
  if (['zh-CN', 'ja-JP', 'ko-KR', 'th-TH', 'ar-SA', 'ru-RU'].includes(code)) {
    return true;
  }
  return rawCount >= 24;
}

interface BreakToken {
  text: string;
  visual: number;
  spaceBefore: boolean;
  badStart: boolean;
}

const BAD_LINE_START =
  /^[，。、！？；：,.;!?…—）】」』》〉"')\]]/;
const SINGLE_WORD_PARTICLES = new Set([
  '的',
  '了',
  '吗',
  '呢',
  '吧',
  '啊',
  'を',
  'に',
  'は',
]);

function buildBreakTokens(
  text: string,
  languageCode: string,
  maxRaw: number,
): BreakToken[] {
  const tokens: BreakToken[] = [];
  let pendingSpace = false;

  for (const segment of tokenizeSegments(text, languageCode)) {
    if (segment.whitespace) {
      pendingSpace = true;
      continue;
    }

    const pieces = canHardSplitSegment(segment.text, languageCode, maxRaw)
      ? splitLongSegment(segment.text, maxRaw)
      : [segment.text];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      tokens.push({
        text: piece,
        visual: getTextLength(piece, languageCode),
        spaceBefore: index === 0 && pendingSpace,
        badStart: isBadLineStart(piece),
      });
      pendingSpace = false;
    }
  }

  return tokens;
}

function isBadLineStart(text: string): boolean {
  const first = Array.from(text)[0];
  if (!first) return false;
  if (BAD_LINE_START.test(first)) return true;
  return SINGLE_WORD_PARTICLES.has(first);
}

function lineWidth(
  tokens: BreakToken[],
  start: number,
  end: number,
): number {
  let width = 0;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    width += token.visual;
    if (index > start && token.spaceBefore) width += 0.32;
  }
  return width;
}

function joinLine(
  tokens: BreakToken[],
  start: number,
  end: number,
): string {
  let text = '';
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (index > start && token.spaceBefore) text += ' ';
    text += token.text;
  }
  return text;
}

function chooseLineBreaks(
  tokens: BreakToken[],
  lineCount: number,
  idealWidth: number,
): number[] {
  const count = tokens.length;
  const costs = Array.from(
    { length: lineCount + 1 },
    () => new Array<number>(count + 1).fill(Infinity),
  );
  const previousStarts = Array.from(
    { length: lineCount + 1 },
    () => new Array<number>(count + 1).fill(-1),
  );
  costs[0][0] = 0;

  for (let line = 1; line <= lineCount; line += 1) {
    for (let end = line; end <= count; end += 1) {
      for (
        let start = line - 1;
        start < end;
        start += 1
      ) {
        const previousCost = costs[line - 1][start];
        if (!Number.isFinite(previousCost)) continue;
        const width = lineWidth(tokens, start, end);
        const balancePenalty = Math.abs(width - idealWidth) ** 1.5;
        const startPenalty = tokens[start].badStart ? 3.5 : 0;
        const total = previousCost + balancePenalty + startPenalty;
        if (total < costs[line][end]) {
          costs[line][end] = total;
          previousStarts[line][end] = start;
        }
      }
    }
  }

  const breaks: number[] = [count];
  let cursor = count;
  for (let line = lineCount; line >= 1; line -= 1) {
    cursor = previousStarts[line][cursor];
    breaks.push(cursor);
  }
  breaks.reverse();
  return breaks;
}

function wrapWithLineCount(
  text: string,
  languageCode: string,
  lineCount: number,
  maxRaw: number,
  idealWidth: number,
): string[] {
  const tokens = buildBreakTokens(text, languageCode, maxRaw);
  if (tokens.length === 0) return [];
  const actualLineCount = Math.min(lineCount, tokens.length);
  const breaks = chooseLineBreaks(
    tokens,
    actualLineCount,
    idealWidth,
  );

  const lines: string[] = [];
  for (let index = 0; index < actualLineCount; index += 1) {
    const start = breaks[index];
    const end = breaks[index + 1];
    const line = joinLine(tokens, start, end);
    if (line) lines.push(line);
  }
  return lines;
}

function fitMaxLines(
  text: string,
  languageCode: string,
  nonSpaceLength: number,
  visualLength: number,
  lineVisualLimit: number,
  maxLines: number,
): string[] {
  const desiredLines = Math.max(
    2,
    Math.ceil(nonSpaceLength / MAX_CHARS_PER_LINE),
    Math.ceil(visualLength / lineVisualLimit),
  );
  const lineCount = Math.min(maxLines, desiredLines);
  let maxRaw = Math.min(
    MAX_CHARS_PER_LINE,
    Math.max(8, Math.ceil(nonSpaceLength / lineCount)),
  );

  const idealWidth = visualLength / lineCount;
  let lines = wrapWithLineCount(
    text,
    languageCode,
    lineCount,
    maxRaw,
    idealWidth,
  );

  if (lines.length <= maxLines) return lines;

  // If many unbreakable words still overflow, relax the raw limit gradually.
  let attempts = 0;
  while (
    lines.length > maxLines &&
    maxRaw < nonSpaceLength &&
    attempts < 8
  ) {
    maxRaw = Math.min(nonSpaceLength, maxRaw + 2);
    lines = wrapWithLineCount(
      text,
      languageCode,
      lineCount,
      maxRaw,
      idealWidth,
    );
    attempts += 1;
  }
  return lines;
}

export function planTextLines(
  text: string,
  languageCode = 'en-US',
  options: TextPlanOptions = {},
): VoiceTextLinePlan[] {
  const normalized = text.replace(/\s*\n+\s*/g, ' ').trim();
  if (!normalized) return [];

  const lineVisualLimit = Math.max(
    6,
    options.lineVisualLimit ?? MAX_CHARS_PER_LINE,
  );
  const maxLines = Math.min(
    MAX_LINES_PER_MESSAGE,
    options.maxLines ?? MAX_LINES_PER_MESSAGE,
  );
  const nonSpaceLength = Array.from(normalized).filter(
    (char) => !/\s/.test(char),
  ).length;
  const visualLength = getTextLength(normalized, languageCode);
  if (
    nonSpaceLength <= MAX_CHARS_PER_LINE &&
    visualLength <= lineVisualLimit
  ) {
    return [
      {
        text: normalized,
        level: getTextFontLevel(normalized, languageCode),
        visualLength,
      },
    ];
  }

  const lines = fitMaxLines(
    normalized,
    languageCode,
    nonSpaceLength,
    visualLength,
    lineVisualLimit,
    maxLines,
  );
  return lines.map((line) => ({
    text: line,
    level: getTextFontLevel(line, languageCode),
    visualLength: getTextLength(line, languageCode),
  }));
}
