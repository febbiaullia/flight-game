// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the sky's top colour. Everything is canvas paths — a gradient sky with a
// low sun, two parallax cloud layers, a scrolling sea, the island chain sampled
// from the world's own terrain function, the mail plane drawn from shapes, and
// canvas text for the HUD and panels. Text that holds a number is rebuilt only
// when the number changes, so a frame allocates almost nothing.
import { FIELD, FONT, PALETTE, PLANE, PX_PER_M, SKIES } from './config.js';
import { KIND_BIRD, KIND_FUEL, KIND_MAIL, KIND_REPAIR, KIND_STAR, KIND_STORM } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL = 'level';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 120, line: 36 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** A tiny deterministic hash in [0,1) for decoration placement. */
function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 0;
  let viewH = 0;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const mailLabel = cachedLabel('Mail ');
  const levelLabel = cachedLabel('Route ');
  const distLabel = cachedLabel('');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function skyFor(level) {
    return SKIES[(level - 1) % SKIES.length];
  }

  function drawSky(sky, camX, elapsed) {
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(0.55, sky.mid);
    grad.addColorStop(1, sky.low);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // The sun, low and slow: it barely moves with the camera.
    const sunX = 1050 - (camX * 0.02) % 60;
    const sunY = 118;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
    glow.addColorStop(0, sky.sun);
    glow.addColorStop(1, 'rgba(255, 243, 176, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
    ctx.fillStyle = sky.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();

    drawCloudLayer(sky, camX * 0.18, 0.55, 300, 60, 150, elapsed * 2);
    drawCloudLayer(sky, camX * 0.45, 0.85, 210, 130, 300, elapsed * 5);
  }

  function drawCloudLayer(sky, scroll, alpha, spacing, baseY, spreadY, drift) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = sky.cloud;
    const total = FIELD.width + spacing * 2;
    const first = Math.floor((scroll + drift) / spacing);
    for (let i = first - 1; i < first + Math.ceil(total / spacing) + 1; i += 1) {
      const x = i * spacing + hash(i * 3 + spacing) * 90 - (scroll + drift);
      const y = baseY + hash(i * 7 + spacing) * spreadY;
      const s = 0.7 + hash(i * 11 + spacing) * 0.8;
      cloudPuff(x, y, s);
    }
    ctx.restore();
  }

  function cloudPuff(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
    ctx.arc(x + 30 * s, y + 4 * s, 20 * s, 0, Math.PI * 2);
    ctx.arc(x - 30 * s, y + 5 * s, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 4 * s, y - 12 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSea(sky, camX, elapsed) {
    const grad = ctx.createLinearGradient(0, FIELD.seaY, 0, FIELD.height);
    grad.addColorStop(0, sky.sea);
    grad.addColorStop(1, sky.seaDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, FIELD.seaY, FIELD.width, FIELD.height - FIELD.seaY);
    // Wave ticks scrolling with the world.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const spacing = 64;
    const first = Math.floor(camX / spacing);
    for (let i = first - 1; i < first + FIELD.width / spacing + 2; i += 1) {
      const x = i * spacing - camX + hash(i) * 20;
      const y = FIELD.seaY + 16 + (i % 3) * 18 + Math.sin(elapsed * 1.6 + i) * 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 22, y);
    }
    ctx.stroke();
  }

  function drawTerrain(sky, camX, terrainYAt) {
    // The island silhouette, sampled from the world's terrain function and filled
    // down to the waterline only, so the sea shows between islands.
    ctx.beginPath();
    ctx.moveTo(-8, FIELD.seaY);
    for (let sx = -8; sx <= FIELD.width + 8; sx += 8) {
      ctx.lineTo(sx, terrainYAt(camX + sx));
    }
    ctx.lineTo(FIELD.width + 8, FIELD.seaY);
    ctx.closePath();
    ctx.fillStyle = sky.island;
    ctx.fill();
    // A darker band along the waterline, clipped to the silhouette.
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = sky.islandDark;
    ctx.fillRect(0, FIELD.seaY - 30, FIELD.width, 30);
    ctx.restore();
    ctx.strokeStyle = 'rgba(250, 230, 170, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let sx = -8; sx <= FIELD.width + 8; sx += 8) {
      const y = terrainYAt(camX + sx);
      if (sx === -8) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
    }
    ctx.stroke();
  }

  function drawStrip(state, camX) {
    const sx = state.strip.x - camX;
    if (sx > FIELD.width + 80 || sx + state.strip.w < -80) return;
    const y = state.strip.y;
    const ready = state.mail >= state.mailNeeded;
    // Runway slab with threshold bars and centreline dashes.
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(sx, y - 6, state.strip.w, 10);
    ctx.fillStyle = '#e8eef4';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(sx + 8 + i * 10, y - 5, 5, 8);
    for (let x = sx + 60; x < sx + state.strip.w - 20; x += 34) ctx.fillRect(x, y - 2, 18, 3);
    // Edge lights: amber while mail is short, green when the delivery can land.
    ctx.fillStyle = ready ? PALETTE.good : PALETTE.accent;
    for (let x = sx + 6; x < sx + state.strip.w; x += 26) {
      ctx.beginPath();
      ctx.arc(x, y - 9, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // A windsock pole so the strip reads from far away.
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx + state.strip.w - 14, y - 6);
    ctx.lineTo(sx + state.strip.w - 14, y - 44);
    ctx.stroke();
    ctx.fillStyle = '#ff7b54';
    ctx.beginPath();
    ctx.moveTo(sx + state.strip.w - 14, y - 44);
    ctx.lineTo(sx + state.strip.w + 12, y - 38);
    ctx.lineTo(sx + state.strip.w - 14, y - 32);
    ctx.closePath();
    ctx.fill();
  }

  function drawItem(item, camX, elapsed) {
    const x = item.x - camX;
    if (x > FIELD.width + 120 || x + item.w < -120) return;
    const y = item.y + Math.sin(elapsed * 2 + item.phase) * 4;
    if (item.kind === KIND_MAIL) {
      ctx.fillStyle = PALETTE.mail;
      roundRect(x, y, item.w, item.h, 5);
      ctx.fill();
      ctx.strokeStyle = '#c9930a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 3);
      ctx.lineTo(x + item.w / 2, y + item.h * 0.62);
      ctx.lineTo(x + item.w - 2, y + 3);
      ctx.stroke();
      ctx.fillStyle = '#e63946';
      ctx.fillRect(x + item.w - 10, y + 3, 6, 7);
    } else if (item.kind === KIND_STAR) {
      ctx.save();
      ctx.translate(x + item.w / 2, y + item.h / 2);
      ctx.rotate(elapsed * 1.8 + item.phase);
      ctx.fillStyle = PALETTE.star;
      starPath(item.w / 2, item.w / 4.4);
      ctx.fill();
      ctx.restore();
    } else if (item.kind === KIND_FUEL) {
      ctx.fillStyle = PALETTE.fuel;
      roundRect(x, y, item.w, item.h, 4);
      ctx.fill();
      ctx.fillStyle = '#c25e1e';
      ctx.fillRect(x, y + 8, item.w, 4);
      ctx.fillRect(x, y + item.h - 12, item.w, 4);
      ctx.fillStyle = '#7a3b0d';
      ctx.fillRect(x + item.w / 2 - 4, y - 4, 8, 5);
    } else if (item.kind === KIND_REPAIR) {
      ctx.fillStyle = '#f8fafc';
      roundRect(x, y, item.w, item.h, 5);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.fillRect(x + item.w / 2 - 3, y + 6, 6, item.h - 12);
      ctx.fillRect(x + 6, y + item.h / 2 - 3, item.w - 12, 6);
    } else if (item.kind === KIND_STORM) {
      ctx.fillStyle = PALETTE.storm;
      cloudPuff(x + item.w / 2, y + item.h / 2, 2.1);
      ctx.fillStyle = PALETTE.stormDark;
      cloudPuff(x + item.w / 2 - 8, y + item.h / 2 + 12, 1.7);
      // A lightning flicker on a deterministic beat.
      if (Math.sin(elapsed * 7 + item.phase * 9) > 0.86) {
        ctx.fillStyle = '#ffe66d';
        ctx.beginPath();
        const lx = x + item.w / 2;
        const ly = y + item.h - 6;
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - 8, ly + 18);
        ctx.lineTo(lx + 1, ly + 18);
        ctx.lineTo(lx - 5, ly + 34);
        ctx.lineTo(lx + 9, ly + 13);
        ctx.lineTo(lx + 1, ly + 13);
        ctx.closePath();
        ctx.fill();
      }
    } else if (item.kind === KIND_BIRD) {
      const flap = Math.sin(elapsed * 14 + item.phase) * 8;
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 12 - flap);
      ctx.quadraticCurveTo(x + item.w / 2, y + 2, x + item.w - 2, y + 12 - flap);
      ctx.stroke();
      ctx.fillStyle = '#263238';
      ctx.beginPath();
      ctx.ellipse(x + item.w / 2, y + 12, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawPlane(state, elapsed) {
    const plane = state.plane;
    // Blink while invulnerable after a hit.
    if (plane.invulnerable > 0 && Math.floor(elapsed * 14) % 2 === 0) return;
    const cx = PLANE.x + PLANE.width / 2;
    const cy = plane.y + PLANE.height / 2;
    const tilt = Math.max(-0.32, Math.min(0.32, plane.vy / 900));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    // Smoke when the hull is hurt: puffs trailing behind, placed by elapsed time.
    if (plane.hull === 1 && !state.landed) {
      ctx.fillStyle = 'rgba(70, 80, 95, 0.5)';
      for (let i = 0; i < 4; i += 1) {
        const t = (elapsed * 2.2 + i / 4) % 1;
        ctx.beginPath();
        ctx.arc(-46 - t * 60, -4 - t * 12, 5 + t * 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tail fin and tailplane.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-38, -2);
    ctx.lineTo(-50, -20);
    ctx.lineTo(-34, -20);
    ctx.lineTo(-26, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-50, 2, 22, 5);
    // Fuselage.
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wing.
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.lineTo(16, 20);
    ctx.lineTo(26, 20);
    ctx.lineTo(10, 2);
    ctx.closePath();
    ctx.fill();
    // Cockpit and stripe.
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-30, -3, 62, 4);
    ctx.fillStyle = '#bfe9ff';
    ctx.beginPath();
    ctx.ellipse(14, -8, 12, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Propeller: two blurred blades and a hub, spinning with the throttle.
    if (!plane.dead) {
      const spin = elapsed * (26 + plane.throttle * 30);
      ctx.strokeStyle = 'rgba(30, 40, 55, 0.75)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(47, -Math.cos(spin) * 20);
      ctx.lineTo(47, Math.cos(spin) * 20);
      ctx.stroke();
    }
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(46, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHud(state, meta) {
    const plane = state.plane;
    ctx.font = FONT.hud;
    ctx.textBaseline = 'top';
    // A soft shadow keeps pale HUD text readable against the bright sky.
    ctx.shadowColor = 'rgba(8, 24, 44, 0.55)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;

    // Hull as little plane silhouettes, top-left.
    for (let i = 0; i < PLANE.hull; i += 1) {
      ctx.fillStyle = i < plane.hull ? PALETTE.planeBody : 'rgba(255,255,255,0.25)';
      const hx = 22 + i * 34;
      const hy = 18;
      ctx.beginPath();
      ctx.ellipse(hx + 12, hy + 8, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(hx, hy + 2, 6, 4);
    }

    // Fuel gauge under the hull; flashes when low.
    const fuelFrac = Math.max(0, plane.fuel / PLANE.fuel);
    const low = plane.fuel <= 22 && !state.landed;
    ctx.fillStyle = 'rgba(10, 26, 46, 0.55)';
    roundRect(20, 44, 170, 16, 6);
    ctx.fill();
    ctx.fillStyle = low && Math.floor(state.elapsed * 4) % 2 === 0 ? PALETTE.bad : PALETTE.fuel;
    if (fuelFrac > 0) {
      roundRect(23, 47, 164 * fuelFrac, 10, 4);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = FONT.small;
    ctx.fillText('FUEL', 198, 44);

    // Mail progress and route, top-centre.
    ctx.font = FONT.hud;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(mailLabel(`${state.mail}/${state.mailNeeded}`), FIELD.width / 2, 16);
    const remainM = Math.max(0, Math.round((state.strip.x - plane.worldX) / PX_PER_M));
    ctx.font = FONT.small;
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(state.mail >= state.mailNeeded ? distLabel(`Land on the strip · ${remainM} m`) : distLabel(`Collect the mail · strip ${remainM} m`), FIELD.width / 2, 44);
    ctx.textAlign = 'left';

    // Score and best, top-right; route number bottom-left.
    ctx.font = FONT.hud;
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(scoreLabel(Math.floor(state.score)), FIELD.width - 22, 16);
    ctx.font = FONT.small;
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(bestLabel(meta.best), FIELD.width - 22, 44);
    ctx.textAlign = 'left';
    ctx.fillText(levelLabel(state.level), 22, FIELD.height - 30);
    if (meta.muted) {
      ctx.textAlign = 'right';
      ctx.fillText('Muted (M)', FIELD.width - 22, FIELD.height - 30);
      ctx.textAlign = 'left';
    }

    // An arrow at the right edge while the strip is still off-screen.
    const stripScreenX = state.strip.x - (plane.worldX - PLANE.x);
    if (stripScreenX > FIELD.width && state.mail >= state.mailNeeded) {
      ctx.fillStyle = PALETTE.good;
      ctx.beginPath();
      ctx.moveTo(FIELD.width - 34, 96);
      ctx.lineTo(FIELD.width - 10, 108);
      ctx.lineTo(FIELD.width - 34, 120);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  function drawPanel(title, lines, prompt) {
    // Title block, the lines, then room for the prompt clear of the last line.
    const height = 150 + lines.length * PANEL.line;
    const x = (FIELD.width - PANEL.width) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(x, PANEL.top, PANEL.width, height, 16);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.accent;
    ctx.font = FONT.big;
    ctx.fillText(title, FIELD.width / 2, PANEL.top + 22);
    ctx.fillStyle = PALETTE.text;
    ctx.font = FONT.panel;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, PANEL.top + 84 + i * PANEL.line);
    });
    ctx.fillStyle = PALETTE.good;
    ctx.font = FONT.hud;
    ctx.fillText(prompt, FIELD.width / 2, PANEL.top + height - 44);
    ctx.textAlign = 'left';
  }

  function drawTitle(meta) {
    // A translucent panel behind the words so the bright sky never swallows them.
    ctx.fillStyle = PALETTE.panel;
    roundRect((FIELD.width - 760) / 2, 100, 760, 456, 18);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.accent;
    ctx.font = FONT.title;
    ctx.fillText('SKY COURIER', FIELD.width / 2, 124);
    ctx.fillStyle = PALETTE.text;
    ctx.font = FONT.panel;
    const lines = [
      'Fly the mail between island airstrips.',
      'Climb and dive with the Up and Down arrows or W and S.',
      'On touch screens, drag up or down to steer.',
      'Throttle with the Left and Right arrows or A and D.',
      'Collect every mail bag, dodge storms and birds,',
      'mind the fuel, slow down, and land gently on the strip.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 232 + i * 36));
    ctx.fillStyle = PALETTE.dim;
    ctx.font = FONT.small;
    ctx.fillText(bestLabel(meta.best), FIELD.width / 2, 462);
    ctx.fillStyle = PALETTE.good;
    ctx.font = FONT.hud;
    ctx.fillText('Press SPACE or tap to take off', FIELD.width / 2, 496);
    ctx.textAlign = 'left';
  }

  function draw(state, terrainYAt, screen, meta) {
    const sky = skyFor(state.level);
    const camX = state.plane.worldX - PLANE.x;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = sky.top;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    drawSky(sky, camX, state.elapsed);
    drawSea(sky, camX, state.elapsed);
    drawTerrain(sky, camX, terrainYAt);
    drawStrip(state, camX);
    for (const item of state.items) if (item.active) drawItem(item, camX, state.elapsed);
    drawPlane(state, state.elapsed);

    if (screen === SCREEN_TITLE) {
      drawTitle(meta);
      return;
    }
    drawHud(state, meta);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The mail can wait a moment.'], 'Press P or tap to fly on');
    } else if (screen === SCREEN_LEVEL) {
      drawPanel('Delivered!', [
        `Route ${state.level} complete${state.perfect ? ' — a perfect landing!' : ''}`,
        `Score ${Math.floor(state.score)}`,
        'The next island is farther, with more mail aboard.',
      ], 'Press SPACE or tap for the next route');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Down in the drink', [
        `Score ${Math.floor(state.score)}`,
        `Best ${meta.best}`,
        `You reached route ${state.level} with ${state.mail} of ${state.mailNeeded} mail bags.`,
      ], 'Press SPACE or tap to fly again');
    }
  }

  return { draw };
}
