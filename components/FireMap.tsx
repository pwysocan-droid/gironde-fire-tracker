"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BBOX, BOD, FIRE_CENTROID } from "@/lib/constants";
import { track, trackOnce } from "@/lib/track";
import type { FireData, TrafficData, WindData } from "@/lib/types";

/**
 * Carto Positron raster tiles. Raster (not vector) keeps the dependency surface
 * to maplibre-gl alone.
 *
 * Desaturation happens here in the style, via raster-saturation, and NOT as a
 * CSS filter on the canvas: MapLibre draws the basemap and every data layer
 * into one WebGL canvas, so a CSS grayscale filter greys out the fire dots and
 * aircraft along with the map. Doing it on the raster layer leaves the data
 * layers as the only source of colour on the page.
 */
const BASEMAP: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    positron: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#F4F2EC" } },
    {
      id: "positron",
      type: "raster",
      source: "positron",
      paint: {
        "raster-opacity": 0.72,
        "raster-saturation": -1,
        "raster-contrast": -0.12,
      },
    },
  ],
};

const ACCENT = "#E8280A";
const H6 = 6 * 3600 * 1000;
const H24 = 24 * 3600 * 1000;

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/**
 * Aircraft glyph as an ImageData triangle. Drawn on a canvas rather than loaded
 * as an SVG because MapLibre's addImage takes raw pixels reliably, and this
 * keeps the whole map dependency-free beyond maplibre-gl itself.
 *
 * Drawn pointing up (north); the symbol layer rotates it to true_track.
 */
function triangleImage(fill: string, ratio = 2): ImageData | null {
  const s = 18 * ratio;
  const cv = document.createElement("canvas");
  cv.width = s;
  cv.height = s;
  const g = cv.getContext("2d");
  if (!g) return null;

  g.clearRect(0, 0, s, s);
  g.beginPath();
  g.moveTo(s / 2, 2 * ratio);
  g.lineTo(s - 4 * ratio, s - 3 * ratio);
  g.lineTo(s / 2, s - 6.5 * ratio);
  g.lineTo(4 * ratio, s - 3 * ratio);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  // Hairline in ground colour so triangles stay countable when they overlap.
  g.strokeStyle = "#F4F2EC";
  g.lineWidth = 0.8 * ratio;
  g.stroke();

  return g.getImageData(0, 0, s, s);
}

function trafficGeoJson(traffic: TrafficData | null): GeoJSON.FeatureCollection {
  if (!traffic) return EMPTY;
  return {
    type: "FeatureCollection",
    features: traffic.aircraft
      .filter((a) => !a.onGround)
      .map((a) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [a.lon, a.lat] },
        properties: {
          callsign: a.callsign,
          track: a.track ?? 0,
          fire: a.firefighter ? 1 : 0,
        },
      })),
  };
}

function fireGeoJson(fire: FireData | null): GeoJSON.FeatureCollection {
  if (!fire) return EMPTY;
  const now = Date.now();
  return {
    type: "FeatureCollection",
    features: fire.detections.map((d) => {
      const a = now - Date.parse(d.acquiredAt);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [d.lon, d.lat] },
        properties: {
          frp: d.frp,
          // 0 = last 6 h, 1 = 6–24 h, 2 = older. Drives colour + opacity.
          bucket: a <= H6 ? 0 : a <= H24 ? 1 : 2,
          sensor: d.sensor,
        },
      };
    }),
  };
}

/* ---------- wind-driven spread projection ---------- */

const KM_PER_DEG_LAT = 111.32;

/** Andrew's monotone chain. Points as [lon, lat]; returns the hull CCW. */
function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 3) return pts;
  const cross = (
    o: [number, number],
    a: [number, number],
    b: [number, number],
  ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

type Projection = {
  fc: GeoJSON.FeatureCollection;
  labels: { lngLat: [number, number]; text: string }[];
};

/**
 * Greedy single-linkage clustering: points chained within `kmThresh` belong to
 * one fire. Needed because the July 24 flare-up produced a second ignition
 * ~20 km south of the main front — one convex hull over both spanned the
 * whole Arcachon basin, which as a "projection" was worse than nothing.
 */
function clusterPoints(
  pts: { lon: number; lat: number }[],
  kmThresh = 4,
): { lon: number; lat: number }[][] {
  const n = pts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  const midLat = pts.reduce((s, p) => s + p.lat, 0) / (n || 1);
  const kx = KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const t2 = kmThresh * kmThresh;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = (pts[i].lon - pts[j].lon) * kx;
      const dy = (pts[i].lat - pts[j].lat) * KM_PER_DEG_LAT;
      if (dx * dx + dy * dy <= t2) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }

  const groups = new Map<number, { lon: number; lat: number }[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(pts[i]);
    else groups.set(r, [pts[i]]);
  }
  return [...groups.values()];
}

