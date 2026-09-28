# KvK-klantintake — beveiliging en ingebruikname

Branch: `feature/kvk-customer-onboarding`. Deze wijziging is uitsluitend lokaal gebouwd en getest. Geen online migratie, deployment, abonnement, productiebevraging, commit of push uitgevoerd.

## Beveiligingsbeoordeling

De bestaande Office-identiteit, actieve membership/rolscope en harde 24-uurs-TOTP-controle staan vóór alle nieuwe KvK-routes. Owner/admin mogen aanmaken; accountant/handler/viewer mogen alleen zoeken en controleren. Klantaccounts krijgen geen Office-toegang. De bestaande origincontrole, HttpOnly/Secure/Strict-cookies en RLS blijven intact. Passkeys worden niet ingeschakeld.

De Worker verstuurt de KvK-key alleen als `apikey` naar de vaste officiële HTTPS-host. Alleen de exacte test- of productiebase wordt geaccepteerd; geen redirects of links uit API-responses worden gevolgd. Elke KvK-aanvraag heeft maximaal zeven seconden en een responsegrens van 1 MB. Zoekresultaten zijn begrensd tot tien per pagina en tien pagina's; zoeknaam tot 120 en plaats tot 80 tekens. Fouten worden vertaald naar veilige Nederlandse meldingen. Requestbodies, headers, API-keys en ruwe providerfouten worden niet gelogd.

De browser verstuurt bij aanmaken uitsluitend het KvK-nummer en handmatige klantvelden. De server haalt Basisprofiel en de exacte zoekstatus opnieuw op. Alleen een aantoonbaar actieve hoofdvestiging/rechtspersoon wordt toegelaten; een materiële einddatum, uitschrijving of onbekende status blokkeert de intake. Het bezoekadres kan afgeschermd zijn en blijft dan afgeschermd. Ontbrekende velden worden niet verzonnen.

**Ook directe PostgREST-RPC-aanroepen mogen geen KvK-hercontrole veinzen.** Daarom heeft de nieuwe RPC naast de gewone gebruikerssessie een beperkte Worker-capability nodig: `KVK_INTAKE_RPC_KEY`, onafhankelijk van de KvK API-key. Supabase bewaart uitsluitend de SHA-256 van deze willekeurige 32-byte hexwaarde in een afgeschermd schema. De capability is geen service-role-key, geeft geen algemene databasebevoegdheden en vervangt nooit de Office-/MFA-controle. Zonder geconfigureerde hash faalt de intake gesloten. De echte KvK-key wordt nooit naar Supabase gestuurd.

## API en gegevens

| Route | Invoer | Resultaat |
| --- | --- | --- |
| GET `/api/kvk/search` | `kvkNumber` óf `name` met optioneel `city`; `page` 1–10 | Beperkte genormaliseerde zoeklijst en omgeving |
| GET `/api/kvk/organizations/:kvkNumber` | Exact acht cijfers | Genormaliseerd Basisprofiel, status, controletijd en omgeving |
| POST `/api/relationships/from-kvk` | `kvkNumber`, `manual` | Eén klantrelatie en eerste onderneming; hun IDs |

`manual` staat uitsluitend `relationshipName` (verplicht), `vatId`, `taxNumber`, `iban`, `email`, `phone`, `contactPerson`, `fiscalChoices` en `services` toe. Deze overige velden zijn optioneel en blijven leeg tot een medewerker ze invult. Tekstvelden zijn begrensd op 200 tekens; fiscale keuzes/dienstverlening op 1000. E-mail krijgt een eenvoudige formaatcontrole; er wordt geen fiscale of bancaire validatie/automatisering gesuggereerd.

Basisprofiel wordt beperkt tot KvK-nummer, naam/statutaire naam, handelsnamen, rechtsvorm, status, registratie-/aanvangsdatum, bezoek-/correspondentieadres, hoofdvestigingsnummer, activiteiten/SBI en vestigingenaantal. Data uit het embedded eigenaarblok wordt alleen gebruikt voor de rechtsvorm en zakelijke adressen indien er geen hoofdvestiging is. Er worden geen aparte eigenaar-, bestuurder- of UBO-endpoints aangeroepen; RSIN, medewerkers, websites en andere niet-benodigde velden worden niet opgeslagen. Openbare bedrijfsnamen/adressen van een eenmanszaak kunnen betrekking hebben op een persoon; behandel het dossier daarom als vertrouwelijk.

De wizard heeft vier stappen: zoeken, controleren, klantgegevens aanvullen, bevestigen. De gebruiker ziet de testomgeving nadrukkelijk. Knoppen worden tijdens verzoeken geblokkeerd, er kan maar één wizard openstaan en de database blokkeert dubbele actieve KvK-nummers ook bij gelijktijdige verzoeken. Bij een onzekere netwerkuitkomst eerst het overzicht controleren: opnieuw opslaan levert eventueel een duplicaatmelding, nooit een tweede actief dossier met hetzelfde nummer. Succes opent het bestaande klantdossier met de opgeslagen intakegegevens.

