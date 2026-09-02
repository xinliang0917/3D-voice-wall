import * as THREE from 'three';
import { WALL_BOTTOM_Y } from '../config';

export interface StoneImpactEvent {
  id: string;
  text: string;
  position: THREE.Vector3;
  speed: number;
  strength: number;
}

export type StoneImpactHandler = (event: StoneImpactEvent) => void;

const impactHandlers = new Set<StoneImpactHandler>();

export function subscribeStoneImpact(handler: StoneImpactHandler): () => void {
  impactHandlers.add(handler);
  return () => impactHandlers.delete(handler);
}

export function publishStoneImpact(event: StoneImpactEvent): void {
  impactHandlers.forEach((handler) => handler(event));
}

export interface StoneRestingEvent {
  id: string;
  text: string;
  position: THREE.Vector3;
}

export type StoneRestingHandler = (event: StoneRestingEvent) => void;

const restingHandlers = new Set<StoneRestingHandler>();

export function subscribeStoneResting(handler: StoneRestingHandler): () => void {
  restingHandlers.add(handler);
  return () => restingHandlers.delete(handler);
}

export function publishStoneResting(event: StoneRestingEvent): void {
  restingHandlers.forEach((handler) => handler(event));
}

interface Shard {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
  startScale: number;
}

interface DustParticle {
  active: boolean;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ImpactRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
  width: number;
}

const SHARD_POOL_SIZE = 96;
const DUST_POOL_SIZE = 48;
const RING_POOL_SIZE = 12;
const SHARD_GRAVITY = -24;
const DUST_GRAVITY = -7;
const SHARD_TONES = ['#cfe0ff', '#9fc0ff', '#b9d2ff', '#eaf3ff', '#d5e6ff'];

let softRadialTexture: THREE.CanvasTexture | null = null;

function getSoftRadialTexture(): THREE.CanvasTexture {
  if (softRadialTexture) return softRadialTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  softRadialTexture = new THREE.CanvasTexture(canvas);
  return softRadialTexture;
}

export class ImpactEffects {
  readonly group = new THREE.Group();

  private readonly shards: Shard[] = [];
  private shardCursor = 0;
  private readonly dustPositions: Float32Array;
  private readonly dustData: DustParticle[];
  private readonly dustGeometry: THREE.BufferGeometry;
  private readonly dustPoints: THREE.Points;
  private readonly rings: ImpactRing[] = [];
  private ringCursor = 0;

