// Sky Courier's rules and state, with no drawing and no browser in it: the plane, the
// island chain it flies over, the pooled mail bags, stars, fuel drums, repair kits,
// storm clouds and birds, the fuel and hull gauges, the score and the delivery
// mission. step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (sound, screens) without the world knowing about either.
// Nothing here allocates after createWorld returns, except the island list rebuilt
// once per level.
//
// The plane stays at a fixed screen x; its worldX grows and everything else is placed
// in world coordinates, so the renderer only subtracts the camera. The route is a
// chain of low islands over the sea ending in one flat-topped island with the
// destination strip: collect the mail, then put the plane down on the strip gently
// and slowly to deliver it.

import { FIELD, PLANE, PX_PER_M, ROUTE, SCORE, SPAWN, STEP } from './config.js';
import { range } from './random.js';

export const KIND_MAIL = 0;
export const KIND_STAR = 1;
export const KIND_FUEL = 2;
export const KIND_REPAIR = 3;
export const KIND_STORM = 4;
export const KIND_BIRD = 5;

export const EVENT_MAIL = 1;
export const EVENT_STAR = 2;
export const EVENT_FUEL = 4;
export const EVENT_REPAIR = 8;
export const EVENT_HIT = 16;
export const EVENT_LANDED = 32;
export const EVENT_OVER = 64;

