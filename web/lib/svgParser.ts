/**
 * SVG path parser — extracts polygon points from SVG path data
 * Runs entirely client-side, no server needed.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface ParsedShape {
  contours: Vec2[][];  // outer = first, holes = rest
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Sample points along a cubic bezier */
function sampleCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, steps = 16): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
      y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
    });
  }
  return pts;
}

/** Sample points along a quadratic bezier */
function sampleQuadratic(p0: Vec2, p1: Vec2, p2: Vec2, steps = 12): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt ** 2 * p0.x + 2 * mt * t * p1.x + t ** 2 * p2.x,
      y: mt ** 2 * p0.y + 2 * mt * t * p1.y + t ** 2 * p2.y,
    });
  }
  return pts;
}

/** Sample an arc (SVG arc command → points) */
function sampleArc(
  x1: number, y1: number,
  rx: number, ry: number,
  xRot: number, largeArc: number, sweep: number,
  x2: number, y2: number,
  steps = 24
): Vec2[] {
  // Endpoint to center parameterization
  const phi = (xRot * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  // Ensure radii are large enough
  const lambda = Math.sqrt(x1pSq / rxSq + y1pSq / rySq);
  if (lambda > 1) {
    rx = lambda * rx;
    ry = lambda * ry;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const den = rxSq * y1pSq + rySq * x1pSq;
  const sq = Math.sqrt(Math.max(0, num / den));
  const sign = largeArc === sweep ? -1 : 1;
  const cxp = sign * sq * (rx * y1p) / ry;
  const cyp = sign * sq * -(ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  let startAngle = Math.atan2(uy, ux);
  let dAngle = Math.atan2(vy, vx) - startAngle;

  if (sweep === 0 && dAngle > 0) dAngle -= 2 * Math.PI;
  if (sweep === 1 && dAngle < 0) dAngle += 2 * Math.PI;

  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (i / steps) * dAngle;
    const xp = rx * Math.cos(angle);
    const yp = ry * Math.sin(angle);
    pts.push({
      x: cosPhi * xp - sinPhi * yp + cx,
      y: sinPhi * xp + cosPhi * yp + cy,
    });
  }
  return pts;
}

/** Parse a single SVG `d` attribute into a list of contour point arrays */
export function parseSvgPath(d: string): Vec2[][] {
  const contours: Vec2[][] = [];
  let current: Vec2[] = [];
  let cx = 0, cy = 0; // current point
  let sx = 0, sy = 0; // start of subpath
  let lastCmd = "";
  let lastCtrl: Vec2 | null = null;

  // Tokenize
  const tokens = d
    .replace(/([MmZzLlHhVvCcSsQqTtAa])/g, " $1 ")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  let i = 0;

  const num = () => parseFloat(tokens[i++]);
  const flag = () => parseInt(tokens[i++]);

  while (i < tokens.length) {
    const cmd = tokens[i++];

    if (cmd === "M" || cmd === "m") {
      if (current.length > 0) contours.push(current);
      current = [];
      const abs = cmd === "M";
      cx = abs ? num() : cx + num();
      cy = abs ? num() : cy + num();
      sx = cx; sy = cy;
      current.push({ x: cx, y: cy });
      lastCmd = cmd;
      // Subsequent coordinate pairs are implicit L
      while (i < tokens.length && isNaN(parseFloat(tokens[i])) === false) {
        cx = abs ? num() : cx + num();
        cy = abs ? num() : cy + num();
        current.push({ x: cx, y: cy });
      }
    } else if (cmd === "Z" || cmd === "z") {
      current.push({ x: sx, y: sy });
      contours.push(current);
      current = [];
      cx = sx; cy = sy;
    } else if (cmd === "L" || cmd === "l") {
      const abs = cmd === "L";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        cx = abs ? num() : cx + num();
        cy = abs ? num() : cy + num();
        current.push({ x: cx, y: cy });
      }
    } else if (cmd === "H" || cmd === "h") {
      const abs = cmd === "H";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        cx = abs ? num() : cx + num();
        current.push({ x: cx, y: cy });
      }
    } else if (cmd === "V" || cmd === "v") {
      const abs = cmd === "V";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        cy = abs ? num() : cy + num();
        current.push({ x: cx, y: cy });
      }
    } else if (cmd === "C" || cmd === "c") {
      const abs = cmd === "C";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        const x1 = abs ? num() : cx + num();
        const y1 = abs ? num() : cy + num();
        const x2 = abs ? num() : cx + num();
        const y2 = abs ? num() : cy + num();
        const x = abs ? num() : cx + num();
        const y = abs ? num() : cy + num();
        lastCtrl = { x: x2, y: y2 };
        const pts = sampleCubic({ x: cx, y: cy }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y });
        current.push(...pts.slice(1));
        cx = x; cy = y;
      }
    } else if (cmd === "S" || cmd === "s") {
      const abs = cmd === "S";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        const x1 = lastCtrl
          ? 2 * cx - lastCtrl.x
          : cx;
        const y1 = lastCtrl
          ? 2 * cy - lastCtrl.y
          : cy;
        const x2 = abs ? num() : cx + num();
        const y2 = abs ? num() : cy + num();
        const x = abs ? num() : cx + num();
        const y = abs ? num() : cy + num();
        lastCtrl = { x: x2, y: y2 };
        const pts = sampleCubic({ x: cx, y: cy }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y });
        current.push(...pts.slice(1));
        cx = x; cy = y;
      }
    } else if (cmd === "Q" || cmd === "q") {
      const abs = cmd === "Q";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        const x1 = abs ? num() : cx + num();
        const y1 = abs ? num() : cy + num();
        const x = abs ? num() : cx + num();
        const y = abs ? num() : cy + num();
        lastCtrl = { x: x1, y: y1 };
        const pts = sampleQuadratic({ x: cx, y: cy }, { x: x1, y: y1 }, { x, y });
        current.push(...pts.slice(1));
        cx = x; cy = y;
      }
    } else if (cmd === "T" || cmd === "t") {
      const abs = cmd === "T";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        const cx1: number = lastCtrl ? 2 * cx - lastCtrl.x : cx;
        const cy1: number = lastCtrl ? 2 * cy - lastCtrl.y : cy;
        const x = abs ? num() : cx + num();
        const y = abs ? num() : cy + num();
        lastCtrl = { x: cx1, y: cy1 };
        const pts = sampleQuadratic({ x: cx, y: cy }, { x: cx1, y: cy1 }, { x, y });
        current.push(...pts.slice(1));
        cx = x; cy = y;
      }
    } else if (cmd === "A" || cmd === "a") {
      const abs = cmd === "A";
      while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
        const rx = num();
        const ry = num();
        const xRot = num();
        const largeArc = flag();
        const sweep = flag();
        const x = abs ? num() : cx + num();
        const y = abs ? num() : cy + num();
        const pts = sampleArc(cx, cy, rx, ry, xRot, largeArc, sweep, x, y);
        current.push(...pts.slice(1));
        cx = x; cy = y;
      }
    }

    if (!["C", "c", "S", "s", "Q", "q", "T", "t"].includes(cmd)) {
      lastCtrl = null;
    }
    lastCmd = cmd;
  }

  if (current.length > 0) contours.push(current);
  return contours;
}

