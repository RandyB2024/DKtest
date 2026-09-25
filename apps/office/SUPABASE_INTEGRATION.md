# Office-Supabase — fase 2A

## Status en scope

Uitsluitend lokaal voorbereid op feature/office-customer-management. Niets gecommit, gepusht, gemerged, gedeployed of op afstand gemigreerd. De drie bestaande migraties zijn ongewijzigd.

Office leest dezelfde customer_relationships en organizations als het klantportaal. Fase 2A voegt aanmaken, naam/status wijzigen, ondernemingsgegevens wijzigen en soft archive toe. De nieuwe klant en eerste onderneming worden samen opgeslagen, met audit in dezelfde transactie. Na RPC-bevestiging haalt de interface de actuele gegevens opnieuw op.

Accountuitnodigingen en Auth-gebruikersbeheer blijven uitgeschakeld. Geen Auth Admin API. Boekhouding, uploads, PDF's, documenten, aangiften, berichten en overige bedrijfswrites zijn niet gemigreerd. Geen lokale of gesimuleerde opslag in de Supabase-productcode.

## Rollen en beveiliging

Alle lezers vereisen een actieve Supabase-gebruiker, actief profiel, actief office_membership, rol met scope office en AAL2/TOTP. Alleen owner en admin kunnen muteren; accountant, handler en viewer lezen. Klantaccounts krijgen nooit toegang.

Elke RPC controleert auth.uid(), is_office_user(), has_aal2() en actief profiel/membership/rol via een private helper. Autorisatierijen worden tijdens de transactie vergrendeld tegen gelijktijdige intrekking. Alle functies gebruiken SECURITY DEFINER en set search_path = public, met expliciet gekwalificeerde objectverwijzingen. De zes RPC's zijn alleen uitvoerbaar door authenticated; public en anon verliezen EXECUTE. Private helpers zijn ook voor authenticated niet uitvoerbaar. Functie-eigenaar moet de vertrouwde migratiebeheerder zijn.

Alle bestaande policies blijven intact. Geen directe INSERT-, UPDATE- of DELETE-toegang geopend. Alleen de afgebakende functies muteren, met vaste kolommen en invoervelden. Geen dynamische SQL, mass assignment, fysieke deletes of service-role-key.

Het bestaande Office-model is kantoorbreed: owner/admin mogen iedere niet-gearchiveerde relatie/onderneming beheren. Er is geen medewerker-toewijzing. Onbekende IDs, archieven en archiefouders worden geweigerd. Relatie-/organisatie-ID's kunnen niet via bodyvelden worden verwisseld.

## API en RPC

Alle routes gebruiken de uniforme JSON-envelope, no-store headers, exacte origincontrole en bestaande sessie-/MFA-controle.

| Methode en pad | PostgreSQL RPC |
| --- | --- |
| POST /api/relationships | office_create_relationship(p_input jsonb) |
| PATCH /api/relationships/:relationshipId | office_update_relationship(p_id text, p_input jsonb) |
| POST /api/relationships/:relationshipId/organizations | office_create_organization(p_id text, p_input jsonb) |
| PATCH /api/organizations/:organizationId | office_update_organization(p_id text, p_input jsonb) |
| POST /api/relationships/:relationshipId/archive | office_archive_relationship(p_id text, p_input jsonb) |
| POST /api/organizations/:organizationId/archive | office_archive_organization(p_id text, p_input jsonb) |

Relatie-invoer: name (verplicht bij aanmaken), status (active of inactive). Aanmaken accepteert optioneel organization voor de eerste onderneming; de UI vraagt die altijd. Ondernemingsinvoer: name (verplicht bij aanmaken), legal_name, registration_number. Getrimde namen maximaal 200 tekens. Optionele velden accepteren null/leeg. KvK leeg of exact acht cijfers. PATCH bevat minstens één ondersteund veld. Archive-body is {}. Onbekende velden, verkeerde types, niet-objecten, queryparameters bij writes en niet-canonieke UUID's worden geweigerd. API en SQL valideren; API-body maximaal 16 KiB.

Succes: 201 bij aanmaken, anders 200, alleen relatie-/organisatie-ID's. Fouten: 400 INVALID_INPUT, 401 ontbrekende sessie, 403 rechten/MFA/origin, 404 RECORD_UNAVAILABLE, 413 body te groot en 503 WRITE_UNAVAILABLE voor overige databasefouten. Geen interne fouten of requestinhoud in logs of antwoorden.

## Archivering, status en audit

Soft archive zet archived_at. Klantarchivering archiveert atomair alle nog niet-gearchiveerde ondernemingen eronder, met een auditrecord per onderneming en relatie. De bevestiging vermeldt dit. Standaardoverzichten verbergen archieven. Bewerken of opnieuw archiveren daarvan wordt geweigerd. Geen restore toegevoegd.

