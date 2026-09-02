import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useThree } from '@react-three/fiber';

type Vec3 = [number, number, number];

const NEAR_Z = -4.42;
const FAR_Z = -11.65;
const NEAR_HALF_W = 16.9;
const NEAR_TOP = 10.2;
const NEAR_BOTTOM = -10.2;
const FAR_HALF_W = 7.0;
const FAR_TOP = 5.5;
const FAR_BOTTOM = -5.5;

const MID_FRAME_Z = -8.0;

function colorToTuple(hex: string): [number, number, number] {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
}

function createPanelGeometry(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  c0: [number, number, number],
  c1: [number, number, number],
  c2: [number, number, number],
  c3: [number, number, number],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        ...p0,
        ...p1,
        ...p2,
        ...p0,
        ...p2,
        ...p3,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      [
        ...c0,
        ...c1,
        ...c2,
        ...c0,
        ...c2,
        ...c3,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function usePanelGeometries(): {
  ceiling: THREE.BufferGeometry;
  floor: THREE.BufferGeometry;
  left: THREE.BufferGeometry;
  right: THREE.BufferGeometry;
} {
  return useMemo(() => {
    const ceilingColorNear = colorToTuple('#071c43');
    const ceilingColorFar = colorToTuple('#1453ad');
    const ceiling = createPanelGeometry(
      [-NEAR_HALF_W, NEAR_TOP, NEAR_Z],
      [NEAR_HALF_W, NEAR_TOP, NEAR_Z],
      [FAR_HALF_W, FAR_TOP, FAR_Z],
      [-FAR_HALF_W, FAR_TOP, FAR_Z],
      ceilingColorNear,
      ceilingColorNear,
      ceilingColorFar,
      ceilingColorFar,
    );

    const floorColorNear = colorToTuple('#03102b');
    const floorColorFar = colorToTuple('#0d3d8c');
    const floor = createPanelGeometry(
      [-NEAR_HALF_W, NEAR_BOTTOM, NEAR_Z],
      [NEAR_HALF_W, NEAR_BOTTOM, NEAR_Z],
      [FAR_HALF_W, FAR_BOTTOM, FAR_Z],
      [-FAR_HALF_W, FAR_BOTTOM, FAR_Z],
      floorColorNear,
      floorColorNear,
      floorColorFar,
      floorColorFar,
    );

    const leftColorNear = colorToTuple('#051536');
    const leftColorFar = colorToTuple('#134da4');
    const left = createPanelGeometry(
      [-NEAR_HALF_W, NEAR_TOP, NEAR_Z],
      [-NEAR_HALF_W, NEAR_BOTTOM, NEAR_Z],
      [-FAR_HALF_W, FAR_BOTTOM, FAR_Z],
      [-FAR_HALF_W, FAR_TOP, FAR_Z],
      leftColorNear,
      leftColorNear,
      leftColorFar,
      leftColorFar,
    );

    const right = createPanelGeometry(
      [NEAR_HALF_W, NEAR_TOP, NEAR_Z],
      [NEAR_HALF_W, NEAR_BOTTOM, NEAR_Z],
      [FAR_HALF_W, FAR_BOTTOM, FAR_Z],
      [FAR_HALF_W, FAR_TOP, FAR_Z],
      leftColorNear,
      leftColorNear,
      leftColorFar,
      leftColorFar,
    );

    return { ceiling, floor, left, right };
  }, []);
}

function interpolateDimension(
  near: number,
  far: number,
  z: number,
): number {
  const progress = (z - NEAR_Z) / (FAR_Z - NEAR_Z);
  return THREE.MathUtils.lerp(near, far, progress);
}

function useBarTransform(start: Vec3, end: Vec3, radius: number) {
  return useMemo(() => {
    const startVector = new THREE.Vector3(...start);
    const endVector = new THREE.Vector3(...end);
    const direction = endVector.clone().sub(startVector);
    const length = direction.length();
    const normalized = direction.clone().normalize();
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      length,
      10,
      1,
      true,
    );
    const position = startVector.clone().add(endVector).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normalized,
    );
    return { geometry, position, quaternion };
  }, [end, radius, start]);
}

interface EdgeBarProps {
  start: Vec3;
  end: Vec3;
  radius?: number;
  emissiveIntensity?: number;
  envMap: THREE.Texture | null;
}

function EdgeBar({
  start,
  end,
  radius = 0.085,
  emissiveIntensity = 0.34,
  envMap,
}: EdgeBarProps) {
  const { geometry, position, quaternion } = useBarTransform(
    start,
    end,
    radius,
  );

  return (
    <mesh geometry={geometry} position={position} quaternion={quaternion}>
      <meshPhysicalMaterial
        color="#0d3272"
        emissive="#2f79ea"
        emissiveIntensity={emissiveIntensity}
        envMap={envMap}
        envMapIntensity={0.65}
        metalness={0.62}
        roughness={0.34}
        clearcoat={0.28}
        clearcoatRoughness={0.5}
      />
    </mesh>
  );
}

function createRadialTexture(
  stops: Array<[number, string]>,
  transparent = false,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(
      256,
      256,
      12,
      256,
      256,
      280,
    );
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (transparent) texture.needsUpdate = true;
  return texture;
}

