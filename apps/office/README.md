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

Vertrouwde MFA-sessies zijn maximaal 24 uur geldig vanaf de laatste gevalideerde TOTP-verificatie. Refresh verlengt dit niet. MFA_TRUST_MAX_AGE_SECONDS=86400 is de enige toegestane ingestelde waarde. Zie PWA_SECURITY.md; nieuwe migratie 202609250001 is alleen lokaal voorbereid.


## Optionele passkey-login (25 september 2026)

Office en klantportaal ondersteunen nu passkeys als optionele eerste factor. Na een nieuwe passkey-login blijft TOTP nodig; dit is geen volledige Face ID-MFA. De harde 24-uursgrens en bestaande RLS/migraties zijn ongewijzigd. In Instellingen kunnen gebruikers eigen passkeys registreren, tonen en intrekken na TOTP jonger dan vijf minuten. Intrekken vereist ook een recent bewezen wachtwoordlogin en een nog geverifieerde TOTP-factor. Randy en Ed behouden afzonderlijke persoonlijke accounts.

`GET/POST /api/auth/passkeys` gebruikt Supabase Auth via de gewone server-side SDK. `PASSKEYS_ENABLED=false` is de veilige standaard. Voor latere ingebruikname zijn RP ID `testadmin.nl` en exacte HTTPS-origins vereist; registratie op een ander officieel domein moet mogelijk opnieuw. Er is geen nieuwe migratie en er is niets online ingesteld of toegepast.

Zie [de beveiligingsbeoordeling, het API-contract en de exacte configuratie-/acceptatiestappen](../shared/PASSKEY_SECURITY.md). Daar staan ook de beperkingen van de experimentele Supabase-API, directe Auth-aanroepen, herstel bij verlies en intrekking van reeds bestaande sessies. Uitnodigingen en Auth-gebruikersbeheer blijven uitgeschakeld. De monorepo-deployment moet `apps/shared/passkeys.mjs` meenemen; Office heeft geen bundelstap die dit bestand kopieert.
# Cloudflare Worker

Voor de laptoponafhankelijke Office-hosting op `office.testadmin.nl`: zie [WORKER_DEPLOYMENT.md](WORKER_DEPLOYMENT.md). De bestaande Node-server blijft beschikbaar voor lokale ontwikkeling.


## KvK-gestuurde klantintake (27 september 2026)

Nieuwe klant gebruikt een vierstapswizard met officiële KvK-zoekresultaten, Basisprofielcontrole, handmatige klantgegevens en bevestiging. De server haalt het profiel vóór opslaan opnieuw op. Alleen owner/admin met bestaande verse TOTP mogen aanmaken; andere actieve Office-rollen mogen zoeken/controleren. Klantaccounts hebben geen toegang. Uitgeschreven/onbekende status en dubbele actieve KvK-nummers worden geblokkeerd.

De nieuwe additieve migratie `202609270001_kvk_customer_onboarding.sql` maakt een beperkte intake-RPC, een afgeschermde server-capability en een Office-only intake-momentopname mogelijk. Klant, onderneming en audit ontstaan in één transactie. Bestaande RPC-contracten blijven beschikbaar; dubbele KvK-nummers worden nu ook daar geweigerd. Er is geen boekhouding of uitnodigingsfunctie toegevoegd.

Configureer later `KVK_API_MODE=test`, `KVK_API_BASE_URL=https://api.kvk.nl/test/api` en uitsluitend Worker-secrets voor `KVK_API_KEY` en `KVK_INTAKE_RPC_KEY`. Die tweede capability voorkomt dat directe RPC-aanroepen een server-side KvK-controle kunnen veinzen; de database bewaart alleen de SHA-256 ervan. Zonder configuratie geen KvK-intake. De migratie moet vóór eventuele ingebruikname apart worden gecontroleerd en toegepast.

Zie [KvK-beveiligingsbeoordeling en configuratieprocedure](KVK_ONBOARDING.md) voor het volledige API-/databasecontract, secret-provisioning, duplicaatcontrole, tests en beperkingen. De KvK-wijziging is uitsluitend lokaal; niets online toegepast, gecommit, gepusht of gedeployed.

## Volledig klantprofiel (lokale featurebranch)

Zie [CUSTOMER_PROFILE.md](CUSTOMER_PROFILE.md) voor datamodel, rollenmatrix, interne velden, API, migratieprocedure, tests en terugkeerplan. De acht dossieronderdelen gebruiken de bestaande Office-sessie en 24-uurs-TOTP; alleen owner/admin schrijven. Accountant leest fiscale instellingen, handler/viewer alleen algemene gegevens. RSIN, interne contactopmerkingen, prijsafspraken, notities, audit en bankgegevens worden rolgericht afgeschermd, ook bij directe databaseaanroepen.

De nieuwe additieve migratie `202609280001_complete_customer_profile.sql` moet later apart worden gecontroleerd en toegepast vóór een eventuele Worker-uitrol. Bestaande migraties blijven ongewijzigd. KvK-nummers zijn na aanmaak alleen-lezen. De Worker bouwt ook `customer-profile.js` en `profile-fields.js`; dossierdata blijven network-only. Geen nieuwe secrets, passkeys, accountuitnodigingen of boekhoudautomatisering. Niets online toegepast, gecommit of gepusht.
