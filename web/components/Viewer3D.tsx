"use client";

import { useState, useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { createBaseGeometry, createTopCapGeometry, geometryToSTL } from "@/lib/geometry";
import { CLICKER } from "@/lib/dimensions";

interface Props {
  svgContent: string | null;
  embossed: boolean;
  depth: number;
  size: number;
}

const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;

function BaseMesh({ diameter }: { diameter: number }) {
  const geo = useMemo(() => createBaseGeometry(diameter), [diameter]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#64748b" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

function CapMesh({
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
  const geo = useMemo(
    () => createTopCapGeometry(svgContent ?? EMPTY_SVG, diameter, depth, embossed),
    [svgContent, diameter, depth, embossed]
  );
  return (
    <mesh geometry={geo} position={[0, yOffset, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={svgContent ? "#3b82f6" : "#475569"} roughness={0.3} metalness={0.15} />
    </mesh>
  );
}

function Scene({
  svgContent,
  embossed,
  depth,
  size: diameter,
  exploded,
  activeTab,
}: Props & { exploded: boolean; activeTab: "both" | "base" | "cap" }) {
  const H = CLICKER.BASE_HEIGHT;
  const capH = CLICKER.CAP_THICKNESS;
  // When assembled: cap sits on top of base
  // When exploded: gap of 10mm between them
  const capY = exploded
    ? H / 2 + capH / 2 + 10
    : H / 2 + capH / 2;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[40, 80, 40]} intensity={1.5} castShadow />
      <directionalLight position={[-30, 20, -30]} intensity={0.4} color="#93c5fd" />

      {(activeTab === "both" || activeTab === "base") && (
        <BaseMesh diameter={diameter} />
      )}
      {(activeTab === "both" || activeTab === "cap") && (
        <CapMesh
          svgContent={svgContent}
          diameter={diameter}
          depth={depth}
          embossed={embossed}
          yOffset={activeTab === "cap" ? 0 : capY}
        />
      )}

      <Grid
        args={[300, 300]}
        position={[0, -H / 2 - 0.5, 0]}
        cellColor="#1e293b"
        sectionColor="#334155"
        fadeDistance={200}
        infiniteGrid
      />
    </>
  );
}

function downloadSTL(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Viewer3D({ svgContent, embossed, depth, size }: Props) {
  const [exploded, setExploded] = useState(false);
  const [activeTab, setActiveTab] = useState<"both" | "base" | "cap">("both");

  const handleDownloadBase = () => {
    const geo = createBaseGeometry(size);
    downloadSTL(geometryToSTL(geo), "fidget-clicker-base.stl");
  };

  const handleDownloadCap = () => {
    const geo = createTopCapGeometry(svgContent ?? EMPTY_SVG, size, depth, embossed);
    downloadSTL(geometryToSTL(geo), "fidget-clicker-cap.stl");
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 600 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-wrap gap-2">
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

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setExploded((v) => !v)}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-700"
          >
            {exploded ? "Assemble" : "Explode"}
          </button>
          <button
            onClick={handleDownloadBase}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            ↓ Base STL
          </button>
          <button
            onClick={handleDownloadCap}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-blue-700 hover:bg-blue-600 transition-colors"
          >
            ↓ Cap STL
          </button>
        </div>
      </div>

      {/* Part labels */}
      <div className="flex gap-4 px-4 py-2 text-xs text-gray-500 border-b border-gray-800">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-slate-500" />
          Base (Cherry MX socket)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
          Top Cap {svgContent ? "(with your design)" : "(no design yet)"}
        </span>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1" style={{ minHeight: 480 }}>
        <Canvas
          shadows
          camera={{ position: [0, 25, 55], fov: 50 }}
          gl={{ antialias: true }}
          style={{ background: "#0f172a" }}
        >
          <Suspense fallback={null}>
            <Scene
              svgContent={svgContent}
              embossed={embossed}
              depth={depth}
              size={size}
              exploded={exploded}
              activeTab={activeTab}
            />
          </Suspense>
          <OrbitControls enablePan enableZoom enableRotate minDistance={10} maxDistance={300} />
        </Canvas>
      </div>

      {/* Info bar */}
      <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>Diameter: {size}mm</span>
        <span>Design depth: {depth}mm</span>
        <span>Style: {embossed ? "Embossed" : "Sunken"}</span>
        <span>Switch: Cherry MX Blue (plate mount)</span>
      </div>
    </div>
  );
}
