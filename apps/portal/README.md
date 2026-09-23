# Mijn Destination Known

Lokale PWA-MVP van het beveiligde klantportaal van Destination Known Administraties. Ondernemers beheren hier facturen, documenten, gesprekken, afspraken, rapportages en aangiften zonder de complexiteit van een boekhoudpakket.

## Techniek

- Next.js/Vinext, React 19 en TypeScript
- Server-rendered sessiecontrole met httpOnly cookie
- Centrale TypeScript-domeinmodellen en lokale seedrepository
- Veilige PWA-service worker: uitsluitend manifest en merkiconen worden gecachet
- Responsive app-shell voor telefoon, tablet en desktop

## Starten

Vereist Node.js 22.13 of hoger.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. De eigenaar van de ene demo-onderneming gebruikt `demo@destinationknown.test`; financieel medewerker Sanne gebruikt `ed@example.test`. Het wachtwoord is steeds `Welkom2026!`. Dit zijn fictieve lokale gegevens en iedere persoon heeft een eigen account en sessie.

## Kwaliteitscommando's

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Structuur

- `app/` — serverpagina, API-routes, metadata en styling
- `components/` — login, portaalmodules en PWA-registratie
- `lib/models.ts` — centrale domeinmodellen en berekeningen
- `lib/access.ts` — memberships, rollen, permissies en veilig herstel van de actieve context
- `components/user-management.tsx` — uitnodigingen, rollenmatrix en toegangsgebeurtenissen
- `lib/seed.ts` — fictieve data voor één tenant
- `public/` — manifest, iconen en strikt statische service worker
- `tests/` — berekenings- en isolatiechecks

## Installatie, communicatie en facturatie

De PWA-installatieknop past zich aan desktop, Android en iOS aan. Een al geïnstalleerde app toont de knop niet opnieuw. De service worker bewaart alleen veilige statische shellbestanden; API-antwoorden, klantgegevens en documenten worden nooit gecachet. Bij een verbroken verbinding verschijnt een duidelijke offlinemelding.

**Communicatie** bevat een filterbare inbox, nieuwe berichten en verzoeken, een klantveilige tijdlijn, antwoorden met gevalideerde bijlagen, leesstatus en dossierstatus. Interne Office-notities worden centraal uit de klantweergave gefilterd. Mutaties gebruiken een idempotentiesleutel en server-side organisatie- en rechtencontrole.

**Facturen** bevat een facturatieprofiel met logo, vijf fictieve debiteuren, een mobiele stappenflow voor factuurregels en centrale berekeningen voor korting, btw en KOR. Alleen de server kent definitieve nummers toe. Definitieve facturen, creditnota's en PDF-downloads controleren opnieuw sessie, organisatie en rechten. De demo bevat concept-, verzonden, betaalde, vervallen en gecrediteerde voorbeelden.

De lokale PDF-generator levert echte PDF-bytes met verplichte factuurgegevens en paginanummers. Productie moet logo's, bijlagen en PDF's in private objectopslag bewaren en downloads uitsluitend via kort geldige, geautoriseerde links aanbieden.

## Beveiligingsmodel

De rootpagina controleert de httpOnly ontwikkelsessie server-side. Een gebruiker heeft via `Membership` toegang tot nul, één of meer `Organization`-records, met per onderneming een eigen `Role`. De actieve context wordt als httpOnly voorkeur bewaard, maar iedere serverroute valideert die opnieuw tegen een actieve membership. Mutaties controleren ook de rol, het organisatie-ID in het pad en het organisatie-ID in de requestbody. De service worker negeert pagina's, API-antwoorden, documenten, rapporten en persoonsgegevens. Zie `SECURITY.md`.

## Demo-onderneming

De demo bevat uitsluitend **Jansen Bouw B.V.** De bedrijfswisselaar wordt daarom niet getoond. Facturen, documenten, rapportages, aangiften, voertuigen en het bedrijfsprofiel zijn allemaal aan deze ene onderneming gekoppeld.