## Additieve databasewijziging

Nieuwe migratie: `apps/portal/supabase/migrations/202609270001_kvk_customer_onboarding.sql`.

- Unieke partiële index `organizations_active_kvk_unique` op het getrimde KvK-nummer voor niet-gearchiveerde ondernemingen met een nummer. Dit geldt ook voor bestaande aanmaak-/wijzigings-RPCs; dubbele nummers geven voortaan 409. Lege nummers blijven toegestaan in de bestaande contracten.
- `organization_kvk_intakes`: gekoppelde, onveranderlijke intake-momentopname met genormaliseerd `profile`, `manual_details`, `kvk_checked_at`, `kvk_environment`, `created_by` en `created_at`. Alleen actieve Office-leden met verse TOTP kunnen de niet-gearchiveerde dossiers lezen. Klantaccounts kunnen deze intakegegevens niet lezen; directe writes zijn niet toegestaan.
- `office_kvk_private.worker_gate`: uitsluitend de eigenaar van de database kan de hash en de toegestane omgeving beheren. Geen schema- of tabelrechten voor public/anon/authenticated.
- `office_create_relationship_from_kvk`: SECURITY DEFINER, vaste search_path, bestaande actorcontrole, server-capability, begrensde invoer, recente controletijd en omgevingcontrole. Roept de bestaande transactionele aanmaak-RPC aan en voegt snapshot plus audit toe binnen dezelfde transactie. De drie auditrecords bevatten alleen gewijzigde veldnamen, geen contact-/fiscale waarden. Bij elke fout wordt alles teruggedraaid. EXECUTE alleen voor authenticated; zonder beide controles geen mutatie.

Geen bestaande migratie, policy of RPC-definitie is gewijzigd. De bestaande handmatige RPCs blijven beschikbaar, maar geven geen KvK-gecontroleerde bronstatus. De snapshot is historische herkomstinformatie: latere edits van naam/nummer wijzigen de opgeslagen controle niet. Er is geen nieuwe fysieke deletefunctie. Archiveren verbergt ook de snapshot via RLS; een nieuw actief dossier met hetzelfde nummer is dan toegestaan.

## Handmatige stappen voor de testomgeving

Deze stappen zijn **niet uitgevoerd** en horen bij een afzonderlijk gecontroleerde ingebruikname.

1. Controleer de bestaande vijf migraties en actieve dubbele nummers. Lees bijvoorbeeld:

   ```sql
   select btrim(registration_number) as kvk_number, count(*)
   from public.organizations
   where archived_at is null and nullif(btrim(registration_number),'') is not null
   group by btrim(registration_number) having count(*) > 1;
   ```

   Bij duplicaten: stop en beoordeel de dossiers handmatig. De migratie verwijdert of voegt geen bestaande dossiers samen. Vanuit `apps/portal`: eerst `supabase migration list`, daarna `supabase db push --dry-run`. Alleen de nieuwe KvK-migratie mag nieuw zijn als de eerdere vijf al toegepast zijn. Geen reset/repair en geen online push zonder aparte toestemming.
2. Vraag toegang tot de **KvK-testomgeving** aan via het officiële Developer Portal; sluit geen productieabonnement af voor deze validatie. Gebruik de testkey uitsluitend als Cloudflare Worker-secret `KVK_API_KEY`, nooit in Git, `.env.local`, `wrangler.jsonc`, browsercode of gedeelde screenshots.
3. Configureer Worker-variabelen `KVK_API_MODE=test` en `KVK_API_BASE_URL=https://api.kvk.nl/test/api`. De toegestane productiebase is `https://api.kvk.nl/api`, maar wordt in deze fase niet bevraagd. De client voegt zelf `/v2/zoeken` en `/v1/basisprofielen/{nummer}` toe.
4. Genereer in een beveiligde beheeromgeving een onafhankelijke willekeurige 32-byte waarde als 64 kleine hextekens; sla deze uitsluitend als Worker-secret `KVK_INTAKE_RPC_KEY` op. Bereken SHA-256 over de **UTF-8-tekst van die 64 hextekens**, niet over de oorspronkelijke bytes. Plaats na een apart geautoriseerde migratie alleen de resulterende hash in de private tabel, via een beveiligde databasebeheerverbinding:

   ```sql
   insert into office_kvk_private.worker_gate(singleton,secret_hash,environment)
   values (true, '<SHA256_HEX_VAN_DE_WORKER_CAPABILITY>', 'test');
   ```

   Dit is een placeholder, geen uitvoerbaar secret. Deel/geef de oorspronkelijke capability niet aan gebruikers; zet het private schema niet in de exposed schemas van PostgREST. Bij rotatie Worker-secret en databasehash samen bijwerken; een mismatch blokkeert intake veilig. Gebruik nooit de KvK-key zelf als capability.
