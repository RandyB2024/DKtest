# Volledig klantprofiel — lokale oplevering

Branch `feature/complete-customer-profile`. Nieuwe migratie: `apps/portal/supabase/migrations/202609280001_complete_customer_profile.sql`. Niets online toegepast, gecommit, gepusht of gedeployed. KvK-testmodus, uitgeschakelde passkeys en de bestaande harde 24-uurs-TOTP-grens zijn ongewijzigd. Er is geen boekhoud-, aangifte-, agenda-, bank- of AI-automatisering toegevoegd.

## Datamodellen- en beveiligingsanalyse

De bestaande tabellen `customer_relationships` en `organizations` blijven de bron voor klantnaam/status en ondernemingsnaam/officiële naam/KvK. Een onderneming blijft via haar bestaande foreign key onderdeel van één relatie. Het bestaande klantportaal behoudt alleen zijn bestaande gegevens en rechten. Nieuwe Office-gegevens worden niet aan bestaande portaalcontracten toegevoegd.

De nieuwe migratie voegt toe:

| Opslag | Inhoud / sleutel |
| --- | --- |
| `customer_relationships` | `relationship_number` (unieke identity, geen historisch extern relatienummer), `responsible_id`, `started_on`, `profile_version` |
| `office_customer_versions` | Interne ondernemingsversie; geen directe grants. De teller wordt alleen in de Office-RPC-projectie opgenomen, niet op de door het portaal leesbare organisatietabel |
| `office_customer_company` | Eén rij per onderneming: handmatige handelsnamen, RSIN, rechtsvorm, zakelijke status, adressen, telefoon, e-mail, website, datums en activiteiten |
| `office_customer_contacts` | Meerdere contacten, inclusief primaire/actieve status, portaalregistratie en interne opmerking |
| `office_customer_fiscal` | Eén rij per onderneming: fiscale identifiers, aangifteperioden en keuzes, boekjaar en aandachtspunten |
| `office_customer_administration` | Eén rij per onderneming: inrichting, periode, valuta, stelsel, pakket, medewerkers en aandachtspunten |
| `office_customer_banks` | Meerdere IBAN-stamrecords; nooit een koppeling met banken |
| `office_customer_services` | Meerdere actieve/beëindigde diensten, verantwoordelijke medewerker en prijsafspraak |
| `office_customer_agreements` | Eén rij per onderneming: contact-, rapportage- en aanleverafspraken |
| `office_customer_notes` | Notities met oorspronkelijke auteur, laatste bewerker, categorie en vastgepinde status |
| `office_customer_note_revisions` | Afzonderlijke beschermde inhoudsrevisies van notities; geen notitie-inhoud in auditdetails |
| `audit_events` | Bestaande auditstructuur hergebruikt; alleen gewijzigde veldnamen |

Nieuwe sectietabellen hebben een UUID, organisatie-FK, actor-FKs, aanmaak-/wijzigingsdatum en `archived_at`. Singleton-tabellen hebben een unieke organisatie-FK. De gedeeltelijke unieke contactindex staat maximaal één primaire **actieve, niet-gearchiveerde** contactpersoon toe. Lijsten en historie hebben stabiele paginering op datum én UUID, 25 records per pagina. Relevante organisatie-/datumindexen zijn toegevoegd.

### Gegevensherkomst en geen dubbele actuele bronnen

- Bestaande organisatievelden `name`, `legal_name` en `registration_number` worden niet gedupliceerd in de nieuwe bedrijfstabel.
- `organization_kvk_intakes.profile` blijft een onveranderde historische KvK-momentopname, inclusief SBI, hoofdvestiging, handelsnamen, adressen en controledatum. De interface markeert deze apart als KvK-bron. Aanvullende actuele velden zijn expliciet handmatig beheerd. Een handmatige rechtsvorm wordt bovenaan gebruikt indien ingevuld, anders de herkenbare KvK-bronwaarde.
- RSIN staat uitsluitend in `office_customer_company` en wordt daaruit getoond bij Fiscaal. Er wordt geen tweede fiscaal RSIN-veld opgeslagen.
- De eerdere `manual_details` blijft historisch, uitsluitend voor owner/admin. Er worden geen fiscale keuzes geïnterpreteerd, contacten gesplitst of vrije dienstomschrijvingen automatisch omgezet. Beoordeel deze historische invoer voordat actuele instellingen worden vastgelegd. De historie is geen tweede actuele bron.
- Optionele booleans hebben drie betekenissen: niet ingevuld, ja, nee. Er worden geen fiscale aannames gedaan op basis van rechtsvorm. EUR is alleen de gevraagde standaardvaluta voor nieuwe administratie-instellingen.
- Een ontbrekende verantwoordelijke, startdatum of officiële naam geeft een aanvulmelding. Dit blokkeert bestaande dossiers niet. Verplichte invoer geldt bij het maken/bewerken van het betreffende record, zoals achternaam, notitietitel/inhoud en IBAN.