Onder **Instellingen → Gebruikers en bevoegdheden** kunnen eigenaars persoonlijke accounts en uitnodigingen beheren. De lokale MVP simuleert aflevering en acceptatie; uitnodigingsstatus, vervaldatum, rollen per onderneming, veilige standaardrechten en auditgebeurtenissen zijn wel gemodelleerd. De rollen zijn Eigenaar, Beheerder, Financieel medewerker, Documenten aanleveren, Alleen bekijken en Aangepaste rol.

De PostgreSQL/Supabase-versie moet RLS-beleid krijgen dat per query de ingelogde gebruiker koppelt aan een actieve membership voor `organization_id`. Voor mutaties controleert het beleid daarnaast de rol/permissie. Foreign keys en indexen uit `db/schema.ts` geven de bedoelde productiestructuur weer.

## Lokale MVP-beperkingen

Mutaties leven bewust alleen gedurende de geopende browsersessie. Uploads worden gevalideerd maar niet blijvend opgeslagen. Versturen, Office-antwoorden en e-mailnotificaties zijn simulaties. De ontwikkelsessie is geen productie-authenticatie en de demo-cookie is geen cryptografisch sessietoken.

## Richting productie en Supabase

1. Vervang auth door passkey/WebAuthn plus sterk wachtwoord, verplichte TOTP en recoverycodes.
   Geef iedere uitgenodigde gebruiker een eigen registratie, sessies, passkey/2FA en recoverycodes; deel nooit authenticatiemiddelen.
2. Bouw PostgreSQL-tabellen vanuit de centrale modellen; voeg overal `tenant_id` en `customer_id` toe.
3. Forceer Row Level Security op elk organisatieobject via `auth.uid()`, actieve membership, `organization_id` en benodigde rol; test positieve én negatieve toegang.
4. Vervang de seedrepository door Supabase-repositories achter dezelfde servicegrenzen.
5. Gebruik private buckets, server-side uploadvalidatie en korte signed download-URL's.
6. Laat Destination Known Office dezelfde database, autorisatieregels en auditlog gebruiken. Office krijgt medewerkersrollen; het portaal klantrollen.
7. Sluit Microsoft Graph, bankkoppelingen, SBR/Digipoort en EmailJS via adapters aan. E-mail bevat alleen een neutrale melding.
   Koppel ook uitnodigingsmails met een eenmalig, gehasht en vervallend acceptatietoken.
8. Voeg rate limiting, CSRF-bescherming, secrets management, monitoring, back-ups en onafhankelijke securitytests toe.

De modellen bevatten klant, onderneming, gebruiker, factuur, factuurregel, debiteur, document, transactie, documentverzoek, conversatie, bericht, afspraak, tijdslot, rapportage, aangifte, notificatie, voertuig en auditgebeurtenis. Daardoor kan Office later dezelfde contracten gebruiken.

## Verzekeringen via Klaas Vis

De conditionele verzekeringsmodule verschijnt alleen bij een gecontroleerde verzekeringsrelatie of lopende aanvraag én een afzonderlijke gebruikersbevoegdheid. De lokale demo bevat twee fictieve zakelijke verzekeringen voor Jansen Bouw B.V.; privépolissen worden nooit met de bedrijfsadministratie vermengd. De eigenaar kan polissen, documenten, wijzigingen, schades, berichten en adviesaanvragen gebruiken. De financieel medewerker heeft uitsluitend expliciet toegekende lees- en documentrechten.

Klaas Vis blijft de herkenbare verzekeringsdienstverlener en leidende bron. `lib/insurance.ts` bevat de centrale modellen, lokale fictieve data, relatiecontrole en adapterverwijzingen naar ANVA/DDI. Polisdocumenten worden alleen via een serverroute met sessie-, organisatie- en rechtencontrole opgehaald en krijgen `no-store`-headers. De lokale download is een veilige MVP-simulatie; productie vereist private R2- of DDI-opslag, kort geldige downloads, D1-persistentie en een echte Klaas Vis-integratie.

Destination Known Office ontvangt uitsluitend beperkte zakelijke administratieve signalen. Persoonlijke polissen, schadedossiers, medische informatie en verzekeringsinhoud worden niet automatisch gedeeld.