/**
 * Indicative 6 h spread envelope: the convex hull of the active front,
 * advected hour by hour along the forecast wind and slightly inflated so the
 * flanks widen as the head advances. Drawn at +2/+4/+6 h.
 *
 * This is deliberately crude and labelled INDICATIVE on the page: head rate of
 * spread is taken as ~5 % of a gust-weighted wind speed (a common rule-of-
 * thumb magnitude for wind-driven forest fire), halved when humidity is above
 * 60 %. A real fire-behaviour model needs fuel moisture, fuel type and
 * terrain, none of which this page has — the envelope answers "which way and
 * roughly how far", never "exactly where".
 */
function windProjection(
  fire: FireData | null,
  wind: WindData | null,
): Projection | null {
  if (!fire || !wind || wind.hours.length === 0) return null;

  const now = Date.now();
  // Base the front on the freshest stratum available: the projection should
  // start from where the fire is, not where it was yesterday.
  let pts = fire.detections.filter(
    (d) => now - Date.parse(d.acquiredAt) <= H6,
  );
  if (pts.length < 3)
    pts = fire.detections.filter((d) => now - Date.parse(d.acquiredAt) <= H24);
  if (pts.length < 3) return null;

  // Each distinct fire gets its own hull and its own envelope; a single hull
  // over separate ignitions produces one giant fan over everything between.
  const clusters = clusterPoints(pts).filter((c) => c.length >= 5);
  if (clusters.length === 0) return null;
  clusters.sort((a, b) => b.length - a.length);

  // The hourly drift vector is shared: same wind field over the whole bbox.
  const drifts: { eastKm: number; northKm: number; hour: number }[] = [];
  let eastKm = 0;
  let northKm = 0;
  wind.hours.slice(0, 6).forEach((h, i) => {
    const damp = h.humidity >= 60 ? 0.5 : 1;
    const ros = Math.max(0.3, 0.05 * (0.7 * h.speed + 0.3 * h.gust)) * damp;
    const toward = ((h.direction + 180) * Math.PI) / 180;
    eastKm += Math.sin(toward) * ros;
    northKm += Math.cos(toward) * ros;
    const hour = i + 1;
    if (hour % 2 === 0) drifts.push({ eastKm, northKm, hour });
  });
  if (drifts.length === 0) return null;

  const features: GeoJSON.Feature[] = [];
  const labels: Projection["labels"] = [];

  clusters.forEach((cluster, ci) => {
    const hull = convexHull(cluster.map((d) => [d.lon, d.lat]));
    if (hull.length < 3) return;

    const cLat = hull.reduce((s, p) => s + p[1], 0) / hull.length;
    const cLon = hull.reduce((s, p) => s + p[0], 0) / hull.length;
    const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((cLat * Math.PI) / 180);

    for (const { eastKm, northKm, hour } of drifts) {
      const grow = 1 + 0.03 * hour;
      const ring: [number, number][] = hull.map(([lon, lat]) => [
        cLon + (lon - cLon) * grow + eastKm / kmPerDegLon,
        cLat + (lat - cLat) * grow + northKm / KM_PER_DEG_LAT,
      ]);
      ring.push(ring[0]);

      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: { h: hour },
      });

      // One label — the outermost front of the main fire. In light wind the
      // rings sit close together and per-ring labels just stack unreadably;
      // secondary ignitions keep their rings but stay untagged.
      if (ci !== 0 || hour !== drifts[drifts.length - 1].hour) continue;
      const driftLen = Math.hypot(eastKm, northKm) || 1;
      const ux = eastKm / driftLen;
      const uy = northKm / driftLen;
      let best = ring[0];
      let bestD = -Infinity;
      for (const [lon, lat] of ring) {
        const d =
          (lon - cLon) * kmPerDegLon * ux +
          (lat - cLat) * KM_PER_DEG_LAT * uy;
        if (d > bestD) {
          bestD = d;
          best = [lon, lat];
        }
      }
      labels.push({ lngLat: best, text: `+${hour} H` });
    }
  });

  if (features.length === 0) return null;
  return { fc: { type: "FeatureCollection", features }, labels };
}

