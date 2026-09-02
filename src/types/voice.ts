export type MessageStatus = 'spawn' | 'flying' | 'settling' | 'fixed';
export type SystemMode = 'idle' | 'listening' | 'demo' | 'error';
export type SpeechStatus =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'ready'
  | 'error';

export interface SpeechResult {
  id: string;
  text: string;
  language: string;
  languageCode: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

export interface VoiceMessage {
  id: string;
  text: string;
  language: string;
  languageCode: string;
  confidence: number;
  timestamp: number;
  status: MessageStatus;
}

export interface HoveredMessage {
  id: string;
  text: string;
  language: string;
  confidence: number;
  timestamp: number;
}
