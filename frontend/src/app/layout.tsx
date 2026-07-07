import type { Metadata, Viewport } from "next";
import { Baskervville, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { MockWalletProvider } from "@/shared/lib/mock-wallet";
import { ToastProvider } from "@/shared/ui";
import { ThemePreviewSwitcher } from "@/shared/ui/theme-preview-switcher";
import { SiteHeader, SiteFooter, TestnetBanner } from "@/widgets";
import "@/globals.css";

// Serif — wordmark and editorial headlines (h1/h2 via globals.css).
const baskervville = Baskervville({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-baskervville",
});

// UI / body — a humanist grotesque with character (not Inter/Plex/system).
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
});

// Trust cue: every address, hash and amount renders in mono.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Arkenia — onchain fundraising",
    template: "%s · Arkenia",
  },
  description:
    "Back angel campaigns with a fully refundable pool. Deployed capital becomes cohort shares — claim returns or trade them on the premarket.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

// Applies the stored (or system) theme before first paint to avoid a flash.
const themeInitScript = `(function(){try{var p=localStorage.getItem("arkenia:palette")||"ivory";document.documentElement.setAttribute("data-theme",p);var t=localStorage.getItem("arkenia:theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${baskervville.variable} ${hanken.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <MockWalletProvider>
            <ToastProvider>
              <div className="flex min-h-screen flex-col">
                <TestnetBanner />
                <SiteHeader />
                <main className="flex-1">{children}</main>
                <SiteFooter />
              </div>
            </ToastProvider>
          </MockWalletProvider>
        </Providers>
        <ThemePreviewSwitcher />
      </body>
    </html>
  );
}
