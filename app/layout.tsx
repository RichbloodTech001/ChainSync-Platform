import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "ChainSync — Blockchain Monitoring", description: "Monitor public blockchain addresses and activity in one dashboard.", applicationName: "ChainSync", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
