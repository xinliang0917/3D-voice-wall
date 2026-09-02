import * as THREE from 'three';
import type Matter from 'matter-js';
import type { VoiceMessage } from '../types/voice';

export type VoiceStoneState =
  | 'floating'
  | 'transforming'
  | 'falling'
  | 'impact'
  | 'resting';

export interface VoiceTextObject {
  id: string;
  message: VoiceMessage;
  group: THREE.Group;
  mesh: THREE.Mesh;
  frontMaterial: THREE.MeshPhysicalMaterial;
  backMaterial: THREE.MeshPhysicalMaterial;
  sideMaterial: THREE.MeshPhysicalMaterial;
  state: VoiceStoneState;
  stateTime: number;
  floatBaseY: number;
  baseScale: number;
  floatRotationX: number;
  floatRotationY: number;
  floatRotationZ: number;
  contactShadow: THREE.Mesh;
  width: number;
  height: number;
  depth: number;
  body?: Matter.Body;
  stableTime: number;
  hovered: boolean;
  removing: boolean;
  landed: boolean;
  pendingImpact?: boolean;
  bornAt: number;
  fallStartY: number;
  fallStartVelocity: number;
  removeAt?: number;
  impacted?: boolean;
  impactSpeed?: number;
  impactNormal?: THREE.Vector3;
  shockTime: number;
  impactShockPlayed: boolean;
  restingNotified?: boolean;
}
