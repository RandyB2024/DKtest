# Destination Known Office — PWA-basis

Lokale MVP voor de PWA-, sessie-, passkey- en vergrendelarchitectuur van Destination Known Office, uitgebreid met klantenbeheer en een boekhoudkundig correcte kern. Er zijn geen echte Microsoft-, WebAuthn-, bank- of andere externe koppelingen actief.

## Beschikbare routes

- `/dashboard`
- `/work-queue`
- `/clients` en `/clients/:clientId`
- `/administration`
- `/documents`
- `/tax-returns`
- `/communication`
- `/audit`
- `/settings`

Klantdossiers bevatten financiële kerncijfers, aandachtspunten, activiteit en negen tabs. De Boekhouding-tab bevat bank, inkoop, verkoop, grootboek, debiteuren, crediteuren, BTW, memoriaal en periodecontrole. Journaalposten worden server-side gecontroleerd op `debet = credit`.

## Lokaal starten

Node.js 20 of nieuwer is vereist.

```powershell
$env:ALLOW_DEVELOPMENT_AUTH='true'
npm start
```

Open daarna `http://127.0.0.1:4173`.

## Testen

```powershell
npm test
```

De database-uitbreiding staat in `database/migrations/0033_accounting_core.sql` en is voorbereid op SQLite lokaal en een latere PostgreSQL/Supabase-migratie.

## PWA installeren

Gebruik in Chrome of Edge de installatieknop in de adresbalk of de knop **Installeer app** in Office. Op iPhone/iPad kiest u in Safari **Zet op beginscherm**. Een service worker vereist `localhost`, `127.0.0.1` of HTTPS.

## Productie

Zie `PWA_SECURITY.md`. Start productie nooit met development-auth:

```powershell
$env:NODE_ENV='production'
$env:ALLOW_DEVELOPMENT_AUTH='false'
$env:SESSION_SECRET='<sterk geheim uit de hostingomgeving>'
npm start
```

Zonder geïmplementeerde productieprovider levert de server bewust geen lokale loginroute op. Activeer hosting pas nadat Microsoft/OIDC en WebAuthn server-side zijn aangesloten.
# Mijn Destination Known - lokale testklant

Open `http://127.0.0.1:PORT/mijn` voor het klantportaal van **De Boer Advies**. De lokale ontwikkelmodus meldt Jan de Boer automatisch aan. In productie wordt deze bypass door de bestaande configuratiecontrole geweigerd; de beoogde login is een passkey of een wachtwoord met verplichte authenticator-2FA.

Office en Mijn Destination Known gebruiken in deze MVP dezelfde Node-processcope en dezelfde domeinverzamelingen. Daardoor verschijnen een klantupload, klantvraag en concept-verkoopfactuur direct in de Office-services zolang dezelfde lokale server draait. Dit is dus een echte gedeelde lokale bron, maar nog geen duurzame database: wijzigingen verdwijnen bij een serverherstart.

Voor deployment worden de bestaande `clientId`/`organizationId`-contracten gemigreerd naar één PostgreSQL/Supabase-database. Office krijgt interne boekhoudrechten; klantaccounts krijgen uitsluitend organisatiegebonden rapportage-, document-, factuur- en communicatierechten via applicatie-autorisatie en Row Level Security. Bestanden en rapporten komen in private objectopslag met kortlevende, geautoriseerde downloads.
