"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BBOX, FIRE_CENTROID } from "@/lib/constants";

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

export default function FireMap() {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

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

    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  return (
    <>
      <div className="map" ref={holder} />
      <div className="map-overlay map-legend">
        <div className="label dim" style={{ marginBottom: 2 }}>
          LÉGENDE
        </div>
        <div className="legend-row">
          <span
            className="legend-swatch"
            style={{ background: "#E8280A" }}
          />
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
