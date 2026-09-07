import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type RootState } from '@react-three/fiber';
import { useVoiceStore } from '../store/voiceStore';
import {
  WALL_BOTTOM_Y,
  Z_BACK,
} from '../config';
import { createTextGeometry } from '../three/TextRenderer3D';
import { publishStoneResting } from '../three/ImpactEffects';
import { ColumnLayout } from '../three/ColumnLayout';
import { StonePhysics } from '../three/StonePhysics';
import {
  getDanmakuRegion,
  type DanmakuRegion,
} from '../three/danmakuSpace';
import type { VoiceTextObject } from '../three/VoiceTextObject';
import type { HoveredMessage, VoiceMessage } from '../types/voice';
import { getLanguageMeta } from '../utils/language';
import {
  getTextLength,
  planTextLines,
  type TextFontLevel,
} from '../utils/textLayout';

const FLOATING_DURATION = 1.75;
const TRANSFORM_DURATION = 0.6;
const TEXT_DEPTH = 0.5;
const LINE_FONT_SIZES: Record<TextFontLevel, number> = {
  1: 1.12,
  2: 0.95,
  3: 0.82,
  4: 0.7,
};
const IMPACT_SHAKE_DURATION = 0.3;
const SHAKE_PIXELS = 4.5;
const IMPACT_STATE_DURATION = 0.14;
const IMPACT_TRIGGER_SPEED = 2.8;
const REST_SPEED = 0.35;
const REST_ANGULAR_SPEED = 0.3;
const REST_SETTLE_TIME = 0.28;
const WAKE_SPEED = 1.8;
const WAKE_ANGULAR_SPEED = 0.8;
const GROUP_LINE_Z_JITTER = 0.08;

const FRONT_COLOR = new THREE.Color('#ffffff');
const BACK_COLOR = new THREE.Color('#d9e8ff');
const SIDE_COLOR = new THREE.Color('#4f7fd9');
const AGED_COLOR = new THREE.Color('#b9cdf2');

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function getHalfWidth(obj: VoiceTextObject): number {
  return obj.width / 2 + 0.08;
}

function scorePlacement(
  x: number,
  width: number,
  objects: Map<string, VoiceTextObject>,
): number {
  let score = 0;
  const halfWidth = width / 2;
  objects.forEach((other) => {
    if (other.removing) return;
    const otherX = other.group.position.x;
    const otherHalf = getHalfWidth(other);
    const overlap = otherHalf + halfWidth - Math.abs(otherX - x);
    if (overlap > 0) score += overlap * 10;
    score += Math.min(0.6, Math.abs(x - otherX) * 0.06);
  });
  return score;
}

function lineSpacingForFont(fontSize: number): number {
  return fontSize + 0.24;
}

function estimateLineRenderWidth(
  text: string,
  languageCode: string,
  level: TextFontLevel,
  region: DanmakuRegion,
): number {
  const estimated =
    Math.max(0.3, getTextLength(text, languageCode)) *
    LINE_FONT_SIZES[level] *
    0.96;
  return Math.min(region.maxLineWidth, Math.max(0.65, estimated));
}

function estimateMessageWidth(
  message: VoiceMessage,
  lines: Array<{ text: string; level: TextFontLevel }>,
  region: DanmakuRegion,
): number {
  if (lines.length === 1) {
    return estimateLineRenderWidth(
      lines[0].text,
      message.languageCode,
      lines[0].level,
      region,
    );
  }
  const lineWidths = lines.map((line) =>
    estimateLineRenderWidth(
      line.text,
      message.languageCode,
      line.level,
      region,
    ),
  );
  return Math.max(...lineWidths);
}

function getRotationLimit(
  lineCount: number,
  width: number,
  height: number,
): number {
  if (lineCount > 1) return 0.05;
  const aspect = width / Math.max(0.001, height);
  if (aspect >= 3.2) return 0.045;
  if (aspect >= 2.1) return 0.085;
  if (aspect >= 1.2) return 0.13;
  return 0.2;
}

function pickRotationZ(
  lineCount: number,
  width: number,
  height: number,
): number {
  const limit = getRotationLimit(lineCount, width, height);
  const commonFraction = Math.random() < 0.72 ? 0.45 : 1;
  return randomBetween(
    -limit * commonFraction,
    limit * commonFraction,
  );
}

function createStoneBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    for (let index = 0; index < 1800; index += 1) {
      const value = Math.floor(70 + Math.random() * 120);
      context.fillStyle = `rgb(${value}, ${value}, ${value})`;
      context.fillRect(
        Math.floor(Math.random() * 128),
        Math.floor(Math.random() * 128),
        2,
        2,
      );
    }
    for (let index = 0; index < 34; index += 1) {
      context.fillStyle = `rgba(48, 48, 48, ${0.08 + Math.random() * 0.1})`;
      context.fillRect(
        Math.floor(Math.random() * 128),
        Math.floor(Math.random() * 128),
        5 + Math.floor(Math.random() * 12),
        1 + Math.floor(Math.random() * 3),
      );
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

const STONE_BUMP = createStoneBumpTexture();

let softShadowTexture: THREE.CanvasTexture | null = null;

function getSoftShadowTexture(): THREE.CanvasTexture {
  if (softShadowTexture) return softShadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(84, 84, 84, 0.72)');
    gradient.addColorStop(0.38, 'rgba(84, 84, 84, 0.4)');
    gradient.addColorStop(0.72, 'rgba(84, 84, 84, 0.12)');
    gradient.addColorStop(1, 'rgba(84, 84, 84, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  softShadowTexture = new THREE.CanvasTexture(canvas);
  return softShadowTexture;
}

interface CreateVoiceTextOptions {
  message: VoiceMessage;
  lineText: string;
  lineIndex: number;
  lineCount: number;
  fontSize: number;
  placementX: number;
  region: DanmakuRegion;
}

async function createVoiceTextObject({
  message,
  lineText,
  lineIndex,
  lineCount,
  fontSize,
  placementX,
  region,
}: CreateVoiceTextOptions): Promise<VoiceTextObject | null> {
  const result = await createTextGeometry(
    lineText,
    message.languageCode,
    fontSize,
    TEXT_DEPTH,
  );
  if (!result) return null;

  const frontMaterial = new THREE.MeshPhysicalMaterial({
    color: FRONT_COLOR.clone(),
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 0.26,
    metalness: 0.04,
    transparent: true,
    opacity: 1,
  });
  const backMaterial = new THREE.MeshPhysicalMaterial({
    color: BACK_COLOR.clone(),
    roughness: 0.4,
    metalness: 0.05,
    transparent: true,
    opacity: 1,
  });
  const sideMaterial = new THREE.MeshPhysicalMaterial({
    color: SIDE_COLOR.clone(),
    roughness: 0.62,
    metalness: 0.1,
    transparent: true,
    opacity: 1,
  });

  const mesh = new THREE.Mesh(result.geometry, [
    frontMaterial,
    backMaterial,
    sideMaterial,
  ]);
  const id = `${message.id}:${lineIndex}`;
  mesh.userData.voiceId = id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: getSoftShadowTexture(),
      color: '#0a2a66',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.renderOrder = 2;

  const baseScale = Math.min(
    1,
    region.maxLineWidth / Math.max(result.width, 0.001),
  );
  frontMaterial.emissive.set('#ffffff');
  frontMaterial.emissiveIntensity = 0.06;
  mesh.scale.setScalar(baseScale);

  const width = result.width * baseScale;
  const height = result.height * baseScale;
  const depth = result.depth * baseScale;
  const spacing = lineCount > 1 ? lineSpacingForFont(fontSize) : 0;
  const groupHalfHeight =
    lineCount > 1 ? ((lineCount - 1) * spacing) / 2 : 0;
  const centerY =
    region.topY -
    groupHalfHeight -
    Math.max(0.12, height * 0.55);
  const lineOffset =
    lineCount > 1 ? lineIndex - (lineCount - 1) / 2 : 0;
  const y = centerY + lineOffset * spacing;
  const floatRotationX = 0;
  const floatRotationY =
    lineCount > 1 ? randomBetween(-0.02, 0.02) : randomBetween(-0.04, 0.04);
  const floatRotationZ = pickRotationZ(lineCount, width, height);
  const z =
    lineCount > 1
      ? Z_BACK + randomBetween(-GROUP_LINE_Z_JITTER, GROUP_LINE_Z_JITTER)
      : Z_BACK;
  group.position.set(placementX, y, z);
  group.rotation.set(floatRotationX, floatRotationY, floatRotationZ);

  return {
    id,
    message,
    text: lineText,
    messageGroupId: message.id,
    lineIndex,
    lineCount,
    group,
    mesh,
    frontMaterial,
    backMaterial,
    sideMaterial,
    state: 'floating',
    stateTime: 0,
    floatBaseY: y,
    baseScale,
    floatRotationX,
    floatRotationY,
    floatRotationZ,
    contactShadow,
    width,
    height,
    depth,
    stableTime: 0,
    hovered: false,
    removing: false,
    landed: false,
    pendingImpact: false,
    bornAt: performance.now() / 1000,
    fallStartY: y,
    fallStartVelocity:
      lineCount > 1
        ? randomBetween(-2.1, -1.8)
        : randomBetween(-2.4, -1.7),
    shockTime: 0,
    impactShockPlayed: false,
  };
}

function disposeObject(obj: VoiceTextObject): void {
  obj.mesh.geometry.dispose();
  obj.frontMaterial.dispose();
  obj.backMaterial.dispose();
  obj.sideMaterial.dispose();
  obj.contactShadow.geometry.dispose();
  (obj.contactShadow.material as THREE.Material).dispose();
  obj.group.removeFromParent();
  obj.contactShadow.removeFromParent();
}

function updateStoneMaterial(obj: VoiceTextObject, progress: number): void {
  obj.frontMaterial.roughness = 0.26 + progress * 0.66;
  obj.frontMaterial.metalness = 0.04 * (1 - progress);
  obj.frontMaterial.bumpMap = STONE_BUMP;
  obj.frontMaterial.bumpScale = 0.32 * progress;

  obj.sideMaterial.roughness = 0.62 + progress * 0.34;
  obj.sideMaterial.bumpMap = STONE_BUMP;
  obj.sideMaterial.bumpScale = 0.46 * progress;

  obj.backMaterial.roughness = 0.4 + progress * 0.56;
  obj.backMaterial.bumpMap = STONE_BUMP;
  obj.backMaterial.bumpScale = 0.38 * progress;
}

function startFalling(obj: VoiceTextObject, physics: StonePhysics): void {
  updateStoneMaterial(obj, 1);
  obj.fallStartY = obj.group.position.y;
  obj.group.rotation.set(0, 0, obj.floatRotationZ);
  obj.state = 'falling';
  obj.stateTime = 0;
  obj.stableTime = 0;
  obj.impacted = false;
  obj.pendingImpact = false;

  if (!obj.body) {
    obj.body = physics.addStone(
      obj.id,
      obj.group.position.x,
      obj.group.position.y,
      obj.width,
      obj.height,
      obj.floatRotationZ,
    );
  } else {
    physics.setDynamic(
      obj.body,
      obj.group.position.x,
      obj.group.position.y,
      obj.floatRotationZ,
      randomBetween(-0.45, 0.45),
      obj.fallStartVelocity,
    );
  }
}

function updateHover(
  state: RootState,
  objects: Map<string, VoiceTextObject>,
  hoveredId: string | null,
  setHovered: (message: HoveredMessage | null) => void,
): string | null {
  const meshes: THREE.Mesh[] = [];
  objects.forEach((obj) => {
    if (obj.removing) return;
    meshes.push(obj.mesh);
  });

  if (meshes.length === 0) {
    if (hoveredId !== null) setHovered(null);
    return null;
  }

  state.raycaster.setFromCamera(state.pointer, state.camera);
  const hits = state.raycaster.intersectObjects(meshes, false);
  const nextId = (hits[0]?.object.userData.voiceId as string | undefined) ?? null;

  if (nextId === hoveredId) return hoveredId;

  objects.forEach((obj) => {
    obj.hovered = obj.id === nextId;
  });

  if (nextId) {
    const obj = objects.get(nextId);
    if (obj) {
      const { message } = obj;
      setHovered({
        id: message.id,
        text: message.text,
        language: getLanguageMeta(message.languageCode).name,
        confidence: message.confidence,
        timestamp: message.timestamp,
      });
    }
  } else {
    setHovered(null);
  }

  return nextId;
}

function updateContactShadow(
  obj: VoiceTextObject,
  textHalfWidth: number,
): void {
  const material = obj.contactShadow.material as THREE.MeshBasicMaterial;
  const height = Math.max(0.02, obj.group.position.y - WALL_BOTTOM_Y);
  const heightFade = THREE.MathUtils.clamp(
    1 - (height - 1.5) / 13,
    0.32,
    1,
  );
  const opacity = 0.46 * heightFade;
  const scale =
    Math.max(0.8, obj.width * 1.35) * (1 - Math.min(height * 0.012, 0.3));
  const depthScale = Math.max(0.5, obj.depth * 2.2);
  const maxShadowHalf = textHalfWidth - Math.abs(obj.group.position.x) - 0.08;
  const fittedScale =
    maxShadowHalf > 0.2
      ? Math.min(scale, maxShadowHalf * 2)
      : Math.min(scale, 0.6);
  obj.contactShadow.position.set(
    obj.group.position.x,
    WALL_BOTTOM_Y + 0.01,
    obj.group.position.z,
  );
  obj.contactShadow.scale.set(fittedScale, depthScale, 1);
  material.opacity = opacity;
}

function updateRestingMaterial(obj: VoiceTextObject): void {
  const age = obj.stateTime;
  const t = Math.min(age / 18, 1);
  obj.frontMaterial.opacity = 1 - 0.1 * t;
  obj.frontMaterial.color.copy(FRONT_COLOR).lerp(AGED_COLOR, t);
  obj.backMaterial.opacity = 1 - 0.06 * t;
  obj.sideMaterial.opacity = 1 - 0.08 * t;
}

interface VoiceTextManagerProps {
  foreground?: boolean;
}

export function VoiceTextManager({
  foreground = false,
}: VoiceTextManagerProps) {
  const messages = useVoiceStore((state) => state.messages);
  const setHoveredMessage = useVoiceStore((state) => state.setHoveredMessage);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const groupRef = useRef<THREE.Group>(null);
  const objectsRef = useRef(new Map<string, VoiceTextObject>());
  const pendingRef = useRef(new Set<string>());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const messageQueueRef = useRef<string[]>([]);
  const removedMessageIdsRef = useRef(new Set<string>());
  const stoneIdsByMessageRef = useRef(new Map<string, string[]>());
  const physicsRef = useRef<StonePhysics | null>(null);
  const layoutRef = useRef<ColumnLayout | null>(null);
  const regionRef = useRef(
    getDanmakuRegion(camera as THREE.PerspectiveCamera, 1, 1),
  );
  const hoveredIdRef = useRef<string | null>(null);
  const shakeRef = useRef({
    time: 0,
    amplitude: 0,
    direction: new THREE.Vector3(1, 0.35, 0).normalize(),
    base: new THREE.Vector3(),
    initialized: false,
  });

  const stoneIdsForMessage = (messageId: string): string[] =>
    stoneIdsByMessageRef.current.get(messageId) ?? [];

  const hasMessageStones = (messageId: string): boolean =>
    stoneIdsForMessage(messageId).some((id) => objectsRef.current.has(id));

  const removeStone = (id: string): void => {
    const object = objectsRef.current.get(id);
    if (!object) return;
    physicsRef.current?.removeBody(object.body);
    layoutRef.current?.remove(id);
    disposeObject(object);
    objectsRef.current.delete(id);

    const stoneIds = stoneIdsByMessageRef.current.get(
      object.messageGroupId,
    );
    if (stoneIds) {
      const remaining = stoneIds.filter((entry) => entry !== id);
      if (remaining.length > 0) {
        stoneIdsByMessageRef.current.set(object.messageGroupId, remaining);
      } else {
        stoneIdsByMessageRef.current.delete(object.messageGroupId);
      }
    }
    physicsRef.current?.wakeAll();
  };

  const removeMessageGroup = (messageId: string): void => {
    const stoneIds = [...stoneIdsForMessage(messageId)];
    stoneIds.forEach((id) => removeStone(id));
    stoneIdsByMessageRef.current.delete(messageId);
    messageQueueRef.current = messageQueueRef.current.filter(
      (entry) => entry !== messageId,
    );
    removedMessageIdsRef.current.add(messageId);
  };

  const ensureCapacity = (
    region: DanmakuRegion,
    projectedStones = 0,
    projectedArea = 0,
  ): void => {
    while (messageQueueRef.current.length > 0) {
      let activeStones = 0;
      let occupiedArea = 0;
      objectsRef.current.forEach((object) => {
        if (object.removing) return;
        activeStones += 1;
        occupiedArea += object.width * object.height;
      });

      const fitsStoneLimit =
        activeStones + projectedStones <= region.maxStones;
      const fitsAreaLimit =
        occupiedArea + projectedArea <= region.occupancyLimit;
      if (fitsStoneLimit && fitsAreaLimit) break;

      const oldestId = messageQueueRef.current.shift();
      if (!oldestId) break;
      removeMessageGroup(oldestId);
    }
  };

  useEffect(() => {
    const width = Math.max(1, gl.domElement.clientWidth || 1);
    const height = Math.max(1, gl.domElement.clientHeight || 1);
    const region = getDanmakuRegion(
      camera as THREE.PerspectiveCamera,
      width,
      height,
    );
    regionRef.current = region;
    const layout = new ColumnLayout(region.halfWidth);
    const physics = new StonePhysics((impact) => {
      const object = objectsRef.current.get(impact.id);
      if (!object || object.removing || !object.body) return;
      if (impact.speed < IMPACT_TRIGGER_SPEED) return;
      object.impactSpeed = impact.speed;
      object.impactNormal = new THREE.Vector3(
        impact.normalX,
        impact.normalY,
        0,
      );
      object.pendingImpact = true;
    }, region.halfWidth);
    physicsRef.current = physics;
    layoutRef.current = layout;

    return () => {
      objectsRef.current.forEach((obj) => {
        physics.removeBody(obj.body);
        disposeObject(obj);
      });
      objectsRef.current.clear();
      messageQueueRef.current = [];
      removedMessageIdsRef.current.clear();
      stoneIdsByMessageRef.current.clear();
      physics.dispose();
      physicsRef.current = null;
      layoutRef.current = null;
      regionRef.current = getDanmakuRegion(
        camera as THREE.PerspectiveCamera,
        1,
        1,
      );
      hoveredIdRef.current = null;
      setHoveredMessage(null);
    };
  }, [camera, gl, setHoveredMessage]);

  useEffect(() => {
    const activeIds = new Set(messages.map((message) => message.id));
    const now = performance.now() / 1000;

    objectsRef.current.forEach((obj) => {
      if (!activeIds.has(obj.messageGroupId) && !obj.removing) {
        obj.removing = true;
        obj.removeAt = now + 0.5;
      }
    });

    messages.forEach((message) => {
      if (
        removedMessageIdsRef.current.has(message.id) ||
        hasMessageStones(message.id) ||
        pendingRef.current.has(message.id)
      ) {
        return;
      }
      pendingRef.current.add(message.id);

      queueRef.current = queueRef.current.then(async () => {
        const created: VoiceTextObject[] = [];
        try {
          const layout = layoutRef.current;
          if (!layout) return;
          const width = Math.max(1, gl.domElement.clientWidth || 1);
          const height = Math.max(1, gl.domElement.clientHeight || 1);
          const region = getDanmakuRegion(
            camera as THREE.PerspectiveCamera,
            width,
            height,
          );
          regionRef.current = region;
          layout.setSafeHalfWidth(region.halfWidth);
          physicsRef.current?.setSafeHalfWidth(region.halfWidth);

          const stillActive = useVoiceStore
            .getState()
            .messages.some((entry) => entry.id === message.id);
          if (!stillActive) {
            return;
          }

          const lines = planTextLines(
            message.text,
            message.languageCode,
            {
              lineVisualLimit: region.lineVisualLimit,
              maxLines: 4,
            },
          );
          if (lines.length === 0) return;

          const messageWidth = estimateMessageWidth(
            message,
            lines,
            region,
          );
          const projectedArea =
            messageWidth *
            (lines.length *
              Math.max(0.55, LINE_FONT_SIZES[lines[0].level] * 0.92));
          ensureCapacity(region, lines.length, projectedArea);
          layout.sync(
            [...objectsRef.current.entries()]
              .filter(([, object]) => !object.removing)
              .map(([id, object]) => ({
                id,
                x: object.group.position.x,
                halfWidth: getHalfWidth(object),
              })),
          );
          const placementX = layout.findPlacement(
            messageWidth,
            (candidate) =>
              scorePlacement(candidate, messageWidth, objectsRef.current),
          );

          for (
            let lineIndex = 0;
            lineIndex < lines.length;
            lineIndex += 1
          ) {
            const line = lines[lineIndex];
            const object = await createVoiceTextObject({
              message,
              lineText: line.text,
              lineIndex,
              lineCount: lines.length,
              fontSize: LINE_FONT_SIZES[line.level],
              placementX,
              region,
            });
            if (!object) continue;
            objectsRef.current.set(object.id, object);
            groupRef.current?.add(object.group);
            if (!foreground) {
              groupRef.current?.add(object.contactShadow);
            }
            layout.add(
              object.id,
              object.group.position.x,
              object.width,
            );
            created.push(object);
          }
          if (created.length === 0) return;

          const stillActiveAfterCreate = useVoiceStore
            .getState()
            .messages.some((entry) => entry.id === message.id);
          if (!stillActiveAfterCreate) {
            created.forEach((object) => removeStone(object.id));
            return;
          }

          stoneIdsByMessageRef.current.set(
            message.id,
            created.map((object) => object.id),
          );
          messageQueueRef.current.push(message.id);
        } catch (error) {
          created.forEach((object) => removeStone(object.id));
          console.warn(`[VoiceTextManager] Failed to create ${message.id}`, error);
        } finally {
          pendingRef.current.delete(message.id);
        }
      });
    });

    removedMessageIdsRef.current.forEach((messageId) => {
      if (
        !activeIds.has(messageId) &&
        !stoneIdsByMessageRef.current.has(messageId)
      ) {
        removedMessageIdsRef.current.delete(messageId);
      }
    });
  }, [messages]);

  useFrame((state, delta) => {
    const now = performance.now() / 1000;
    const safeDelta = Math.min(delta, 0.05);
    const canvasWidth = Math.max(
      1,
      gl.domElement.clientWidth || state.size.width || 1,
    );
    const canvasHeight = Math.max(
      1,
      gl.domElement.clientHeight || state.size.height || 1,
    );
    const region = getDanmakuRegion(
      camera as THREE.PerspectiveCamera,
      canvasWidth,
      canvasHeight,
    );
    regionRef.current = region;
    layoutRef.current?.setSafeHalfWidth(region.halfWidth);
    physicsRef.current?.setSafeHalfWidth(region.halfWidth);

    const shake = shakeRef.current;
    if (!foreground) {
      if (!shake.initialized) {
        shake.base.copy(camera.position);
        shake.initialized = true;
      }
      if (shake.time > 0) {
        const progress = 1 - shake.time / IMPACT_SHAKE_DURATION;
        const decay = Math.exp(-6 * progress) * Math.cos(7.6 * progress);
        const offset = shake.amplitude * decay;
        camera.position.set(
          shake.base.x + shake.direction.x * offset,
          shake.base.y + shake.direction.y * offset,
          shake.base.z,
        );
        shake.time -= safeDelta;
      } else {
        camera.position.copy(shake.base);
      }
    }

    physicsRef.current?.step(safeDelta);

    const playPendingImpact = (obj: VoiceTextObject): void => {
      const impactSpeed = obj.impactSpeed ?? 0;
      obj.pendingImpact = false;
      obj.impacted = true;
      obj.landed = true;
      obj.impactShockPlayed = true;
      obj.state = 'impact';
      obj.stateTime = 0;
      obj.shockTime = 0;
      obj.stableTime = 0;

      if (impactSpeed < IMPACT_TRIGGER_SPEED) return;

      const pixelsToWorld =
        (SHAKE_PIXELS * state.viewport.height) / Math.max(1, state.size.height);
      shake.time = IMPACT_SHAKE_DURATION;
      shake.amplitude = pixelsToWorld;
      shake.direction.set(
        randomBetween(-1, 1),
        randomBetween(-0.8, 0.5),
        0,
      );
      if (shake.direction.lengthSq() < 0.0001) {
        shake.direction.set(1, 0.35, 0);
      }
      shake.direction.normalize();
    };

    objectsRef.current.forEach((obj) => {
      if (obj.pendingImpact) playPendingImpact(obj);
    });

    const startFallingForObject = (obj: VoiceTextObject): void => {
      if (obj.state === 'falling' || obj.removing) return;
      const physics = physicsRef.current;
      if (!physics) return;
      startFalling(obj, physics);
    };

    objectsRef.current.forEach((obj) => {
      if (obj.removing) return;

      if (obj.body) {
        const physics = physicsRef.current;
        physics?.limitRotation(
          obj.body,
          getRotationLimit(obj.lineCount, obj.width, obj.height),
        );
        const bodyAngle = obj.body.angle;
        const rotatedHalfX =
          Math.abs(Math.cos(bodyAngle)) * obj.width * 0.5 +
          Math.abs(Math.sin(bodyAngle)) * obj.height * 0.5;
        const centerLimitX = Math.max(
          0,
          region.halfWidth - rotatedHalfX - 0.06,
        );
        physics?.clampToRegion(obj.body, centerLimitX);
        obj.group.position.x = obj.body.position.x;
        obj.group.position.y = obj.body.position.y;
        obj.group.position.z = Z_BACK;
        obj.group.rotation.z = obj.body.angle;
      }

      if (obj.state === 'floating') {
        obj.stateTime += safeDelta;
        obj.group.position.y =
          obj.floatBaseY + Math.sin(now * 2.1 + obj.bornAt * 7) * 0.08;
        obj.group.rotation.set(
          0,
          0,
          obj.floatRotationZ + Math.sin(now * 1.2 + obj.bornAt * 4) * 0.04,
        );
        if (obj.stateTime >= FLOATING_DURATION) {
          obj.state = 'transforming';
          obj.stateTime = 0;
        }
      } else if (obj.state === 'transforming') {
        obj.stateTime += safeDelta;
        const progress = Math.min(obj.stateTime / TRANSFORM_DURATION, 1);
        updateStoneMaterial(obj, progress);

        if (progress >= 1) {
          startFallingForObject(obj);
        }
      } else if (obj.state === 'falling') {
        obj.stateTime += safeDelta;
        if (obj.body) {
          const physics = physicsRef.current;
          const speed = physics ? physics.getSpeed(obj.body) : obj.body.speed;
          const angular = physics
            ? physics.getAngularSpeed(obj.body)
            : obj.body.angularSpeed;
          if (
            speed < REST_SPEED &&
            angular < REST_ANGULAR_SPEED
          ) {
            obj.stableTime += safeDelta;
            if (obj.stableTime >= REST_SETTLE_TIME) {
              obj.state = 'resting';
              obj.stateTime = 0;
              if (!obj.restingNotified) {
                obj.restingNotified = true;
                publishStoneResting({
                  id: obj.id,
                  text: obj.text,
                  position: obj.group.position.clone(),
                });
              }
            }
          } else {
            obj.stableTime = 0;
          }
        }
      } else if (obj.state === 'impact') {
        obj.stateTime += safeDelta;
        obj.shockTime += safeDelta;
        const shockProgress = Math.min(
          obj.shockTime / IMPACT_STATE_DURATION,
          1,
        );
        const shockScale = 1 + 0.085 * Math.sin(shockProgress * Math.PI);
        obj.group.scale.setScalar(shockScale);

        if (obj.stateTime >= IMPACT_STATE_DURATION) {
          obj.group.scale.setScalar(1);
          obj.state = 'resting';
          obj.stateTime = 0;
          if (!obj.restingNotified) {
            obj.restingNotified = true;
            publishStoneResting({
              id: obj.id,
              text: obj.text,
              position: obj.group.position.clone(),
            });
          }
        }
      } else if (obj.state === 'resting') {
        obj.stateTime += safeDelta;
        updateRestingMaterial(obj);
        if (obj.body) {
          const physics = physicsRef.current;
          const speed = physics ? physics.getSpeed(obj.body) : obj.body.speed;
          const angular = physics
            ? physics.getAngularSpeed(obj.body)
            : obj.body.angularSpeed;
          if (speed > WAKE_SPEED || angular > WAKE_ANGULAR_SPEED) {
            obj.state = 'falling';
            obj.stateTime = 0;
            obj.stableTime = 0;
            obj.impacted = false;
            obj.pendingImpact = false;
          }
        }
      }

      updateContactShadow(obj, region.halfWidth);
    });

    hoveredIdRef.current = updateHover(
      state,
      objectsRef.current,
      hoveredIdRef.current,
      setHoveredMessage,
    );

    objectsRef.current.forEach((obj, id) => {
      if (obj.removing && obj.removeAt !== undefined && now >= obj.removeAt) {
        removeStone(id);
      }
    });
  });

  return <group ref={groupRef} />;
}
