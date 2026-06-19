import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SVG to Fidget Clicker — 3D Printable Generator",
  description: "Upload an SVG design and generate a 3D-printable fidget clicker with Cherry MX Blue switch housing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