Status inactive is geen archief: Office houdt de relatie zichtbaar voor beheer; bestaande portal-RLS weigert klanttoegang totdat deze weer active is. Archivering trekt eveneens portaltoegang in. Geen memberships of zakelijke records verwijderd.

Audit bevat actor_id, customer_relationship_id, organization_id waar relevant, action (relationship.created/updated/archived of organization.created/updated/archived), object_type, object_id, result=success. Metadata bevat uitsluitend changed_fields met veldnamen. Updates bepalen werkelijk gewijzigde velden; een identieke niet-lege PATCH kan een succes-event met lege veldlijst geven. Geen volledige waarden of credentials. Een audit-/validatiefout rolt alles terug, inclusief de eerste onderneming. Relatie wordt vóór onderneming vergrendeld om writes te serialiseren.

## Exacte lokale configuratie

Node >=22.13.0. Gebruik apps/office/.env.local op basis van het bestaande .env.example. Dit bestand is genegeerd.

| Variabele | Waarde |
| --- | --- |
| SUPABASE_URL | HTTPS-project-URL van hetzelfde bestaande testproject als apps/portal |
| SUPABASE_PUBLISHABLE_KEY | Publishable key van dat project |
| OFFICE_ORIGIN | http://127.0.0.1:4173 |
| PORT | 4173 |
| ALLOW_DEVELOPMENT_AUTH | false |

Geen nieuwe variabelen, secrets, wachtwoorden of tokens. Geen NEXT_PUBLIC-waarden nodig in Office. Herstart na wijzigingen. Server bindt op 127.0.0.1. Productie vereist volgens bestaande configuratie NODE_ENV=production en een exacte HTTPS-origin. Deze opdracht omvat geen hosting.

## Latere migratiecontrole — niet uitgevoerd

Nieuwe migratie: apps/portal/supabase/migrations/202609240003_office_customer_management.sql.

1. Controleer het reeds gekoppelde testproject en de remote historie: 202609230001, 202609240001 en 202609240002 moeten toegepast zijn.
2. Vanuit apps/portal met reeds ingerichte CLI-toegang: voer `supabase migration list` en vervolgens `supabase db push --dry-run` uit.
3. Alleen 202609240003_office_customer_management.sql mag als nieuw verschijnen. Controleer de nieuwe functies en grants; bestaande policies blijven staan. Bij afwijkende historie stoppen. Geen reset, repair of opnieuw toepassen van oude migraties.
4. Dry-run controleert de planning, geen volledige acceptatie. Beoordeel SQL, tests, functie-eigenaar en archiveringsgevolgen. Alleen na afzonderlijke toestemming mag een beheerder later `supabase db push` uitvoeren. Deze opdracht heeft geen remote CLI-opdrachten uitgevoerd.
5. Controleer daarna de zes RPC-grants, private helpers en bestaande RLS. Voer onderstaande acceptatie uit met testaccounts. Voeg geen echte klantdata toe.

## Acceptatie na afzonderlijke toepassing

- Owner/admin: synthetische klant plus onderneming aanmaken, herladen, relatie bewerken, onderneming toevoegen/bewerken, KvK-validatie en archiveren na bevestiging. Controleer audit en behoud van records.
- Accountant/handler/viewer: gegevens zichtbaar, schrijfknoppen afwezig en API/RPC-mutaties geweigerd.
- Klantaccount: Office geweigerd; eigen bestaande portalgegevens toegankelijk en vreemde organisatie-IDs geweigerd.
- AAL1: MFA-scherm, geen bedrijfsdata. AAL2: toegang. Herladen herstelt sessie; afmelden sluit deze. Intrekking membership/blokkering profiel weigert volgende aanvraag.
- Ongeldige/lege/te lange velden, UUID's, onbekende velden en archieven: geen mutatie/audit. Auditfouten alleen in geïsoleerde testdatabase simuleren.
- Inactief/archief: portaltoegang vervalt volgens bestaande policies. Office-logout wist geen portal-cookie.

## Lokale verificatie

apps/office: npm.cmd test. apps/portal: npm.cmd test, npm.cmd run typecheck, npm.cmd run lint, npm.cmd run build. Repository: git diff --check en git status --short.

Nieuwe PGlite-tests voeren alle vier migraties uit, behalve de pgcrypto-extensiedeclaratie: gen_random_uuid is al aanwezig. SDK/API-tests gebruiken synthetisch transport. Remote projectinstellingen en echte accounts blijven afzonderlijke acceptatiepunten.

## Beperkingen

