import * as THREE from 'three';
import { MAX_TEXT_WIDTH, WALL_BOTTOM_Y, Z_BACK } from '../config';

export interface DanmakuRegion {
  halfWidth: number;
  topY: number;
  bottomY: number;
  maxLineWidth: number;
  lineVisualLimit: number;
  maxStones: number;
  usableArea: number;
  occupancyLimit: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPlaneDimensions(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): { halfWidth: number; halfHeight: number } {
  const aspect = width / height;
  const distance = Math.max(0.001, camera.position.z - Z_BACK);
  const fov = aspect < 1 ? 42 : 50;
  const halfHeight =
    Math.tan(THREE.MathUtils.degToRad(fov) * 0.5) * distance;
  return {
    halfWidth: halfHeight * Math.max(0.001, aspect),
    halfHeight,
  };
}

/**
 * Derives a compact, readable danmaku workspace from the current camera and
 * CSS viewport. The vertical top boundary sits below the top HUD/visualizer,
 * while the bottom boundary keeps the natural landing line clear of controls.
 */
export function getDanmakuRegion(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): DanmakuRegion {
  const { halfWidth: fullHalfWidth, halfHeight } = getPlaneDimensions(
    camera,
    width,
    height,
  );
  const aspect = width / height;
  const sideSafeFraction = aspect < 0.8 ? 0.9 : 0.94;
  const halfWidth = Math.max(1.2, fullHalfWidth * sideSafeFraction);
  const topSafeFraction = aspect < 0.8 ? 0.23 : 0.21;
  const topY = halfHeight * (1 - topSafeFraction * 2);
  const bottomY = WALL_BOTTOM_Y;
  const regionWidth = halfWidth * 2;
  const usableArea = Math.max(
    8,
    regionWidth * (Math.abs(bottomY) + Math.max(topY, 0)),
  );
  const maxLineWidth = Math.min(
    MAX_TEXT_WIDTH,
    Math.max(2.2, regionWidth * 0.62),
  );
  const lineVisualLimit = Math.round(
    clamp(maxLineWidth / 0.62, 8, 13),
  );

  return {
    halfWidth,
    topY,
    bottomY,
    maxLineWidth,
    lineVisualLimit,
    maxStones: Math.round(clamp(regionWidth / 0.72, 9, 26)),
    usableArea,
    occupancyLimit: usableArea * 0.68,
  };
}
