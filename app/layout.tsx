import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Pipetrades Study Helper",
  description: "SAIT Winter 2026 Pre-Employment Study Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-full bg-gray-950 text-gray-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
