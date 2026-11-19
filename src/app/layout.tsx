import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aliança Barber Club",
  description: "Seu clube de agendamento e gestão premium",

  manifest: "/manifest-v2.json",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aliança Barber",
  },

  icons: {
    icon: [
      { url: "/icons/android-chrome-192x192-v2.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/android-chrome-512x512-v2.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon-v2.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
