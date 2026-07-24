import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GET as fireGET } from "@/app/api/fire/route";
import { GET as windGET } from "@/app/api/wind/route";
import { GET as trafficGET } from "@/app/api/traffic/route";
import { GET as historyGET } from "@/app/api/history/route";
import { compass } from "@/lib/format";
import type {
  Envelope,
  FireData,
  HistoryData,
  SitrepData,
  TrafficData,
  WindData,
} from "@/lib/types";

/**
 * 04 SITUATION — a French situation bulletin synthesized by Claude from all
 * live sources at once. This is the one place an LLM genuinely earns its keep
 * on this page: connecting fire trend + wind shift + aerial response into a
 * reading no single-variable template can produce. It narrates observations;
 * it never predicts spread — the projection layer owns "where", and even that
 * is labelled indicative.
 *
 * Regenerated at most every 15 min (route-level ISR), same cadence as the
 * upstream caches, so cost stays at ~100 calls/day.
 */

// NOT route-level ISR: Next clamps a route's revalidate to the shortest inner
// fetch revalidate, and the traffic handler called below fetches at 60 s —
// which would regenerate this route (and call Claude) every minute under
// steady traffic. Instead the route is dynamic, cached at the CDN via
// s-maxage=900, with an in-process throttle as a second line of defence.
export const dynamic = "force-dynamic";

const MODEL = process.env.SITREP_MODEL || "claude-opus-4-8";

/** Warm-lambda memo: never call Claude more than ~4×/hour per instance. */
let memo: { body: Envelope<SitrepData>; at: number } | null = null;
const MEMO_MS = 13 * 60 * 1000;

const SYSTEM = `Tu rédiges le bulletin de situation d'un tracker public
d'incendie pour le feu de Lège-Cap-Ferret (Gironde). Ton lecteur est un
habitant ou un journaliste, pas un pompier.

Règles strictes :
- 3 à 5 phrases, français sobre et factuel, ton préfecture. Pas de markdown,
  pas de liste, pas d'emphase, pas d'exclamation.
- Appuie chaque affirmation sur les données fournies ; cite les chiffres
  importants (détections, MW, km/h, effectifs aériens). Heures en heure de
  Paris.
- Les détections satellite arrivent par passages (~4/jour) : une baisse du
  compteur entre deux passages n'est PAS un recul du feu — ne l'interprète
  jamais ainsi.
- Décris la tendance si l'historique le permet (progression mesurée, activité
  aérienne, bascule de vent à venir dans les 6 h).
- Aucune prédiction de propagation, aucune consigne d'évacuation, aucun
  conseil de sécurité : uniquement la situation observée.
- Si une source est indisponible, dis-le en une demi-phrase et continue avec
  le reste.`;

function summarize(
  fire: Envelope<FireData>,
  wind: Envelope<WindData>,
  traffic: Envelope<TrafficData>,
  history: Envelope<HistoryData>,
): string {
  const parts: string[] = [`Instant: ${new Date().toISOString()}`];

  if (fire.data) {
    const f = fire.data;
    parts.push(
      `FEU (NASA FIRMS): ${f.last6h} détections <6h, ${f.last24h} <24h, ` +
        `puissance totale ${Math.round(f.totalFrp)} MW, dernière détection ${f.newestAt ?? "?"}, ` +
        `foyer principal ${f.centroid ? `${f.centroid.lat.toFixed(3)}N ${f.centroid.lon.toFixed(3)}E` : "?"}`,
    );
  } else parts.push(`FEU: source indisponible (${fire.error})`);

  if (wind.data) {
    const w = wind.data.current;
    const next6 = wind.data.hours.slice(0, 6).map((h) => ({
      t: h.time.slice(11, 16),
      de: compass(h.direction),
      kmh: Math.round(h.speed),
      rafales: Math.round(h.gust),
    }));
    parts.push(
      `VENT (fire centroid): actuel de ${compass(w.direction)} ${Math.round(w.speed)} km/h ` +
        `rafales ${Math.round(w.gust)}, humidité ${w.humidity ?? "?"}%. ` +
        `Prochaines 6h: ${JSON.stringify(next6)}. ` +
        `PM2.5 Bordeaux: ${wind.data.air?.pm25 ?? "?"} µg/m³`,
    );
  } else parts.push(`VENT: source indisponible (${wind.error})`);

  if (traffic.data) {
    const ff = traffic.data.aircraft
      .filter((a) => a.firefighter)
      .map((a) => `${a.callsign} (${a.firefighter!.type}, ${a.altitude ? Math.round(a.altitude) + " m" : "alt ?"})`);
    parts.push(
      `AÉRIEN: ${traffic.data.firefighterCount} appareil(s) de lutte en vol` +
        (ff.length ? ` — ${ff.join(", ")}` : "") +
        `; ${traffic.data.total} appareils au total dans la zone.`,
    );
  } else parts.push(`AÉRIEN: source indisponible (${traffic.error})`);

  if (history.data) {
    const h = history.data;
    if (h.spreadKmh !== null && h.spreadHeading !== null) {
      parts.push(
        `TENDANCE (mesurée sur ~6h de positions satellite): foyer principal en dérive ` +
          `${h.spreadKmh} km/h vers ${compass(h.spreadHeading)} (${Math.round(h.spreadHeading)}°).`,
      );
    }
    const day = h.snapshots.filter(
      (s) => Date.parse(s.taken_at) > Date.now() - 24 * 3600 * 1000,
    );
    if (day.length >= 2) {
      const frp = day.map((s) => Math.round(s.total_frp));
      parts.push(
        `HISTORIQUE 24h (puissance MW, pas 15 min, du plus ancien au plus récent): ` +
          `min ${Math.min(...frp)}, max ${Math.max(...frp)}, actuel ${frp[frp.length - 1]}.`,
      );
    }
  } else parts.push(`TENDANCE: historique indisponible.`);

  return parts.join("\n");
}

export async function GET() {
  const fetchedAt = new Date().toISOString();

  if (!process.env.ANTHROPIC_API_KEY) {
    const body: Envelope<SitrepData> = {
      status: "down",
      fetchedAt,
      error: "ANTHROPIC_API_KEY absente",
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  if (memo && Date.now() - memo.at < MEMO_MS) {
    return NextResponse.json(memo.body, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  }

  try {
    // Sibling handlers, called directly — their own caches absorb the load.
    const [fire, wind, traffic, history] = await Promise.all([
      fireGET().then((r) => r.json() as Promise<Envelope<FireData>>),
      windGET().then((r) => r.json() as Promise<Envelope<WindData>>),
      trafficGET().then((r) => r.json() as Promise<Envelope<TrafficData>>),
      historyGET().then((r) => r.json() as Promise<Envelope<HistoryData>>),
    ]);

    if (!fire.data && !wind.data && !traffic.data) {
      throw new Error("aucune source disponible — rien à synthétiser");
    }

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Données de situation :\n\n${summarize(fire, wind, traffic, history)}\n\n` +
            `Rédige le bulletin.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("génération refusée par le modèle");
    }

    const bulletin = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    if (!bulletin) throw new Error("réponse vide");

    const body: Envelope<SitrepData> = {
      status: "ok",
      fetchedAt,
      data: { bulletin, model: response.model, generatedAt: fetchedAt },
    };
    memo = { body, at: Date.now() };
    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (e) {
    const body: Envelope<SitrepData> = {
      status: "down",
      fetchedAt,
      error: (e as Error).message || "génération indisponible",
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }
}