Geen uitnodigingen, accountbeheer, restore, bulkacties of overige bedrijfsmodules. Geen idempotency-key of optimistic locking: bij time-out kan de transactie al geslaagd zijn; controleer vóór herhalen. Gelijktijdige writes worden geserialiseerd maar een later formulier kan eerdere waarden overschrijven. Geen portalfeatures of hostingwijzigingen. De bestaande Node-server vereist een afzonderlijke hostingbeoordeling; lokale bestanden en demo-processessies zijn geen duurzame Worker-opslag.
## Oplevercontrole

- Office: 97 tests geslaagd, 0 mislukt (inclusief bestaande auth/MFA/sessieherstel en 14 nieuwe API-/SQL-testgevallen).
- Portal: 128 tests geslaagd, 0 mislukt. Typecheck, lint en build geslaagd. Build geeft uitsluitend de bekende melding over beperkte statische routeclassificatie van vinext.
- Geheimen-/bestandsscan: geen credentials aangetroffen in gewijzigde bestanden; geen .env.local, node_modules, private-storage, outputs of tijdelijke bestanden in de wijzigingslijst.
- De drie bestaande migraties en overige portalbroncode zijn ongewijzigd. Nieuwe SQL is uitsluitend lokaal via PGlite uitgevoerd.
- Visuele browseracceptatie kon niet worden uitgevoerd: de browser weigerde toegang omdat het beheerbeleid niet kon worden geverifieerd. Deze beveiligingsblokkade is niet omzeild. API, SQL en frontendbron zijn wel gecontroleerd; de formulieren moeten nog visueel worden geaccepteerd.

Gewijzigde bestanden (ten opzichte van de schone featurebranch):

- apps/office/README.md
- apps/office/SUPABASE_INTEGRATION.md
- apps/office/PWA_SECURITY.md
- apps/office/SHARED_BACKEND_CONTRACTS.md
- apps/office/public/supabase-app.js
- apps/office/public/supabase.css
- apps/office/src/auth/supabase.mjs
- apps/office/src/supabase-api.mjs
- apps/office/src/customer-management.mjs (nieuw)
- apps/office/tests/helpers/supabase-fixture.mjs
- apps/office/tests/customer-management-api.test.mjs (nieuw)
- apps/office/tests/customer-management-rls.test.mjs (nieuw)
- apps/portal/supabase/migrations/202609240003_office_customer_management.sql (nieuw)

## Aanvulling: vertrouwde MFA-sessies

Harde TOTP-grens van 86400 seconden, enforced in server en nieuwe migratie 202609250001_trusted_mfa_sessions.sql. MFA_TRUST_MAX_AGE_SECONDS=86400 (optioneel, dezelfde vaste standaard). Oude migraties zijn ongewijzigd. Zie PWA_SECURITY.md voor voorwaarden, testgrenzen en afzonderlijke dry-runcontrole; niets online toegepast.
## Oplevercontrole vertrouwde MFA — 25 september 2026

Branch feature/trusted-device-passkeys. Office: 110 tests geslaagd; portal: 135 tests geslaagd. Portal typecheck, lint en build geslaagd. Office heeft geen buildscript: alle src/public JavaScript-bestanden zijn aanvullend gecontroleerd met node --check. De bestaande Node-runtime blijft ongewijzigd.

Git diff --check geslaagd. Vier bestaande migraties ongewijzigd. Geen credentials of gegenereerde/private bestanden in de wijzigingslijst aangetroffen. Geen commit, push, deployment of remote migratie uitgevoerd. Nieuwe migratie: 202609250001_trusted_mfa_sessions.sql. Lokale PGlite-tests voeren alle vijf migraties uit en bewijzen bescherming tegen verlopen MFA via tabelpolicies, Storage en de Office-RPC.

De portalbuild meldt alleen de bekende beperking van statische routeclassificatie door vinext. Echte Supabase-projectacceptatie en browseracceptatie zijn in deze fase niet uitgevoerd. De securitydocumentatie beschrijft de latere dry-run en de vaste configuratie.

Volledige gewijzigde-bestandenlijst:
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\.env.example
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\PWA_SECURITY.md
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\README.md
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\src\auth\supabase.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\src\auth\trusted-mfa.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\src\config.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\SUPABASE_INTEGRATION.md
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\tests\customer-management-rls.test.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\tests\helpers\supabase-fixture.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\tests\supabase-auth.test.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\tests\trusted-mfa-rls.test.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\office\tests\trusted-mfa.test.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\.env.example
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\app\api\context\route.ts
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\app\api\organizations\[organizationId]\route.ts
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\lib\portal-access.ts
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\lib\portal-api.ts
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\lib\supabase\config.ts
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\lib\supabase\server.ts
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\lib\supabase\trusted-mfa.ts
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\README.md
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\SECURITY.md
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\supabase\migrations\202609250001_trusted_mfa_sessions.sql
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\tests\supabase-auth.test.mjs
- C:\Users\Randy\Documents\destination-known-platform-local\apps\portal\tests\trusted-mfa.test.mjs
