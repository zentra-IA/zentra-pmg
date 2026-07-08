import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zentra Sales AI | PMG Atacadista",
  description:
    "Plataforma de inteligência comercial para representantes, distribuidores e equipes comerciais da PMG Atacadista.",
  applicationName: "Zentra Sales AI",
  authors: [{ name: "PMG Atacadista" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-[var(--pmg-bg)] text-[var(--pmg-text)]">
        {children}
      </body>
    </html>
  );
}
