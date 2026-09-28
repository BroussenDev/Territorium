import { colord } from "colord";
import { html, LitElement, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { VictoryEffectAttributes } from "../../core/CosmeticSchemas";

// Gold and white when a catalog palette has no usable color.
const FALLBACK_COLORS = ["#facc15", "#ffffff"];

// Every distance is a fraction of the canvas' shorter side, so the same
// effect reads the same on a store card and across a whole screen.
const GRAVITY = 0.32;
const FIREWORK_BURSTS = [0.3, 6];
const CONFETTI_PIECES = [10, 320];
const FLAG_SPARKLES = [5, 220];

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  apex: number;
  color: string;
}

interface Confetto {
  x: number;
  y: number;
  vy: number;
  sway: number;
  phase: number;
  spin: number;
  angle: number;
  color: string;
}

interface Twinkle {
  x: number;
  y: number;
  phase: number;
  speed: number;
  size: number;
  color: string;
}

function clamp(v: number, [min, max]: number[]): number {
  return Math.min(max, Math.max(min, v));
}

export function victoryColors(colors: readonly string[]): string[] {
  const valid = colors.filter((c) => colord(c).isValid());
  return valid.length > 0 ? valid : FALLBACK_COLORS;
}

/**
 * The particles of one victory celebration (fireworks, confetti or a giant
 * waving flag). Call step() with the elapsed time, then draw(). While
 * `emitting` is true new particles keep coming; turn it off to let the
 * celebration die down.
 */
export class VictoryAnimation {
  emitting = true;
  private readonly colors: string[];
  private time = 0;
  private debt = 0;
  private sparks: Spark[] = [];
  private rockets: Rocket[] = [];
  private confetti: Confetto[] = [];
  private twinkles: Twinkle[] = [];

  constructor(
    private readonly attributes: VictoryEffectAttributes,
    private readonly flag: CanvasImageSource | null = null,
    private readonly random: () => number = Math.random,
  ) {
    this.colors = victoryColors(attributes.colors);
  }

  /** Particles alive now; the celebration is over once this hits 0. */
  alive(): number {
    return (
      this.sparks.length +
      this.rockets.length +
      this.confetti.length +
      (this.attributes.type === "giantFlag" && this.emitting ? 1 : 0)
    );
  }

  step(dt: number, width: number, height: number): void {
    // A backgrounded tab resumes with a huge dt: skip rather than explode.
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const unit = Math.min(width, height);
    switch (this.attributes.type) {
      case "fireworks":
        this.stepFireworks(dt, width, height, unit);
        break;
      case "confetti":
        this.stepConfetti(dt, width, height, unit);
        break;
      case "giantFlag":
        this.stepTwinkles(width, height, unit);
        break;
    }
    for (const s of this.sparks) {
      s.vx *= 1 - 1.4 * dt;
      s.vy = s.vy * (1 - 1.4 * dt) + GRAVITY * unit * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const unit = Math.min(width, height);
    if (this.attributes.type === "giantFlag") {
      this.drawFlag(ctx, width, height, unit);
    }
    this.drawConfetti(ctx, unit);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.drawRockets(ctx, unit);
    this.drawSparks(ctx, unit);
    this.drawTwinkles(ctx);
    ctx.restore();
  }

  private color(): string {
    return this.colors[Math.floor(this.random() * this.colors.length)];
  }

  private stepFireworks(dt: number, w: number, h: number, unit: number) {
    if (this.emitting) {
      this.debt += dt * clamp(this.attributes.density, FIREWORK_BURSTS);
      // The first rocket leaves at once so a preview never opens empty.
      if (this.time === dt) this.debt = Math.max(this.debt, 1);
      while (this.debt >= 1) {
        this.debt -= 1;
        this.rockets.push({
          x: w * (0.15 + 0.7 * this.random()),
          y: h,
          vy: -unit * (0.9 + 0.3 * this.random()),
          apex: h * (0.18 + 0.3 * this.random()),
          color: this.color(),
        });
      }
    }
    for (const r of this.rockets) r.y += r.vy * dt;
    for (const r of this.rockets.filter((r) => r.y <= r.apex)) {
      const count = 45 + Math.floor(this.random() * 30);
      const mixed = this.random() < 0.3;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + this.random() * 0.2;
        const speed = unit * (0.22 + 0.2 * this.random());
        const life = 1.1 + 0.7 * this.random();
        this.sparks.push({
          x: r.x,
          y: r.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          color: mixed ? this.color() : r.color,
        });
      }
    }
    this.rockets = this.rockets.filter((r) => r.y > r.apex);
  }

