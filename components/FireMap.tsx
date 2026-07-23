"use client";

import { useCallback, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BBOX, BOD, FIRE_CENTROID } from "@/lib/constants";
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

  // The mount effect's `load` handler would otherwise close over the props
  // from the first render — both null — while the data effects bail out
  // because `ready` is still false. Whichever order the race resolves in, the
  // layers end up empty. A ref that always holds the current payload lets the
  // load handler read live data instead of a stale closure.
  const latest = useRef<{ fire: FireData | null; traffic: TrafficData | null }>({
    fire: null,
    traffic: null,
  });
  latest.current = { fire, traffic };

  const syncLayers = useCallback(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("fire") as maplibregl.GeoJSONSource | undefined)?.setData(
      fireGeoJson(latest.current.fire),
    );
    (m.getSource("traffic") as maplibregl.GeoJSONSource | undefined)?.setData(
      trafficGeoJson(latest.current.traffic),
    );
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

    // Scale matters on a fire map: it is how you read the width of the front.
    m.addControl(
      new maplibregl.ScaleControl({ maxWidth: 96, unit: "metric" }),
      "bottom-right",
    );

    m.on("load", () => {
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

  // Push new detections into the existing source without touching the camera.
  useEffect(() => {
    syncLayers();
  }, [fire, syncLayers]);

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
      </div>
    </>
  );
}
