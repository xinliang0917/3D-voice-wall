import * as THREE from 'three';
import { Z_BACK } from '../config';

export interface TextPlaneBounds {
  halfWidth: number;
  halfHeight: number;
}

export function getTextPlaneBounds(
  camera: THREE.PerspectiveCamera,
): TextPlaneBounds {
  const distance = Math.max(0.001, camera.position.z - Z_BACK);
  const aspect = Math.max(0.001, camera.aspect);
  const fov = aspect < 1 ? 42 : 50;
  const halfHeight =
    Math.tan(THREE.MathUtils.degToRad(fov) * 0.5) * distance;
  const halfWidth = halfHeight * aspect;
  return { halfWidth, halfHeight };
}
