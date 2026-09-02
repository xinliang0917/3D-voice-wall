import Matter from 'matter-js';
import { WALL_BOTTOM_Y } from '../config';

export interface StonePhysicsImpact {
  id: string;
  speed: number;
  normalX: number;
  normalY: number;
}

export type StoneImpactHandler = (impact: StonePhysicsImpact) => void;

const GRAVITY_SCALE = 0.000028;
const FIXED_STEP_MS = 1000 / 60;
const MATTER_SPEED_TO_UNITS = 60;
const GROUND_LABEL = 'pile-ground';
const LEFT_WALL_LABEL = 'pile-left-wall';
const RIGHT_WALL_LABEL = 'pile-right-wall';
const STATIC_LABELS = new Set([
  GROUND_LABEL,
  LEFT_WALL_LABEL,
  RIGHT_WALL_LABEL,
]);

export class StonePhysics {
  readonly engine: Matter.Engine;

  private readonly preSolveSpeeds = new Map<string, number>();
  private readonly impactHandler?: StoneImpactHandler;

  constructor(impactHandler?: StoneImpactHandler) {
    this.impactHandler = impactHandler;
    const engine = Matter.Engine.create({
      enableSleeping: true,
      positionIterations: 8,
      velocityIterations: 6,
    });
    this.engine = engine;

    engine.gravity.x = 0;
    engine.gravity.y = -1;
    engine.gravity.scale = GRAVITY_SCALE;

    const sleeping = Matter.Sleeping as unknown as {
      _motionWakeThreshold: number;
      _motionSleepThreshold: number;
    };
    sleeping._motionWakeThreshold = 0.004;
    sleeping._motionSleepThreshold = 0.0006;

    const ground = Matter.Bodies.rectangle(
      0,
      WALL_BOTTOM_Y - 0.25,
      46,
      0.5,
      {
        isStatic: true,
        label: GROUND_LABEL,
        friction: 0.92,
        restitution: 0,
      },
    );
    const leftWall = Matter.Bodies.rectangle(
      -17.4,
      WALL_BOTTOM_Y + 8.5,
      0.5,
      21,
      {
        isStatic: true,
        label: LEFT_WALL_LABEL,
        friction: 0.88,
        restitution: 0,
      },
    );
    const rightWall = Matter.Bodies.rectangle(
      17.4,
      WALL_BOTTOM_Y + 8.5,
      0.5,
      21,
      {
        isStatic: true,
        label: RIGHT_WALL_LABEL,
        friction: 0.88,
        restitution: 0,
      },
    );
    Matter.Composite.add(engine.world, [ground, leftWall, rightWall]);

    Matter.Events.on(engine, 'beforeSolve', () => {
      this.preSolveSpeeds.clear();
      Matter.Composite.allBodies(engine.world).forEach((body) => {
        if (body.isStatic || STATIC_LABELS.has(body.label)) return;
        this.preSolveSpeeds.set(body.label, Matter.Body.getSpeed(body));
      });
    });

    Matter.Events.on(engine, 'collisionStart', (event) => {
      const handler = this.impactHandler;
      if (!handler) return;
      event.pairs.forEach((pair) => {
        const parentA = pair.collision.parentA;
        const parentB = pair.collision.parentB;
        const candidates = [parentA, parentB].filter(
          (body) => !body.isStatic && !STATIC_LABELS.has(body.label),
        );
        candidates.forEach((body) => {
          const rawSpeed =
            this.preSolveSpeeds.get(body.label) ?? Matter.Body.getSpeed(body);
          handler({
            id: body.label,
            speed: rawSpeed * MATTER_SPEED_TO_UNITS,
            normalX: pair.collision.normal.x,
            normalY: pair.collision.normal.y,
          });
        });
      });
    });
  }

  addStone(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
  ): Matter.Body {
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      label: id,
      density: 0.0019,
      friction: 0.8,
      frictionStatic: 1,
      restitution: 0.02,
      frictionAir: 0.032,
      angle,
    });
    Matter.Composite.add(this.engine.world, body);
    return body;
  }

  setDynamic(
    body: Matter.Body,
    x: number,
    y: number,
    angle: number,
    velocityX: number,
    velocityY: number,
  ): void {
    Matter.Body.setStatic(body, false);
    Matter.Body.setPosition(body, { x, y });
    Matter.Body.setAngle(body, angle);
    Matter.Body.setVelocity(body, {
      x: velocityX / MATTER_SPEED_TO_UNITS,
      y: velocityY / MATTER_SPEED_TO_UNITS,
    });
    Matter.Sleeping.set(body, false);
  }

  getSpeed(body: Matter.Body): number {
    return Matter.Body.getSpeed(body) * MATTER_SPEED_TO_UNITS;
  }

  getAngularSpeed(body: Matter.Body): number {
    return body.angularSpeed * MATTER_SPEED_TO_UNITS;
  }

  removeBody(body?: Matter.Body): void {
    if (!body) return;
    Matter.Composite.remove(this.engine.world, body);
  }

  wakeAll(): void {
    Matter.Composite.allBodies(this.engine.world).forEach((body) => {
      if (!body.isStatic) Matter.Sleeping.set(body, false);
    });
  }

  dispose(): void {
    Matter.Composite.allBodies(this.engine.world).forEach((body) => {
      if (!body.isStatic) Matter.Composite.remove(this.engine.world, body);
    });
    Matter.Engine.clear(this.engine);
  }

  step(deltaSeconds: number): void {
    const totalMs = Math.min(deltaSeconds, 0.05) * 1000;
    const steps = Math.max(1, Math.ceil(totalMs / FIXED_STEP_MS));
    const stepMs = totalMs / steps;
    for (let index = 0; index < steps; index += 1) {
      Matter.Engine.update(this.engine, stepMs);
    }
  }
}
