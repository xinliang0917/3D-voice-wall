import { useVoiceStore } from '../store/voiceStore';
import { normalizePunctuationForDisplay } from '../utils/textSanitize';
import type { SpeechStatus } from '../types/voice';

const STATUS_LABELS: Record<SpeechStatus, string> = {
  idle: 'IDLE',
  listening: 'LISTENING',
  speaking: 'HEARING',
  processing: 'RECOGNIZING',
  ready: 'READY',
  error: 'ERROR',
};

const ACTIVE_STATUSES: SpeechStatus[] = ['listening', 'speaking', 'processing', 'ready'];

export function SpeechHud() {
  const speechStatus = useVoiceStore((state) => state.speechStatus);
  const currentRecognition = useVoiceStore((state) => state.currentRecognition);
  const errorMessage = useVoiceStore((state) => state.errorMessage);
  const isActive = ACTIVE_STATUSES.includes(speechStatus);

  return (
    <div className="speech-hud">
      <div className={`status-pill ${isActive ? 'status-pill-active' : ''}`}>
        <span className={`status-dot ${isActive ? 'status-dot-active' : ''}`} />
        <span>{STATUS_LABELS[speechStatus]}</span>
      </div>
      {errorMessage && <div className="speech-error">{errorMessage}</div>}
      {currentRecognition && (
        <div className="current-recognition">
          <div className="recognition-card">
            <div className="recognition-label">
              <span className="listening-mark">●</span>
              {currentRecognition.isFinal ? 'READY' : 'RECOGNIZING'}
            </div>
            <div className="recognition-language">{currentRecognition.language}</div>
            <div className="recognition-text">
              {normalizePunctuationForDisplay(
                currentRecognition.text,
                currentRecognition.languageCode,
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
