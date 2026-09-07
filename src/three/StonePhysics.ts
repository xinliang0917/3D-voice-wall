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
// Matter only applies restitution on fast impacts. Bullet-vs-bullet jelly
// motion is injected after the solver below.
const JELLY_RESTITUTION = 0.24;
const JELLY_IMPULSE_FACTOR = 0.68;
const JELLY_GROUND_IMPULSE_FACTOR = 0.65;
const JELLY_PILE_IMPULSE_FACTOR = 0.62;
const JELLY_MIN_APPROACH = 0.012;
const JELLY_MAX_APPROACH = 0.45;

interface JellyContact {
  bodyA: Matter.Body;
  bodyB: Matter.Body;
  impulse: number;
  vertical: boolean;
  upperBody: Matter.Body | null;
}

interface StaticJellyContact {
  body: Matter.Body;
  outwardX: number;
  outwardY: number;
  impulse: number;
}

export class StonePhysics {
  readonly engine: Matter.Engine;

  private readonly preSolveSpeeds = new Map<string, number>();
  private readonly jellyContacts: JellyContact[] = [];
  private readonly staticJellyContacts: StaticJellyContact[] = [];
  private readonly impactHandler?: StoneImpactHandler;
  private safeHalfWidth: number;
  private ground!: Matter.Body;
  private leftWall!: Matter.Body;
  private rightWall!: Matter.Body;

  constructor(
    impactHandler?: StoneImpactHandler,
    textHalfWidth = 14.8,
  ) {
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

    this.safeHalfWidth = Math.max(0.1, textHalfWidth);
    this.rebuildBoundaries();

    Matter.Events.on(engine, 'beforeSolve', () => {
      this.preSolveSpeeds.clear();
      Matter.Composite.allBodies(engine.world).forEach((body) => {
        if (body.isStatic || STATIC_LABELS.has(body.label)) return;
        this.preSolveSpeeds.set(body.label, Matter.Body.getSpeed(body));
      });
    });

    Matter.Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => this.collectJellyContact(pair));
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

