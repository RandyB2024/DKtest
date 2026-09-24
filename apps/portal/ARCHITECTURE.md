# Portaalarchitectuur

## Actieve verticale basis

Supabase PostgreSQL is de bron voor profiel, memberships, klantrollen en ondernemingen. Supabase Auth levert identiteit, sessies en TOTP MFA. Office blijft een afzonderlijke applicatie en is hier niet gewijzigd.

De pagina `app/page.tsx` rendert een publieke shell zonder klantdata. `components/portal-entry.tsx` vraagt `GET /api/context` op. Alleen de serverroute valideert identiteit en toegangsrechten en stuurt vervolgens de minimaal benodigde data. Bij focus en iedere minuut terwijl de pagina zichtbaar is wordt de context opnieuw gecontroleerd. Alle individuele API-aanvragen blijven afzonderlijk autoriseren.

Deze bewuste BFF-opzet vermijdt cookies schrijven vanuit React-servercomponenten en verschillen in middleware/proxy-ondersteuning tussen Next en vinext. Vernieuwing loopt via routehandlers, waar Set-Cookie altijd op de response wordt gezet, ook bij foutantwoorden.

## Bestandsgrenzen

- `lib/supabase/config.ts`: valideert uitsluitend de twee publieke variabelen.
- `lib/supabase/server.ts`: nieuwe SDK-client per request, chunked cookie getAll/setAll en no-store.
- `lib/supabase/browser.ts`: anonieme browserclient zonder persistente sessie. Aangemelde clientcomponenten gebruiken de eigen API; deze client krijgt geen HttpOnly sessie.
- `lib/portal-access.ts`: getUser, profielstatus, actuele klantmemberships, organisaties en AAL2.
- `lib/portal-api.ts`: origincontrole, begrensde JSON-aanvragen, algemene fouten en afgesloten oude modules.
- `app/api/auth/*`: login, logout en MFA.
- `app/api/context`: read-only profiel/memberships/organisatiebasis en gevalideerde contextvoorkeur.
- `app/api/organizations/[organizationId]`: geautoriseerde organisatiequery; wijzigingen nog gesloten.
- `components/portal.tsx`: bestaande shell/stijlen, werkend profiel en organisaties, expliciete migratiemeldingen.

De browser bepaalt nooit de identiteit. `mdk_active_org` blijft een HttpOnly **voorkeur**, geen toegangsbewijs. POST valideert het aangeleverde ID strikt (403 bij manipulatie); GET herstelt een achterhaalde voorkeur naar een actuele toegestane context. "Alle" bevat uitsluitend de afzonderlijk geautoriseerde ondernemingen.

## Historische onderdelen

`lib/session.ts` is verwijderd. `db/index.ts` verwijst naar Supabase, niet D1. `db/schema.ts`, `drizzle/` en `examples/d1` zijn historische ontwerpmaterialen en geen actieve database-integratie.

`lib/access.ts`, `lib/seed.ts` en de oude modulecomponenten worden uitsluitend nog door historische domein-/fixturepaden gebruikt. De actieve importgraaf wordt getest op afwezigheid van deze demo-autorisatie en demodata. Oude demo-e-mailadressen zijn uit de accountfixtures verwijderd.

## Databasegrens

De basismigratie blijft ongewijzigd. `202609240001_portal_auth_boundary.sql`:

1. Controleert start- en einddatum, actief profiel, klantrol, actieve klantrelatie en niet-gearchiveerde onderneming.
2. Controleert voor Office expliciet de Office-rolscope, zonder portaaltoegang uit Office-memberships af te leiden.
3. Schakelt RLS in op aanvullende referentietabellen en geeft uitsluitend leesrechten op de eigen gebruikte klantrollen.
4. Legt restrictieve grenzen op aan profiel-, membership- en organisatiequeries.
5. Blokkeert klantmutaties in niet-gemigreerde tabellen en vier Storage-buckets, ook via rechtstreekse API-aanroepen.
6. Behoudt/versterkt AAL2 voor financiële tabellen, documenten en factuurregels.

De mutatieblokkades beperken gewone klantaccounts. Bestaande afzonderlijk bevoegde Office-gebruikers krijgen hierdoor geen nieuwe permissieve rechten. Een beheerder met beide accounttypen behoudt bestaande Office-databaserechten; ken geen Office-membership aan een gewone klant toe.

## Concreet vervolgplan

| Module | Werk vóór herinschakelen |
| --- | --- |
| Facturatie en debiteuren | Supabase-repository, rolpermissies, transactionele nummering, unieke/idempotente finalisatie, betalingen en audit; vervang daarna uitsluitend bijbehorende mutatieblokkades. |
| Documenten | Private Storage-upload, inhouds-/typecontrole, malwarecontrole, metadata, AAL2 en kort geldige geautoriseerde downloads; cross-tenant- en bestandsacceptatie. |
| Dashboards en rapportages | Query's op gemigreerde financiële bronnen, periodefilters, centenberekeningen, correcte som per geautoriseerde onderneming en AAL2. |
| Communicatie | Conversaties/deelnemers, uitsluitend klantzichtbare berichten, verbod op interne inserts, idempotentie, bijlagen, audit en echte verzending. |
| Verzekeringen | Afzonderlijk geverifieerde relatie, eigen bevoegdheden, privacyscheiding, databasecontract en gecontroleerde Klaas Vis-adapter. |
| Agenda | Afspraken, tijdoverlap-/tijdzonevalidatie en rolgebonden wijzigingen. |
| Aangiften en voertuigen | Ontbrekende tabellen/contracten, eigenaarschap, bewaartermijnen en expliciete goedkeuringsflows. |
| Notificaties | Persoonlijke query en beperkte read-statusupdate; geen brede profiel-/notificationupdates. |
| Profiel en gebruikersbeheer | Veldbeperkte profielupdates, persoonlijke uitnodigingen, veilig acceptatieproces, rolbeheer en laatste-eigenaarcontrole; bevoorrecht beheer in een afzonderlijke serverdienst. |
| Office | Eigen app-auth, Office-rollen/permissies en onafhankelijke acceptatietests; nooit klanttoegang afleiden uit Office-rechten. |

Per module: eerst migratie + repositories + negatieve RLS-tests, daarna API en UI samen aansluiten. Geen mix van online lezen en lokale schrijfsimulaties.