## Rollenmatrix en gegevensclassificatie

Alle toegang vereist een actief profiel, actief Office-lidmaatschap met Office-scope en verse gevalideerde AAL2/TOTP. Klantaccounts, anon, onbekende rollen, ontbrekende/verlopen claims en ingetrokken lidmaatschap krijgen geen toegang. Alleen owner/admin mogen wijzigen, inclusief contacten en notities; niemand krijgt brede directe tabelwrites.

| Onderdeel | Owner/admin | Accountant | Handler/viewer | Klantportaal |
| --- | --- | --- | --- | --- |
| Overzicht / algemene bedrijfsgegevens / publieke KvK-bron | Lezen/wijzigen | Lezen | Lezen | Alleen reeds bestaande portaalvelden |
| Contactgegevens zonder interne opmerking | Lezen/wijzigen | Lezen via RPC | Lezen via RPC | Geen nieuwe toegang |
| RSIN / fiscale instellingen | Lezen/wijzigen | Lezen | Geen | Geen |
| Interne contactopmerking | Lezen/wijzigen | Geen | Geen | Geen |
| Administratie, bankstamgegevens, diensten/prijsafspraken, afspraken | Lezen/wijzigen | Geen | Geen | Geen |
| Interne notities en inhoudsrevisies | Lezen/wijzigen/archiveren | Geen | Geen | Geen |
| Historie, eerdere handmatige intake | Lezen | Geen | Geen | Geen |

Contactgegevens zijn persoonsgegevens; fiscale identifiers, bankgegevens, prijsafspraken en interne tekst zijn vertrouwelijk. Nieuwe tabellen zijn Office-only. De algemene bedrijfstabel bevat RSIN: handler/viewer krijgen daarom geen directe tabelrijen, maar alleen de geredigeerde RPC-projectie. Hetzelfde geldt voor contacten met interne opmerkingen. Directe RLS en de RPC controleren dit onafhankelijk van de UI.

Aan `audit_events` en `organization_kvk_intakes` wordt een extra **restrictieve** leespolicy toegevoegd voor owner/admin. Dit sluit de eerder bredere Office-leesroute voor vertrouwelijke historische inhoud. De publieke KvK-bron blijft voor toegestane Office-rollen beschikbaar via de gerichte lees-RPC, zonder `manual_details`. Bestaande policies worden niet verwijderd of versoepeld. Een RLS-weigering levert geen geheime details op.

## Schrijven, concurrency en validatie

`office_customer_profile_write` is SECURITY DEFINER met `search_path=public`, beperkte EXECUTE-grants en hercontrole via de bestaande `office_cm_actor()`. Eerst worden de relatie en daarna de onderneming vergrendeld. Iedere meegegeven record-ID wordt opnieuw aan de betreffende onderneming gekoppeld. Een verkeerde relatie/organisatiecombinatie, gearchiveerd record of onbekend veld wordt geweigerd.

De versie is verplicht bij iedere mutatie. Overzicht gebruikt de relatieversie; overige secties gebruiken de ondernemingsversie. Versies zijn monotone wijzigingsmarkeringen, geen telling van gebruikershandelingen. Triggers verhogen ze ook bij bestaande legacy-RPCs en archivering. Een verouderde versie geeft HTTP 409; de UI bewaart de invoer totdat de gebruiker bewust annuleert/herlaadt. Dit is bewust grovere concurrency: wijzigingen in twee verschillende secties kunnen ook conflicteren, maar overschrijven elkaar nooit stilzwijgend.

