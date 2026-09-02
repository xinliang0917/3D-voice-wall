import { useEffect } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

const BACKDROP_Z = -4.72;
const U2_HEIGHT = 2.0;
const UNISOUND_HEIGHT = 1.1;
const LOGO_GAP = 0.9;
const LOGO_OPACITY = 0.8;

export function LogoBackdrop() {
  const [unisoundTexture, u2Texture] = useTexture([
    '/logos/unisound.png',
    '/logos/u2.png',
  ]);

  useEffect(() => {
    [unisoundTexture, u2Texture].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    });
  }, [unisoundTexture, u2Texture]);

  const unisoundWidth =
    UNISOUND_HEIGHT * (unisoundTexture.image.width / unisoundTexture.image.height);
  const u2Width = U2_HEIGHT * (u2Texture.image.width / u2Texture.image.height);
  const totalWidth = unisoundWidth + u2Width + LOGO_GAP;
  const unisoundX = -totalWidth / 2 + unisoundWidth / 2;
  const u2X = totalWidth / 2 - u2Width / 2;

  return (
    <group position={[0, 0, BACKDROP_Z]}>
      <mesh position={[unisoundX, 0, 0]}>
        <planeGeometry args={[unisoundWidth, UNISOUND_HEIGHT]} />
        <meshBasicMaterial
          map={unisoundTexture}
          transparent
          opacity={LOGO_OPACITY}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <mesh position={[u2X, 0, 0]}>
        <planeGeometry args={[u2Width, U2_HEIGHT]} />
        <meshBasicMaterial
          map={u2Texture}
          transparent
          opacity={LOGO_OPACITY}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
