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
 * Base: solid cylinder with a switch pocket cut from the top.
 * The base is a solid disc with:
 *  - Outer body: full solid cylinder
 *  - Socket pocket: rectangular recess from the top for the MX switch
 *  - Pin holes: small cylindrical voids for switch pins (bottom)
 *
 * Centered at Y=0, extends ±BASE_HEIGHT/2 on Y axis
 */
export function createBaseGeometry(diameter: number): THREE.BufferGeometry {
  const outerR = diameter / 2;
  const H = CLICKER.BASE_HEIGHT;
  const botH = CLICKER.BASE_BOTTOM;
  const pocketDepth = H - botH; // depth of the switch pocket from top
  const halfH = CHERRY_MX.PLATE_HOLE / 2;
  const geos: THREE.BufferGeometry[] = [];

  // 1. Solid base cylinder (the main body)
  // Use ExtrudeGeometry from a circle shape with square hole for the pocket
  // Actually simpler: solid cylinder + pocket walls

  // Bottom solid disc (full circle, closed)
  const baseCyl = new THREE.CylinderGeometry(outerR, outerR, botH, SEG, 1, false);
  baseCyl.translate(0, -H / 2 + botH / 2, 0);
  geos.push(baseCyl);

  // 2. Outer wall ring from bottom plate to top
  // This is the cylindrical wall around the pocket
  // Create as a shape (annular ring) extruded upward
  const wallShape = new THREE.Shape();
  wallShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const pocketHole = new THREE.Path();
  pocketHole.absarc(0, 0, outerR - CLICKER.BASE_WALL, 0, Math.PI * 2, true);
  wallShape.holes.push(pocketHole);
  const wallGeo = new THREE.ExtrudeGeometry(wallShape, {
    depth: pocketDepth,
    bevelEnabled: false,
  });
  wallGeo.rotateX(-Math.PI / 2);
  wallGeo.translate(0, -H / 2 + botH, 0);
  geos.push(wallGeo);

  // 3. Socket frame (raised platform inside pocket with 14mm square hole)
  // This is the "plate" that holds the switch — an annular platform inside the pocket
  // It sits at the top of the pocket (flush with top of base)
  const plateH = CHERRY_MX.PLATE_THICKNESS;
  const innerR = outerR - CLICKER.BASE_WALL;

  // Create the plate as a circle with square hole
  const plateShape = new THREE.Shape();
  plateShape.absarc(0, 0, innerR, 0, Math.PI * 2, false);
  const squareHole = new THREE.Path();
  squareHole.moveTo(-halfH, -halfH);
  squareHole.lineTo(halfH, -halfH);
  squareHole.lineTo(halfH, halfH);
  squareHole.lineTo(-halfH, halfH);
  squareHole.closePath();
  plateShape.holes.push(squareHole);
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
    depth: plateH,
    bevelEnabled: false,
  });
  plateGeo.rotateX(-Math.PI / 2);
  plateGeo.translate(0, H / 2 - plateH, 0);
  geos.push(plateGeo);

  // 4. Pin guide cylinders (solid posts rising from bottom plate)
  // These have holes for the pins to pass through — for now solid guides
  const pinGuideH = pocketDepth - plateH - 1.0; // leave gap below plate
  for (const pin of [CHERRY_MX.PIN_1, CHERRY_MX.PIN_2]) {
    const cyl = new THREE.CylinderGeometry(pin.diameter / 2 + 0.5, pin.diameter / 2 + 0.5, pinGuideH, 12, 1, false);
    cyl.translate(pin.x, -H / 2 + botH + pinGuideH / 2, pin.y);
    geos.push(cyl);
  }

  // 5. Center post (alignment peg)
  const centerH = pocketDepth - plateH - 0.5;
  const centerCyl = new THREE.CylinderGeometry(
    CHERRY_MX.CENTER_POST.diameter / 2 + 0.3,
    CHERRY_MX.CENTER_POST.diameter / 2 + 0.3,
    centerH, 16, 1, false
  );
  centerCyl.translate(0, -H / 2 + botH + centerH / 2, 0);
  geos.push(centerCyl);

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
