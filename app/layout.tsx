import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PAUSED } from "@/lib/constants";
import "./globals.css";

// Shared links must not advertise live monitoring once it has stopped.
const DESCRIPTION = PAUSED
  ? "Suivi en pause : l'incendie de Lège-Cap-Ferret est éteint et cette page " +
    "n'est plus surveillée. Informations officielles : préfecture de la " +
    "Gironde. Urgences : 18 ou 112."
  : "Suivi en direct de l'incendie de Lège-Cap-Ferret (Gironde) : détections " +
    "satellite NASA FIRMS, vent et prévisions, bombardiers d'eau en vol, " +
    "bulletin de situation actualisé. Données publiques, non officielles.";

const OG_TITLE = PAUSED
  ? "SUIVI FEU / GIRONDE — suivi en pause, incendie éteint"
  : "SUIVI FEU / GIRONDE — incendie de Lège-Cap-Ferret en direct";

export const metadata: Metadata = {
  metadataBase: new URL("https://gironde-fire-tracker.vercel.app"),
  title: PAUSED ? "SUIVI FEU — GIRONDE (EN PAUSE)" : "SUIVI FEU — GIRONDE",
  description: DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Suivi Feu Gironde",
    locale: "fr_FR",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Suivi Feu Gironde — suivi en direct de l'incendie de Lège-Cap-Ferret",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4F2EC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
