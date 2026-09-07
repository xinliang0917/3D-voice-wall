import { useEffect } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

const BACKDROP_Z = -4.72;
const LOGO_Y = 6.1;
const LOGO_HEIGHT = 1.15;

interface LogoBackdropProps {
  envMap: THREE.Texture | null;
}

export function LogoBackdrop({ envMap }: LogoBackdropProps) {
  const [texture] = useTexture(['/logos/unisound-main.png']);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    texture.needsUpdate = true;
  }, [texture]);

  const image = texture.image as HTMLImageElement;
  const logoWidth =
    LOGO_HEIGHT * (image.width / image.height);

  return (
    <group position={[0, LOGO_Y, BACKDROP_Z]}>
      <group>
        {/* Recessed metallic side of the raised logo */}
        <mesh position={[0.09, -0.055, -0.115]} renderOrder={1}>
          <planeGeometry args={[logoWidth, LOGO_HEIGHT]} />
          <meshPhysicalMaterial
            map={texture}
            color="#12325f"
            transparent
            metalness={0.96}
            roughness={0.34}
            envMapIntensity={0.4}
            fog={false}
          />
        </mesh>
        {/* Secondary depth layer, tinted with the brand blue */}
        <mesh position={[0.035, -0.022, -0.06]} renderOrder={2}>
          <planeGeometry args={[logoWidth, LOGO_HEIGHT]} />
          <meshPhysicalMaterial
            map={texture}
            color="#2e6cc9"
            transparent
            metalness={0.88}
            roughness={0.24}
            envMapIntensity={0.5}
            fog={false}
          />
        </mesh>
        {/* Cool highlight edge for the metallic bevel */}
        <mesh position={[-0.045, 0.032, -0.018]} renderOrder={3}>
          <planeGeometry args={[logoWidth, LOGO_HEIGHT]} />
          <meshPhysicalMaterial
            map={texture}
            color="#dff3ff"
            transparent
            opacity={0.7}
            metalness={0.9}
            roughness={0.16}
            envMapIntensity={0.6}
            fog={false}
          />
        </mesh>
        {/* Polished metal logo face */}
        <mesh renderOrder={4}>
          <planeGeometry args={[logoWidth, LOGO_HEIGHT]} />
          <meshPhysicalMaterial
            map={texture}
            bumpMap={texture}
            bumpScale={0.16}
            alphaTest={0.12}
            transparent
            depthWrite={false}
            color="#ffffff"
            metalness={0.05}
            roughness={0.22}
            clearcoat={1}
            clearcoatRoughness={0.08}
            envMap={envMap}
            envMapIntensity={1.8}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      </group>
      <pointLight
        position={[-2.1, 1.25, 0.75]}
        intensity={2.4}
        distance={7}
        decay={2}
        color="#dcecff"
      />
      <pointLight
        position={[2.25, -1.45, 0.7]}
        intensity={1.35}
        distance={7}
        decay={2}
        color="#7db8ff"
      />
    </group>
  );
}
