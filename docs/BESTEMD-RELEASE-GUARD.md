# BESTEMD Release Guard 1.0 — veilige invoering

Status: **inventarisatie en anti-rollback controles, GEEN nieuwe productie-deployments**.

## Doel

BESTEMD Office (`bestemd-office`) en Mijn Bestemming (`bestemd-portal`) blijven afzonderlijke Workers, maar gebruiken één afgeschermde GitHub-publicatieprocedure. Geen oudere release zonder expliciete aparte hersteltoestemming.

## Vastgestelde code (19 november 2026)

- GitHub: `RandyB2024/DKtest`; standaardbranch `main`.
- Gecontroleerde `main` bij start van deze opdracht: `14e6860166b20c85cb6876e1d49e570b8a0bf8c6`.
- Digitale Declaraties: lopende **draft PR #49**, blijft onaangetast.
- Cloudflare live Worker-versies: **nog niet via geautoriseerde Cloudflare-API gelezen**. Daarom zijn de baselines `null` en is de releasecontrole geblokkeerd.

## Implementatie

- `scripts/release-guard/guard.mjs`: weigert onbekende versie, meerdere actieve versies, afwijkende Cloudflare deployment-ID, onbekende baseline, geen ancestry met live commit, niet-actuele GitHub-main, ongeldige Worker en ontbrekende toestemming.
- `guard.test.mjs`: veiligheidstests inclusief aantoonbare weigering van oudere code.
- `inventory.mjs`: **alleen lezen**; vraagt via Cloudflare API de actuele deployment-ID en 100%-versie-ID van beide Workers op.
- `check.mjs`: uitsluitend preflight; controleert live versie, beschermde baseline, actuele main-commit en expliciete toestemming, maar roept geen deploy aan.
- `.github/workflows/bestemd-release-guard.yml`: handmatige inventarisatie en preflight; **geen upload, rollback, deploy of Cloudflare-mutatie**.
- `.bestemd/release-baselines.json`: standaard leeg zodat de releasecontrole weigert bij ontbrekende live-versies.

## Gecontroleerd activeren (beheerder)

1. Maak in Cloudflare een API-token met uitsluitend **Workers Scripts Read** voor de bedoelde account. Voeg in de GitHub-repository via Settings → Secrets and variables → Actions toe: `CLOUDFLARE_RELEASE_GUARD_READ_TOKEN` en `CLOUDFLARE_ACCOUNT_ID`. Plaats nooit tokens in code of chat.
2. Merge **alleen deze Release Guard PR** na geslaagde anti-rollback tests.
3. Ga naar Actions → **BESTEMD Release Guard 1.0 (read-only)** → Run workflow → main → mode **inventory**. De uitvoer toont voor elke Worker de echte Cloudflare deployment- en version-ID.
4. Koppel elke versie-ID aan de **werkelijk gebruikte GitHub-commit**, op basis van eerdere deploylogs en Cloudflare metadata. **Niet** automatisch aannemen dat de huidige GitHub-main al live staat. Als de herkomst onbekend is: niet activeren, eerst broncode/live-artifacts vergelijken en veilige back-up.
5. Laat de beheerder daarna uitsluitend via een nieuwe, beschermde PR de gecontroleerde `gitSha`, `versionId`, `deploymentId` in `.bestemd/release-baselines.json` vastleggen, apart per Worker.
6. Maak een GitHub environment `bestemd-production` met vereiste reviewers, beperkte branches (`main`) en deploymentbescherming. Controleer welke regels het huidige GitHub-plan daadwerkelijk ondersteunt.
7. Zet eventuele ongecontroleerde Cloudflare Workers Builds auto-deploy uit of zet de deploy command op **versions upload** zonder productiepromotie; beperk ook bestaande lokale Wrangler-tokens/credentials. Anders kan iemand buiten de guard om publiceren.
8. Pas na een geslaagde eindcontrole een **aparte**, expliciet goedgekeurde productie-workflow aan die eerst de live-versie opnieuw vergelijkt en daarna uitsluitend de gekozen Worker vanuit `main` publiceert. Bewaar na publicatie het nieuwe Cloudflare versie- en deployment-ID met Git SHA; opnieuw goedkeuren bij een volgende release.
9. Herstel/rollback is een **apart noodproces** met eigen toestemming, logging en controle. Nooit automatisch terugzetten.

