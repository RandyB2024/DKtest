# Destination Known Office — Supabase fase 1

Office gebruikt standaard Supabase Auth, verplichte TOTP-MFA (AAL2) en gedeelde klantrelaties/ondernemingen. Alleen actieve Office-medewerkers krijgen toegang. De bestaande vormgeving en navigatie blijven behouden; nog niet gemigreerde modules zijn expliciet uitgeschakeld.

Zie [SUPABASE_INTEGRATION.md](SUPABASE_INTEGRATION.md) voor configuratie, migratie, handmatige acceptatie en hostingadvies. Zie [PWA_SECURITY.md](PWA_SECURITY.md) voor de beveiligingsgrenzen.

## Lokaal starten

Node.js >=22.13.0 is vereist. Voer uit vanuit apps/office:

```powershell
npm ci
Copy-Item .env.example .env.local
# Vul de twee Supabase-waarden lokaal in voor het bestaande testproject.
npm start
```

Open http://127.0.0.1:4173. Gebruik dezelfde origin als OFFICE_ORIGIN. Start zonder Supabase-configuratie veilig met een configuratiefout bij aanmelden; er is geen automatische demo-fallback.

## Tests

```powershell
npm test
```

De tests gebruiken fictieve accounts, de echte Supabase-client met een gesimuleerde transportlaag en PostgreSQL/RLS-tests via PGlite. Er zijn geen echte sleutels nodig.

## Historische lokale demo

De oorspronkelijke modules blijven geïsoleerd in src/development-server.mjs voor lokale ontwikkeling en regressietests. Alleen expliciet ALLOW_DEVELOPMENT_AUTH=true, NODE_ENV=development of test, zonder Supabase-configuratie en via een loopbackverbinding maakt deze modus toegankelijk. Deze gegevens zijn tijdelijk en niet autoritatief. De geïntegreerde /mijn-demo is in Supabase-modus uitgeschakeld; het echte klantportaal staat in apps/portal.