Dezelfde transactie bevat wijziging, eventuele notitierevisie, versie-update en audit. Een auditfout rolt alles terug. De actor komt uit de gevalideerde sessie, nooit uit formulierdata. `created_by` blijft bij notities behouden; `updated_by` houdt de laatste bewerker bij. Er bestaat geen fysieke verwijderroute. Contacten met een portaalregistratie kunnen uitsluitend worden gearchiveerd.

KvK is na aanmaak alleen-lezen. Een nieuwe trigger blokkeert nummerwijzigingen ook via de bestaande `office_update_organization`-RPC. Deze route wordt niet vervangen, en bestaande naamwijzigingen blijven werken. Een toekomstige KvK-correctie vereist een aparte beoordeelde flow. Bestaande lege nummers worden niet geraden of automatisch ingevuld.

De invoercontracten staan in `public/profile-fields.js` en als bevroren contract in de nieuwe migratie. Een test controleert hun gelijkheid. De database valideert opnieuw; de browser is geen beveiligingsgrens. Tekstlengtes, enums, echte datums/datumvolgorde, booleans, aantallen, actieve Office-medewerkers, e-mailnormalisatie en HTTP(S)-websites worden gecontroleerd. Fiscale identifiers blijven begrensde tekst: geen numerieke conversie, geen belastingdienstverificatie en geen te strikte Nederlandse patroonregel die uitzonderingen uitsluit. Een syntactisch geldig veld bewijst geen fiscale juistheid.

IBAN wordt lokaal genormaliseerd en gecontroleerd met mod-97, de internationale teken-/lengtegrens en specifiek het NL-formaat. Land-specifieke lengtetabellen buiten NL worden niet geclaimd. De lijst-API toont alleen landcode en laatste vier tekens. Een bewerkformulier geeft het volledige bestaande IBAN niet terug: leeg laten bewaart het; vervangen vraagt bevestiging. Volledige IBANs blijven uitsluitend in beschermde Office-opslag voor owner/admin, nooit in auditdetails.

## API

Basisroute: `/api/relationships/:relationshipId/organizations/:organizationId/profile`.

| Methode / suffix | Functie |
| --- | --- |
| GET basisroute | Relatie, onderneming, toegestane singleton-secties, Office-medewerkers en KvK-bron |
| PATCH `/overview`, `/company`, `/fiscal`, `/administration`, `/agreements` | Gerichte sectie-update |
| GET `/contacts`, `/banks`, `/services`, `/notes` | Gepagineerde lijst; `page=1`, `archived=false` |
| POST dezelfde collectie | Record toevoegen |
| PATCH `/:collectie/:recordId` | Record wijzigen |
| POST `/:collectie/:recordId/archive` | Soft archive |
| GET `/history?page=1` | Gepagineerde, geredigeerde auditgeschiedenis |

Mutatiebody: `{ "version": 0, "fields": { ... } }`; archiveren gebruikt lege `fields`. Alleen verwachte velden/queryparameters, geldige UUIDs en juiste HTTP-methoden zijn toegestaan. Read-RPC: `office_customer_profile_read`; write-RPC: `office_customer_profile_write`. Interne helperfuncties zijn niet algemeen uitvoerbaar, behalve de strikt begrensde rol-/leesbooleans die RLS nodig heeft.

De bestaande uniforme JSON-envelope, no-store headers, origin-/CSRF-controle, servercookies en gevalideerde Supabase-sessie blijven gebruikt. Node en Worker voeren dezelfde API-code uit. Geen service-role, nieuwe secrets, Auth Admin API of Auth-accountaanmaak. Het contactveld portaaltoegang registreert alleen een dossiergegeven en verleent **geen** toegang. Accountuitnodigingen blijven uitgeschakeld.

## Interface

