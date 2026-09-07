import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../store/voiceStore';

const BAR_COUNT = 36;

function smoothLevel(
  current: number,
  target: number,
  speed: number,
): number {
  return current + (target - current) * speed;
}

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
    const levels = new Array<number>(BAR_COUNT).fill(0.08);
    const frequencyData = analyser
      ? new Uint8Array(analyser.frequencyBinCount)
      : null;
    const active = systemStatus === 'listening' || systemStatus === 'demo';

    const draw = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);

      if (analyser && frequencyData) {
        analyser.getByteFrequencyData(frequencyData);
        const binsPerBar = Math.max(
          1,
          Math.floor(frequencyData.length / BAR_COUNT),
        );
        for (let bar = 0; bar < BAR_COUNT; bar += 1) {
          let peak = 0;
          const start = bar * binsPerBar;
          for (
            let index = start;
            index < Math.min(start + binsPerBar, frequencyData.length);
            index += 1
          ) {
            peak = Math.max(peak, frequencyData[index] / 255);
          }
          const target = active ? 0.08 + peak * 0.8 : 0.04 + peak * 0.3;
          levels[bar] = smoothLevel(
            levels[bar],
            target,
            active ? 0.42 : 0.2,
          );
        }
      } else {
        for (let bar = 0; bar < BAR_COUNT; bar += 1) {
          const wave =
            Math.abs(Math.sin(time * 0.0021 + bar * 0.36)) * 0.52 +
            Math.abs(Math.sin(time * 0.0031 + bar * 0.23)) * 0.3 +
            Math.sin(time * 0.0014 + bar * 0.9) * 0.08;
          const target = active ? 0.12 + wave : 0.08 + wave * 0.65;
          levels[bar] = smoothLevel(
            levels[bar],
            Math.max(0.03, target),
            active ? 0.24 : 0.14,
          );
        }
      }

      const step = width / BAR_COUNT;
      const barWidth = Math.max(6, step * 0.56);
      const centerY = height * 0.5;

      context.save();
      context.shadowColor = 'rgba(37, 99, 235, 0.28)';
      context.shadowBlur = active ? 10 : 5;
      context.strokeStyle = '#2563eb';
      context.lineWidth = barWidth;
      context.lineCap = 'round';
      context.beginPath();

      for (let bar = 0; bar < BAR_COUNT; bar += 1) {
        const x = (bar + 0.5) * step;
        const halfHeight = Math.max(
          2.5,
          (0.14 + levels[bar]) * height * 0.45,
        );
        context.moveTo(x, centerY - halfHeight);
        context.lineTo(x, centerY + halfHeight);
      }

      context.stroke();
      context.restore();

      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [analyser, systemStatus]);

  return (
    <div className="voice-visualizer">
      <canvas
        ref={canvasRef}
        className="voice-visualizer-canvas"
        width={960}
        height={90}
      />
    </div>
  );
}
