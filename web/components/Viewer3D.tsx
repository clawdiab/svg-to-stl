"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import * as THREE from "three";
import { createBaseGeometry, createTopCapGeometry, geometryToSTL } from "@/lib/geometry";
import { CLICKER } from "@/lib/dimensions";

interface Props {
  svgContent: string | null;
  embossed: boolean;
  depth: number;
  size: number;
}

// ── individual part meshes ──────────────────────────────────────────────────

function BasePart({ diameter }: { diameter: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useRef<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    geo.current = createBaseGeometry(diameter);
    if (meshRef.current) {
      meshRef.current.geometry.dispose();
      meshRef.current.geometry = geo.current;
    }
  }, [diameter]);

  const baseGeo = createBaseGeometry(diameter);

  return (
    <mesh ref={meshRef} geometry={baseGeo} castShadow receiveShadow>
      <meshStandardMaterial
        color="#64748b"
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
}

function TopCapPart({
  svgContent,
  diameter,
  depth,
  embossed,
  yOffset,
}: {
  svgContent: string | null;
  diameter: number;
  depth: number;
  embossed: boolean;
  yOffset: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geo = svgContent
    ? createTopCapGeometry(svgContent, diameter, depth, embossed)
    : createTopCapGeometry(
        // Default cap with no design
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`,
        diameter,
        depth,
        embossed
      );

  return (
    <mesh
      ref={meshRef}
      geometry={geo}
      position={[0, yOffset, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={svgContent ? "#3b82f6" : "#475569"}
        roughness={0.3}
        metalness={0.15}
      />
    </mesh>
  );
}

// ── exploded / assembled toggle ────────────────────────────────────────────

function ClickerAssembly({
  svgContent,
  embossed,
  depth,
  size: diameter,
  exploded,
}: Props & { exploded: boolean }) {
  const baseHeight = CLICKER.BASE_HEIGHT;
  const capOffset = exploded ? baseHeight / 2 + CLICKER.CAP_THICKNESS + 8 : baseHeight / 2 + CLICKER.CAP_THICKNESS * 0.5;

  return (
    <group>
      {/* Base — centred at origin */}
      <BasePart diameter={diameter} />

      {/* Top cap — sits on top of base */}
      <TopCapPart
        svgContent={svgContent}
        diameter={diameter}
        depth={depth}
        embossed={embossed}
        yOffset={capOffset}
      />
    </group>
  );
}

// ── download helper ────────────────────────────────────────────────────────

function downloadSTL(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── main viewer component ──────────────────────────────────────────────────

export default function Viewer3D({ svgContent, embossed, depth, size }: Props) {
  const [exploded, setExploded] = useState(false);
  const [activeTab, setActiveTab] = useState<"both" | "base" | "cap">("both");

  const handleDownloadBase = () => {
    const geo = createBaseGeometry(size);
    geo.computeVertexNormals();
    const stl = geometryToSTL(geo);
    downloadSTL(stl, "fidget-clicker-base.stl");
  };

  const handleDownloadCap = () => {
    const svg = svgContent || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;
    const geo = createTopCapGeometry(svg, size, depth, embossed);
    geo.computeVertexNormals();
    const stl = geometryToSTL(geo);
    downloadSTL(stl, "fidget-clicker-cap.stl");
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 600 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex gap-1">
          {(["both", "base", "cap"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {tab === "both" ? "Both Parts" : tab === "base" ? "Base" : "Top Cap"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setExploded((v) => !v)}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            {exploded ? "Assemble" : "Explode"}
          </button>

          <button
            onClick={handleDownloadBase}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Base STL
          </button>

          <button
            onClick={handleDownloadCap}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-blue-700 hover:bg-blue-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Cap STL
          </button>
        </div>
      </div>

      {/* Labels */}
      <div className="flex gap-4 px-4 py-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-slate-500" /> Base (Cherry MX socket)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> Top Cap (your design)
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1" style={{ minHeight: 500 }}>
        <Canvas
          shadows
          camera={{ position: [0, 60, 80], fov: 40 }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#0f172a"]} />
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[50, 100, 50]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <pointLight position={[-30, 40, -30]} intensity={0.4} color="#60a5fa" />

          <Suspense fallback={null}>
            {activeTab === "both" && (
              <ClickerAssembly
                svgContent={svgContent}
                embossed={embossed}
                depth={depth}
                size={size}
                exploded={exploded}
              />
            )}
            {activeTab === "base" && <BasePart diameter={size} />}
            {activeTab === "cap" && (
              <TopCapPart
                svgContent={svgContent}
                diameter={size}
                depth={depth}
                embossed={embossed}
                yOffset={0}
              />
            )}
          </Suspense>

          <Grid
            args={[200, 200]}
            position={[0, -CLICKER.BASE_HEIGHT / 2 - 1, 0]}
            cellColor="#1e293b"
            sectionColor="#334155"
            fadeDistance={150}
            infiniteGrid
          />

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={20}
            maxDistance={200}
          />
        </Canvas>
      </div>

      {/* Info bar */}
      <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500 flex gap-4">
        <span>Diameter: {size}mm</span>
        <span>Design depth: {depth}mm</span>
        <span>Style: {embossed ? "Embossed" : "Sunken"}</span>
        <span>Switch: Cherry MX Blue (plate mount)</span>
      </div>
    </div>
  );
}
