import type { Metadata, Viewport } from "next";
import { archivo, inter, notoSansSinhala } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Samantha's Bakery",
  description: "Café & bakery operations — a BizCore demo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Noto Sans Sinhala is loaded (variable available) but not applied yet —
  // it switches on later when lang="si". Body uses Inter (var --font-inter).
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${notoSansSinhala.variable}`}>
      <body className="bg-bg text-ink min-h-dvh antialiased">{children}</body>
    </html>
  );
}
