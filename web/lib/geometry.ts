/**
 * Generate 3D geometry for the fidget clicker parts
 * All dimensions in mm, geometry as Three.js BufferGeometry
 */

import * as THREE from "three";
import { CHERRY_MX, CLICKER } from "./dimensions";
import { Vec2, parseSvgPath, extractSvgPaths, getSvgViewBox, computeBounds } from "./svgParser";

const SEGMENTS = 64;

/**
 * Merge multiple BufferGeometries into one (no CSG, additive only)
 */
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = geos.filter(g => g.attributes.position?.count > 0);
  if (valid.length === 0) return new THREE.BufferGeometry();
  if (valid.length === 1) return valid[0];

  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of valid) {
    totalVerts += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }

  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);
  const idx = new Uint32Array(totalIdx);

  let vOff = 0, iOff = 0;
  for (const g of valid) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    pos.set(p.array as Float32Array, vOff * 3);
    if (n) nor.set(n.array as Float32Array, vOff * 3);

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[iOff + i] = g.index.array[i] + vOff;
      iOff += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[iOff + i] = vOff + i;
      iOff += p.count;
    }
    vOff += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  return out;
}

/**
 * Create base geometry — cylindrical shell with flat bottom
 * Y-up, centred at world origin, extends from -BASE_HEIGHT/2 to +BASE_HEIGHT/2
 */
export function createBaseGeometry(diameter: number): THREE.BufferGeometry {
  const outerR = diameter / 2;
  const innerR = outerR - CLICKER.BASE_WALL;
  const H = CLICKER.BASE_HEIGHT;
  const botH = CLICKER.BASE_BOTTOM;

  // Outer wall
  const outerTop    = new THREE.CylinderGeometry(outerR, outerR, H, SEGMENTS, 1, false);
  // Inner cavity (open top) — we subtract visually by NOT drawing it; instead draw the shell
  // Shell ring
  const ring = new THREE.CylinderGeometry(outerR, outerR, H, SEGMENTS, 1, true); // open cylinder
  // Top annular cap (ring at top)
  const topCap = new THREE.RingGeometry(innerR, outerR, SEGMENTS);
  topCap.rotateX(-Math.PI / 2);
  topCap.translate(0, H / 2, 0);
  // Bottom full disc (with socket hole approximated visually)
  const bottomDisc = new THREE.CylinderGeometry(outerR, outerR, botH, SEGMENTS, 1, false);
  bottomDisc.translate(0, -H / 2 + botH / 2, 0);

  // Inner wall surface
  const innerWall = new THREE.CylinderGeometry(innerR, innerR, H - botH, SEGMENTS, 1, true);
  innerWall.translate(0, botH / 2, 0);

  // Cherry MX socket indicator — a raised square frame on the bottom inner face
  const halfHole = CHERRY_MX.PLATE_HOLE / 2;
  const socketFrameGeos: THREE.BufferGeometry[] = [];
  // 4 walls of the socket frame
  const wallThick = 1.0;
  const wallH = 2.0;
  const wallY = -H / 2 + botH + wallH / 2;

  // Front & back walls
  for (const sign of [-1, 1]) {
    const w = new THREE.BoxGeometry(CHERRY_MX.PLATE_HOLE + wallThick * 2, wallH, wallThick);
    w.translate(0, wallY, sign * (halfHole + wallThick / 2));
    socketFrameGeos.push(w);
  }
  // Left & right walls
  for (const sign of [-1, 1]) {
    const w = new THREE.BoxGeometry(wallThick, wallH, CHERRY_MX.PLATE_HOLE);
    w.translate(sign * (halfHole + wallThick / 2), wallY, 0);
    socketFrameGeos.push(w);
  }

  // Pin holes (visual cylinders inside socket)
  const pin1 = new THREE.CylinderGeometry(0.8, 0.8, wallH, 12);
  pin1.translate(CHERRY_MX.PIN_1.x, wallY, CHERRY_MX.PIN_1.y);
  const pin2 = new THREE.CylinderGeometry(0.8, 0.8, wallH, 12);
  pin2.translate(CHERRY_MX.PIN_2.x, wallY, CHERRY_MX.PIN_2.y);

  const allGeos = [ring, topCap, bottomDisc, innerWall, ...socketFrameGeos, pin1, pin2];
  return mergeGeos(allGeos);
}

/**
 * Create top cap geometry with SVG design on top face
 * Y-up, centred at world origin
 */
export function createTopCapGeometry(
  svgContent: string,
  diameter: number,
  designDepth: number,
  embossed: boolean
): THREE.BufferGeometry {
  const outerR = diameter / 2 - CLICKER.BASE_WALL - CLICKER.CAP_CLEARANCE;
  const lipR   = outerR - 1.0;
  const H      = CLICKER.CAP_THICKNESS;
  const lipH   = CLICKER.CAP_LIP;

  // Main disc
  const disc = new THREE.CylinderGeometry(outerR, outerR, H, SEGMENTS, 1, false);

  // Lip ring (goes inside the base)
  const lip = new THREE.CylinderGeometry(lipR, lipR, lipH, SEGMENTS, 1, true);
  lip.translate(0, -(H / 2 + lipH / 2), 0);

  // Lip top/bottom caps
  const lipTop = new THREE.RingGeometry(lipR - 1, lipR, SEGMENTS);
  lipTop.rotateX(-Math.PI / 2);
  lipTop.translate(0, -(H / 2), 0);
  const lipBot = new THREE.RingGeometry(lipR - 1, lipR, SEGMENTS);
  lipBot.rotateX(-Math.PI / 2);
  lipBot.translate(0, -(H / 2 + lipH), 0);
  // lip inner floor
  const lipFloor = new THREE.CircleGeometry(lipR - 1, SEGMENTS);
  lipFloor.rotateX(-Math.PI / 2);
  lipFloor.translate(0, -(H / 2 + lipH), 0);

  // Cross stem receiver
  const stemGeos = createStemReceiverGeos(H, lipH);

  // SVG design
  const designGeos = createDesignGeos(svgContent, outerR, H, designDepth, embossed);

  const allGeos = [disc, lip, lipTop, lipBot, lipFloor, ...stemGeos, ...designGeos];
  return mergeGeos(allGeos);
}

