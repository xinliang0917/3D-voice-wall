import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../store/voiceStore';

const SAMPLE_COUNT = 96;

export function VoiceVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyser = useVoiceStore((state) => state.audioAnalyser);
  const systemStatus = useVoiceStore((state) => state.systemStatus);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let animationFrame = 0;
    let level = 0.12;
    const timeData = analyser ? new Uint8Array(analyser.fftSize) : null;
    const active = systemStatus === 'listening' || systemStatus === 'demo';

    const draw = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);

      let targetLevel = 0.12 + 0.05 * Math.sin(time * 0.0018);
      if (analyser && timeData) {
        analyser.getByteTimeDomainData(timeData);
        let peak = 0;
        for (let index = 0; index < timeData.length; index += 4) {
          const amplitude = Math.abs(timeData[index] - 128) / 128;
          if (amplitude > peak) peak = amplitude;
        }
        targetLevel = Math.max(targetLevel, peak * (active ? 1 : 0.55));
      }
      level += (targetLevel - level) * (active ? 0.18 : 0.06);

      const midY = height * 0.5;
      const amplitude = Math.min(
        height * (0.18 + level * 0.4) * (active ? 1.3 : 0.85),
        height * 0.46,
      );
      context.shadowColor = 'rgba(100, 170, 255, 0.6)';
      context.shadowBlur = active ? 18 : 9;
      context.beginPath();
      context.strokeStyle = `rgba(170, 215, 255, ${0.38 + level * 0.5})`;
      context.lineWidth = 3.4;
      context.lineCap = 'round';

      for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
        const x = (index / SAMPLE_COUNT) * width;
        let y: number;
        if (analyser && timeData) {
          const sourceIndex = Math.floor((index / SAMPLE_COUNT) * timeData.length);
          y = midY + ((timeData[sourceIndex] - 128) / 128) * amplitude;
        } else {
          y = midY + Math.sin(time * 0.003 + index * 0.35) * amplitude * 0.5;
        }
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();

      context.beginPath();
      context.strokeStyle = `rgba(130, 190, 255, ${0.28 + level * 0.4})`;
      context.lineWidth = 1.6;
      for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
        const x = (index / SAMPLE_COUNT) * width;
        const y = midY +
          Math.sin(time * 0.002 + index * 0.4) *
            Math.min(
              height * (0.09 + level * 0.16) * (active ? 1.35 : 0.9),
              height * 0.24,
            );
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.shadowBlur = 0;

      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [analyser, systemStatus]);

  return (
    <canvas
      ref={canvasRef}
      className="voice-visualizer"
      width={960}
      height={90}
    />
  );
}
