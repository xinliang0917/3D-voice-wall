import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVoiceStore } from './store/voiceStore';
import { useSpeechController } from './hooks/useSpeechController';
import { useIdlePhraseFallback } from './hooks/useIdlePhraseFallback';
import { Room } from './components/Room';
import { LanguageStats } from './components/LanguageStats';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { VoiceForegroundLayer } from './components/VoiceForegroundLayer';
import { ControlBar } from './components/ControlBar';
import { HoverInfo } from './components/HoverInfo';
import { PostProcessing } from './three/PostProcessing';

function DisplayCamera() {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.viewport.aspect);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    const isPortrait = aspect < 1;
    perspective.fov = isPortrait ? 42 : 50;
    perspective.updateProjectionMatrix();
  }, [aspect, camera]);

  return null;
}

export default function App() {
  const systemStatus = useVoiceStore((state) => state.systemStatus);
  const { startMicrophone, startDemo, stop, reset } = useSpeechController();
  useIdlePhraseFallback();
  const [language, setLanguage] = useState('');

  return (
    <div className="app">
      <div className="canvas-shell">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 0, 14.2], fov: 50 }}
          onCreated={({ camera }) => camera.lookAt(0, 0, -4.25)}
          gl={{ antialias: true, alpha: true }}
        >
          <DisplayCamera />
          <color attach="background" args={['#0b2f6b']} />
          <fog attach="fog" args={['#0b2f6b', 18, 38]} />
          <ambientLight intensity={0.9} color="#ffffff" />
          <directionalLight
            position={[5.5, 8, 6]}
            intensity={2.5}
            color="#ffffff"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-16}
            shadow-camera-right={16}
            shadow-camera-top={14}
            shadow-camera-bottom={-14}
            shadow-camera-near={0.5}
            shadow-camera-far={36}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
          />
          <directionalLight
            position={[-7, 4, 2]}
            intensity={0.7}
            color="#ffffff"
          />
          <pointLight position={[0, 2.5, 5]} intensity={0.6} color="#ffffff" />
          <Room />
          <PostProcessing />
        </Canvas>
      </div>

      <div className="ui-layer">
        <LanguageStats />
        <VoiceVisualizer />
        <VoiceForegroundLayer />
        <HoverInfo />
        <ControlBar
          mode={systemStatus}
          language={language}
          onLanguageChange={setLanguage}
          onStart={() => void startMicrophone(language)}
          onDemo={() => void startDemo()}
          onStop={() => void stop()}
          onReset={() => void reset()}
        />
      </div>
    </div>
  );
}