/**
 * Cross-shaped stem receiver (Cherry MX cross slot)
 */
function createStemReceiverGeos(capH: number, lipH: number): THREE.BufferGeometry[] {
  const { STEM_WIDTH, STEM_THICKNESS } = CHERRY_MX;
  const receiverH = CLICKER.STEM_RECEIVER_DEPTH;
  const wall = 1.0;
  const baseY = -(capH / 2 + lipH + receiverH / 2);

  const geos: THREE.BufferGeometry[] = [];

  // Outer cross bounding box (solid)
  const outerW = STEM_WIDTH + wall * 2;
  const outer = new THREE.BoxGeometry(outerW, receiverH, outerW);
  outer.translate(0, baseY, 0);
  geos.push(outer);

  // Punch out cross slot visually (just show the walls by adding inner pieces)
  // Horizontal arm of cross (slot cutout represented as void — skip for additive preview)
  // Instead: show the 4 corner blocks that form around the cross
  const cornerW = (outerW - STEM_THICKNESS) / 2;
  const cornerD = (outerW - STEM_THICKNESS) / 2;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const corner = new THREE.BoxGeometry(cornerW, receiverH, cornerD);
      corner.translate(
        sx * (STEM_THICKNESS / 2 + cornerW / 2),
        baseY,
        sz * (STEM_THICKNESS / 2 + cornerD / 2)
      );
      // Remove (subtract) — since we can't do CSG, just skip; outer box gives visual
    }
  }

  return geos;
}

/**
 * Extrude SVG design onto the top face of the cap
 */
function createDesignGeos(
  svgContent: string,
  capRadius: number,
  capH: number,
  designDepth: number,
  embossed: boolean
): THREE.BufferGeometry[] {
  try {
    const pathData = extractSvgPaths(svgContent);
    if (pathData.length === 0) return [];

    const allContours: Vec2[][] = [];
    for (const { d } of pathData) {
      allContours.push(...parseSvgPath(d));
    }
    if (allContours.length === 0) return [];

    const bounds = computeBounds(allContours);
    const svgW = bounds.maxX - bounds.minX;
    const svgH = bounds.maxY - bounds.minY;
    if (svgW === 0 || svgH === 0) return [];

    const targetSize = capRadius * 2 * 0.7;
    const scale = targetSize / Math.max(svgW, svgH);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    const geos: THREE.BufferGeometry[] = [];

    for (const contour of allContours) {
      if (contour.length < 3) continue;

      const shape = new THREE.Shape();
      shape.moveTo(
        (contour[0].x - cx) * scale,
        -(contour[0].y - cy) * scale
      );
      for (let i = 1; i < contour.length; i++) {
        shape.lineTo((contour[i].x - cx) * scale, -(contour[i].y - cy) * scale);
      }
      shape.closePath();

      const area = Math.abs(THREE.ShapeUtils.area(shape.getPoints()));
      if (area < 0.01) continue;

      try {
        const extruded = new THREE.ExtrudeGeometry(shape, {
          depth: designDepth,
          bevelEnabled: false,
        });

        // Rotate from XY plane to XZ (top face)
        extruded.rotateX(-Math.PI / 2);

        // Position: embossed = on top of cap, sunken = recessed into cap top
        const topFace = capH / 2;
        if (embossed) {
          extruded.translate(0, topFace, 0);
        } else {
          extruded.translate(0, topFace - designDepth, 0);
        }

        geos.push(extruded);
      } catch {
        // skip bad shapes
      }
    }

    return geos;
  } catch {
    return [];
  }
}

/**
 * Export a BufferGeometry as binary STL ArrayBuffer
 */
export function geometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const geo = geometry.toNonIndexed();
  geo.computeVertexNormals();
  const posAttr = geo.attributes.position;
  const norAttr = geo.attributes.normal;
  const numTris = posAttr.count / 3;

  const buf = new ArrayBuffer(80 + 4 + numTris * 50);
  const view = new DataView(buf);

  const header = "SVG-to-STL Fidget Clicker";
  for (let i = 0; i < 80; i++) view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  view.setUint32(80, numTris, true);

  let off = 84;
  for (let i = 0; i < numTris; i++) {
    const base = i * 3;
    // Normal (averaged from 3 vertices)
    const nx = (norAttr.getX(base) + norAttr.getX(base + 1) + norAttr.getX(base + 2)) / 3;
    const ny = (norAttr.getY(base) + norAttr.getY(base + 1) + norAttr.getY(base + 2)) / 3;
    const nz = (norAttr.getZ(base) + norAttr.getZ(base + 1) + norAttr.getZ(base + 2)) / 3;
    view.setFloat32(off, nx, true); off += 4;
    view.setFloat32(off, ny, true); off += 4;
    view.setFloat32(off, nz, true); off += 4;

    for (let j = 0; j < 3; j++) {
      view.setFloat32(off, posAttr.getX(base + j), true); off += 4;
      view.setFloat32(off, posAttr.getY(base + j), true); off += 4;
      view.setFloat32(off, posAttr.getZ(base + j), true); off += 4;
    }
    view.setUint16(off, 0, true); off += 2;
  }

  return buf;
}
