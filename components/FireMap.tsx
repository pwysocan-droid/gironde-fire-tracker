"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BBOX, FIRE_CENTROID } from "@/lib/constants";
import type { FireData } from "@/lib/types";

/**
 * Carto Positron raster tiles. Raster (not vector) keeps the dependency surface
 * to maplibre-gl alone, and the CSS grayscale filter on .maplibregl-canvas
 * pushes it to near-monochrome so the data layers carry all the colour.
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
      paint: { "raster-opacity": 0.82 },
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

export default function FireMap({ fire }: { fire: FireData | null }) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);

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

    m.on("load", () => {
      m.addSource("fire", { type: "geojson", data: EMPTY });

      // Soft heat wash under the dots so clusters read as one fire front
      // rather than as loose confetti.
      m.addLayer({
        id: "fire-heat",
        type: "circle",
        source: "fire",
        filter: ["<=", ["get", "bucket"], 1],
        paint: {
          "circle-color": ACCENT,
          "circle-blur": 1,
          "circle-opacity": ["case", ["==", ["get", "bucket"], 0], 0.2, 0.09],
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
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "bucket"], 0],
            ACCENT,
            "#0A0A08",
          ],
          "circle-opacity": [
            "case",
            ["==", ["get", "bucket"], 0],
            0.95,
            ["==", ["get", "bucket"], 1],
            0.6,
            0.3,
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            [
              "interpolate", ["linear"], ["get", "frp"],
              0, 1.6, 10, 2.6, 50, 4, 150, 5.6, 500, 7.5,
            ],
            12,
            [
              "interpolate", ["linear"], ["get", "frp"],
              0, 3, 10, 5, 50, 8, 150, 12, 500, 17,
            ],
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "bucket"], 0],
            0.75,
            0,
          ],
          "circle-stroke-color": "#F4F2EC",
        },
      });

      ready.current = true;
      const src = m.getSource("fire") as maplibregl.GeoJSONSource | undefined;
      src?.setData(fireGeoJson(fire));
    });

    map.current = m;

    return () => {
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // Deliberately mount-only; data arrives through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new detections into the existing source without touching the camera.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource("fire") as maplibregl.GeoJSONSource | undefined;
    src?.setData(fireGeoJson(fire));
  }, [fire]);

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
      </div>
    </>
  );
}
