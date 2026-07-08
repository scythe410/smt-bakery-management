import type { Metadata, Viewport } from "next";
import { archivo, inter, notoSansSinhala } from "@/lib/fonts";
import { I18nProvider } from "@/i18n/client";
import { getCurrentLanguage } from "@/lib/auth";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Language is resolved server-side (signed-in user's preference, else 'en') so
  // <html lang>, the Sinhala font, and the client i18n instance all agree with
  // no hydration flash. Noto Sans Sinhala applies only when lang="si".
  const language = await getCurrentLanguage();

  return (
    <html
      lang={language}
      className={`${archivo.variable} ${inter.variable} ${notoSansSinhala.variable}`}
    >
      <body
        className={`bg-bg text-ink min-h-dvh antialiased ${language === "si" ? "font-sinhala" : ""}`}
      >
        <I18nProvider language={language}>{children}</I18nProvider>
      </body>
    </html>
  );
}
