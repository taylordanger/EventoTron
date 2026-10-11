import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./calendar-display.css";
import "./reports.css";
import "./support.css";
import "./suite-appearance.css";
import "./personal.css";
import "./responsive.css";
import { BetaSupport } from "./BetaSupport";
import { SuiteAppearance } from "./SuiteAppearance";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EventoTron — Operations Suite",
  description: "Plan events, meals, room layouts, and schedules in one suite.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SuiteAppearance>
          {children}
          <BetaSupport />
        </SuiteAppearance>
      </body>
    </html>
  );
}