const PLANE_BOX = { dx: 8, dy: 6, w: PLANE.width - 16, h: PLANE.height - 10 };
const ITEM_SIZE = {
  [KIND_MAIL]: { w: 34, h: 26 },
  [KIND_STAR]: { w: 26, h: 26 },
  [KIND_FUEL]: { w: 28, h: 34 },
  [KIND_REPAIR]: { w: 30, h: 30 },
  [KIND_STORM]: { w: SPAWN.storm.width, h: SPAWN.storm.height },
  [KIND_BIRD]: { w: 36, h: 20 },
};

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function createWorld(random) {
  const items = [];
  for (let i = 0; i < SPAWN.poolSize; i += 1) {
    items.push({ active: false, kind: KIND_MAIL, x: 0, y: 0, w: 0, h: 0, vx: 0, phase: 0 });
  }

  const plane = {
    worldX: 0,
    y: 300,
    vy: 0,
    throttle: 1,
    hull: PLANE.hull,
    fuel: PLANE.fuel,
    invulnerable: 0,
    dead: false, // engine out: gliding down to whatever is below
  };

  const state = {
    plane,
    items,
    islands: [],
    strip: { x: 0, y: FIELD.seaY, w: ROUTE.stripWidth },
    score: 0,
    level: 1,
    mail: 0,
    mailNeeded: ROUTE.baseMail,
    routeLengthPx: ROUTE.baseLengthM * PX_PER_M,
    elapsed: 0,
    over: false,
    landed: false,
    perfect: false,
    timers: { mail: 1.2, star: 2.4, fuel: 6, repair: 18, storm: 2.8, bird: 4.2 },
  };

  function buildRoute() {
    state.routeLengthPx = (ROUTE.baseLengthM + (state.level - 1) * ROUTE.lengthPerLevelM) * PX_PER_M;
    state.mailNeeded = ROUTE.baseMail + (state.level - 1) * ROUTE.mailPerLevel;
    state.islands = [];
    // A gentle home island under the start so the first seconds are safe.
    state.islands.push({ x: -400, w: 900, peak: 46, flat: false });
    let x = 700;
    const endX = state.routeLengthPx;
    while (x < endX - 500) {
      const w = range(random, 320, 860);
      const peak = range(random, 42, 185);
      state.islands.push({ x, w, peak, flat: false });
      x += w + range(random, 420, 1050);
    }
    // The destination: a flat-topped island whose top carries the strip.
    const stripX = endX;
    const stripPeak = 64;
    state.islands.push({ x: stripX - 170, w: ROUTE.stripWidth + 340, peak: stripPeak, flat: true });
    state.strip = { x: stripX, y: FIELD.seaY - stripPeak, w: ROUTE.stripWidth };
  }

  /** Ground height (a y) at a world x: sea level minus the tallest island bump there. */
  function terrainYAt(worldX) {
    let ground = FIELD.seaY;
    for (const island of state.islands) {
      if (worldX < island.x || worldX > island.x + island.w) continue;
      const t = (worldX - island.x) / island.w; // 0..1 across the island
      let h;
      if (island.flat) {
        // Flat top with soft shoulders: full height across the middle 60%.
        const edge = Math.min(t / 0.2, (1 - t) / 0.2, 1);
        h = island.peak * Math.max(0, edge);
      } else {
        h = island.peak * Math.sin(Math.PI * t) ** 1.4;
      }
      ground = Math.min(ground, FIELD.seaY - h);
    }
    return ground;
  }

  function reset() {
    plane.worldX = 0;
    plane.y = 300;
    plane.vy = 0;
    plane.throttle = 1;
    plane.hull = PLANE.hull;
    plane.fuel = PLANE.fuel;
    plane.invulnerable = 0;
    plane.dead = false;
    for (const item of items) item.active = false;
    state.score = 0;
    state.level = 1;
    state.mail = 0;
    state.elapsed = 0;
    state.over = false;
    state.landed = false;
    state.perfect = false;
    state.timers = { mail: 1.2, star: 2.4, fuel: 6, repair: 18, storm: 2.8, bird: 4.2 };
    buildRoute();
  }

  /** Start the next route after a delivery: score and level carry over, gauges refill. */
  function nextLevel() {
    state.level += 1;
    plane.worldX = 0;
    plane.y = 300;
    plane.vy = 0;
    plane.throttle = 1;
    plane.fuel = PLANE.fuel;
    plane.invulnerable = 0;
    plane.dead = false;
    for (const item of items) item.active = false;
    state.mail = 0;
    state.elapsed = 0;
    state.landed = false;
    state.perfect = false;
    state.timers = { mail: 1.2, star: 2.4, fuel: 6, repair: 18, storm: 2.8, bird: 4.2 };
    buildRoute();
  }

  function spawn(kind) {
    for (const item of items) {
      if (item.active) continue;
      const size = ITEM_SIZE[kind];
      item.active = true;
      item.kind = kind;
      item.w = size.w;
      item.h = size.h;
      item.x = plane.worldX + SPAWN.aheadPx + range(random, 0, 240);
      item.phase = range(random, 0, Math.PI * 2);
      item.vx = 0;
      if (kind === KIND_MAIL) item.y = range(random, SPAWN.mail.minY, SPAWN.mail.maxY);
      else if (kind === KIND_STAR) item.y = range(random, SPAWN.star.minY, SPAWN.star.maxY);
      else if (kind === KIND_FUEL) item.y = range(random, SPAWN.fuel.minY, SPAWN.fuel.maxY);
      else if (kind === KIND_REPAIR) item.y = range(random, SPAWN.repair.minY, SPAWN.repair.maxY);
      else if (kind === KIND_STORM) item.y = range(random, SPAWN.storm.minY, SPAWN.storm.maxY);
      else if (kind === KIND_BIRD) {
        item.y = range(random, SPAWN.bird.minY, SPAWN.bird.maxY);
        item.vx = -SPAWN.bird.speed; // birds fly toward the plane
      }
      // Never bury a pickup inside a hill: lift it clear of the ground.
      const ground = terrainYAt(item.x + item.w / 2);
      if (item.y + item.h > ground - 26) item.y = Math.max(56, ground - 26 - item.h);
      return;
    }
  }

  function hit() {
    if (plane.invulnerable > 0 || state.over) return 0;
    plane.hull -= 1;
    plane.invulnerable = PLANE.invulnerable;
    if (plane.hull <= 0) {
      state.over = true;
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  /**
   * Advance one fixed step. `stick` is { climb: -1..1 (positive climbs), throttle:
   * -1..1 (positive speeds up) }. Returns the event bit flags for this step.
   */
  function step(stick) {
    if (state.over || state.landed) return 0;
    let events = 0;
    state.elapsed += STEP;

    // Throttle and climb, smoothed so the plane feels flown, not teleported.
    if (!plane.dead) {
      plane.throttle = Math.min(
        PLANE.maxThrottle,
        Math.max(PLANE.minThrottle, plane.throttle + stick.throttle * PLANE.throttleRate * STEP),
      );
    }
    const targetVy = plane.dead ? 150 : -stick.climb * PLANE.climbRate;
    plane.vy += (targetVy - plane.vy) * Math.min(1, PLANE.verticalSmoothing * STEP);

    const speed = PLANE.baseSpeed * plane.throttle;
    plane.worldX += speed * STEP;
    plane.y += plane.vy * STEP;
    if (plane.y < 24) {
      plane.y = 24;
      plane.vy = Math.max(plane.vy, 0);
    }
    state.score += speed * STEP / PX_PER_M * SCORE.perMetre;

    // Fuel burn follows the throttle; empty tank means a dead engine and a glide down.
    if (!plane.dead) {
      plane.fuel = Math.max(0, plane.fuel - PLANE.fuelBurn * plane.throttle * STEP);
      if (plane.fuel <= 0) plane.dead = true;
    }
    if (plane.invulnerable > 0) plane.invulnerable = Math.max(0, plane.invulnerable - STEP);

    // Spawning, each kind on its own timer; hazards thicken a little per level.
    const t = state.timers;
    const hazardScale = Math.max(0.45, SPAWN.intervalScalePerLevel ** (state.level - 1));
    t.mail -= STEP; if (t.mail <= 0) { spawn(KIND_MAIL); t.mail = SPAWN.mail.interval * range(random, 0.75, 1.3); }
    t.star -= STEP; if (t.star <= 0) { spawn(KIND_STAR); t.star = SPAWN.star.interval * range(random, 0.75, 1.3); }
    t.fuel -= STEP; if (t.fuel <= 0) { spawn(KIND_FUEL); t.fuel = SPAWN.fuel.interval * range(random, 0.8, 1.25); }
    t.repair -= STEP; if (t.repair <= 0) { spawn(KIND_REPAIR); t.repair = SPAWN.repair.interval * range(random, 0.8, 1.3); }
    t.storm -= STEP; if (t.storm <= 0) { spawn(KIND_STORM); t.storm = Math.max(SPAWN.minInterval, SPAWN.storm.interval * hazardScale * range(random, 0.75, 1.3)); }
    t.bird -= STEP; if (t.bird <= 0) { spawn(KIND_BIRD); t.bird = Math.max(SPAWN.minInterval, SPAWN.bird.interval * hazardScale * range(random, 0.75, 1.3)); }

    // Items drift (birds fly at the plane) and retire behind the camera.
    const retireX = plane.worldX - PLANE.x - 260;
    for (const item of items) {
      if (!item.active) continue;
      item.x += item.vx * STEP;
      if (item.kind === KIND_BIRD) item.y += Math.sin(state.elapsed * 2.4 + item.phase) * 26 * STEP;
      if (item.x + item.w < retireX) item.active = false;
    }

    // Collisions with the plane's forgiving box.
    const px = plane.worldX + PLANE_BOX.dx;
    const py = plane.y + PLANE_BOX.dy;
    for (const item of items) {
      if (!item.active) continue;
      if (!overlaps(px, py, PLANE_BOX.w, PLANE_BOX.h, item.x, item.y, item.w, item.h)) continue;
      if (item.kind === KIND_MAIL) {
        item.active = false;
        state.mail += 1;
        state.score += SCORE.mail;
        events |= EVENT_MAIL;
      } else if (item.kind === KIND_STAR) {
        item.active = false;
        state.score += SCORE.star;
        events |= EVENT_STAR;
      } else if (item.kind === KIND_FUEL) {
        item.active = false;
        plane.fuel = Math.min(PLANE.fuel, plane.fuel + SPAWN.fuel.amount);
        if (plane.dead && plane.fuel > 0) plane.dead = false;
        events |= EVENT_FUEL;
      } else if (item.kind === KIND_REPAIR) {
        item.active = false;
        plane.hull = Math.min(PLANE.hull, plane.hull + 1);
        events |= EVENT_REPAIR;
      } else if (item.kind === KIND_STORM || item.kind === KIND_BIRD) {
        item.active = false;
        events |= hit();
        if (state.over) return events;
      }
    }

    // Ground contact: the destination strip first, then plain terrain.
    const groundY = terrainYAt(plane.worldX + PLANE.width / 2);
    const bottom = plane.y + PLANE.height;
    const onStrip =
      plane.worldX + PLANE.width > state.strip.x &&
      plane.worldX < state.strip.x + state.strip.w &&
      bottom >= state.strip.y - 2;
    if (onStrip && state.mail >= state.mailNeeded && !plane.dead) {
      if (plane.throttle <= ROUTE.landMaxSpeed && plane.vy <= ROUTE.landMaxSink) {
        state.landed = true;
        state.perfect = plane.vy <= 90 && plane.throttle <= 0.85;
        state.score += SCORE.landing + SCORE.levelBonus + (state.perfect ? SCORE.perfectLanding : 0);
        return events | EVENT_LANDED;
      }
      // Too fast or dropping too hard: bounce off and come around again.
      plane.y = state.strip.y - PLANE.height;
      plane.vy = -170;
      events |= hit();
      return events;
    }
    if (bottom >= groundY) {
      if (plane.dead) {
        state.over = true;
        plane.y = groundY - PLANE.height;
        return events | EVENT_OVER;
      }
      plane.y = groundY - PLANE.height;
      plane.vy = -210; // bounce back into the air, at the cost of hull
      events |= hit();
    }

    return events;
  }

  reset();
  return { state, reset, nextLevel, step, terrainYAt };
}
