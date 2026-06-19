"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const Viewer3D = dynamic(() => import("@/components/Viewer3D"), { ssr: false });

export default function Home() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [svgFileName, setSvgFileName] = useState<string>("");
  const [embossed, setEmbossed] = useState(false);
  const [depth, setDepth] = useState(1.5);
  const [size, setSize] = useState(40);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSvgFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSvgContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">SVG to Fidget Clicker</h1>
        <p className="text-gray-400 mb-8">
          Upload an SVG design, preview it as a 3D-printable fidget clicker with Cherry MX Blue switch
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Panel */}
          <div className="space-y-6">
            {/* Upload */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="text-lg font-semibold mb-4">Upload SVG</h2>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <div className="text-center">
                  <svg className="mx-auto h-8 w-8 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-400">
                    {svgFileName || "Click to upload SVG"}
                  </p>
                </div>
                <input
                  type="file"
                  accept=".svg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Settings */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="text-lg font-semibold mb-4">Settings</h2>

              {/* Design Style */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Design Style</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEmbossed(false)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      !embossed
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    Sunken
                  </button>
                  <button
                    onClick={() => setEmbossed(true)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      embossed
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    Embossed
                  </button>
                </div>
              </div>

              {/* Design Depth */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  Design Depth: {depth}mm
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={depth}
                  onChange={(e) => setDepth(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Size */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  Diameter: {size}mm (max 50mm)
                </label>
                <input
                  type="range"
                  min="25"
                  max="50"
                  step="1"
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Cherry MX Info */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="text-lg font-semibold mb-2">Cherry MX Blue</h2>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Socket: 14mm × 14mm</li>
                <li>• Stem: cross-shaped (+)</li>
                <li>• Plate mount clips</li>
                <li>• Actuation: 50g / 2mm</li>
              </ul>
            </div>
          </div>

          {/* 3D Preview */}
          <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden" style={{ minHeight: "600px" }}>
            <Viewer3D
              svgContent={svgContent}
              embossed={embossed}
              depth={depth}
              size={size}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
