/**
 * Generate 3D geometry for the fidget clicker parts
 * Units: mm. Y-up coordinate system.
 */

import * as THREE from "three";
import { CHERRY_MX, CLICKER } from "./dimensions";
import { Vec2, parseSvgPath, extractSvgPaths, getSvgViewBox, computeBounds } from "./svgParser";

const SEG = 64;

/** Merge multiple geometries into one */
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = geos.filter(g => g.attributes.position?.count > 0);
  if (valid.length === 0) return new THREE.BufferGeometry();
  if (valid.length === 1) {
    const g = valid[0].clone();
    g.computeVertexNormals();
    return g;
  }

  // Convert all to non-indexed first
  const nonIndexed = valid.map(g => g.toNonIndexed());

  let totalVerts = 0;
  for (const g of nonIndexed) totalVerts += g.attributes.position.count;

  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);

  let off = 0;
  for (const g of nonIndexed) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count * 3; i++) pos[off * 3 + i] = (p.array as Float32Array)[i];
    if (n) for (let i = 0; i < n.count * 3; i++) nor[off * 3 + i] = (n.array as Float32Array)[i];
    off += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.computeVertexNormals();
  return out;
}

/**
 * Base: outer cylinder shell + bottom plate + Cherry MX socket frame
 * Centered at Y=0, extends ±BASE_HEIGHT/2 on Y axis
 */
export function createBaseGeometry(diameter: number): THREE.BufferGeometry {
  const outerR = diameter / 2;
  const innerR = outerR - CLICKER.BASE_WALL;
  const H = CLICKER.BASE_HEIGHT;
  const botH = CLICKER.BASE_BOTTOM;
  const geos: THREE.BufferGeometry[] = [];

  // Outer wall (open cylinder)
  const outerWall = new THREE.CylinderGeometry(outerR, outerR, H, SEG, 1, true);
  geos.push(outerWall);

  // Top annular cap
  const topRing = new THREE.CylinderGeometry(outerR, innerR, 0.01, SEG, 1, false);
  topRing.translate(0, H / 2, 0);
  // Use a ring shape extruded flat
  const topShape = new THREE.Shape();
  topShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const topHole = new THREE.Path();
  topHole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  topShape.holes.push(topHole);
  const topCapGeo = new THREE.ShapeGeometry(topShape, SEG);
  topCapGeo.rotateX(-Math.PI / 2);
  topCapGeo.translate(0, H / 2, 0);
  geos.push(topCapGeo);

  // Bottom full disc
  const botShape = new THREE.Shape();
  botShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const botGeo = new THREE.ShapeGeometry(botShape, SEG);
  botGeo.rotateX(Math.PI / 2); // face down
  botGeo.translate(0, -H / 2, 0);
  geos.push(botGeo);

  // Bottom inner disc (top of bottom plate)
  const botInnerShape = new THREE.Shape();
  botInnerShape.absarc(0, 0, innerR, 0, Math.PI * 2, false);
  // Cherry MX socket hole cutout (visual — square)
  const halfH = CHERRY_MX.PLATE_HOLE / 2;
  const socketPath = new THREE.Path();
  socketPath.moveTo(-halfH, -halfH);
  socketPath.lineTo(halfH, -halfH);
  socketPath.lineTo(halfH, halfH);
  socketPath.lineTo(-halfH, halfH);
  socketPath.closePath();
  botInnerShape.holes.push(socketPath);
  const botInnerGeo = new THREE.ShapeGeometry(botInnerShape, SEG);
  botInnerGeo.rotateX(-Math.PI / 2);
  botInnerGeo.translate(0, -H / 2 + botH, 0);
  geos.push(botInnerGeo);

  // Inner wall (open)
  const innerWall = new THREE.CylinderGeometry(innerR, innerR, H - botH, SEG, 1, true);
  innerWall.translate(0, botH / 2, 0);
  geos.push(innerWall);

  // Socket frame walls (4 box sides)
  const fw = CHERRY_MX.PLATE_HOLE;
  const fwH = 2.5;
  const ft = 1.0;
  const fy = -H / 2 + botH + fwH / 2;
  for (const [w, d, tx, tz] of [
    [fw + ft * 2, ft, 0, -(fw / 2 + ft / 2)],
    [fw + ft * 2, ft, 0, fw / 2 + ft / 2],
    [ft, fw, -(fw / 2 + ft / 2), 0],
    [ft, fw, fw / 2 + ft / 2, 0],
  ] as [number, number, number, number][]) {
    const box = new THREE.BoxGeometry(w, fwH, d);
    box.translate(tx, fy, tz);
    geos.push(box);
  }

  // Pin cylinders
  for (const pin of [CHERRY_MX.PIN_1, CHERRY_MX.PIN_2]) {
    const cyl = new THREE.CylinderGeometry(0.75, 0.75, fwH, 12);
    cyl.translate(pin.x, fy, pin.y);
    geos.push(cyl);
  }

  return mergeGeos(geos);
}

/**
 * Top cap: disc + lip ring + stem receiver + SVG design
 * Centered at Y=0
 */
