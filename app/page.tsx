import Clock from "@/components/Clock";
import Dashboard from "@/components/Dashboard";

export default function Page() {
  return (
    <main className="frame">
      <header className="masthead">
        <div className="masthead-title">
          <h1>
            Suivi Feu <span className="accent">/</span> Gironde
          </h1>
          <div className="masthead-sub">
            <div className="label">INCENDIE ACTIF — LÈGE-CAP-FERRET</div>
            <div className="label dim" style={{ marginTop: 4 }}>
              44.75°N 1.20°O · BASSIN D&apos;ARCACHON · NOUVELLE-AQUITAINE
            </div>
          </div>
        </div>
        <div className="masthead-clock">
          <Clock />
        </div>
      </header>

      <Dashboard />

      <footer className="footer">
        <span className="label dim">SOURCES</span>
        <span className="label">
          <a
            href="https://firms.modaps.eosdis.nasa.gov/"
            target="_blank"
            rel="noreferrer"
          >
            NASA FIRMS
          </a>
        </span>
        <span className="label">
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            OPEN-METEO
          </a>
        </span>
        <span className="label">
          <a
            href="https://opensky-network.org/"
            target="_blank"
            rel="noreferrer"
          >
            OPENSKY NETWORK
          </a>
        </span>
        <span className="label dim" style={{ marginLeft: "auto" }}>
          FOND DE CARTE © OPENSTREETMAP © CARTO
        </span>
      </footer>
    </main>
  );
}
