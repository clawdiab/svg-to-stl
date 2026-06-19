/**
 * Generate 3D geometry for the fidget clicker parts
 * All dimensions in mm, geometry as Three.js BufferGeometry
 */

import * as THREE from "three";
import { CHERRY_MX, CLICKER } from "./dimensions";
import { Vec2, parseSvgPath, extractSvgPaths, getSvgViewBox, computeBounds } from "./svgParser";

/**
 * Create the base part geometry (housing for Cherry MX switch)
 */
export function createBaseGeometry(diameter: number): THREE.BufferGeometry {
  const radius = diameter / 2;
  const { BASE_WALL, BASE_HEIGHT, BASE_BOTTOM, PLATE_HOLE } = { ...CLICKER, ...CHERRY_MX };
  const innerRadius = radius - BASE_WALL;
  const segments = 64;

  // Outer shell - cylinder
  const outer = new THREE.CylinderGeometry(radius, radius, BASE_HEIGHT, segments);

  // Inner cavity - cylinder (hollowed out)
  const innerHeight = BASE_HEIGHT - BASE_BOTTOM;
  const inner = new THREE.CylinderGeometry(innerRadius, innerRadius, innerHeight, segments);
  inner.translate(0, BASE_BOTTOM / 2, 0);

  // Switch socket hole (14mm square, through the bottom part)
  // We'll approximate with actual CSG or just represent visually
  // For visual preview, we'll use a combined approach

  // Use a simpler representation: outer cylinder with hole indicators
  const group = new THREE.Group();

  // Main body
  const bodyShape = new THREE.Shape();
  bodyShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  bodyShape.holes.push(holePath);

  const baseGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: BASE_HEIGHT,
    bevelEnabled: false,
  });

  // Add bottom plate
  const bottomShape = new THREE.Shape();
  bottomShape.absarc(0, 0, innerRadius, 0, Math.PI * 2, false);
  // Cherry MX socket cutout (square)
  const halfHole = PLATE_HOLE / 2;
  const socketHole = new THREE.Path();
  socketHole.moveTo(-halfHole, -halfHole);
  socketHole.lineTo(halfHole, -halfHole);
  socketHole.lineTo(halfHole, halfHole);
  socketHole.lineTo(-halfHole, halfHole);
  socketHole.closePath();
  bottomShape.holes.push(socketHole);

  const bottomGeo = new THREE.ExtrudeGeometry(bottomShape, {
    depth: BASE_BOTTOM,
    bevelEnabled: false,
  });

  // Merge geometries
  baseGeo.rotateX(-Math.PI / 2);
  bottomGeo.rotateX(-Math.PI / 2);
  bottomGeo.translate(0, -BASE_HEIGHT / 2, 0);

  // Combine into single geometry
  const merged = mergeGeometries([baseGeo, bottomGeo]);
  merged.translate(0, -BASE_HEIGHT / 2, 0);
  merged.rotateX(-Math.PI / 2);

  return merged;
}

/**
 * Create the top cap geometry with SVG design
 */
export function createTopCapGeometry(
  svgContent: string,
  diameter: number,
  designDepth: number,
  embossed: boolean
): THREE.BufferGeometry {
  const radius = diameter / 2;
  const { CAP_THICKNESS, CAP_LIP, CAP_CLEARANCE } = CLICKER;
  const capRadius = radius - CLICKER.BASE_WALL - CAP_CLEARANCE;
  const segments = 64;

  // Main cap disc
  const capShape = new THREE.Shape();
  capShape.absarc(0, 0, capRadius, 0, Math.PI * 2, false);

  const capGeo = new THREE.ExtrudeGeometry(capShape, {
    depth: CAP_THICKNESS,
    bevelEnabled: false,
  });

  // Lip that goes inside base
  const lipShape = new THREE.Shape();
  lipShape.absarc(0, 0, capRadius - 1, 0, Math.PI * 2, false);
  const lipHole = new THREE.Path();
  lipHole.absarc(0, 0, capRadius - 2, 0, Math.PI * 2, true);
  lipShape.holes.push(lipHole);

  const lipGeo = new THREE.ExtrudeGeometry(lipShape, {
    depth: CAP_LIP,
    bevelEnabled: false,
  });
  lipGeo.translate(0, 0, -CAP_LIP);

  // Stem receiver (cross shape for Cherry MX)
  const stemGeo = createStemReceiver();
  stemGeo.translate(0, 0, -CAP_LIP - CLICKER.STEM_RECEIVER_DEPTH);

  // Parse SVG and create design
  const designGeo = createDesignGeometry(svgContent, capRadius, designDepth, embossed);

  const geos = [capGeo, lipGeo, stemGeo];
  if (designGeo) geos.push(designGeo);

  const merged = mergeGeometries(geos);
  merged.rotateX(-Math.PI / 2);
  merged.translate(0, CAP_THICKNESS / 2, 0);

  return merged;
}

