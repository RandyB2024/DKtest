# Office op Cloudflare Workers

De Worker verzorgt Office op `office.testadmin.nl` zonder lokale Node-server of laptop. Het klantportaal op `mijn.testadmin.nl` blijft afzonderlijk. De bestaande Supabase-projectgegevens en de 24-uurs TOTP-grens blijven gelden. Passkey-login staat niet meer op het Office-inlogscherm; passkeybeheer in Instellingen blijft optioneel en staat standaard uit.

## Voorbereiding op de Windows-repository

Werk op de branch met de huidige passkey-wijzigingen. Controleer eerst `git status --short` en pas het wijzigingspakket toe volgens de bijgeleverde instructie. Daarna:

```powershell
cd apps\office
npm ci
npm run build:worker
npm test
npx wrangler deploy --dry-run
```

De Worker-build publiceert alleen de bestanden in `worker-public/`: een schone Supabase HTML-shell, beperkte CSS/JS, iconen, manifest, offlinepagina en service worker. `worker-public/` is gegenereerd en genegeerd door Git. Demo-HTML, demo-scripts, klantportalcode, lokale opslag en `.env.local` komen niet in de statische upload. Bij gewijzigde frontendbestanden altijd opnieuw `npm run build:worker` uitvoeren; `npm run deploy:worker` doet dit automatisch.

## Cloudflare-configuratie

Controleer de Worker-naam in `wrangler.jsonc` en dat hij niet een andere Worker vervangt. `workers_dev` is uit. `office.testadmin.nl` is als Custom Domain vastgelegd in `wrangler.jsonc`. Maak in `apps/office` een **niet gecommit** bestand `.env.worker-secrets` met uitsluitend:

```dotenv
SUPABASE_URL="https://JOUW_PROJECT.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_JOUW_SLEUTEL"
```

Gebruik de bestaande URL en publiceerbare sleutel uit `apps/office/.env.local`. Plaats hierin geen service-role/secret key, accountwachtwoord of TOTP-code. Het bestand is door `.gitignore` uitgesloten. Wrangler kan beide waarden tegelijk als Worker-secrets uploaden:

```powershell
npm run build:worker
npx wrangler deploy --secrets-file .env.worker-secrets
```

De Worker weigert andere origins en onveilige of onvolledige configuratie. De productie-origin staat op `https://office.testadmin.nl`, TOTP blijft exact 86400 seconden, en passkeys blijven uit. Zet `PASSKEYS_ENABLED` alleen volgens de aparte passkey-acceptatieprocedure aan.

## Productieconfiguratie

Office draait op Cloudflare Workers via het Custom Domain `office.testadmin.nl`. Deze koppeling is vastgelegd in `wrangler.jsonc`.

De eerdere Worker Route `office.testadmin.nl/*` en het DNS-record naar de lokale Cloudflare Tunnel zijn verwijderd. Het klantportaal `mijn.testadmin.nl` blijft afzonderlijk gekoppeld aan Worker `dktest`.

Deploy vanuit `apps/office` met:

```powershell
npm run build:worker
npx wrangler deploy --secrets-file .env.worker-secrets

## Uitgevoerde productiecontrole

De Worker-broncode gebruikt de bestaande Office API met een Fetch-adapter. De sessie- en herkomstcontroles zijn geautomatiseerd getest.

De productie-acceptatie is uitgevoerd op `https://office.testadmin.nl`. Login, TOTP, klantgegevens en de Custom Domain-koppeling werken. Office blijft bereikbaar wanneer de laptop, lokale Node-server en Cloudflare Tunnel uitstaan.

De Office-demo blijft uitsluitend voor lokale ontwikkeling beschikbaar via `npm start`.


## KvK-gestuurde klantintake (27 september 2026)

Nieuwe klant gebruikt een vierstapswizard met officiële KvK-zoekresultaten, Basisprofielcontrole, handmatige klantgegevens en bevestiging. De server haalt het profiel vóór opslaan opnieuw op. Alleen owner/admin met bestaande verse TOTP mogen aanmaken; andere actieve Office-rollen mogen zoeken/controleren. Klantaccounts hebben geen toegang. Uitgeschreven/onbekende status en dubbele actieve KvK-nummers worden geblokkeerd.

De nieuwe additieve migratie `202609270001_kvk_customer_onboarding.sql` maakt een beperkte intake-RPC, een afgeschermde server-capability en een Office-only intake-momentopname mogelijk. Klant, onderneming en audit ontstaan in één transactie. Bestaande RPC-contracten blijven beschikbaar; dubbele KvK-nummers worden nu ook daar geweigerd. Er is geen boekhouding of uitnodigingsfunctie toegevoegd.

Configureer later `KVK_API_MODE=test`, `KVK_API_BASE_URL=https://api.kvk.nl/test/api` en uitsluitend Worker-secrets voor `KVK_API_KEY` en `KVK_INTAKE_RPC_KEY`. Die tweede capability voorkomt dat directe RPC-aanroepen een server-side KvK-controle kunnen veinzen; de database bewaart alleen de SHA-256 ervan. Zonder configuratie geen KvK-intake. De migratie moet vóór eventuele ingebruikname apart worden gecontroleerd en toegepast.

Zie [KvK-beveiligingsbeoordeling en configuratieprocedure](KVK_ONBOARDING.md) voor het volledige API-/databasecontract, secret-provisioning, duplicaatcontrole, tests en beperkingen. De KvK-wijziging is uitsluitend lokaal; niets online toegepast, gecommit, gepusht of gedeployed.

## Volledig klantprofiel (lokale featurebranch)

Zie [CUSTOMER_PROFILE.md](CUSTOMER_PROFILE.md) voor datamodel, rollenmatrix, interne velden, API, migratieprocedure, tests en terugkeerplan. De acht dossieronderdelen gebruiken de bestaande Office-sessie en 24-uurs-TOTP; alleen owner/admin schrijven. Accountant leest fiscale instellingen, handler/viewer alleen algemene gegevens. RSIN, interne contactopmerkingen, prijsafspraken, notities, audit en bankgegevens worden rolgericht afgeschermd, ook bij directe databaseaanroepen.

De nieuwe additieve migratie `202609280001_complete_customer_profile.sql` moet later apart worden gecontroleerd en toegepast vóór een eventuele Worker-uitrol. Bestaande migraties blijven ongewijzigd. KvK-nummers zijn na aanmaak alleen-lezen. De Worker bouwt ook `customer-profile.js` en `profile-fields.js`; dossierdata blijven network-only. Geen nieuwe secrets, passkeys, accountuitnodigingen of boekhoudautomatisering. Niets online toegepast, gecommit of gepusht.
