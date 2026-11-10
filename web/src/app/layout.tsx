import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EchoFocus — Focus on the Voice That Matters",
  description:
    "Isolate any voice from messy, multi-speaker recordings with target speaker extraction, Whisper ASR, and genuine confidence scoring. Built on the VANTA extraction foundation.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="page-bg min-h-full">{children}</body>
    </html>
  );
}
