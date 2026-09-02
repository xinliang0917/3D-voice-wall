import * as THREE from 'three';
import { Text } from 'three-text';
import { woff2Decode } from 'woff-lib/woff2/decode';
import { getLanguageMeta } from '../utils/language';
import { sanitizeTextForFont } from '../utils/textSanitize';

const FONT_PATH = '/fonts/';

let readyPromise: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      Text.setHarfBuzzPath('/hb/hb.wasm');
      Text.enableWoff2(woff2Decode);
      await Text.init();
    })();
  }
  return readyPromise;
}

export interface TextGeometryResult {
  geometry: THREE.BufferGeometry;
  width: number;
  height: number;
  depth: number;
}

function addExtrusionMaterialGroups(geometry: THREE.BufferGeometry): void {
  const index = geometry.index;
  const normal = geometry.getAttribute('normal');
  if (!index || !normal) return;

  geometry.clearGroups();
  const triangleCount = Math.floor(index.count / 3);
  let current: { materialIndex: number; start: number; count: number } | null = null;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    let z = 0;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = index.getX(triangle * 3 + corner);
      z += normal.getZ(vertexIndex);
    }
    z /= 3;

    const materialIndex = z > 0.45 ? 0 : z < -0.45 ? 1 : 2;
    const start = triangle * 3;
    if (
      current &&
      current.materialIndex === materialIndex &&
      current.start + current.count === start
    ) {
      current.count += 3;
    } else {
      if (current) {
        const last = geometry.groups[geometry.groups.length - 1];
        if (last) last.count = current.count;
      }
      current = { materialIndex, start, count: 3 };
      geometry.addGroup(start, 3, materialIndex);
    }
  }
  if (current) {
    const last = geometry.groups[geometry.groups.length - 1];
    if (last) last.count = current.count;
  }
}

export async function createTextGeometry(
  text: string,
  languageCode: string,
  size: number,
  depth: number,
): Promise<TextGeometryResult | null> {
  const language = getLanguageMeta(languageCode);
  const font = `${FONT_PATH}${language.font}?v=2`;
  const renderText = sanitizeTextForFont(text, languageCode);
  if (!renderText) return null;

  try {
    await ensureReady();
    const result = await Text.create({
      text: renderText,
      font,
      size,
      depth,
      // Static CJK fonts already have clean outlines; overlap removal can drop thin strokes.
      removeOverlaps: false,
      curveFidelity: {
        distanceTolerance: 0.2,
        angleTolerance: 0.12,
      },
      layout: {
        direction: language.direction,
      },
    });

    const geometry = result.geometry;
    geometry.center();
    addExtrusionMaterialGroups(geometry);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) {
      geometry.dispose();
      return null;
    }

    return {
      geometry,
      width: box.max.x - box.min.x,
      height: box.max.y - box.min.y,
      depth: box.max.z - box.min.z,
    };
  } catch (error) {
    console.warn(`[TextRenderer3D] Failed to render text "${text}":`, error);
    return null;
  }
}
