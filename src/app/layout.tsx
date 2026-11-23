import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppBar, AppBarFallback } from "@/components/app-bar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CS Command Center",
  description: "Customer 360 for CS teams: which accounts need you today, and why.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {/* The path is request-time data, so the bar that marks the current page streams in. */}
        <Suspense fallback={<AppBarFallback />}>
          <AppBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
