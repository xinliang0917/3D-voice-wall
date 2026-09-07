import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useThree } from '@react-three/fiber';
import { LogoBackdrop } from './LogoBackdrop';

type Vec3 = [number, number, number];

const NEAR_Z = -4.42;
const FAR_Z = -11.65;
const NEAR_HALF_W = 8.4;
const NEAR_TOP = 10.5;
const NEAR_BOTTOM = -10.5;
const FAR_HALF_W = 4.2;
const FAR_TOP = 5.25;
const FAR_BOTTOM = -5.25;

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
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  envMap: THREE.Texture | null;
}

function EdgeBar({
  start,
  end,
  radius = 0.085,
  color = '#0d3272',
  emissive = '#2f79ea',
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
        color={color}
        emissive={emissive}
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

function NeonSegment({
  start,
  end,
  radius = 0.04,
  extension = 0,
}: {
  start: Vec3;
  end: Vec3;
  radius?: number;
  extension?: number;
}) {
  const { geometry, position, quaternion } = useMemo(() => {
    const startVector = new THREE.Vector3(...start);
    const endVector = new THREE.Vector3(...end);
    const direction = endVector.clone().sub(startVector);
    const normalized = direction.clone().normalize();
    const from = startVector.clone().sub(normalized.clone().multiplyScalar(extension));
    const to = endVector.clone().add(normalized.clone().multiplyScalar(extension));
    const length = from.distanceTo(to);
    const segmentGeometry = new THREE.CylinderGeometry(
      radius,
      radius,
      length,
      10,
      1,
      true,
    );
    const segmentPosition = from.clone().add(to).multiplyScalar(0.5);
    const segmentQuaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normalized,
    );
    return {
      geometry: segmentGeometry,
      position: segmentPosition,
      quaternion: segmentQuaternion,
    };
  }, [end, extension, radius, start]);

  return (
    <mesh geometry={geometry} position={position} quaternion={quaternion}>
      <meshPhysicalMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={4}
        metalness={0}
        roughness={0.2}
        fog={false}
      />
    </mesh>
  );
}

function NeonChannel() {
  const horizontalZ = -10.5;
  const horizontalY = 5.43;
  const leftCornerX = -3.46;
  const rightCornerX = 3.46;
  const leftTop: Vec3 = [-4.9, 7.16, -4.55];
  const rightTop: Vec3 = [4.9, 7.16, -4.55];

  return (
    <group>
      <NeonSegment
        start={leftTop}
        end={[leftCornerX, horizontalY, horizontalZ]}
      />
      <NeonSegment
        start={[leftCornerX, horizontalY, horizontalZ]}
        end={[rightCornerX, horizontalY, horizontalZ]}
      />
      <NeonSegment
        start={[rightCornerX, horizontalY, horizontalZ]}
        end={rightTop}
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

      <NeonChannel />
      <EdgeBar
        start={[-FAR_HALF_W, FAR_TOP, FAR_Z]}
        end={[FAR_HALF_W, FAR_TOP, FAR_Z]}
        radius={0.09}
        emissiveIntensity={0.5}
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
        radius={0.09}
        emissiveIntensity={0.5}
        envMap={envMap}
      />
      <EdgeBar
        start={[FAR_HALF_W, FAR_BOTTOM, FAR_Z]}
        end={[FAR_HALF_W, FAR_TOP, FAR_Z]}
        radius={0.09}
        emissiveIntensity={0.5}
        envMap={envMap}
      />

      <pointLight
        position={[-4.26, 6.4, -8.1]}
        intensity={2.2}
        distance={26}
        decay={2}
        color="#4f9bff"
      />
      <pointLight
        position={[4.26, 6.4, -8.1]}
        intensity={2.2}
        distance={26}
        decay={2}
        color="#4f9bff"
      />

      <LogoBackdrop envMap={envMap} />
    </group>
  );
}