  private stepConfetti(dt: number, w: number, h: number, unit: number) {
    const target = clamp(this.attributes.density, CONFETTI_PIECES);
    while (this.emitting && this.confetti.length < target) {
      this.confetti.push({
        x: w * this.random(),
        // Spread the first wave above the screen so it doesn't fall as a line.
        y: -h * this.random() * (this.time < 0.2 ? 0.6 : 0.1) - unit * 0.03,
        vy: unit * (0.16 + 0.14 * this.random()),
        sway: unit * (0.01 + 0.02 * this.random()),
        phase: this.random() * Math.PI * 2,
        spin: 4 + 6 * this.random(),
        angle: this.random() * Math.PI,
        color: this.color(),
      });
    }
    for (const c of this.confetti) {
      c.y += c.vy * dt;
      c.x += Math.sin(this.time * 2 + c.phase) * c.sway * dt * 3;
      c.angle += dt * 1.5;
    }
    this.confetti = this.confetti.filter((c) => c.y < h + unit * 0.05);
  }

  private stepTwinkles(w: number, h: number, unit: number) {
    const target = this.emitting
      ? clamp(this.attributes.density, FLAG_SPARKLES)
      : 0;
    while (this.twinkles.length < target) {
      this.twinkles.push({
        x: w * this.random(),
        y: h * this.random(),
        phase: this.random() * Math.PI * 2,
        speed: 2 + 4 * this.random(),
        size: unit * (0.006 + 0.012 * this.random()),
        color: this.color(),
      });
    }
    if (this.twinkles.length > target) this.twinkles.length = target;
  }