    Matter.Events.on(engine, 'afterUpdate', () => {
      this.applyJellyContacts();
      this.applyStaticJellyContacts();
    });
  }

  setSafeHalfWidth(halfWidth: number): void {
    const nextHalfWidth = Math.max(0.1, halfWidth);
    if (Math.abs(nextHalfWidth - this.safeHalfWidth) < 0.01) return;
    this.safeHalfWidth = nextHalfWidth;
    this.rebuildBoundaries();
  }

  private rebuildBoundaries(): void {
    if (this.ground) {
      Matter.Composite.remove(this.engine.world, [
        this.ground,
        this.leftWall,
        this.rightWall,
      ]);
    }

    const halfWidth = this.safeHalfWidth;
    this.ground = Matter.Bodies.rectangle(
      0,
      WALL_BOTTOM_Y - 0.25,
      halfWidth * 2 + 6,
      0.5,
      {
        isStatic: true,
        label: GROUND_LABEL,
        friction: 0.92,
        restitution: 0,
      },
    );
    this.leftWall = Matter.Bodies.rectangle(
      -halfWidth - 0.35,
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
    this.rightWall = Matter.Bodies.rectangle(
      halfWidth + 0.35,
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
    Matter.Composite.add(this.engine.world, [
      this.ground,
      this.leftWall,
      this.rightWall,
    ]);
  }

  private collectJellyContact(pair: Matter.Pair): void {
    const bodyA = pair.collision.parentA;
    const bodyB = pair.collision.parentB;
    if (bodyA.isStatic && bodyB.isStatic) return;
    if (bodyA.isSensor || bodyB.isSensor) return;

    if (bodyA.isStatic || bodyB.isStatic) {
      const staticBody = bodyA.isStatic ? bodyA : bodyB;
      const dynamicBody = bodyA.isStatic ? bodyB : bodyA;
      if (staticBody.label !== GROUND_LABEL) return;

      const velocity = Matter.Body.getVelocity(dynamicBody);
      const directionX = 0;
      const directionY =
        dynamicBody.position.y >= staticBody.position.y ? 1 : -1;
      const approach =
        directionX * velocity.x + directionY * velocity.y;

      if (approach >= -JELLY_MIN_APPROACH) return;
      const speed = Math.min(-approach, JELLY_MAX_APPROACH);
      this.staticJellyContacts.push({
        body: dynamicBody,
        outwardX: directionX,
        outwardY: directionY,
        impulse: speed * JELLY_GROUND_IMPULSE_FACTOR,
      });
      return;
    }

    const velocityA = Matter.Body.getVelocity(bodyA);
    const velocityB = Matter.Body.getVelocity(bodyB);
    const normal = pair.collision.normal;
    const approach =
      normal.x * (velocityA.x - velocityB.x) +
      normal.y * (velocityA.y - velocityB.y);

    // Only fresh closing contacts receive the soft jelly impulse.
    if (approach >= -JELLY_MIN_APPROACH) return;

    const speed = Math.min(-approach, JELLY_MAX_APPROACH);
    const vertical = Math.abs(normal.y) > 0.82;
    const upperBody =
      bodyA.position.y > bodyB.position.y ? bodyA : bodyB;

    // Keep restitution off here so the injected upward pile impulse below is
    // the single source of the landing bounce, matching the ground bounce.
    pair.restitution = vertical
      ? 0
      : Math.max(pair.restitution, JELLY_RESTITUTION);
    this.jellyContacts.push({
      bodyA,
      bodyB,
      impulse:
        speed *
        (vertical
          ? JELLY_PILE_IMPULSE_FACTOR
          : JELLY_IMPULSE_FACTOR),
      vertical,
      upperBody: vertical ? upperBody : null,
    });
  }

  private applyJellyContacts(): void {
    if (this.jellyContacts.length === 0) return;

    const contacts = this.jellyContacts.splice(0);
    contacts.forEach((contact) => {
      const { bodyA, bodyB, impulse, vertical, upperBody } = contact;
      if (bodyA.isStatic || bodyB.isStatic) return;

      const velocityA = Matter.Body.getVelocity(bodyA);
      const velocityB = Matter.Body.getVelocity(bodyB);

      if (vertical && upperBody) {
        const upper = upperBody;
        const lower = upper === bodyA ? bodyB : bodyA;
        const upperVelocity = Matter.Body.getVelocity(upper);
        const reboundVelocity = Math.max(0.014, impulse);

        Matter.Body.setVelocity(upper, {
          x: upperVelocity.x,
          y: Math.max(upperVelocity.y, reboundVelocity),
        });
        Matter.Sleeping.set(upper, false);
        Matter.Sleeping.set(lower, false);
        return;
      }

      const offsetX = bodyA.position.x - bodyB.position.x;
      const offsetY = bodyA.position.y - bodyB.position.y;
      const length = Math.hypot(offsetX, offsetY) || 1;
      const pushX = (offsetX / length) * impulse;
      const pushY = (offsetY / length) * impulse;

      // Push away from the contact offset. A top impact therefore also gives
      // supported neighbours a small sideways squeeze instead of only a stop.
      Matter.Body.setVelocity(bodyA, {
        x: velocityA.x + pushX,
        y: velocityA.y + pushY,
      });
      Matter.Body.setVelocity(bodyB, {
        x: velocityB.x - pushX,
        y: velocityB.y - pushY,
      });
      Matter.Sleeping.set(bodyA, false);
      Matter.Sleeping.set(bodyB, false);
    });
  }

  private applyStaticJellyContacts(): void {
    if (this.staticJellyContacts.length === 0) return;

    const contacts = this.staticJellyContacts.splice(0);
    contacts.forEach((contact) => {
      const { body, outwardX, outwardY, impulse } = contact;
      if (body.isStatic || body.isSleeping) return;

      const velocity = Matter.Body.getVelocity(body);
      Matter.Body.setVelocity(body, {
        x: velocity.x + outwardX * impulse,
        y: velocity.y + outwardY * impulse,
      });
      Matter.Sleeping.set(body, false);
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

  limitRotation(body: Matter.Body, maxAngle: number): void {
    const limit = Math.max(0.01, maxAngle);
    const clamped = Math.max(-limit, Math.min(limit, body.angle));
    if (Math.abs(clamped - body.angle) < 0.0001) return;
    Matter.Body.setAngle(body, clamped);
    Matter.Body.setAngularVelocity(body, 0);
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

  clampToRegion(body: Matter.Body, centerLimitX: number): void {
    const limit = Math.max(0, centerLimitX);
    const x = body.position.x;
    if (x > limit) {
      Matter.Body.setPosition(body, { x: limit, y: body.position.y });
      if (body.velocity.x > 0) {
        Matter.Body.setVelocity(body, {
          x: 0,
          y: body.velocity.y,
        });
      }
    } else if (x < -limit) {
      Matter.Body.setPosition(body, { x: -limit, y: body.position.y });
      if (body.velocity.x < 0) {
        Matter.Body.setVelocity(body, {
          x: 0,
          y: body.velocity.y,
        });
      }
    }
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
