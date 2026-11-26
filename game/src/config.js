// Sky Courier tuning: every number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule depends on
// the screen size. World units are pixels of the logical field; distances in metres
// are the field scrolled past, divided by PX_PER_M.

export const FIELD = { width: 1280, height: 720, seaY: 648 };
export const PX_PER_M = 24;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const BEST_KEY = 'sky-courier-best';
export const MUTE_KEY = 'sky-courier-muted';

export const PLANE = {
  x: 300, // the plane's fixed screen x; the world scrolls past it
  width: 84,
  height: 30,
  baseSpeed: 300, // px/s of world scroll at throttle 1
  minThrottle: 0.55,
  maxThrottle: 1.7,
  throttleRate: 0.9, // throttle units per second while a key is held
  climbRate: 330, // px/s of vertical speed at full stick
  verticalSmoothing: 6, // how fast vertical speed chases the stick, per second
  invulnerable: 1.7, // seconds of grace after a hit
  hull: 3,
  fuel: 100,
  fuelBurn: 1.75, // fuel per second at throttle 1; scaled by throttle
  fuelLow: 22, // below this the gauge flashes and the engine coughs
};

export const ROUTE = {
  baseLengthM: 900, // metres to the destination strip on level 1
  lengthPerLevelM: 350,
  baseMail: 4, // mail bags to collect before the strip counts as a delivery
  mailPerLevel: 1,
  stripWidth: 260, // px of runway at the destination
  landMaxSpeed: 1.15, // throttle at or below this lands; faster overshoots
  landMaxSink: 190, // px/s of descent at or below this lands; faster bounces
};

export const SPAWN = {
  // Items are placed ahead of the plane in world space. Each kind has its own timer.
  mail: { interval: 3.4, minY: 90, maxY: 470, points: 100 },
  star: { interval: 5.2, minY: 70, maxY: 420, points: 50 },
  fuel: { interval: 8.5, minY: 140, maxY: 500, amount: 40 },
  repair: { interval: 26, minY: 160, maxY: 460 },
  storm: { interval: 5.4, minY: 70, maxY: 430, width: 132, height: 82 },
  bird: { interval: 7.6, minY: 90, maxY: 480, speed: 125 },
  intervalScalePerLevel: 0.9, // storms and birds come a little thicker each level
  minInterval: 1.6,
  poolSize: 96,
  aheadPx: 1500, // spawn this far ahead of the plane's world position
};

export const SCORE = {
  perMetre: 1,
  mail: 100,
  star: 50,
  landing: 500,
  perfectLanding: 250, // gentle touchdown bonus
  levelBonus: 300,
};

export const FONT = {
  hud: '600 20px system-ui, -apple-system, "Segoe UI", sans-serif',
  small: '600 15px system-ui, -apple-system, "Segoe UI", sans-serif',
  title: '800 64px system-ui, -apple-system, "Segoe UI", sans-serif',
  panel: '600 21px system-ui, -apple-system, "Segoe UI", sans-serif',
  big: '800 40px system-ui, -apple-system, "Segoe UI", sans-serif',
};

// Three skies, one per stretch of levels: morning, midday, dusk. The renderer picks
// by level so a long run visibly travels through the day.
export const SKIES = [
  { name: 'morning', top: '#7ec8f7', mid: '#bfe6fb', low: '#fdf3d8', sun: '#fff3b0', sea: '#2e7fb8', seaDark: '#256a99', island: '#7fae5a', islandDark: '#67914a', cloud: '#ffffff' },
  { name: 'midday', top: '#4aa8ec', mid: '#93d2f7', low: '#e8f7ff', sun: '#fff8cf', sea: '#1f7fc4', seaDark: '#18669f', island: '#86b95e', islandDark: '#6d9c4c', cloud: '#ffffff' },
  { name: 'dusk', top: '#3b4a8f', mid: '#b06a8c', low: '#ffb36b', sun: '#ffdf9e', sea: '#2b5f8f', seaDark: '#21496e', island: '#5f8f57', islandDark: '#4c7446', cloud: '#ffd9c4' },
];

export const PALETTE = {
  ink: '#10233b',
  panel: 'rgba(10, 26, 46, 0.82)',
  panelEdge: 'rgba(255, 255, 255, 0.22)',
  text: '#f4faff',
  dim: '#bcd8ef',
  accent: '#ffb703',
  good: '#7be495',
  bad: '#ff6b6b',
  storm: '#3d4a63',
  stormDark: '#2c3750',
  mail: '#ffcf4d',
  fuel: '#ff8c42',
  star: '#ffe66d',
  planeBody: '#e63946',
  planeWing: '#f1fa8c',
  planeTrim: '#ffffff',
};