/**
 * Create cross-shaped stem receiver for Cherry MX
 */
function createStemReceiver(): THREE.BufferGeometry {
  const { STEM_WIDTH, STEM_THICKNESS } = CHERRY_MX;
  const depth = CLICKER.STEM_RECEIVER_DEPTH;
  const wall = 1.0;

  // Cross shape with walls
  const outerSize = STEM_WIDTH + wall * 2;
  const shape = new THREE.Shape();
  shape.moveTo(-outerSize / 2, -STEM_THICKNESS / 2 - wall);
  shape.lineTo(outerSize / 2, -STEM_THICKNESS / 2 - wall);
  shape.lineTo(outerSize / 2, STEM_THICKNESS / 2 + wall);
  shape.lineTo(-outerSize / 2, STEM_THICKNESS / 2 + wall);
  shape.closePath();

  // Horizontal bar of cross (the slot)
  const hSlot = new THREE.Path();
  hSlot.moveTo(-STEM_WIDTH / 2, -STEM_THICKNESS / 2);
  hSlot.lineTo(STEM_WIDTH / 2, -STEM_THICKNESS / 2);
  hSlot.lineTo(STEM_WIDTH / 2, STEM_THICKNESS / 2);
  hSlot.lineTo(-STEM_WIDTH / 2, STEM_THICKNESS / 2);
  hSlot.closePath();
  shape.holes.push(hSlot);

  const geo1 = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });

  // Vertical bar
  const shape2 = new THREE.Shape();
  shape2.moveTo(-STEM_THICKNESS / 2 - wall, -outerSize / 2);
  shape2.lineTo(STEM_THICKNESS / 2 + wall, -outerSize / 2);
  shape2.lineTo(STEM_THICKNESS / 2 + wall, outerSize / 2);
  shape2.lineTo(-STEM_THICKNESS / 2 - wall, outerSize / 2);
  shape2.closePath();

  const vSlot = new THREE.Path();
  vSlot.moveTo(-STEM_THICKNESS / 2, -STEM_WIDTH / 2);
  vSlot.lineTo(STEM_THICKNESS / 2, -STEM_WIDTH / 2);
  vSlot.lineTo(STEM_THICKNESS / 2, STEM_WIDTH / 2);
  vSlot.lineTo(-STEM_THICKNESS / 2, STEM_WIDTH / 2);
  vSlot.closePath();
  shape2.holes.push(vSlot);

  const geo2 = new THREE.ExtrudeGeometry(shape2, { depth, bevelEnabled: false });

  return mergeGeometries([geo1, geo2]);
}

/**
 * Create SVG design geometry on cap surface
 */
function createDesignGeometry(
  svgContent: string,
  capRadius: number,
  designDepth: number,
  embossed: boolean
): THREE.BufferGeometry | null {
  try {
    const pathData = extractSvgPaths(svgContent);
    if (pathData.length === 0) return null;

    const viewBox = getSvgViewBox(svgContent);
    const allContours: Vec2[][] = [];

    for (const { d } of pathData) {
      const contours = parseSvgPath(d);
      allContours.push(...contours);
    }

    if (allContours.length === 0) return null;

    const bounds = computeBounds(allContours);
    const svgWidth = bounds.maxX - bounds.minX;
    const svgHeight = bounds.maxY - bounds.minY;
    if (svgWidth === 0 || svgHeight === 0) return null;

    // Scale to fit within cap (80% of cap radius for margin)
    const targetSize = capRadius * 2 * 0.7;
    const scale = targetSize / Math.max(svgWidth, svgHeight);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    // Create Three.js shapes from contours
    const shapes: THREE.Shape[] = [];

    for (const contour of allContours) {
      if (contour.length < 3) continue;

      const shape = new THREE.Shape();
      const firstPt = contour[0];
      const tx = (firstPt.x - centerX) * scale;
      const ty = -(firstPt.y - centerY) * scale; // flip Y

      shape.moveTo(tx, ty);
      for (let i = 1; i < contour.length; i++) {
        const pt = contour[i];
        shape.lineTo((pt.x - centerX) * scale, -(pt.y - centerY) * scale);
      }
      shape.closePath();

      // Only include shapes with meaningful area
      const area = Math.abs(THREE.ShapeUtils.area(shape.getPoints()));
      if (area > 0.01) {
        shapes.push(shape);
      }
    }

    if (shapes.length === 0) return null;

    // Extrude the design
    const zOffset = embossed ? 0 : -designDepth;
    const extrudeSettings = {
      depth: designDepth,
      bevelEnabled: false,
    };

    const geos: THREE.BufferGeometry[] = [];
    for (const shape of shapes) {
      try {
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        if (embossed) {
          // Place on top of cap
          geo.translate(0, 0, 0);
        } else {
          // Place as indentation (visual indicator)
          geo.translate(0, 0, -designDepth * 0.5);
        }
        geos.push(geo);
      } catch {
        // Skip invalid shapes
      }
    }

    if (geos.length === 0) return null;

    const merged = mergeGeometries(geos);
    const capThickness = CLICKER.CAP_THICKNESS;

    if (embossed) {
      merged.translate(0, 0, capThickness);
    } else {
      merged.translate(0, 0, capThickness - designDepth);
    }

    return merged;
  } catch {
    return null;
  }
}