5. Controleer de migratie/RLS, secrets en configuratie voordat de nieuwe Worker ooit online wordt gezet. De nieuwe dossierleesroute verwacht de nieuwe tabel. Accountuitnodigingen, boekhouding en overige niet-gemigreerde functies blijven uit.
6. Test later handmatig op de HTTPS-testomgeving: BV `68750110`, eenmanszaak `69599084`, inactieve `96354429`, foutscenario `90004973`, lege resultaten, afgeschermd adres, dubbele aanmaak, verlopen TOTP en klantaccount. De lokale fixtures gebruiken deze nummers met synthetische namen/adressen; zij zijn geen opname van de echte testdataset. Controleer in een gecontroleerde acceptatie ook directe PostgREST/RPC/Storage-toegang. Er zijn in dit werk geen live KvK- of Supabase-bevragingen gedaan.

## Lokale validatie

Vanuit `apps/office`:

```powershell
npm run build:worker
npm test
$env:WRANGLER_SEND_METRICS='false'
$env:WRANGLER_LOG_PATH=(Join-Path (Get-Location) 'work/wrangler-logs')
npx wrangler deploy --dry-run --outdir worker-build
npm run test:worker-runtime
```

De runtime-test gebruikt de vooraf gebouwde Wrangler-bundel in echte lokale workerd/Miniflare, met alle externe verzoeken onderschept door fixtures. Vanuit `apps/portal`: `npm test`. Controleer daarnaast de gewijzigde JavaScript-bestanden met `node --check` en vanuit de repository `git diff --check` en `git status --short`.

`worker-public`, `worker-build`, `work`, `.env.local`, `.env.worker-secrets`, node_modules en privéopslag zijn uitgesloten van het wijzigingspakket. De runtime-test gebruikt de reeds via Wrangler geïnstalleerde Miniflare; geen nieuwe dependency toegevoegd.

## Officiële bronnen

Geraadpleegd 27 september 2026: [Zoeken v2](https://developers.kvk.nl/nl/documentation/zoeken-api), [Basisprofiel](https://developers.kvk.nl/nl/documentation/basisprofiel-api), [officiële Basisprofiel OpenAPI-specificatie](https://developers.kvk.nl/cms/api/uploads/api_basisprofiel_widget.yaml) en [testnummers](https://developers.kvk.nl/nl/documentation/testing/swagger-basisprofiel-api). De materiële einddatum heet `datumEinde`; onbekende status wordt nooit als actief ingevuld.

## Uitgevoerde controles en volledige bestandslijst

- Office: 144 tests geslaagd, 0 mislukt.
- Portal: 138 tests geslaagd, 0 mislukt.
- Lokale workerd-runtime: 1 test geslaagd met volledig onderschepte externe verzoeken.
- JavaScript-syntaxcontrole, build:worker, Wrangler deploy --dry-run en git diff --check geslaagd.
- Geen bestaande migraties gewijzigd; geen secrets of gegenereerde bestanden in de onderstaande wijzigingslijst.
- Live provider-acceptatie en handmatige browsercontrole blijven nog nodig; fixtures bewijzen niet de beschikbaarheid of inhoud van de echte KvK-testomgeving.

- `apps/office/.env.example`
- `apps/office/KVK_ONBOARDING.md`
- `apps/office/PWA_SECURITY.md`
- `apps/office/README.md`
- `apps/office/SHARED_BACKEND_CONTRACTS.md`
- `apps/office/SUPABASE_INTEGRATION.md`
- `apps/office/WORKER_DEPLOYMENT.md`
- `apps/office/package.json`
- `apps/office/public/kvk-intake.js`
- `apps/office/public/supabase-app.js`
- `apps/office/scripts/build-worker-assets.mjs`
- `apps/office/src/config.mjs`
- `apps/office/src/customer-management.mjs`
- `apps/office/src/kvk/client.mjs`
- `apps/office/src/kvk/intake.mjs`
- `apps/office/src/kvk/normalize.mjs`
- `apps/office/src/supabase-api.mjs`
- `apps/office/src/worker.mjs`
- `apps/office/tests/helpers/kvk-fixture.mjs`
- `apps/office/tests/kvk-rls.test.mjs`
- `apps/office/tests/kvk-worker.test.mjs`
- `apps/office/tests/kvk.test.mjs`
- `apps/office/tests/runtime/kvk.test.mjs`
- `apps/portal/supabase/migrations/202609270001_kvk_customer_onboarding.sql`
