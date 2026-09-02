import { useState } from 'react';
import { Languages, Mic, Play, RotateCcw, Square } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../utils/language';
import type { SystemMode } from '../types/voice';

interface ControlBarProps {
  mode: SystemMode;
  language: string;
  onLanguageChange: (language: string) => void;
  onStart: () => void;
  onDemo: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function ControlBar({
  mode,
  language,
  onLanguageChange,
  onStart,
  onDemo,
  onStop,
  onReset,
}: ControlBarProps) {
  const [showLanguage, setShowLanguage] = useState(false);

  return (
    <div className="controls">
      <button
        className={`control-button control-button-icon ${showLanguage ? 'control-button-active' : ''}`}
        onClick={() => setShowLanguage((visible) => !visible)}
        title="Recognition language"
      >
        <Languages size={15} />
      </button>
      {showLanguage && (
        <label className="language-select">
          <span className="sr-only">Recognition language</span>
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
            disabled={mode === 'listening'}
          >
            <option value="">Auto · 多语种</option>
            {SUPPORTED_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.nativeName} · {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === 'listening' ? (
        <button className="control-button control-button-primary" onClick={onStop} title="Stop voice">
          <Square size={15} />
          <span>Stop</span>
        </button>
      ) : (
        <button className="control-button control-button-primary" onClick={onStart} title="Start listening">
          <Mic size={15} />
          <span>Listen</span>
        </button>
      )}
      <button
        className={`control-button ${mode === 'demo' ? 'control-button-active' : ''}`}
        onClick={onDemo}
        title="Run multilingual demo"
      >
        <Play size={15} />
        <span>Demo</span>
      </button>
      <button className="control-button" onClick={onReset} title="Reset voice wall">
        <RotateCcw size={15} />
        <span>Reset</span>
      </button>
    </div>
  );
}
