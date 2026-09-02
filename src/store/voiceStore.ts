import { create } from 'zustand';
import { MAX_VISIBLE_MESSAGES } from '../config';
import { stripEmoji } from '../utils/textSanitize';
import type {
  HoveredMessage,
  SpeechResult,
  SpeechStatus,
  SystemMode,
  VoiceMessage,
} from '../types/voice';

interface VoiceState {
  messages: VoiceMessage[];
  currentRecognition: SpeechResult | null;
  languageStats: Record<string, number>;
  systemStatus: SystemMode;
  speechStatus: SpeechStatus;
  errorMessage: string | null;
  audioAnalyser: AnalyserNode | null;
  hoveredMessage: HoveredMessage | null;
  setCurrentRecognition: (result: SpeechResult | null) => void;
  addMessage: (result: SpeechResult) => void;
  setSystemStatus: (status: SystemMode) => void;
  setSpeechStatus: (status: SpeechStatus) => void;
  setErrorMessage: (message: string | null) => void;
  setAudioAnalyser: (analyser: AnalyserNode | null) => void;
  setHoveredMessage: (message: HoveredMessage | null) => void;
  resetVoiceWall: () => void;
}

function createMessageId(): string {
  return `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanResult(result: SpeechResult): SpeechResult {
  const text = stripEmoji(result.text);
  return text === result.text ? result : { ...result, text };
}

export const useVoiceStore = create<VoiceState>((set) => ({
  messages: [],
  currentRecognition: null,
  languageStats: {},
  systemStatus: 'idle',
  speechStatus: 'idle',
  errorMessage: null,
  audioAnalyser: null,
  hoveredMessage: null,

  setCurrentRecognition: (result) =>
    set({ currentRecognition: result ? cleanResult(result) : null }),

  addMessage: (result) =>
    set((state) => {
      const clean = cleanResult(result);
      const message: VoiceMessage = {
        id: clean.id || createMessageId(),
        text: clean.text,
        language: clean.language,
        languageCode: clean.languageCode,
        confidence: clean.confidence,
        timestamp: clean.timestamp,
        status: 'spawn',
      };

      const messages = [...state.messages, message];
      if (messages.length > MAX_VISIBLE_MESSAGES) {
        messages.splice(0, messages.length - MAX_VISIBLE_MESSAGES);
      }

      const languageStats = { ...state.languageStats };
      languageStats[clean.languageCode] = (languageStats[clean.languageCode] ?? 0) + 1;

      return { messages, languageStats };
    }),

  setSystemStatus: (status) => set({ systemStatus: status }),
  setSpeechStatus: (status) => set({ speechStatus: status }),
  setErrorMessage: (message) => set({ errorMessage: message }),
  setAudioAnalyser: (analyser) => set({ audioAnalyser: analyser }),
  setHoveredMessage: (message) => set({ hoveredMessage: message }),

  resetVoiceWall: () =>
    set({
      messages: [],
      currentRecognition: null,
      languageStats: {},
      systemStatus: 'idle',
      speechStatus: 'idle',
      errorMessage: null,
      hoveredMessage: null,
      audioAnalyser: null,
    }),
}));
