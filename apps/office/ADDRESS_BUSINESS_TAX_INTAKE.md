# Adres-, ondernemings- en fiscale intake

Geïmplementeerd en lokaal gecontroleerd op feature/address-business-tax-intake, 29 september 2026. Niets remote toegepast, gedeployed, gecommit of gepusht. Dit document vervangt de onderzoeksnotitie die vóór implementatie is geschreven. Alle zeven bestaande migraties zijn byte-voor-byte behouden.

## Datamodel en bestaande gegevens

Bestaande getypeerde Office-profieltabellen, versiecontrole en audit blijven leidend. Geen tweede fiscale administratie, automatische backfill of standaard false voor onbekende antwoorden.

| Sectie | Hergebruik | Uitbreiding |
| --- | --- | --- |
| Onderneming | Naam, officiële naam, KvK, vrije bezoek-/postadressen | Gestructureerde bezoek-/postadressen; bron, handmatig aangepast, postadres gelijk, servervastgelegde controlemetadata |
| Administratie | Bestaande interne sectie | Voertuigen, pand en minimale Klaas Vis-opgave |
| Winstbelasting | income_tax, bestaande attention | Onbekend, ingangsdatum, expliciete bevestiging, servervastgelegde bevestiger/tijdstip |
| Omzetbelasting | vat_id, tax_number, vat_period, filing_start, icp, oss | Canonieke btw-status, ingangsdatum en afzonderlijke fiscale eenheid btw |
| Overige fiscaliteit | Loonheffingennummer/-periode, boekjaar, gebroken boekjaar, adviseur | Loonheffingen van toepassing, dividendbelasting, fiscale eenheid VPB, overige verplichting, verantwoordelijke |

Gebruikersbesluit: bestaand fiscal_unity blijft **historisch en ongespecificeerd**. Het is zichtbaar maar niet meer bewerkbaar. Nieuwe btw- en VPB-keuzes blijven onbekend tot handmatige beoordeling; geen omzetting van oude true/false-waarden.

### Velddefinities

- Adressen: prefix visit_ of postal_ met country (2 hoofdletters), postcode, house_number, addition (maximaal 20 tekens), street/city/municipality (maximaal 200), bag_id (16 cijfers), source (manual/pdok_suggestion), nullable manual. Nederlandse postcode wordt genormaliseerd; Nederlands huisnummer 1–99999. Buitenlandse adressen blijven tekst. postal_same=true kopieert de gestructureerde bezoekadresvelden. Vrije-tekstadressen blijven behouden, zonder parsing.
- Bron/handmatige wijziging zijn **Office-opgaven**. visit_checked_at, postal_checked_at en address_reviewed_at/by worden server-side bij adresbewerking vastgelegd: Office-controletijden, geen ondertekend bewijs van providerverificatie of klantidentiteit.
- vehicles/premises: nullable boolean. vehicle_count: positief indien ingevuld bij ja, maximaal 100000. vehicle_use: owned/financial_lease/operational_lease/mixed/unknown. premises_use: rented/owned/mixed/borrowed/other/unknown; premises_same: nullable boolean. Toelichtingen maximaal 2000 tekens.
- klaas_vis: yes/no/unknown/to_check; insurance_notes maximaal 2000 tekens. Interne opgave, geen polisnummers, dekking, premies, koppeling, externe verificatie of gegevensdeling.
- income_tax: income_tax/corporate_tax/not_applicable/unknown; income_tax_start: datum. Wijziging vereist expliciete income_tax_confirm=true in hetzelfde verzoek. income_tax_confirmed_by/at komen uit de database. Een oude bevestiging autoriseert geen nieuwe keuze.
- vat_status: regular/kor/exempt/mixed/not_liable/unknown; vat_status_start: datum. vat_period: month/quarter/year/not_applicable/unknown. Identificatienummers blijven tekst.
- vat_unity, vpb_unity, payroll_obligation, dividend_tax: nullable boolean. other_obligations maximaal 1000 tekens. tax_responsible_id: actieve Office-medewerker. Bij nieuwe intake is de huidige gebruiker het duidelijk vermelde uitgangspunt; daarna wijzigbaar in het dossier.
- Afhankelijke voertuig-, pand- en loonheffingenperiodevelden worden na bevestiging gewist wanneer de hoofdkeuze niet langer ja is. De database weigert verborgen oude vervolgwaarden. Onbekend wordt nooit als nee geïnterpreteerd.

KOR betreft uitsluitend omzetbelasting en verandert income_tax nooit. Rechtsvormsuggesties zijn alleen voorstellen, geen opgeslagen fiscale beslissing. Permanente KOR-melding; KOR met periodieke aangifte geeft een waarschuwing, geen verbod op uitzonderingen. Een expliciete nieuwe btw-status synchroniseert oude kor/vat_liable waar eenduidig; geen automatische migratie. Oude flags zijn daarna niet afzonderlijk wijzigbaar.

