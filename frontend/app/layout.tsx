import type { Metadata } from "next";
import {
  Inter,
  Noto_Sans_Bengali,
} from "next/font/google";

import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  variable: "--font-bangla",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000",
  ),

  title: {
    default: "BanglaGuard",
    template: "%s | BanglaGuard",
  },

  description:
    "An explainable Bangla NLP research platform for hate-speech detection, sentiment analysis, model comparison, analytics, and human feedback.",

  keywords: [
    "Bangla NLP",
    "Bangla hate speech detection",
    "Bangla sentiment analysis",
    "explainable AI",
    "natural language processing",
    "BanglaBERT",
  ],

  openGraph: {
    title: "BanglaGuard",
    description:
      "Explainable Bangla NLP for research, analysis, and safer digital communication.",
    type: "website",
    locale: "en_US",
  },
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
     data-scroll-behavior="smooth">
      <body
        className={`
          ${inter.variable}
          ${notoSansBengali.variable}
          min-h-screen bg-background text-foreground
          antialiased
        `}
      >
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
