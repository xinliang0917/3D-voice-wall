import { WALL_BOTTOM_Y } from '../config';

export function Room() {
  return (
    <group>
      <mesh position={[0, 0, -5]} receiveShadow>
        <boxGeometry args={[60, 34, 0.5]} />
        <meshStandardMaterial color="#0d347a" roughness={0.92} metalness={0.05} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, WALL_BOTTOM_Y, -3]}
        receiveShadow
      >
        <planeGeometry args={[36, 20]} />
        <meshBasicMaterial color="#0b2f6b" />
      </mesh>
    </group>
  );
}
