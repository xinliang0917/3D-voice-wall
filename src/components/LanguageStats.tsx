import { useVoiceStore } from '../store/voiceStore';
import { getLanguageMeta } from '../utils/language';

const FLAGS: Record<string, string> = {
  'zh-CN': '🇨🇳',
  'en-US': '🇬🇧',
  'ja-JP': '🇯🇵',
  'ko-KR': '🇰🇷',
  'fr-FR': '🇫🇷',
  'es-ES': '🇪🇸',
  'de-DE': '🇩🇪',
  'ru-RU': '🇷🇺',
  'ar-SA': '🇸🇦',
  'th-TH': '🇹🇭',
  'vi-VN': '🇻🇳',
  'id-ID': '🇮🇩',
  'ms-MY': '🇲🇾',
};

export function LanguageStats() {
  const languageStats = useVoiceStore((state) => state.languageStats);
  const totalVoices = Object.keys(languageStats).length;
  const entries = Object.entries(languageStats)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <aside className="language-stats">
      <div className="panel-title">累计倾听 {totalVoices} 种声音</div>
      <div className="panel-subtitle">Total Voices Heard: {totalVoices} Languages</div>
      <div className="stat-list">
        {entries.map(({ code, count }) => {
          const language = getLanguageMeta(code);
          return (
            <div className="stat-entry" key={code}>
              <div className="stat-line">
                <span className="stat-name">
                  {FLAGS[code] ?? ''} {language.nativeName}
                </span>
                <span className="stat-count">{count} 次</span>
              </div>
              <div className="stat-line-sub">
                {language.name} — {count} times
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="stat-entry">
            <div className="stat-line">
              <span className="stat-name">等待第一句声音</span>
              <span className="stat-count">0 次</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