/**
 * Wind barb pinned at the fire centroid, built as raw SVG markup so it can ride
 * inside a MapLibre DOM marker without a React root. Points the way the fire is
 * being driven (from + 180), with the speed in km/h set beside the shaft.
 */
function barbElement(from: number, speed: number, gust: number): HTMLElement {
  const heading = (from + 180) % 360;
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.innerHTML = `
<svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true">
  <circle cx="43" cy="43" r="27" fill="none" stroke="${ACCENT}"
          stroke-opacity="0.5" stroke-width="1" stroke-dasharray="2 3"/>
  <g transform="rotate(${heading} 43 43)">
    <line x1="43" y1="62" x2="43" y2="24" stroke="${ACCENT}" stroke-width="2.4"/>
    <polygon points="43,16 37,29 49,29" fill="${ACCENT}"/>
  </g>
  <circle cx="43" cy="43" r="2.4" fill="${ACCENT}"/>
</svg>
<div style="position:absolute;left:50%;top:100%;transform:translate(-50%,2px);
            background:${ACCENT};color:#F4F2EC;font-family:var(--mono);
            font-size:9px;font-weight:600;letter-spacing:0.06em;
            padding:1px 4px 2px;white-space:nowrap;">
  ${Math.round(speed)}/${Math.round(gust)} KM/H
</div>`;
  el.style.position = "relative";
  return el;
}