  constructor() {
    for (let index = 0; index < SHARD_POOL_SIZE; index += 1) {
      const geometry =
        index % 3 === 0
          ? new THREE.BoxGeometry(0.14, 0.14, 0.14)
          : index % 3 === 1
            ? new THREE.TetrahedronGeometry(0.17)
            : new THREE.ConeGeometry(0.1, 0.24, 5);
      const material = new THREE.MeshStandardMaterial({
        color: SHARD_TONES[index % SHARD_TONES.length],
        roughness: 0.95,
        metalness: 0,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.shards.push({
        mesh,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6,
        active: false,
        startScale: 1,
      });
    }

    this.dustPositions = new Float32Array(DUST_POOL_SIZE * 3);
    this.dustPositions.fill(-999);
    this.dustGeometry = new THREE.BufferGeometry();
    this.dustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dustPositions, 3),
    );
    this.dustData = Array.from({ length: DUST_POOL_SIZE }, () => ({
      active: false,
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0.55,
    }));
    this.dustPoints = new THREE.Points(
      this.dustGeometry,
      new THREE.PointsMaterial({
        color: '#b9d2ff',
        size: 0.075,
        map: getSoftRadialTexture(),
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
    );
    this.dustPoints.frustumCulled = false;
    this.group.add(this.dustPoints);

    const ringGeometry = new THREE.RingGeometry(0.3, 0.42, 64);
    for (let index = 0; index < RING_POOL_SIZE; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: '#cfe0ff',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.rings.push({
        mesh,
        life: 0,
        maxLife: 0.16,
        active: false,
        width: 1,
      });
    }
  }

  burst(position: THREE.Vector3, width: number, speed: number): void {
    const strength = THREE.MathUtils.clamp((speed - 6) / 14, 0.25, 1);
    const shardCount = Math.round(THREE.MathUtils.lerp(26, 52, strength));
    for (let index = 0; index < shardCount; index += 1) {
      const shard = this.shards[this.shardCursor];
      this.shardCursor = (this.shardCursor + 1) % SHARD_POOL_SIZE;

      shard.active = true;
      shard.life = 0;
      shard.maxLife = 0.5 + Math.random() * 0.45;
      shard.startScale = 0.85 + Math.random() * 1.1;
      shard.mesh.visible = true;
      shard.mesh.position.set(
        position.x + (Math.random() - 0.5) * Math.max(0.4, width * 0.18),
        position.y + (Math.random() - 0.5) * 0.32,
        position.z + (Math.random() - 0.5) * 0.28,
      );
      shard.mesh.scale.setScalar(shard.startScale);
      shard.mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      shard.velocity.set(
        (Math.random() - 0.5) * (4.6 + strength * 4.0),
        2.8 + Math.random() * (3.6 + strength * 3.2),
        (Math.random() - 0.5) * (2.6 + strength * 2.4),
      );
      shard.angularVelocity.set(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
      );
      (shard.mesh.material as THREE.MeshStandardMaterial).opacity = 1;
    }

    const dustCount = Math.round(THREE.MathUtils.lerp(8, 16, strength));
    for (let index = 0; index < dustCount; index += 1) {
      const dust = this.dustData[index];
      dust.active = true;
      dust.life = 0;
      dust.maxLife = 0.4 + Math.random() * 0.45;
      const offset = index * 3;
      this.dustPositions[offset] = position.x + (Math.random() - 0.5) * Math.max(0.5, width);
      this.dustPositions[offset + 1] = position.y + (Math.random() - 0.5) * 0.28;
      this.dustPositions[offset + 2] = position.z + (Math.random() - 0.5) * 0.45;
      dust.velocity.set(
        (Math.random() - 0.5) * 1.4,
        0.5 + Math.random() * 1.1,
        (Math.random() - 0.5) * 1.1,
      );
    }
    this.dustGeometry.attributes.position.needsUpdate = true;

    const ring = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % RING_POOL_SIZE;
    ring.active = true;
    ring.life = 0;
    ring.maxLife = 0.12 + Math.random() * 0.06;
    ring.width = Math.max(1.1, width * 1.15);
    ring.mesh.visible = true;
    ring.mesh.position.set(
      position.x,
      WALL_BOTTOM_Y + 0.01,
      THREE.MathUtils.clamp(position.z, -4.8, -3.6),
    );
    ring.mesh.scale.setScalar(0.18);
    (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
  }

  update(delta: number): void {
    for (const shard of this.shards) {
      if (!shard.active) continue;
      shard.life += delta;
      shard.velocity.y += SHARD_GRAVITY * delta;
      shard.mesh.position.addScaledVector(shard.velocity, delta);
      shard.mesh.rotation.x += shard.angularVelocity.x * delta;
      shard.mesh.rotation.y += shard.angularVelocity.y * delta;
      shard.mesh.rotation.z += shard.angularVelocity.z * delta;

      const progress = Math.min(shard.life / shard.maxLife, 1);
      shard.mesh.scale.setScalar(shard.startScale * (1 - progress * 0.82));
      (shard.mesh.material as THREE.MeshStandardMaterial).opacity = 1 - progress;

      if (progress >= 1) {
        shard.active = false;
        shard.mesh.visible = false;
      }
    }

    let maxDustProgress = 0;
    for (let index = 0; index < this.dustData.length; index += 1) {
      const dust = this.dustData[index];
      if (!dust.active) continue;
      dust.life += delta;
      dust.velocity.y += DUST_GRAVITY * delta;
      const offset = index * 3;
      this.dustPositions[offset] += dust.velocity.x * delta;
      this.dustPositions[offset + 1] += dust.velocity.y * delta;
      this.dustPositions[offset + 2] += dust.velocity.z * delta;

      if (this.dustPositions[offset + 1] < WALL_BOTTOM_Y + 0.04) {
        this.dustPositions[offset + 1] = WALL_BOTTOM_Y + 0.04;
        dust.velocity.y *= -0.18;
        dust.velocity.x *= 0.72;
        dust.velocity.z *= 0.72;
      }

      const progress = Math.min(dust.life / dust.maxLife, 1);
      maxDustProgress = Math.max(maxDustProgress, progress);
      if (progress >= 1) {
        dust.active = false;
        this.dustPositions[offset] = -999;
        this.dustPositions[offset + 1] = -999;
        this.dustPositions[offset + 2] = -999;
      }
    }
    (this.dustPoints.material as THREE.PointsMaterial).opacity =
      1 - maxDustProgress * 0.82;
    this.dustGeometry.attributes.position.needsUpdate = true;

    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.life += delta;
      const progress = Math.min(ring.life / ring.maxLife, 1);
      const eased = 1 - Math.pow(1 - progress, 2.4);
      ring.mesh.scale.set(
        0.18 + eased * ring.width,
        0.18 + eased * ring.width * 0.55,
        1,
      );
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity =
        0.55 * Math.pow(1 - progress, 1.35);
      if (progress >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
      }
    }
  }

  dispose(): void {
    for (const shard of this.shards) {
      shard.mesh.geometry.dispose();
      (shard.mesh.material as THREE.Material).dispose();
    }
    (this.dustPoints.material as THREE.Material).dispose();
    this.dustGeometry.dispose();
    for (const ring of this.rings) {
      ring.mesh.geometry.dispose();
      (ring.mesh.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}
