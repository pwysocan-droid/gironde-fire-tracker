import Dashboard from "@/components/Dashboard";

export default function Page() {
  return (
    <main className="frame">
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
