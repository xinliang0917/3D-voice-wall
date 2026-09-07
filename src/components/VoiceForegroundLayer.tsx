import { useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { VoiceTextManager } from './VoiceTextManager';

function PortraitCamera() {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.viewport.aspect);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    perspective.fov = aspect < 1 ? 42 : 50;
    perspective.updateProjectionMatrix();
  }, [aspect, camera]);

  return null;
}

export function VoiceForegroundLayer() {
  return (
    <div className="text-foreground-layer">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 14.2], fov: 50 }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, 0, -4.25);
          gl.setClearColor(0x000000, 0);
        }}
        gl={{
          alpha: true,
          premultipliedAlpha: false,
          antialias: true,
        }}
      >
        <PortraitCamera />
        <ambientLight intensity={1.05} color="#ffffff" />
        <directionalLight
          position={[5.5, 8, 6]}
          intensity={2.1}
          color="#ffffff"
        />
        <directionalLight
          position={[-7, 4, 2]}
          intensity={0.85}
          color="#ffffff"
        />
        <pointLight
          position={[0, 2.5, 5]}
          intensity={0.9}
          color="#ffffff"
        />
        <VoiceTextManager foreground />
      </Canvas>
    </div>
  );
}