## Interface en opslag

Zes wizardstappen: zoeken, bron controleren, adres, onderneming/bedrijfsmiddelen, fiscaliteit, bevestigen. Teruggaan behoudt invoer in geheugen; geen localStorage. Adresresultaten worden expliciet gekozen en gecontroleerd. Geen resultaat of providerstoring laat handmatige invoer beschikbaar.

Het dossier gebruikt dezelfde velden/validatie in Onderneming, Administratie en Fiscaal. Groepen, conditionele velden, bevestigingsdialoog voor wissen en meldingen passen in de bestaande UI. Alle acht onderdelen blijven bereikbaar; KvK-nummer blijft beschermd. Historie bevat veilige veldnamen, geen gevoelige waarden.

Definitieve aanmaak haalt het KvK-profiel opnieuw op en schrijft relatie, onderneming, intake en audits in één transactie. Validatie- of auditfouten rollen alles terug. Oud KvK-request zonder intake blijft werken.

## Rollen, beveiliging en privacy

| Actie/gegevens | owner/admin | accountant | handler/viewer | klant/anon |
| --- | --- | --- | --- | --- |
| Onderneming lezen | Ja | Ja | Bestaande toegestane secties | Geen Office-toegang |
| Fiscaal lezen | Ja | Ja | Nee | Nee |
| Interne bedrijfsmiddelen/Klaas Vis | Ja | Nee | Nee | Nee |
| Schrijven, bevestigen, adreslookup | Ja, verse MFA | Nee | Nee | Nee |

Actief profiel, actieve Office-membership, Office-scope en bestaande AAL2/TOTP-controle blijven vereist. Harde 86400-secondenlimiet, AAL1-bootstrap, isolatie, IDOR-controles, concurrency, RLS en portaltoegang blijven behouden. Passkeys uit; KvK testmodus. Persoonlijke accounts niet gewijzigd.

Geen brede directe writes. SECURITY DEFINER gebruikt vaste search_path=public, expliciete autorisatie en grants/revokes. Audit en mutatie transactioneel; alleen actor, object, relatie/organisatie, actie/resultaat en gewijzigde veldnamen. Geen volledige adressen, fiscale nummers of toelichtingen in audit. Geen nieuwe logging van bodies, providerresponses, tokens of adresgegevens.

## PDOK-provider en configuratie