  private drawSparks(ctx: CanvasRenderingContext2D, unit: number) {
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.2, unit * 0.005);
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, (s.life / s.maxLife) * 1.6);
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 0.05, s.y - s.vy * 0.05);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawRockets(ctx: CanvasRenderingContext2D, unit: number) {
    ctx.lineWidth = Math.max(1.5, unit * 0.006);
    for (const r of this.rockets) {
      const tail = ctx.createLinearGradient(r.x, r.y, r.x, r.y + unit * 0.08);
      tail.addColorStop(0, r.color);
      tail.addColorStop(1, "transparent");
      ctx.strokeStyle = tail;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x, r.y + unit * 0.08);
      ctx.stroke();
    }
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, unit: number) {
    const w = Math.max(3, unit * 0.018);
    const h = Math.max(1.5, unit * 0.009);
    for (const c of this.confetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      // Flipping in 3D: the piece narrows to a line and back.
      ctx.scale(1, Math.cos(this.time * c.spin + c.phase));
      ctx.fillStyle = c.color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  private drawTwinkles(ctx: CanvasRenderingContext2D) {
    for (const t of this.twinkles) {
      const glow = (Math.sin(this.time * t.speed + t.phase) + 1) / 2;
      const r = t.size * (0.4 + 0.6 * glow);
      ctx.globalAlpha = 0.25 + 0.75 * glow;
      ctx.fillStyle = t.color;
      // A four-pointed star.
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - r * 2);
      ctx.quadraticCurveTo(t.x, t.y, t.x + r * 2, t.y);
      ctx.quadraticCurveTo(t.x, t.y, t.x, t.y + r * 2);
      ctx.quadraticCurveTo(t.x, t.y, t.x - r * 2, t.y);
      ctx.quadraticCurveTo(t.x, t.y, t.x, t.y - r * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The flag hangs from a pole on the left and ripples in the wind, rising
  // into place in the first second.
  private drawFlag(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    unit: number,
  ) {
    const aspect = flagAspect(this.flag);
    const flagW = Math.min(width * 0.62, height * 0.55 * aspect);
    const flagH = flagW / aspect;
    const rise = 1 - Math.pow(1 - Math.min(1, this.time / 0.9), 3);
    const left = (width - flagW) / 2 + unit * 0.02;
    const top = (height - flagH) / 2 + (1 - rise) * height * 0.6;
    const amp = flagH * 0.06;
    const strips = 48;
    const stripW = flagW / strips;

    ctx.fillStyle = "#d1d5db";
    const poleW = Math.max(3, unit * 0.012);
    ctx.fillRect(left - poleW, top - unit * 0.03, poleW, height - top);
    ctx.beginPath();
    ctx.arc(left - poleW / 2, top - unit * 0.03, poleW, 0, Math.PI * 2);
    ctx.fillStyle = this.colors[0];
    ctx.fill();

    for (let i = 0; i < strips; i++) {
      const u = i / strips;
      // Fixed at the pole, freer towards the loose edge.
      const phase = u * 7 - this.time * 5;
      const dy = Math.sin(phase) * amp * u;
      const x = left + i * stripW;
      if (this.flag) {
        const sw = imageWidth(this.flag) / strips;
        ctx.drawImage(
          this.flag,
          i * sw,
          0,
          sw,
          imageHeight(this.flag),
          x,
          top + dy,
          stripW + 0.6,
          flagH,
        );
      } else {
        this.drawClothStrip(ctx, x, top + dy, stripW + 0.6, flagH);
      }
      // Folds catch the light on one side and fall into shade on the other.
      const slope = Math.cos(phase) * u;
      ctx.fillStyle =
        slope > 0
          ? `rgba(255,255,255,${0.18 * slope})`
          : `rgba(0,0,0,${0.3 * -slope})`;
      ctx.fillRect(x, top + dy, stripW + 0.6, flagH);
    }
  }

  // Without a flag to show, the cloth wears the palette as horizontal bands.
  private drawClothStrip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const bands = this.colors.length;
    for (let b = 0; b < bands; b++) {
      ctx.fillStyle = this.colors[b];
      ctx.fillRect(x, y + (b * h) / bands, w, h / bands + 0.6);
    }
  }
}

function imageWidth(image: CanvasImageSource): number {
  return Number((image as { width: number }).width) || 3;
}

function imageHeight(image: CanvasImageSource): number {
  return Number((image as { height: number }).height) || 2;
}

function flagAspect(flag: CanvasImageSource | null): number {
  if (!flag) return 3 / 2;
  const aspect = imageWidth(flag) / imageHeight(flag);
  return Number.isFinite(aspect) && aspect > 0.5 ? Math.min(aspect, 2.2) : 1.5;
}

/**
 * Loads a flag picture for the giant-flag celebration, drawn once onto a
 * canvas (an SVG without a size reports no natural size to crop strips
 * from). Null when it can't load.
 */
export function loadFlagImage(url: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const aspect =
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : 1.5;
      const canvas = document.createElement("canvas");
      canvas.height = 400;
      canvas.width = Math.round(400 * aspect);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, 400);
      resolve(canvas);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

/**
 * Store preview of a victory effect: the celebration looping over a night
 * sky. With reduced motion it holds a single frame.
 */
@customElement("victory-swatch")
export class VictorySwatch extends LitElement {
  @property({ attribute: false })
  victory: VictoryEffectAttributes | null = null;

  private frame = 0;
  private animation: VictoryAnimation | null = null;
  private last = 0;
  private started = 0;

  // Light DOM so the shared Tailwind classes apply.
  createRenderRoot(): HTMLElement {
    return this;
  }

  render(): TemplateResult {
    return html`<canvas
      data-victory-swatch=${this.victory?.type ?? ""}
      class="block h-full w-full rounded-md"
      style="background: radial-gradient(circle at 50% 30%, #1e3a5f, #0a1628)"
    ></canvas>`;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("victory")) this.restart();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private restart() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const canvas = this.querySelector("canvas");
    if (!canvas || !this.victory) return;
    this.animation = new VictoryAnimation(this.victory);
    this.started = this.last = performance.now();
    if (prefersReducedMotion()) {
      // Enough simulated time for the effect to show what it is.
      const { w, h } = this.fit(canvas);
      for (let i = 0; i < 40; i++) this.animation.step(0.04, w, h);
      this.paint(canvas);
      return;
    }
    const loop = (now: number) => {
      const { w, h } = this.fit(canvas);
      this.animation?.step((now - this.last) / 1000, w, h);
      this.last = now;
      // A giant flag rises again every few seconds, like a fresh win.
      if (this.victory?.type === "giantFlag" && now - this.started > 6000) {
        this.animation = new VictoryAnimation(this.victory);
        this.started = now;
      }
      this.paint(canvas);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private fit(canvas: HTMLCanvasElement): { w: number; h: number } {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * ratio)) {
      canvas.width = Math.round(w * ratio);
    }
    if (canvas.height !== Math.round(h * ratio)) {
      canvas.height = Math.round(h * ratio);
    }
    return { w, h };
  }

  private paint(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !this.animation) return;
    const ratio = canvas.width / Math.max(1, canvas.clientWidth);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    this.animation.draw(ctx, canvas.clientWidth, canvas.clientHeight);
  }
}
