# Destination Known Office — Supabase fase 2A

Office gebruikt Supabase Auth met verplichte TOTP-MFA (AAL2). Actieve Office-medewerkers lezen gedeelde klantrelaties en ondernemingen. Alleen owner en admin mogen deze aanmaken, bewerken en soft archiveren. Accountant, handler en viewer houden alleen leesrechten.

Elke wijziging loopt via een transactionele PostgreSQL RPC met autorisatie, validatie en audit. Directe tabelwrites blijven door bestaande RLS geblokkeerd. Een nieuwe klant met eerste onderneming wordt atomair opgeslagen. Klantarchivering archiveert ook de onderliggende ondernemingen, zonder fysieke verwijdering.

Accountuitnodigingen en Auth-gebruikersbeheer zijn uitgeschakeld. Ook boekhouding, documenten, uploads, PDF's, aangiften, communicatie en overige bedrijfsmodules blijven niet-gemigreerd.

Zie SUPABASE_INTEGRATION.md voor configuratie, API/RPC-contracten, migratiecontrole, acceptatie en beperkingen. PWA_SECURITY.md beschrijft de beveiligingsgrenzen.

## Lokaal starten

Node.js >=22.13.0, vanuit apps/office:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Vul uitsluitend lokaal de bestaande Supabase-testprojectwaarden in.
npm.cmd start
```

Open http://127.0.0.1:4173 met dezelfde origin als OFFICE_ORIGIN. Zonder configuratie is er geen demo-fallback. De nieuwe migratie moet apart worden gecontroleerd en toegepast voordat schrijven werkt. Er is niets online toegepast.

## Tests

```powershell
npm.cmd test
```

Tests gebruiken synthetische accounts, de echte Supabase SDK met testtransport en PostgreSQL/RLS via PGlite. Geen echte credentials nodig.

De historische demo in src/development-server.mjs blijft uitsluitend expliciet lokaal beschikbaar voor regressietests. Deze is geen bron voor de Supabase-interface. Development-auth mag niet met Supabase-configuratie worden gemengd en is in productie verboden. Het echte klantportaal staat in apps/portal.
