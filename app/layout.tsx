import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const DESCRIPTION =
  "Suivi en direct de l'incendie de Lège-Cap-Ferret (Gironde) : détections " +
  "satellite NASA FIRMS, vent et prévisions, bombardiers d'eau en vol, " +
  "bulletin de situation actualisé. Données publiques, non officielles.";

export const metadata: Metadata = {
  metadataBase: new URL("https://gironde-fire-tracker.vercel.app"),
  title: "SUIVI FEU — GIRONDE",
  description: DESCRIPTION,
  openGraph: {
    title: "SUIVI FEU / GIRONDE — incendie de Lège-Cap-Ferret en direct",
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
    title: "SUIVI FEU / GIRONDE — incendie de Lège-Cap-Ferret en direct",
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
