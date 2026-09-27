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
