import { PAUSED_SINCE } from "@/lib/constants";

/**
 * Shown at the top of the page in paused mode. Three jobs, in order of
 * importance to someone arriving from a months-old Facebook link:
 * say plainly that this is no longer live, say where to get real
 * information instead, and only then explain what the archive below is.
 */
export default function PausedNotice() {
  const since = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(`${PAUSED_SINCE}T12:00:00Z`));

  return (
    <section className="paused" aria-labelledby="paused-title">
      <div className="paused-head">
        <span className="paused-dot" aria-hidden="true" />
        <span className="label" id="paused-title">
          SUIVI EN PAUSE — PLUS DE SURVEILLANCE ACTIVE
        </span>
      </div>

      <div className="paused-body">
        <p>
          L&apos;incendie de Lège-Cap-Ferret est éteint : les satellites ne
          détectent plus de foyer actif dans le secteur. Ce suivi a été mis en
          pause le {since}.
        </p>

        <p>
          Les mesures ci-dessous sont toujours chargées depuis les sources
          publiques à l&apos;ouverture de la page — elles restent donc à jour au
          moment où vous les lisez. En revanche la page n&apos;est plus
          surveillée : le bulletin de situation n&apos;est plus rédigé, aucune
          alerte n&apos;est assurée, et personne ne vérifie ces chiffres.
        </p>

        <p className="paused-official">
          <strong>Pour toute information officielle ou en cas d&apos;urgence :</strong>{" "}
          Préfecture de la Gironde (
          <a
            href="https://www.gironde.gouv.fr/"
            target="_blank"
            rel="noreferrer"
          >
            gironde.gouv.fr
          </a>
          ) · Météo-France (
          <a href="https://vigilance.meteofrance.fr/" target="_blank" rel="noreferrer">
            vigilance.meteofrance.fr
          </a>
          ) · Secours : <strong>18</strong> ou <strong>112</strong>.
        </p>

        <p className="dim">
          Ce suivi était un outil indépendant, non officiel, construit à partir
          de données publiques (NASA FIRMS, Open-Meteo, adsb.lol) pendant
          l&apos;incendie de juillet 2026. Il pourra être réactivé si un nouvel
          incendie touche le secteur. Le code est ouvert :{" "}
          <a
            href="https://github.com/pwysocan-droid/gironde-fire-tracker"
            target="_blank"
            rel="noreferrer"
          >
            github.com/pwysocan-droid/gironde-fire-tracker
          </a>
          .
        </p>
      </div>
    </section>
  );
}