/**
 * Merge multiple BufferGeometries into one
 */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const validGeos = geos.filter(g => g && g.attributes.position && g.attributes.position.count > 0);
  if (validGeos.length === 0) return new THREE.BufferGeometry();
  if (validGeos.length === 1) return validGeos[0];

  let totalVerts = 0;
  let totalIndices = 0;

  for (const geo of validGeos) {
    totalVerts += geo.attributes.position.count;
    if (geo.index) {
      totalIndices += geo.index.count;
    } else {
      totalIndices += geo.attributes.position.count;
    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  let vertOffset = 0;
  let indexOffset = 0;

  for (const geo of validGeos) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;

    for (let i = 0; i < pos.count * 3; i++) {
      positions[vertOffset * 3 + i] = pos.array[i];
    }
    if (norm) {
      for (let i = 0; i < norm.count * 3; i++) {
        normals[vertOffset * 3 + i] = norm.array[i];
      }
    }

    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) {
        indices[indexOffset + i] = geo.index.array[i] + vertOffset;
      }
      indexOffset += geo.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[indexOffset + i] = vertOffset + i;
      }
      indexOffset += pos.count;
    }

    vertOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeVertexNormals();
  return merged;
}

/**
 * Export geometry as binary STL
 */
export function geometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const posAttr = geometry.attributes.position;
  const index = geometry.index;

  let numTriangles: number;
  if (index) {
    numTriangles = index.count / 3;
  } else {
    numTriangles = posAttr.count / 3;
  }

  // STL binary format: 80 byte header + 4 byte tri count + 50 bytes per triangle
  const bufferLength = 80 + 4 + numTriangles * 50;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // Header (80 bytes)
  const header = "SVG-to-STL Fidget Clicker Generator";
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // Triangle count
  view.setUint32(80, numTriangles, true);

  let offset = 84;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();

  for (let i = 0; i < numTriangles; i++) {
    let i0: number, i1: number, i2: number;
    if (index) {
      i0 = index.getX(i * 3);
      i1 = index.getX(i * 3 + 1);
      i2 = index.getX(i * 3 + 2);
    } else {
      i0 = i * 3;
      i1 = i * 3 + 1;
      i2 = i * 3 + 2;
    }

    v0.fromBufferAttribute(posAttr, i0);
    v1.fromBufferAttribute(posAttr, i1);
    v2.fromBufferAttribute(posAttr, i2);

    // Calculate normal
    edge1.subVectors(v1, v0);
    edge2.subVectors(v2, v0);
    normal.crossVectors(edge1, edge2).normalize();

    // Normal
    view.setFloat32(offset, normal.x, true); offset += 4;
    view.setFloat32(offset, normal.y, true); offset += 4;
    view.setFloat32(offset, normal.z, true); offset += 4;

    // Vertex 1
    view.setFloat32(offset, v0.x, true); offset += 4;
    view.setFloat32(offset, v0.y, true); offset += 4;
    view.setFloat32(offset, v0.z, true); offset += 4;

    // Vertex 2
    view.setFloat32(offset, v1.x, true); offset += 4;
    view.setFloat32(offset, v1.y, true); offset += 4;
    view.setFloat32(offset, v1.z, true); offset += 4;

    // Vertex 3
    view.setFloat32(offset, v2.x, true); offset += 4;
    view.setFloat32(offset, v2.y, true); offset += 4;
    view.setFloat32(offset, v2.z, true); offset += 4;

    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}