export function createTopCapGeometry(
  svgContent: string,
  diameter: number,
  designDepth: number,
  embossed: boolean
): THREE.BufferGeometry {
  const outerR = diameter / 2 - CLICKER.BASE_WALL - CLICKER.CAP_CLEARANCE;
  const lipR = outerR - 1.2;
  const H = CLICKER.CAP_THICKNESS;
  const lipH = CLICKER.CAP_LIP;
  const geos: THREE.BufferGeometry[] = [];

  // Main disc (solid cylinder)
  const disc = new THREE.CylinderGeometry(outerR, outerR, H, SEG, 1, false);
  geos.push(disc);

  // Lip ring (open cylinder, hangs below disc)
  const lipWall = new THREE.CylinderGeometry(lipR, lipR, lipH, SEG, 1, true);
  lipWall.translate(0, -(H / 2 + lipH / 2), 0);
  geos.push(lipWall);

  // Lip annular top (connects disc bottom to lip)
  const lipTopShape = new THREE.Shape();
  lipTopShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const lipTopHole = new THREE.Path();
  lipTopHole.absarc(0, 0, lipR, 0, Math.PI * 2, true);
  lipTopShape.holes.push(lipTopHole);
  const lipTopGeo = new THREE.ShapeGeometry(lipTopShape, SEG);
  lipTopGeo.rotateX(Math.PI / 2); // face down
  lipTopGeo.translate(0, -H / 2, 0);
  geos.push(lipTopGeo);

  // Lip bottom disc
  const lipBotShape = new THREE.Shape();
  lipBotShape.absarc(0, 0, lipR, 0, Math.PI * 2, false);
  const lipBotGeo = new THREE.ShapeGeometry(lipBotShape, SEG);
  lipBotGeo.rotateX(Math.PI / 2);
  lipBotGeo.translate(0, -(H / 2 + lipH), 0);
  geos.push(lipBotGeo);

  // Stem receiver block
  const { STEM_WIDTH, STEM_THICKNESS } = CHERRY_MX;
  const recH = CLICKER.STEM_RECEIVER_DEPTH;
  const wall = 1.0;
  const recY = -(H / 2 + lipH + recH / 2);
  const outerW = STEM_WIDTH + wall * 2;

  // Solid outer block
  const stemBlock = new THREE.BoxGeometry(outerW, recH, outerW);
  stemBlock.translate(0, recY, 0);
  geos.push(stemBlock);

  // SVG design on top face
  const designGeos = svgContent
    ? createDesignGeos(svgContent, outerR, H, designDepth, embossed)
    : [];
  geos.push(...designGeos);

  return mergeGeos(geos);
}

function createDesignGeos(
  svgContent: string,
  capRadius: number,
  capH: number,
  designDepth: number,
  embossed: boolean
): THREE.BufferGeometry[] {
  try {
    const pathData = extractSvgPaths(svgContent);
    if (!pathData.length) return [];

    const allContours: Vec2[][] = [];
    for (const { d } of pathData) allContours.push(...parseSvgPath(d));
    if (!allContours.length) return [];

    const bounds = computeBounds(allContours);
    const svgW = bounds.maxX - bounds.minX;
    const svgH = bounds.maxY - bounds.minY;
    if (!svgW || !svgH) return [];

    const targetSize = capRadius * 2 * 0.72;
    const scale = targetSize / Math.max(svgW, svgH);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    const geos: THREE.BufferGeometry[] = [];
    for (const contour of allContours) {
      if (contour.length < 3) continue;
      const shape = new THREE.Shape(
        contour.map(p => new THREE.Vector2((p.x - cx) * scale, -(p.y - cy) * scale))
      );
      const area = Math.abs(THREE.ShapeUtils.area(shape.getPoints()));
      if (area < 0.1) continue;

      try {
        const extruded = new THREE.ExtrudeGeometry(shape, { depth: designDepth, bevelEnabled: false });
        extruded.rotateX(-Math.PI / 2);
        const topY = capH / 2;
        extruded.translate(0, embossed ? topY : topY - designDepth, 0);
        geos.push(extruded);
      } catch { /* skip */ }
    }
    return geos;
  } catch {
    return [];
  }
}

/**
 * Export geometry as binary STL
 */
export function geometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const geo = geometry.toNonIndexed();
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const numTris = pos.count / 3;

  const buf = new ArrayBuffer(80 + 4 + numTris * 50);
  const view = new DataView(buf);
  const header = "SVG-to-STL Fidget Clicker";
  for (let i = 0; i < 80; i++) view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  view.setUint32(80, numTris, true);

  let off = 84;
  for (let i = 0; i < numTris; i++) {
    const b = i * 3;
    view.setFloat32(off, nor.getX(b), true); off += 4;
    view.setFloat32(off, nor.getY(b), true); off += 4;
    view.setFloat32(off, nor.getZ(b), true); off += 4;
    for (let j = 0; j < 3; j++) {
      view.setFloat32(off, pos.getX(b + j), true); off += 4;
      view.setFloat32(off, pos.getY(b + j), true); off += 4;
      view.setFloat32(off, pos.getZ(b + j), true); off += 4;
    }
    view.setUint16(off, 0, true); off += 2;
  }
  return buf;
}
