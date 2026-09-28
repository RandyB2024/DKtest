# Office klantenwerkruimte en dossierpresentatie

UI-vervolg op `feature/complete-customer-profile`, 28 september 2026. De bestaande dossierimplementatie was bij aanvang al aanwezig. Deze wijziging past uitsluitend presentatie, lokale UI-tests en de registratie van een statisch Worker-asset aan.

## Presentatie

Het dossier heeft een geïntegreerde header, statusbadge, relatienummer, KvK, verantwoordelijke en compacte aandachtspunten. Acht onderdelen gebruiken rustige navigatie, gegroepeerde leesweergaven en afzonderlijke bewerkdialogen. Desktop gebruikt twee veldkolommen, mobiel één. Lege groepen, brongegevens, interne onderdelen, bevestigingen, fouten en succesmeldingen hebben consistente opmaak. Lijsten tonen compacte samenvattingen met uitklapbare details. De bestaande autorisatie bepaalt nog steeds welke gegevens en acties beschikbaar zijn.

Het algemene overzicht toont één rij per klantrelatie met maximaal twee ondernemingssamenvattingen en een verwijzing naar overige ondernemingen in het dossier. Desktop gebruikt een tabel; tablet en telefoon compacte kaarten. Zoeken, status- en basisgegevensfilters, sortering en paginering met 10, 25 of 50 resultaten beperken de hoeveelheid gerenderde inhoud. Lange namen breken af binnen de beschikbare breedte. Dynamische tekst wordt via textContent toegevoegd, niet via HTML-interpolatie.

## Grenzen van het bestaande API-contract

Er is geen API-uitbreiding. De werkruimte gebruikt uitsluitend de bestaande `/api/clients`-response: relatienaam/status en ondernemingsnaam, officiële naam en KvK. Zoeken doorzoekt deze namen en KvK; een bestaande ondernemingsnaam kan als handelsnaam worden gevonden. Aanvullende KvK-handelsnamen worden niet opgehaald.

Relatienummer en verantwoordelijke ontbreken in deze response. Daarom zijn de overzichtskolommen leeg gemarkeerd en verwijst de interface naar het dossier. Zoeken op relatienummer en filteren op verantwoordelijke zijn hier nog niet mogelijk. Rechtsvorm- en dienstfilters zijn evenmin toegevoegd. Er worden geen volledige dossiers als workaround geladen en geen fiscale gegevens, IBAN's of interne notities in het overzicht geplaatst.

De indicatie “Basisgegevens” betreft uitsluitend naam, onderneming, officiële naam en KvK. Dit is geen volledige dossiercontrole. Zoeken, sorteren en pagineren werken tijdelijk client-side over de response die de bestaande API levert. Eventuele bestaande serverlimieten blijven gelden. Voor grotere volumes is in een afzonderlijke opdracht server-side zoeken/paginering met totalen nodig, plus een bewust ontworpen minimaal overzichtscontract voor verantwoordelijke, relatienummer en dossiercompleetheid. De huidige implementatie claimt niet dat zij een bestaande response-limiet omzeilt.

Toekomstige Cockpit-panelen voor taken, agenda en communicatie kunnen boven of naast de klantenwerkruimte aansluiten, onder dezelfde paginatitel. Er zijn geen nepgegevens, knoppen of functionaliteiten hiervoor toegevoegd.

## Validatie

- Alle Office-tests: 162 geslaagd, 0 mislukt, 0 overgeslagen.
- Worker-runtime-tests: 2 geslaagd, 0 mislukt, 0 overgeslagen.
- Nieuwe overzichtstests: 0, 1, 10, 50, 100 en 1000 synthetische klanten; zoeken, gecombineerde filters, sortering, paginering, paginagrootte, lege uitkomsten, archiefuitsluiting, veilige tekstweergave en minimale gegevensprojectie.
- Browsercontrole: datasets 0/1/10/50/100; filters en paginering; desktop 1440, tablet 768, telefoon 390 en extra smal 320 pixels. Alle acht dossieronderdelen op desktop en mobiel, lange namen, lege contactlijst, foutmelding en volle lijsten gecontroleerd. Bewerkdialogen op tablet en mobiel gecontroleerd. De gevonden headeroverflow op 320 pixels is hersteld en opnieuw gecontroleerd.
- Bestaande dossier-UI-test dekt laadstatus, lege toestand, fout/conflict, opslaan/herladen, succesmelding, annuleren en text-only rendering.
- Syntaxcontrole van alle zeven aanvullende JavaScriptbestanden geslaagd; Worker-build en Wrangler `deploy --dry-run` geslaagd. De dry-run meldt expliciet dat hij afsluit zonder deployment.
- `git diff --check` geslaagd. Gegenereerde Worker-assets, testlogs, node_modules, private-storage, outputs en `.env.local` staan niet in de aanvullende bestanden.

De browserfixture `tests/helpers/profile-visual-fixture.mjs` is alleen een lokale testserver met synthetische gegevens en transport. Start vanuit apps/office met `node tests/helpers/profile-visual-fixture.mjs 4191`. De testlogin is `office-fixture@example.invalid` / `visual-fixture-only`; dit zijn geen echte providercredentials. De fixture wordt niet opgenomen in de Worker-assets en is geen productiemodus of vervanging voor echte opslag.

## Integriteitscontrole en aanvullende bestanden

Vergeleken met de SHA-256-baseline aan het begin van de UI-opdracht zijn uitsluitend deze bestanden aanvullend gewijzigd/toegevoegd:

- `public/customer-profile.js`
- `public/client-workspace.js`
- `public/supabase-app.js`
- `public/supabase.css`
- `scripts/build-worker-assets.mjs`
- `src/worker.mjs`
- `tests/client-workspace.test.mjs`
- `tests/helpers/profile-visual-fixture.mjs`
- `CUSTOMER_UI.md`

De Worker-bron en buildregistratie veranderen uitsluitend door toevoeging van `client-workspace.js` aan hun assetlijst; dit is afzonderlijk tegen de baseline geverifieerd. Alle API-, database-, rol-, MFA-, RLS- en bedrijfslogica en gedeelde veldvalidatie zijn ongewijzigd. De overige reeds aanwezige werkboomwijzigingen horen bij de eerdere dossierimplementatie.

Migratie `202609280001_complete_customer_profile.sql` is byte-voor-byte ongewijzigd. SHA-256 voor en na: `e96330815d114636f18397b8c13d30eac6fd5229dde689c709651fac11222542`. Er is geen nieuwe migratie gemaakt. De service worker blijft ongewijzigd ten opzichte van de UI-baseline: de gewijzigde CSS/JS-assets behoren niet tot de gecachete SHELL-lijst en worden via het netwerk geladen. Een extra cacheversie is daarom niet nodig.

KvK blijft in testmodus; passkeys blijven uit. Niets online toegepast, gedeployed, gecommit of gepusht.
