import type { Metadata } from "next";
import { Baskervville, Noto_Sans_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import "@/globals.css";

const baskervville = Baskervville({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-baskervville",
});

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-noto-sans-mono",
});

export const metadata: Metadata = {
  title: "Arkenia",
  description: "Reputation-gated onchain fundraising platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${baskervville.variable} ${notoSansMono.variable}`}>
      <body>
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
