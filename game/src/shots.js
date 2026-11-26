// The screenshot scenes behind ?shot=start|play|dusk|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot, so the frame is what a short flight really looks like and the same seed
// always gives the same frame. The autopilot scores a handful of candidate
// altitudes each step — clear of the ground and the weather first, toward the mail
// second — and flies a proper approach once the mail is aboard: slow down early,
// then settle onto the strip without descending into its shoulders.
import { FIELD, PLANE, STEP } from './config.js';
import { EVENT_OVER, KIND_BIRD, KIND_FUEL, KIND_MAIL, KIND_STORM } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 3;
const PLAY_SECONDS = 26;
const DUSK_SECONDS = 42;
const END_LIMIT_SECONDS = 300;

const LANES = [80, 140, 200, 260, 320, 380, 440, 500];

/** Score one candidate altitude: lower is better. Hazards and ground dominate. */
function laneScore(world, y) {
  const { state } = world;
  const plane = state.plane;
  const midY = y + PLANE.height / 2;
  let score = Math.abs(y - plane.y) * 0.06; // a mild preference for not swooping
  for (const item of state.items) {
    if (!item.active || (item.kind !== KIND_STORM && item.kind !== KIND_BIRD)) continue;
    const dx = item.x - plane.worldX;
    if (dx < -60 || dx > 1000) continue;
    const clear = Math.abs(midY - (item.y + item.h / 2)) - (item.h / 2 + PLANE.height / 2);
    if (clear < 62) score += (62 - clear) * (1.7 - dx / 1000) * 3;
  }
  // Ground ahead: a lane whose belly would scrape a hill is out.
  for (let dx = 0; dx <= 760; dx += 95) {
    const ground = world.terrainYAt(plane.worldX + dx);
    if (y + PLANE.height > ground - 54) score += 400;
  }
  // A pull toward the nearest mail (or fuel, when the tank runs low — urgently so).
  let best = null;
  let bestDist = Infinity;
  for (const item of state.items) {
    if (!item.active) continue;
    const dx = item.x - plane.worldX;
    if (dx < -40 || dx > 900) continue;
    const wanted = item.kind === KIND_MAIL || (item.kind === KIND_FUEL && plane.fuel < 68);
    if (wanted && dx < bestDist) {
      best = item;
      bestDist = dx;
    }
  }
  if (best) {
    const urgency = best.kind === KIND_FUEL && plane.fuel < 40 ? 0.9 : 0.35;
    score += Math.abs(midY - (best.y + best.h / 2)) * urgency;
  }
  return score;
}

/** The autopilot's stick for this step. Exported so tests can fly whole routes. */
export function autopilot(world) {
  const { state } = world;
  const plane = state.plane;
  const toStrip = state.strip.x - plane.worldX;

  // Final approach: mail aboard and the strip in sight — slow right down and
  // settle onto it, staying above the island's shoulders until over the runway.
  if (state.mail >= state.mailNeeded && toStrip < 1600 && toStrip > -300) {
    let targetY = state.strip.y - PLANE.height;
    if (plane.worldX + PLANE.width < state.strip.x) {
      const floorY = world.terrainYAt(plane.worldX + PLANE.width + 40) - PLANE.height;
      targetY = Math.min(targetY, floorY - 8);
    }
    const climb = Math.max(-1, Math.min(1, (plane.y - targetY) / 55));
    return { climb, throttle: -1 };
  }

  let want = LANES[0];
  let bestScore = Infinity;
  for (const lane of LANES) {
    const s = laneScore(world, lane);
    if (s < bestScore) {
      bestScore = s;
      want = lane;
    }
  }
  const climb = Math.max(-1, Math.min(1, (plane.y - want) / 55));
  return { climb, throttle: 0 };
}

function fly(world, seconds, pilot) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(pilot(world));
    if (events & EVENT_OVER) break;
    if (world.state.landed) break;
  }
}

/**
 * Stage one screenshot scene on a fresh world and return the screen to draw.
 * The world is reset first, so the scene depends only on the world's seed.
 */
export function stageShot(world, name) {
  world.reset();
  if (name === 'start') {
    fly(world, START_SECONDS, autopilot);
    return SCREEN_TITLE;
  }
  if (name === 'play') {
    fly(world, PLAY_SECONDS, autopilot);
    return SCREEN_PLAY;
  }
  if (name === 'dusk') {
    // Two deliveries in, the sky has turned: route 3 flies at dusk.
    world.nextLevel();
    world.nextLevel();
    fly(world, DUSK_SECONDS, autopilot);
    return SCREEN_PLAY;
  }
  // 'end': a careless pilot with a nearly dry tank glides into the sea.
  world.state.plane.fuel = 10;
  fly(world, END_LIMIT_SECONDS, () => ({ climb: 0, throttle: 0 }));
  return SCREEN_OVER;
}
