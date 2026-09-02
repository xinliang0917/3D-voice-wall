import { AnimatePresence, motion } from 'framer-motion';
import { useVoiceStore } from '../store/voiceStore';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

export function HoverInfo() {
  const hovered = useVoiceStore((state) => state.hoveredMessage);

  return (
    <div className="hover-info">
      <AnimatePresence>
        {hovered && (
          <motion.div
            key={hovered.id}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="hover-card"
          >
            <div className="hover-language">{hovered.language}</div>
            <div className="hover-meta">
              Confidence {Math.round(hovered.confidence * 100)}% · {formatTime(hovered.timestamp)}
            </div>
            <div className="hover-text">{hovered.text}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