/** Extract all path `d` attributes from SVG string */
export function extractSvgPaths(svgString: string): { d: string; transform?: string }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const paths: { d: string; transform?: string }[] = [];

  // Also handle rect/circle/ellipse by converting to paths
  doc.querySelectorAll("path").forEach((el) => {
    const d = el.getAttribute("d");
    if (d) paths.push({ d, transform: el.getAttribute("transform") || undefined });
  });

  // Convert rect elements
  doc.querySelectorAll("rect").forEach((el) => {
    const x = parseFloat(el.getAttribute("x") || "0");
    const y = parseFloat(el.getAttribute("y") || "0");
    const w = parseFloat(el.getAttribute("width") || "0");
    const h = parseFloat(el.getAttribute("height") || "0");
    if (w > 0 && h > 0) {
      paths.push({ d: `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z` });
    }
  });

  // Convert circle elements
  doc.querySelectorAll("circle").forEach((el) => {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const r = parseFloat(el.getAttribute("r") || "0");
    if (r > 0) {
      // Approximate circle as cubic bezier
      const k = 0.5522847498;
      paths.push({
        d: `M${cx - r},${cy} C${cx - r},${cy - k * r} ${cx - k * r},${cy - r} ${cx},${cy - r} C${cx + k * r},${cy - r} ${cx + r},${cy - k * r} ${cx + r},${cy} C${cx + r},${cy + k * r} ${cx + k * r},${cy + r} ${cx},${cy + r} C${cx - k * r},${cy + r} ${cx - r},${cy + k * r} ${cx - r},${cy} Z`,
      });
    }
  });

  // Convert ellipse elements
  doc.querySelectorAll("ellipse").forEach((el) => {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const rx = parseFloat(el.getAttribute("rx") || "0");
    const ry = parseFloat(el.getAttribute("ry") || "0");
    if (rx > 0 && ry > 0) {
      const k = 0.5522847498;
      paths.push({
        d: `M${cx - rx},${cy} C${cx - rx},${cy - k * ry} ${cx - k * rx},${cy - ry} ${cx},${cy - ry} C${cx + k * rx},${cy - ry} ${cx + rx},${cy - k * ry} ${cx + rx},${cy} C${cx + rx},${cy + k * ry} ${cx + k * rx},${cy + ry} ${cx},${cy + ry} C${cx - k * rx},${cy + ry} ${cx - rx},${cy + k * ry} ${cx - rx},${cy} Z`,
      });
    }
  });

  return paths;
}

/** Get the viewBox bounds from an SVG string */
export function getSvgViewBox(svgString: string): { width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return { width: 100, height: 100 };

  const vb = svg.getAttribute("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) return { width: parts[2], height: parts[3] };
  }

  const w = parseFloat(svg.getAttribute("width") || "100");
  const h = parseFloat(svg.getAttribute("height") || "100");
  return { width: w, height: h };
}

/** Compute bounds of contours */
export function computeBounds(contours: Vec2[][]): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const contour of contours) {
    for (const p of contour) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}