De [officiële PDOK-repository](https://github.com/PDOK/locatieserver) en [API-wiki](https://github.com/PDOK/locatieserver/wiki/API-Locatieserver) onderbouwen Locatieserver v3.1. Openbaar documentatievoorbeeld Europalaan 93, 3526KP Utrecht is via normale TLS geverifieerd: HTTP 200, één exact BAG-adresresultaat. Geen klantadres gebruikt.

Optionele niet-geheime instelling PDOK_API_BASE_URL=https://api.pdok.nl/bzk/locatieserver/search/v3_1. Dit is ook de standaard; uitsluitend deze exacte basis-URL is toegestaan. Geen sleutel nodig. Bestaande KvK/Supabase-configuratie blijft nodig; geen secrets nieuw aangemaakt of uitgelezen.

- Browser gebruikt eigen Office-API; server bouwt /free met vaste BAG/adres/postcode/huisnummerfilters.
- Gesloten unieke queryparameters; geen vrije providerquery of redirects.
- Timeout 7 seconden inclusief body; gestreamde response maximaal 64 KiB; maximaal 50 exacte kandidaten met schema-/adrescontrole.
- Cache maximaal 200 publieke adresresultaten, 5 minuten, zonder klant-/gebruikerskoppeling.
- Database-rate-limit 30 verzoeken per gebruiker per 60 seconden, gedeeld tussen Worker-instances, ook vóór cachehits. Alleen gebruiker, venster en aantal opgeslagen.
- Generieke 400/403/429/503/504-fouten, geen ruwe providerdata opgeslagen. Meerdere resultaten vereisen keuze.

[PDOK-servicevoorwaarden/FAQ](https://www.pdok.nl/veelgestelde-vragen-over-pdok-services): best effort. Controleer vóór live ingebruikname actuele BAG-metadata/licentie en toepasselijke servicevoorwaarden; voorkom overmatig gebruik. Handmatige invoer blijft fallback, ook voor buitenlandse adressen.

Service-worker-cacheversie ongewijzigd: gewijzigde Office-modules en Supabase-stijlen zitten niet in de shellcache. Worker-assetlijsten bevatten de twee nieuwe modules; gegenereerde assets blijven uitgesloten.

## API en databasefuncties

- Nieuw GET /api/addresses/lookup?postcode=1234AB&houseNumber=10&addition=A, achter bestaande Office-sessiecontrole, uniforme JSON-envelope en no-store.
- Bestaande KvK-aanmaakroute accepteert optioneel intake met uitsluitend company/administration/fiscal. Oude requests blijven ondersteund; geen browsergestuurde bevestigingsactor of KvK-bronvelden.
- Bestaande profielroutes behouden relatie-/organisatie-/sectie-/versiecontract met uitgebreide gesloten validatie.

Enige nieuwe migratie: apps/portal/supabase/migrations/202609280002_address_business_tax_intake.sql.

Functies:

- office_cp_schema(): uitgebreid gesloten veldschema.
- office_customer_profile_write(...): extra validatie/servermetadata; oude implementatie private office_customer_profile_write_v1(...), zonder EXECUTE voor public/anon/authenticated.
- office_create_relationship_from_kvk_intake(jsonb,jsonb,text,timestamptz,text,jsonb): transactionele uitgebreide intake.
- office_address_lookup_allow(): owner/admin-rate-limit; interne RLS-tabel office_address_lookup_limits zonder directe anon/authenticated-toegang.

Openbare schrijf-/lookup-RPC's: uitsluitend authenticated met herhaalde rol/MFA-controle. Oude policies blijven. Nullable kolommen, constraints en foreign keys behouden bestaande records.

## Exacte lokale testresultaten

| Controle | Resultaat |
| --- | --- |
| Office npm test | 171 geslaagd, 0 mislukt, 0 overgeslagen |
| Portal npm test | 138 geslaagd, 0 mislukt, 0 overgeslagen |
| Office npm run test:worker-runtime | 2 geslaagd, 0 mislukt, 0 overgeslagen; echte workerd |
| node --check | 18 gewijzigde/nieuwe JavaScriptbestanden geslaagd |
| Portal typecheck, lint, build | Geslaagd |
| Office build:worker | Geslaagd |
| Wrangler deploy --dry-run --outdir worker-build | Geslaagd; geen upload |
| git diff --check | Geslaagd |
| SHA-256 zeven oude migraties | Alle gelijk aan baseline |
| Gerichte geheimen-/bestandscontrole | Geen secretpatronen of uitgesloten bestanden in wijzigingsset |

Tests omvatten lokale PostgreSQL/RLS, directe writes, rollen, ontbrekende/verlopen/toekomstige MFA, isolatie/IDOR, concurrency, privacy en rollback bij validatie- én auditfout. Adrestests: normalisatie, toevoeging, nul/meerdere resultaten, timeout, omvang, ongeldige JSON, redirects/SSRF, rate-limit/cache. Wizard: zes stappen, teruggaan, bevestiging, conditioneel wissen. KOR en winstbelasting onafhankelijk.

Browser met synthetische lokale fixtures: volledige wizard, adreskeuze, fiscale validatie, opslaan/herladen en acht dossieronderdelen. Desktop 1440, tablet 768, mobiel 390 pixels zonder horizontale document-/dialoogoverflow. Dit bewijst UI-gedrag, geen live Supabase-opslag. Geen gesimuleerde opslag in productiecode toegevoegd.

## Afzonderlijke veilige migratie- en deploystappen

Onderstaande online stappen zijn NIET uitgevoerd en vereisen een afzonderlijke opdracht.

1. Review nieuwe SQL, grants, rollen en tests. Controleer oude hashes, herstel-/backupmogelijkheid en juiste projectidentiteit zonder secrets te tonen.
2. Vanuit apps/portal: supabase migration list --linked en supabase db push --linked --dry-run met bestaande veilig ingestelde CLI-authenticatie. Remote historie moet overeenkomen; uitsluitend 202609280002 mag wachten. Bij afwijking stoppen, geen repair/reset of oude migratie bewerken.
3. Pas na afzonderlijke goedkeuring die ene migratie toe. Controleer functies, privileges, constraints en bestaande gegevens met beperkte acceptatieaccounts. Nog geen nieuwe UI bij falende databasecontrole.
4. Bouw goedgekeurde Office-versie, herhaal Wrangler dry-run, controleer PDOK-configuratie, KvK-testmodus en passkeys uit. Daadwerkelijke Worker-deployment is een aparte geautoriseerde stap.
5. Voer onderstaande live acceptatie uit; alleen veilige foutcodes/aggregaten observeren, geen bodies of persoonsgegevens loggen.

### Openstaande live acceptatie

- Echte Supabase-sessies: owner/admin schrijven, accountant passende leesrechten, handler/viewer/klant geweigerd waar vereist.
- Directe PostgREST-, Storage- en RPC-toegang met ontbrekende/verlopen/toekomstige MFA; portal en login intact.
- Werkelijke Worker→PDOK-connectiviteit, toevoegingen/meerdere resultaten, gedeelde rate-limit en handmatige fallback.
- KvK-testaanmaak met volledige intake, reload, versieconflict en auditredactie; oude KvK-client bruikbaar.
- Historisch fiscal_unity onveranderd, nieuwe btw/VPB onbekend, vrije adressen behouden; uitsluitend synthetische testgegevens.
- Actuele providerlicentie/servicevoorwaarden en productie-observability beoordelen.

### Beperkingen en terugkeerplan

Geen belastingadvies, berekeningen, boekhoudmutaties, automatisering of verzekeringstoegang. PDOK-voorstel bewijst geen klantidentiteit of verzekeringsdekking. Historische fiscale gegevens vereisen handmatige beoordeling. Live Supabase/Cloudflare-acceptatie nog niet uitgevoerd.

Bij problemen eerder goedgekeurde applicatieversie terugzetten, nieuwe nullable data en audit behouden. Oude KvK-request is regressiegetest. Oudere profielclients kunnen bij historische fiscale-eenheidvelden of onbevestigde winstbelasting veilig geweigerd worden; volledige schrijfcompatibiliteit daarvan niet beloofd. Herstel via beoordeelde voorwaartse wijziging, geen destructieve down-migratie of bewerking van toegepaste migraties.

## Officiële fiscale bronnen

- [Belastingdienst: KOR](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/hoe_werkt_de_btw/kleineondernemersregeling/kleineondernemersregeling): btw-regeling, geen uitschakeling winstbelasting.
- [Belastingdienst: belastingplicht VPB](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/vennootschapsbelasting/belastingplicht_en_aangifte/).
- [Fiscale eenheid VPB](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/vennootschapsbelasting/fiscale_eenheid_vennootschapsbelasting/) en [fiscale eenheid btw](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/hoe_werkt_de_btw/voor_wie_geldt_de_btw/fiscale_eenheid/): afzonderlijke begrippen, geen historische mapping.

## Volledige gewijzigde bestandslijst

22 bestanden, relatief aan de repository:

- apps/office/.env.example
- apps/office/public/customer-profile.js
- apps/office/public/kvk-intake.js
- apps/office/public/profile-fields.js
- apps/office/public/supabase.css
- apps/office/scripts/build-worker-assets.mjs
- apps/office/src/config.mjs
- apps/office/src/kvk/intake.mjs
- apps/office/src/supabase-api.mjs
- apps/office/src/worker.mjs
- apps/office/tests/customer-profile-rls.test.mjs
- apps/office/tests/customer-profile.test.mjs
- apps/office/tests/helpers/profile-visual-fixture.mjs
- apps/office/tests/kvk-worker.test.mjs
- apps/office/tests/runtime/customer-profile.test.mjs
- apps/office/ADDRESS_BUSINESS_TAX_INTAKE.md
- apps/office/public/intake-fields.js
- apps/office/public/intake-form.js
- apps/office/src/addresses.mjs
- apps/office/tests/address-intake.test.mjs
- apps/office/tests/intake-wizard-ui.test.mjs
- apps/portal/supabase/migrations/202609280002_address_business_tax_intake.sql

Geen .env.local, .env.worker-secrets, node_modules, private-storage, outputs, worker-public of worker-build opgenomen. Lokale logs en builds blijven genegeerd. Geen nieuwe afhankelijkheden.

## Baseline bestaande migraties

SHA-256 van de lokale bytes bij aanvang van deze opdracht:

```text
202609230001_initial_test_foundation.sql 586a5f5f04a34e6646d7bac726948e60e5b115cf1e523e5d0a6339c2d654a2d7
202609240001_portal_auth_boundary.sql 26629a2430e22a076b32b293b61c85be05fcef16c13e0222dc3ffcded3c49d8b
202609240002_office_phase1.sql 94a84fd4b2314e552b246d69d3b73bff0f8868b1a5b1c4bc452be9fcc5a49de8
202609240003_office_customer_management.sql 902f6f6f3261fcb9a5def66ced81453b29a062e786df8e16b15b6d9f47e9dc1d
202609250001_trusted_mfa_sessions.sql 94d76bcd223178a9033ab03185c4fc70ace152b58ea5f40adbae3f05ebace177
202609270001_kvk_customer_onboarding.sql b13b69bbc5b6e104f210cc5b956d510cba5202bcdbbb0e5b11d0bd48fe7cb023
202609280001_complete_customer_profile.sql 177b92e259c77b2fd131a9de4897cf8d57b75951e89747e11de2cfb4ecf777e0
```

De laatste migratie heeft bij aanvang CRLF-regeleinden in de Windows-werkboom. De LF-versie in HEAD heeft hash `e96330815d114636f18397b8c13d30eac6fd5229dde689c709651fac11222542`, gelijk aan de eerder gerapporteerde inhoud. Geen regeleinden of andere bytes wijzigen in deze opdracht. Remote inhoud is niet benaderd of gewijzigd.