Het bestaande dossier krijgt acht onderdelen: Overzicht, Onderneming, Contactpersonen, Fiscaal, Administratie, Diensten en afspraken, Interne notities, Historie. Bij meerdere ondernemingen is er een keuzelijst. Bekijken en bewerken zijn gescheiden. Formulieren bewaren foutieve/conflicterende invoer, blokkeren dubbel opslaan, bevestigen risicovolle wijzigingen en vragen bevestiging bij annuleren van gewijzigde invoer. Navigatie tijdens opslaan is geblokkeerd. Afmelden/MFA-verlies blijft belangrijker dan onopgeslagen tekst: de veilige sessieschermen verwijderen dossierinhoud.

Dynamische tekst gebruikt DOM `textContent`; geen nieuwe dynamische HTML. Na succes wordt de API opnieuw gelezen. Laden, lege lijsten, fouten, succes, paginering en archiefweergave zijn zichtbaar. De Worker-assetlijst bevat beide nieuwe frontendmodules. De shellcacheversie is `v14-profile`; profiel-API en persoonsgegevens worden niet in de service-worker cache of browseropslag opgeslagen.

## Migratieprocedure — nog niet uitgevoerd

1. Controleer dat de huidige database de zes eerdere migraties bevat. Lees de nieuwe migratie volledig en maak volgens het beheerproces een herstelpunt/back-up; exporteer geen productiegegevens naar deze repository.
2. Vanuit `apps/portal`: `supabase migration list`, daarna `supabase db push --dry-run`. Deze opdracht heeft geen remote migratiecontrole of push uitgevoerd. Alleen de nieuwe migratie mag nog openstaan als de zes eerdere al zijn toegepast. Bij afwijkingen stoppen; geen reset of repair.
3. Beoordeel expliciet de extra leesbeperkingen op oude intake/audit en de KvK-immutabiliteitstrigger. Er wordt geen bestaand klantrecord verwijderd, geen bestaande fiscale waarde geconverteerd en geen bestaande migratie aangepast. Identity-relatienummers zijn nieuwe interne nummers, geen reconstructie van oude klantnummers.
4. Pas de migratie later uitsluitend met afzonderlijke autorisatie toe in de testomgeving. De nieuwe frontend/API verwacht de nieuwe RPCs en tabellen; rol de Worker pas daarna uit, eveneens met afzonderlijke autorisatie.
5. Geen nieuwe secrets/configuratie nodig. Bestaande KvK-testconfiguratie en secrets blijven staan. Passkeys blijven uit.

## Testprocedure en live acceptatie

Lokaal, vanuit `apps/office`:

```powershell
npm run build:worker
npm test
$env:WRANGLER_SEND_METRICS='false'
$env:WRANGLER_LOG_PATH=(Join-Path (Get-Location) 'work/wrangler-logs')
npx wrangler deploy --dry-run --outdir worker-build
npm run test:worker-runtime
```

Vanuit `apps/portal`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Controleer gewijzigde JavaScript met `node --check` en vanuit de repository `git diff --check`/`git status --short`.

PostgreSQL-tests voeren alle zeven migraties uit in PGlite; alleen de daar niet beschikbare pgcrypto-extensiondeclaratie wordt overgeslagen (de benodigde UUID/hashfuncties zijn ingebouwd). Ze testen RLS, rol-/organisatiegrenzen, directe SQL equivalent aan PostgREST, portal- en Storage-regressies, accountstatus, exacte MFA-expiry, atomiciteit/auditfouten, KvK-regressie, concurrentie, notitierevisies, primaire contacten en IBAN. De API-tests gebruiken synthetische Supabase-responses. De DOM-unit-harness test laden/leeg/fout, opslaan, invoerbehoud, annuleren en conflicten. De afzonderlijke runtime-tests gebruiken echte lokale workerd met alle externe verzoeken onderschept.

Nog live te accepteren, na apart geautoriseerde testmigratie/uitrol:

- Echte Office-accounts per rol en klantaccounts; directe PostgREST-, RPC- en Storage-aanroepen met verse, ontbrekende en exact verlopen TOTP.
- Actuele Supabase-grants/schema-exposure verifiëren, zonder private tabellen/schema's openbaar te maken.
- Twee browsers gelijktijdig laten bewerken; conflict, herladen, dubbele primaire contacten en archiveren controleren.
- Mobiele/desktopbrowser, toetsenbord, dialoogfocus, browser-terug, afmelden tijdens opslag en verlies van netwerk beoordelen. DOM-unit-tests vervangen deze browseracceptatie niet.
- Oud dossier zonder KvK-intake, bestaande handmatige intake, nieuwe KvK-testintake en meerdere ondernemingen controleren. Geen fiscale instellingen automatisch overnemen zonder inhoudelijke beoordeling.
- Notitie-/auditredactie en gemaskeerde bankweergave controleren; gevoelige inhoud mag niet in portal-API, logs of auditpayloads staan.

## Bekende beperkingen en terugkeerplan

Dit is stamgegevensbeheer, geen fiscale beoordeling of boekhouding. Portaalregistratie maakt geen Auth-account. Geen KvK-correctie, automatische bronverversing, bankkoppeling, inhoudszoekmachine, notitieherstel of uitnodigingen. Notitie-inhoudsrevisies worden beschermd opgeslagen; de dossierhistorie toont alleen veilige wijzigingsmetadata, geen volledige oude notitie-inhoud. Archief is leesbaar, herstellen is nog geen actie. Een exacte volle pagina kan een lege volgende pagina hebben; er wordt geen onbegrensde telling uitgelezen.

Bij een defecte uitrol: stop nieuwe profielmutaties en keer terug naar de vorige Worker-versie; behoud de additieve tabellen en ingevoerde data. De aangescherpte RLS, versietriggers en KvK-immutabiliteit moeten blijven staan. De oude Worker kan namen blijven bewerken en KvK-intakes blijven aanmaken, maar KvK-correcties blijven geweigerd en lagere rollen zien geen oude interne intake. Geen tabellen droppen, geen oude migraties herschrijven en geen ongedocumenteerde reverse-migratie toepassen. Herstel bij dataproblemen pas na expliciete beoordeling via een nieuwe additieve herstelmigratie of het beheerback-upproces.

## Uitgevoerde controles

- Office: 158 tests geslaagd, 0 mislukt.
- Portal: 138 tests geslaagd, 0 mislukt.
- Echte lokale Worker-runtime: 2 tests geslaagd, 0 mislukt.
- Portal typecheck, lint en build: geslaagd. De build meldt de bestaande vinext-beperking in statische routeclassificatie, geen buildfout.
- Office heeft geen aparte lint-/typecheckscript; syntaxcontrole van alle gewijzigde runtime-/frontend-JavaScript is geslaagd.
- Worker asset-build en Wrangler deploy --dry-run: geslaagd, 16 assets; geen deployment.
- git diff --check: geslaagd. Zes bestaande migratiebestanden byte-inhoudelijk gecontroleerd tegen HEAD en ongewijzigd. Alleen de nieuwe additieve migratie toegevoegd.
- Gewijzigde bestanden gecontroleerd op uitgesloten privé-/gegenereerde paden en herkenbare credentialpatronen. Geen secrets geopend of opgenomen; geen nieuwe dependency.

## Volledige gewijzigde bestandslijst

- `apps/office/CUSTOMER_PROFILE.md`
- `apps/office/PWA_SECURITY.md`
- `apps/office/README.md`
- `apps/office/SHARED_BACKEND_CONTRACTS.md`
- `apps/office/SUPABASE_INTEGRATION.md`
- `apps/office/WORKER_DEPLOYMENT.md`
- `apps/office/public/customer-profile.js`
- `apps/office/public/profile-fields.js`
- `apps/office/public/supabase-app.js`
- `apps/office/public/supabase.css`
- `apps/office/public/sw.js`
- `apps/office/scripts/build-worker-assets.mjs`
- `apps/office/src/customer-profile.mjs`
- `apps/office/src/supabase-api.mjs`
- `apps/office/src/worker.mjs`
- `apps/office/tests/customer-profile-rls.test.mjs`
- `apps/office/tests/customer-profile-ui.test.mjs`
- `apps/office/tests/customer-profile.test.mjs`
- `apps/office/tests/runtime/customer-profile.test.mjs`
- `apps/office/tests/stability.test.mjs`
- `apps/portal/supabase/migrations/202609280001_complete_customer_profile.sql`