## Beperkingen

Deze eerste fase verhindert geen directe handmatige `wrangler deploy` met al bestaande Cloudflare-adminrechten. De blokkade wordt technisch afdwingbaar als **uitsluitend de centrale pipeline** publicatierechten heeft, branch/environment bescherming is ingesteld, en oude tokens zijn ingetrokken. Zonder die stappen niet beweren dat terugvallen onmogelijk is.

De releasegeschiedenis moet niet op tijdstempels alleen vertrouwen: een nieuwere Worker-versie kan nog steeds gebouwd zijn uit **oudere code**. De Git-ancestrycontrole gebruikt daarom een via logs bewezen commit-versie-koppeling.

## Gecontroleerde Cloudflare inventarisatie — 19 november 2026

De gebruiker heeft de uitvoer van `wrangler deployments list --json` voor beide Workers geleverd. Deze CLI-resultaten staan **oudste eerst**. Daarom selecteert Release Guard de hoogste `created_on` in plaats van het eerste array-element. De Cloudflare REST API documenteert zijn resultaten anders; de selectie is met tests voor beide volgordes afgedekt.

| Worker | Deployment-ID | Worker version-ID | UTC |
| --- | --- | --- | --- |
| `bestemd-portal` | `e922919a-cd05-4a6f-812a-945aa395c89a` | `381ebf18-c853-480a-931a-27c4a3698d2b` | `2026-11-18T21:46:27.088083Z` |
| `bestemd-office` | `7791c950-3a28-4c3f-8753-87d427915316` | `3d728689-6a3b-4ec6-bc5f-0811e72c1c90` | `2026-11-17T20:59:07.700122Z` |

Deze IDs staan alleen in `.bestemd/observed-live-workers-20261119.json`. Het geverifieerde Git-SHA van de twee live Workers blijft **onbekend**. `.bestemd/release-baselines.json` blijft daarom onveranderd en de beschermde releaseprocedure blijft gesloten. De Office Worker mag niet vanaf de huidige GitHub-main worden overschreven zolang codeherkomst niet is vergeleken. 

## Fase 2 — gecontroleerde broncodeherkomst en rechten (19 november 2026)

- Lees uitsluitend de live versie-metadata via `scripts/release-guard/inventory-provenance.ps1`. De scriptcontrole vergelijkt **beide** Cloudflare deployment-ID's en versie-ID's met de inventaris van 19 november. Bij een afwijking stopt het script. Een eventueel aangetroffen Git-SHA is slechts een kandidaat, géén bewijs van werkelijke bronidentiteit.
- Cloudflare Worker script-content kan met de officiële Workers Scripts Read API opgevraagd worden voor inhoudelijke vergelijking; voor een reproduceerbare bron-identificatie moeten ook statische assets, bundelproces, configuratie, bindings en build-logs worden gecontroleerd. Bewaar eventuele inhoud lokaal en deel geen geheimen.
- Stel pas een beschermde `bestemd-production` GitHub environment in als de GitHub-planrechten daadwerkelijk vereiste reviewers en branchregels ondersteunen. Een vrij tekstveld `IK KEUR PRODUCTIE GOED` is **geen voldoende technische autorisatie** en mag niet als vervanging voor reviewers gelden.
- In GitHub zijn secret `CLOUDFLARE_RELEASE_GUARD_READ_TOKEN` en productie-deploy-token **verschillend**. Een READ-token kan niet publiceren; deploy-token uitsluitend beschikbaar voor een later afgeschermde workflow.
- In Cloudflare: inventariseer bestaande API-tokens, Cloudflare Workers Builds, dashboard-/accountlidmaatschappen en lokale Wrangler-aanmeldingen. Haal rechten pas weg nadat de huidige live Worker-versies en beschikbare veilige herstelopties zijn vastgelegd. Anders is beheer mogelijk onbedoeld onmogelijk.
- **NOODSTOP:** de huidige productie-baselines blijven `null` totdat Git-bronherkomst echt bewezen is. PR #49 blijft ongemoeid. Geen code publicatie, geen rollback en geen automatische migratie.
