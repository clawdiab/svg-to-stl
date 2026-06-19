"""
svg-to-stl: Convert SVG files to 3D STL models by extruding paths.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from stl import mesh
import svgpathtools
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import triangle as tr


def svg_path_to_points(path, num_points=100):
    """Sample points along an SVG path to create a polygon."""
    points = []
    for t in np.linspace(0, 1, num_points):
        point = path.point(t)
        points.append((point.real, point.imag))
    return points


def paths_to_polygons(paths):
    """Convert SVG paths to Shapely polygons."""
    polygons = []
    for path in paths:
        if len(path) == 0:
            continue
        points = svg_path_to_points(path)
        if len(points) < 3:
            continue
        try:
            poly = Polygon(points)
            if poly.is_valid and poly.area > 0:
                polygons.append(poly)
            else:
                # Try to fix invalid polygon
                poly = poly.buffer(0)
                if poly.is_valid and poly.area > 0:
                    polygons.append(poly)
        except Exception:
            continue
    return polygons


def polygon_to_triangles(polygon):
    """Triangulate a polygon using constrained Delaunay triangulation."""
    if isinstance(polygon, MultiPolygon):
        all_vertices = []
        all_triangles = []
        for poly in polygon.geoms:
            verts, tris = polygon_to_triangles(poly)
            offset = len(all_vertices)
            all_vertices.extend(verts)
            all_triangles.extend([(t[0] + offset, t[1] + offset, t[2] + offset) for t in tris])
        return all_vertices, all_triangles

    exterior = list(polygon.exterior.coords[:-1])  # Remove closing point
    if len(exterior) < 3:
        return [], []

    vertices = list(exterior)
    segments = [(i, (i + 1) % len(exterior)) for i in range(len(exterior))]

    holes = []
    for interior in polygon.interiors:
        hole_coords = list(interior.coords[:-1])
        if len(hole_coords) < 3:
            continue
        offset = len(vertices)
        vertices.extend(hole_coords)
        hole_segments = [(offset + i, offset + (i + 1) % len(hole_coords)) for i in range(len(hole_coords))]
        segments.extend(hole_segments)
        # Representative point inside the hole
        hole_poly = Polygon(hole_coords)
        rep = hole_poly.representative_point()
        holes.append([rep.x, rep.y])

    data = {
        "vertices": np.array(vertices, dtype=np.float64),
        "segments": np.array(segments, dtype=np.int32),
    }
    if holes:
        data["holes"] = np.array(holes, dtype=np.float64)

    try:
        result = tr.triangulate(data, "p")
        triangles = result.get("triangles", [])
        verts_out = result.get("vertices", vertices)
        return verts_out.tolist(), triangles.tolist()
    except Exception:
        return [], []


def extrude_polygon(polygon, depth):
    """Extrude a 2D polygon into a 3D mesh."""
    vertices_2d, triangles = polygon_to_triangles(polygon)
    if not vertices_2d or not triangles:
        return None

    vertices_2d = np.array(vertices_2d)
    triangles = np.array(triangles)

    num_verts = len(vertices_2d)
    num_tris = len(triangles)

    # Top face vertices (z = depth)
    top_verts = np.column_stack([vertices_2d, np.full(num_verts, depth)])
    # Bottom face vertices (z = 0)
    bottom_verts = np.column_stack([vertices_2d, np.zeros(num_verts)])

    # All vertices: [top, bottom]
    all_vertices = np.vstack([top_verts, bottom_verts])

    # Top face triangles
    top_triangles = triangles.copy()
    # Bottom face triangles (reversed winding)
    bottom_triangles = triangles[:, ::-1] + num_verts

    # Side faces - get polygon boundary edges
    faces = []
    faces.extend(top_triangles.tolist())
    faces.extend(bottom_triangles.tolist())

    # Build side walls from exterior ring
    if isinstance(polygon, MultiPolygon):
        rings = []
        for poly in polygon.geoms:
            rings.append(list(poly.exterior.coords[:-1]))
    else:
        rings = [list(polygon.exterior.coords[:-1])]

    # Map 2D coordinates to vertex indices
    vert_map = {}
    for i, v in enumerate(vertices_2d):
        key = (round(v[0], 8), round(v[1], 8))
        if key not in vert_map:
            vert_map[key] = i

    for ring in rings:
        for i in range(len(ring)):
            j = (i + 1) % len(ring)
            key_i = (round(ring[i][0], 8), round(ring[i][1], 8))
            key_j = (round(ring[j][0], 8), round(ring[j][1], 8))
            if key_i not in vert_map or key_j not in vert_map:
                continue
            vi = vert_map[key_i]
            vj = vert_map[key_j]
            # Top indices: vi, vj
            # Bottom indices: vi + num_verts, vj + num_verts
            faces.append([vi, vj, vj + num_verts])
            faces.append([vi, vj + num_verts, vi + num_verts])

    faces = np.array(faces)
    stl_mesh = mesh.Mesh(np.zeros(len(faces), dtype=mesh.Mesh.dtype))
    for i, face in enumerate(faces):
        for j in range(3):
            stl_mesh.vectors[i][j] = all_vertices[face[j]]

    return stl_mesh


def svg_to_stl(svg_path, output_path, depth=5.0, scale=1.0):
    """Convert an SVG file to an STL file."""
    paths, attributes, svg_attributes = svgpathtools.svg2paths2(svg_path)

    if not paths:
        print(f"Error: No paths found in {svg_path}", file=sys.stderr)
        return False

    polygons = paths_to_polygons(paths)
    if not polygons:
        print(f"Error: Could not create valid polygons from SVG paths", file=sys.stderr)
        return False

    # Merge overlapping polygons
    merged = unary_union(polygons)

    meshes = []
    if isinstance(merged, MultiPolygon):
        for poly in merged.geoms:
            m = extrude_polygon(poly, depth)
            if m is not None:
                meshes.append(m)
    else:
        m = extrude_polygon(merged, depth)
        if m is not None:
            meshes.append(m)

    if not meshes:
        print("Error: Could not generate any 3D geometry", file=sys.stderr)
        return False

    # Combine all meshes
    combined = mesh.Mesh(np.concatenate([m.data for m in meshes]))

    # Apply scale
    if scale != 1.0:
        combined.vectors *= scale

    # Center the model
    min_coords = combined.vectors.reshape(-1, 3).min(axis=0)
    max_coords = combined.vectors.reshape(-1, 3).max(axis=0)
    center = (min_coords + max_coords) / 2
    combined.vectors -= center
    combined.vectors[:, :, 2] += depth / 2  # Move up so bottom is at z=0

    combined.save(str(output_path))
    print(f"Saved STL to {output_path}")
    print(f"  Polygons: {len(polygons)}")
    print(f"  Triangles: {len(combined.data)}")
    print(f"  Depth: {depth}mm")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Convert SVG files to 3D STL models"
    )
    parser.add_argument("input", help="Input SVG file path")
    parser.add_argument("-o", "--output", help="Output STL file path (default: input with .stl extension)")
    parser.add_argument("-d", "--depth", type=float, default=5.0, help="Extrusion depth in mm (default: 5.0)")
    parser.add_argument("-s", "--scale", type=float, default=1.0, help="Scale factor (default: 1.0)")

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix(".stl")

    success = svg_to_stl(str(input_path), output_path, depth=args.depth, scale=args.scale)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
