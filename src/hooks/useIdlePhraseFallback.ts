import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../store/voiceStore';
import { createIdleSpeechResult } from '../utils/idlePhrases';

const IDLE_WAIT_MS = 10_000;
const VOICE_CHECK_MS = 100;
const VOICE_RMS_THRESHOLD = 0.04;

function isVoiceLevelAboveThreshold(analyser: AnalyserNode): boolean {
  const timeData = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(timeData);

  let sum = 0;
  for (const value of timeData) {
    const delta = (value - 128) / 128;
    sum += delta * delta;
  }
  return Math.sqrt(sum / timeData.length) > VOICE_RMS_THRESHOLD;
}

export function useIdlePhraseFallback(): void {
  const systemStatus = useVoiceStore((state) => state.systemStatus);
  const audioAnalyser = useVoiceStore((state) => state.audioAnalyser);
  const currentRecognition = useVoiceStore((state) => state.currentRecognition);
  const addMessage = useVoiceStore((state) => state.addMessage);
  const lastVoiceActivityRef = useRef(0);

  useEffect(() => {
    if (systemStatus !== 'listening') return;
    lastVoiceActivityRef.current = performance.now();

    const idleTimer = setInterval(() => {
      const now = performance.now();
      if (audioAnalyser && isVoiceLevelAboveThreshold(audioAnalyser)) {
        lastVoiceActivityRef.current = now;
      }

      if (now - lastVoiceActivityRef.current >= IDLE_WAIT_MS) {
        addMessage(createIdleSpeechResult());
        lastVoiceActivityRef.current = now;
      }
    }, VOICE_CHECK_MS);

    return () => clearInterval(idleTimer);
  }, [addMessage, audioAnalyser, systemStatus]);

  useEffect(() => {
    if (systemStatus !== 'listening' || !currentRecognition) return;
    lastVoiceActivityRef.current = performance.now();
  }, [currentRecognition, systemStatus]);
}