export default function FireMap({
  fire,
  wind,
  traffic,
}: {
  fire: FireData | null;
  wind: WindData | null;
  traffic: TrafficData | null;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const barb = useRef<maplibregl.Marker | null>(null);
  const labels = useRef<maplibregl.Marker[]>([]);
  const projLabels = useRef<maplibregl.Marker[]>([]);

  const [showProj, setShowProj] = useState(true);
  const showProjRef = useRef(showProj);
  showProjRef.current = showProj;

  // The mount effect's `load` handler would otherwise close over the props
  // from the first render — both null — while the data effects bail out
  // because `ready` is still false. Whichever order the race resolves in, the
  // layers end up empty. A ref that always holds the current payload lets the
  // load handler read live data instead of a stale closure.
  const latest = useRef<{
    fire: FireData | null;
    wind: WindData | null;
    traffic: TrafficData | null;
  }>({
    fire: null,
    wind: null,
    traffic: null,
  });
  latest.current = { fire, wind, traffic };

  const syncLayers = useCallback(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("fire") as maplibregl.GeoJSONSource | undefined)?.setData(
      fireGeoJson(latest.current.fire),
    );
    (m.getSource("traffic") as maplibregl.GeoJSONSource | undefined)?.setData(
      trafficGeoJson(latest.current.traffic),
    );

    // Projection: data when enabled, empty when toggled off. Hour labels are
    // DOM markers, managed alongside the layer data so they can never orphan.
    const proj = showProjRef.current
      ? windProjection(latest.current.fire, latest.current.wind)
      : null;
    (m.getSource("projection") as maplibregl.GeoJSONSource | undefined)?.setData(
      proj?.fc ?? EMPTY,
    );
    for (const l of projLabels.current) l.remove();
    projLabels.current = [];
    for (const { lngLat, text } of proj?.labels ?? []) {
      const el = document.createElement("div");
      el.className = "proj-label";
      el.textContent = text;
      projLabels.current.push(
        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(m),
      );
    }
  }, []);

  useEffect(() => {
    if (!holder.current || map.current) return;

    const m = new maplibregl.Map({
      container: holder.current,
      style: BASEMAP,
      bounds: [
        [BBOX.lonMin, BBOX.latMin],
        [BBOX.lonMax, BBOX.latMax],
      ],
      fitBoundsOptions: { padding: 24 },
      center: [FIRE_CENTROID.lon, FIRE_CENTROID.lat],
      attributionControl: false,
    });

    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    // One deduped event when a session actually engages with the map —
    // measures whether the map is interactive surface or backdrop.
    m.once("zoomstart", () => trackOnce("map_interact"));
    m.once("dragstart", () => trackOnce("map_interact"));

    // Scale matters on a fire map: it is how you read the width of the front.
    m.addControl(
      new maplibregl.ScaleControl({ maxWidth: 96, unit: "metric" }),
      "bottom-right",
    );

    m.on("load", () => {
      // Projection envelope goes in first so it renders beneath the
      // detections — a forecast must never visually outrank an observation.
      m.addSource("projection", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "proj-fill",
        type: "fill",
        source: "projection",
        paint: {
          "fill-color": ACCENT,
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["get", "h"],
            2, 0.05,
            6, 0.02,
          ],
        },
      });
      m.addLayer({
        id: "proj-line",
        type: "line",
        source: "projection",
        paint: {
          "line-color": ACCENT,
          "line-width": 1.2,
          "line-dasharray": [2, 2],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["get", "h"],
            2, 0.65,
            6, 0.28,
          ],
        },
      });

      m.addSource("fire", { type: "geojson", data: EMPTY });

      // Soft heat wash under the dots so clusters read as one fire front
      // rather than as loose confetti.
      m.addLayer({
        id: "fire-heat",
        type: "circle",
        source: "fire",
        // Only the live front gets a wash; washing 24 h of history as well
        // just produces one dark halo with no shape to it.
        filter: ["==", ["get", "bucket"], 0],
        paint: {
          "circle-color": ACCENT,
          "circle-blur": 1,
          "circle-opacity": 0.16,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, ["interpolate", ["linear"], ["get", "frp"], 0, 6, 200, 20],
            12, ["interpolate", ["linear"], ["get", "frp"], 0, 16, 200, 54],
          ],
        },
      });

      // The countable marks. Radius scales with FRP; sqrt-ish via interpolate
      // stops so a 500 MW return doesn't swamp the map.
      m.addLayer({
        id: "fire-dots",
        type: "circle",
        source: "fire",
        layout: {
          // Draw newest last so the live front sits on top of its own history
          // instead of being buried under two days of older returns.
          "circle-sort-key": ["-", 2, ["get", "bucket"]],
        },
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "bucket"], 0],
            ACCENT,
            "#0A0A08",
          ],
          // Older strata sit well back: at this fire's density a 0.6-opacity
          // 24 h layer merges into one solid mass with no countable marks.
          "circle-opacity": [
            "case",
            ["==", ["get", "bucket"], 0],
            0.92,
            ["==", ["get", "bucket"], 1],
            0.34,
            0.16,
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            [
              "interpolate", ["linear"], ["get", "frp"],
              0, 1.1, 10, 1.9, 50, 3, 150, 4.2, 500, 5.8,
            ],
            12,
            [
              "interpolate", ["linear"], ["get", "frp"],
              0, 2.4, 10, 4, 50, 6.5, 150, 9.5, 500, 14,
            ],
          ],
          // Ground-colour hairline keeps overlapping marks countable.
          "circle-stroke-width": [
            "case",
            ["==", ["get", "bucket"], 0],
            0.7,
            0.35,
          ],
          "circle-stroke-color": "#F4F2EC",
          "circle-stroke-opacity": [
            "case",
            ["==", ["get", "bucket"], 0],
            0.9,
            0.3,
          ],
        },
      });

      // Bordeaux-Mérignac: air-traffic anchor only. Its 21 July fire is
      // resolved and is deliberately not drawn as a fire feature.
      m.addSource("bod", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [BOD.lon, BOD.lat] },
              properties: {},
            },
          ],
        },
      });
      m.addLayer({
        id: "bod-ring",
        type: "circle",
        source: "bod",
        paint: {
          "circle-radius": 4,
          "circle-color": "transparent",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0A0A08",
          "circle-stroke-opacity": 0.55,
        },
      });

      const neutral = triangleImage("rgba(10,10,8,0.62)");
      const hot = triangleImage(ACCENT);
      if (neutral) m.addImage("ac-neutral", neutral, { pixelRatio: 2 });
      if (hot) m.addImage("ac-fire", hot, { pixelRatio: 2 });

      m.addSource("traffic", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "traffic-dots",
        type: "symbol",
        source: "traffic",
        layout: {
          "icon-image": [
            "case",
            ["==", ["get", "fire"], 1],
            "ac-fire",
            "ac-neutral",
          ],
          "icon-rotate": ["get", "track"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-size": [
            "case",
            ["==", ["get", "fire"], 1],
            1.05,
            0.72,
          ],
        },
      });

      ready.current = true;
      syncLayers();
    });

    map.current = m;

    // The map is constructed before CSS grid has resolved the column's height,
    // so MapLibre sizes its canvas to a near-zero box and the basemap renders
    // as a strip across the top. Observe the container and resize + refit once
    // real dimensions land, and on every later layout change.
    let fitted = false;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 2 || box.height < 2) return;
      m.resize();
      if (!fitted) {
        fitted = true;
        m.fitBounds(
          [
            [BBOX.lonMin, BBOX.latMin],
            [BBOX.lonMax, BBOX.latMax],
          ],
          { padding: 24, duration: 0 },
        );
      }
    });
    ro.observe(holder.current);

    return () => {
      ro.disconnect();
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // Deliberately mount-only; data arrives through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new data into the existing sources without touching the camera. The
  // projection consumes fire + wind + the toggle, so all three re-sync.
  useEffect(() => {
    syncLayers();
  }, [fire, wind, showProj, syncLayers]);

  // Aircraft positions, refreshed every poll. Firefighters additionally get a
  // DOM label so the callsign is readable in Plex Mono — a visible PELICAN
  // shuttling basin-to-fireline is the whole point of this layer.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;

    syncLayers();

    for (const l of labels.current) l.remove();
    labels.current = [];

    for (const a of traffic?.aircraft ?? []) {
      if (!a.firefighter || a.onGround) continue;
      const el = document.createElement("div");
      el.className = "ac-label";
      el.textContent = a.callsign;
      labels.current.push(
        new maplibregl.Marker({ element: el, anchor: "left" })
          .setLngLat([a.lon, a.lat])
          .addTo(m),
      );
    }
  }, [traffic, syncLayers]);

  useEffect(() => {
    return () => {
      for (const l of labels.current) l.remove();
      labels.current = [];
      for (const l of projLabels.current) l.remove();
      projLabels.current = [];
    };
  }, []);

  // Wind barb sits on the live FRP-weighted centroid when we have one, so it
  // tracks the fire as the front moves rather than sitting on a fixed pin.
  useEffect(() => {
    const m = map.current;
    if (!m || !wind) return;

    const at = fire?.centroid ?? FIRE_CENTROID;
    barb.current?.remove();
    barb.current = new maplibregl.Marker({
      element: barbElement(
        wind.current.direction,
        wind.current.speed,
        wind.current.gust,
      ),
    })
      .setLngLat([at.lon, at.lat])
      .addTo(m);

    return () => {
      barb.current?.remove();
      barb.current = null;
    };
  }, [wind, fire?.centroid]);

  return (
    <>
      <div className="map" ref={holder} />
      <div className="map-overlay map-legend">
        <div className="label dim" style={{ marginBottom: 2 }}>
          LÉGENDE · TAILLE = PUISSANCE
        </div>
        <div className="legend-row">
          <span className="legend-swatch" style={{ background: ACCENT }} />
          <span className="label">FEU &lt; 6 H</span>
        </div>
        <div className="legend-row">
          <span
            className="legend-swatch"
            style={{ background: "rgba(10,10,8,0.6)" }}
          />
          <span className="label">FEU 6–24 H</span>
        </div>
        <div className="legend-row">
          <span
            className="legend-swatch"
            style={{ background: "rgba(10,10,8,0.3)" }}
          />
          <span className="label">FEU &gt; 24 H</span>
        </div>
        <div
          className="legend-row"
          style={{ marginTop: 3, paddingTop: 5, borderTop: "1px solid rgba(10,10,8,0.12)" }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
            <polygon points="4.5,0 9,9 4.5,6.6 0,9" fill={ACCENT} />
          </svg>
          <span className="label">SÉCURITÉ CIVILE</span>
        </div>
        <div className="legend-row">
          <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
            <polygon points="4.5,0 9,9 4.5,6.6 0,9" fill="rgba(10,10,8,0.62)" />
          </svg>
          <span className="label">AUTRE TRAFIC</span>
        </div>
        <button
          type="button"
          className="proj-toggle"
          onClick={() =>
            setShowProj((v) => {
              track("projection_toggle", { state: v ? "off" : "on" });
              return !v;
            })
          }
          aria-pressed={showProj}
        >
          <svg width="14" height="9" viewBox="0 0 14 9" aria-hidden="true">
            <line
              x1="0"
              y1="4.5"
              x2="14"
              y2="4.5"
              stroke={ACCENT}
              strokeWidth="1.4"
              strokeDasharray="3 2"
              opacity={showProj ? 1 : 0.35}
            />
          </svg>
          PROJECTION VENT 6 H · {showProj ? "ON" : "OFF"}
        </button>
        {showProj ? (
          <div className="label dim" style={{ maxWidth: "22ch", lineHeight: 1.6 }}>
            ENVELOPPE INDICATIVE, HORS RELIEF ET COMBUSTIBLE
          </div>
        ) : null}
      </div>
    </>
  );
}