function RibFrame({
  z,
  envMap,
}: {
  z: number;
  envMap: THREE.Texture | null;
}) {
  const halfWidth = interpolateDimension(NEAR_HALF_W, FAR_HALF_W, z);
  const top = interpolateDimension(NEAR_TOP, FAR_TOP, z);
  const bottom = interpolateDimension(NEAR_BOTTOM, FAR_BOTTOM, z);
  const radius = 0.075;

  return (
    <group>
      <EdgeBar
        start={[-halfWidth, top, z]}
        end={[halfWidth, top, z]}
        radius={radius}
        emissiveIntensity={0.18}
        envMap={envMap}
      />
      <EdgeBar
        start={[-halfWidth, bottom, z]}
        end={[halfWidth, bottom, z]}
        radius={radius}
        emissiveIntensity={0.14}
        envMap={envMap}
      />
      <EdgeBar
        start={[-halfWidth, bottom, z]}
        end={[-halfWidth, top, z]}
        radius={radius}
        emissiveIntensity={0.2}
        envMap={envMap}
      />
      <EdgeBar
        start={[halfWidth, bottom, z]}
        end={[halfWidth, top, z]}
        radius={radius}
        emissiveIntensity={0.2}
        envMap={envMap}
      />
    </group>
  );
}

function WallMaterial({ envMap }: { envMap: THREE.Texture | null }) {
  return (
    <meshPhysicalMaterial
      vertexColors
      color="#ffffff"
      envMap={envMap}
      envMapIntensity={0.52}
      metalness={0.22}
      roughness={0.5}
      clearcoat={0.18}
      clearcoatRoughness={0.55}
      side={THREE.DoubleSide}
    />
  );
}

export function Room() {
  const gl = useThree((state) => state.gl);
  const geometries = usePanelGeometries();
  const [envMap, setEnvMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(environment, 0.04).texture;
    setEnvMap(texture);

    return () => {
      environment.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const material = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material.dispose();
          }
        }
      });
      texture.dispose();
      pmrem.dispose();
    };
  }, [gl]);

  const screenTexture = useMemo(
    () =>
      createRadialTexture([
        [0, '#9fd0ff'],
        [0.32, '#55a2ff'],
        [0.62, '#2069d9'],
        [0.84, '#123f92'],
        [1, '#0b2a69'],
      ]),
    [],
  );

  const glowTexture = useMemo(
    () =>
      createRadialTexture([
        [0, 'rgba(130, 190, 255, 0.92)'],
        [0.38, 'rgba(70, 135, 245, 0.5)'],
        [0.68, 'rgba(35, 95, 225, 0.16)'],
        [1, 'rgba(8, 30, 90, 0)'],
      ]),
    [],
  );

  return (
    <group>
      <mesh geometry={geometries.ceiling} receiveShadow>
        <WallMaterial envMap={envMap} />
      </mesh>
      <mesh geometry={geometries.floor} receiveShadow>
        <WallMaterial envMap={envMap} />
      </mesh>
      <mesh geometry={geometries.left} receiveShadow>
        <WallMaterial envMap={envMap} />
      </mesh>
      <mesh geometry={geometries.right} receiveShadow>
        <WallMaterial envMap={envMap} />
      </mesh>

      <EdgeBar
        start={[-NEAR_HALF_W, NEAR_TOP, NEAR_Z]}
        end={[-FAR_HALF_W, FAR_TOP, FAR_Z]}
        radius={0.12}
        emissiveIntensity={0.42}
        envMap={envMap}
      />
      <EdgeBar
        start={[NEAR_HALF_W, NEAR_TOP, NEAR_Z]}
        end={[FAR_HALF_W, FAR_TOP, FAR_Z]}
        radius={0.12}
        emissiveIntensity={0.42}
        envMap={envMap}
      />
      <EdgeBar
        start={[-NEAR_HALF_W, NEAR_BOTTOM, NEAR_Z]}
        end={[-FAR_HALF_W, FAR_BOTTOM, FAR_Z]}
        radius={0.1}
        emissiveIntensity={0.32}
        envMap={envMap}
      />
      <EdgeBar
        start={[NEAR_HALF_W, NEAR_BOTTOM, NEAR_Z]}
        end={[FAR_HALF_W, FAR_BOTTOM, FAR_Z]}
        radius={0.1}
        emissiveIntensity={0.32}
        envMap={envMap}
      />

      <RibFrame z={MID_FRAME_Z} envMap={envMap} />

      <mesh position={[0, 0, FAR_Z - 0.42]}>
        <planeGeometry args={[20, 16]} />
        <meshBasicMaterial
          map={glowTexture}
          transparent
          opacity={0.42}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>

      <mesh position={[0, 0, FAR_Z - 0.22]}>
        <planeGeometry args={[FAR_HALF_W * 2, FAR_TOP - FAR_BOTTOM]} />
        <meshBasicMaterial map={screenTexture} color="#ffffff" fog={false} />
      </mesh>

      <EdgeBar
        start={[-FAR_HALF_W, FAR_TOP, FAR_Z]}
        end={[FAR_HALF_W, FAR_TOP, FAR_Z]}
        radius={0.11}
        emissiveIntensity={0.62}
        envMap={envMap}
      />
      <EdgeBar
        start={[-FAR_HALF_W, FAR_BOTTOM, FAR_Z]}
        end={[FAR_HALF_W, FAR_BOTTOM, FAR_Z]}
        radius={0.11}
        emissiveIntensity={0.52}
        envMap={envMap}
      />
      <EdgeBar
        start={[-FAR_HALF_W, FAR_BOTTOM, FAR_Z]}
        end={[-FAR_HALF_W, FAR_TOP, FAR_Z]}
        radius={0.12}
        emissiveIntensity={0.72}
        envMap={envMap}
      />
      <EdgeBar
        start={[FAR_HALF_W, FAR_BOTTOM, FAR_Z]}
        end={[FAR_HALF_W, FAR_TOP, FAR_Z]}
        radius={0.12}
        emissiveIntensity={0.72}
        envMap={envMap}
      />

      <pointLight
        position={[0, -1.4, FAR_Z + 1.8]}
        intensity={3.2}
        distance={18}
        decay={2}
        color="#74aaff"
      />
    </group>
  );
}
