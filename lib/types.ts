/** Shared shapes between route handlers and client modules. */

export type SourceStatus = "ok" | "down";

/** Every route handler returns this envelope so modules can fail independently. */
export type Envelope<T> = {
  status: SourceStatus;
  /** ISO UTC of when the server fetched this. */
  fetchedAt: string;
  error?: string;
  data: T | null;
};

/* ---------- 01 FEU ---------- */

export type Detection = {
  lat: number;
  lon: number;
  /** Kelvin. VIIRS reports bright_ti4, MODIS reports brightness. */
  brightness: number;
  /** Fire radiative power, MW. */
  frp: number;
  /** ISO UTC, composed from acq_date + acq_time. */
  acquiredAt: string;
  /** Normalised 0–100. VIIRS l/n/h is mapped to 20/60/90. */
  confidence: number;
  sensor: "VIIRS_NOAA20" | "VIIRS_NOAA21" | "MODIS";
  satellite: string;
  daynight: "D" | "N";
};

export type FireData = {
  detections: Detection[];
  /** Counts by recency bucket, for module 01 and the legend. */
  last6h: number;
  last24h: number;
  totalFrp: number;
  /** ISO UTC of the most recent detection, or null. */
  newestAt: string | null;
  /** Sensors that returned data vs. those that failed. */
  sensorsOk: string[];
  sensorsFailed: string[];
  /** Weighted centroid of the last-24h detections — where the fire actually is. */
  centroid: { lat: number; lon: number } | null;
};

/* ---------- 02 VENT ---------- */

export type WindHour = {
  /** ISO local (Europe/Paris) as returned by Open-Meteo. */
  time: string;
  speed: number;
  gust: number;
  direction: number;
  humidity: number;
  temp: number;
};

export type WindData = {
  current: {
    speed: number;
    gust: number;
    direction: number;
    humidity: number | null;
    temp: number | null;
  };
  hours: WindHour[];
  /** Plain-language reading of what the wind direction means for the fire. */
  reading: string;
  /** Air quality at Bordeaux city — smoke plume proxy. Null if unavailable. */
  air: { pm25: number | null; pm10: number | null } | null;
};

/* ---------- 03 TRAFIC AÉRIEN ---------- */

export type Aircraft = {
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  /** Barometric altitude, m. */
  altitude: number | null;
  /** m/s. */
  velocity: number | null;
  /** Degrees true. */
  track: number | null;
  verticalRate: number | null;
  onGround: boolean;
  /**
   * Whatever the provider can tell us about the airframe: an ICAO type code
   * from adsb.lol ("DH8D"), or the origin country from OpenSky. Providers
   * expose different things, so this is deliberately loose.
   */
  descriptor: string;
  /** Set when the callsign matches a Sécurité Civile prefix. */
  firefighter: { type: string; role: string } | null;
};

export type TrafficData = {
  aircraft: Aircraft[];
  /** Which upstream actually answered — surfaced in the module header. */
  provider: string;
  firefighterCount: number;
  /** Aircraft within BOD_RADIUS_KM of BOD and below BOD_CEILING_M. */
  bodTraffic: number;
  total: number;
};
