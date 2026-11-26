// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play, paused,
// route delivered and game over.
//
// ?seed=N fixes the route. ?shot=start|play|dusk|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, MUTE_KEY, PLANE, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_FUEL,
  EVENT_HIT,
  EVENT_LANDED,
  EVENT_MAIL,
  EVENT_OVER,
  EVENT_REPAIR,
  EVENT_STAR,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_LEVEL,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be unavailable (private mode); the best score just will not stick.
  }
}

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

let best = readBest();
audio.setMuted(readMuted());
let screen = SCREEN_TITLE;
let lowFuelBeepAt = 0;

function announce(text) {
  status.textContent = text;
}

function react(events) {
  if (events & EVENT_MAIL) audio.mail();
  if (events & EVENT_STAR) audio.star();
  if (events & EVENT_FUEL) audio.fuel();
  if (events & EVENT_REPAIR) audio.repair();
  if (events & EVENT_HIT) audio.hit();
  if (events & EVENT_LANDED) {
    audio.landed();
    screen = SCREEN_LEVEL;
    announce(`Delivered. Route ${world.state.level} complete. Score ${Math.floor(world.state.score)}.`);
  }
  if (events & EVENT_OVER) {
    audio.over();
    screen = SCREEN_OVER;
    const score = Math.floor(world.state.score);
    if (score > best) {
      best = score;
      writeBest(best);
    }
    announce(`Game over. Score ${score}. Best ${best}.`);
  }
}

function meta() {
  return { best, muted: audio.isMuted() };
}

if (shot) {
  screen = stageShot(world, shot);
  renderer.draw(world.state, world.terrainYAt, screen, meta());
  renderer.draw(world.state, world.terrainYAt, screen, meta());
  window.__shotReady = true;
} else {
  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;

    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      try {
        window.localStorage.setItem(MUTE_KEY, audio.isMuted() ? '1' : '0');
      } catch { /* storage unavailable; mute lasts for this visit only */ }
    }

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        world.reset();
        screen = SCREEN_PLAY;
        announce('Take off. Collect the mail and land on the strip.');
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
      } else {
        accumulator += dt;
        const stick = input.stick();
        while (accumulator >= STEP) {
          accumulator -= STEP;
          react(world.step(stick));
          if (screen !== SCREEN_PLAY) {
            accumulator = 0;
            break;
          }
        }
        // A soft warning beep while the tank runs low.
        const plane = world.state.plane;
        if (plane.fuel <= PLANE.fuelLow && !plane.dead && now - lowFuelBeepAt > 1400) {
          lowFuelBeepAt = now;
          audio.lowFuel();
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) screen = SCREEN_PLAY;
    } else if (screen === SCREEN_LEVEL) {
      if (actions & ACTION_CONFIRM) {
        world.nextLevel();
        screen = SCREEN_PLAY;
        announce(`Route ${world.state.level}. Collect ${world.state.mailNeeded} mail bags.`);
      }
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        world.reset();
        screen = SCREEN_PLAY;
        announce('Take off again.');
      }
    }

    const plane = world.state.plane;
    audio.setEngine(plane.throttle, screen === SCREEN_PLAY && !plane.dead);
    renderer.draw(world.state, world.terrainYAt, screen, meta());
  }
  requestAnimationFrame(frame);
}
