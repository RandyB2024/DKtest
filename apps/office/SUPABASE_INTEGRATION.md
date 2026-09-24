# Supabase-integratie Office — fase 1

## Werkelijke scope

Supabase login/logout, sessieherstel, TOTP-enrollment en verificatie werken via de gebruikerssessie. Een actief profiel, actief office_membership, Office-rol en AAL2 zijn verplicht voordat bedrijfsgegevens worden getoond. Klantrelaties en ondernemingen worden rechtstreeks uit Supabase gelezen. Jansen Bouw Test B.V. verschijnt wanneer dit bestaande, niet-gearchiveerde record in het gekoppelde testproject staat; de naam of inhoud wordt niet hardcoded of opnieuw geseed.

Overzicht, klantenlijsten en details zijn alleen-lezen. Administratie, boekingen, aangiften, werkvoorraad, documenten, uploads, PDF-downloads, communicatie, audit en instellingen zijn nog niet gemigreerd. Hun oude API-acties leveren na autorisatie NOT_MIGRATED op. Er is geen gesimuleerde succesvolle opslag.

## Exacte lokale configuratie

Gebruik Node >=22.13.0. Maak apps/office/.env.local op basis van .env.example. Dit bestand wordt genegeerd door Git.

| Variabele | Waarde |
| --- | --- |
| SUPABASE_URL | HTTPS-project-URL van hetzelfde bestaande testproject als apps/portal, zonder pad |
| SUPABASE_PUBLISHABLE_KEY | Publishable key van dat project, beginnend met sb_publishable_ |
| OFFICE_ORIGIN | http://127.0.0.1:4173 |
| PORT | 4173 |
| ALLOW_DEVELOPMENT_AUTH | false |

NEXT_PUBLIC-variabelen zijn voor Office niet nodig. Geen service-role-key, SESSION_SECRET of wachtwoord toevoegen. De CLI leest .env.local bij opstarten; herstart na wijzigingen. Een andere poort of localhost in de browser vereist een overeenkomstige OFFICE_ORIGIN. Bestaande procesvariabelen kunnen lokale configuratie beïnvloeden; verwijder oude development-auth-instellingen. In productie zijn NODE_ENV=production en een expliciete HTTPS-origin verplicht.

Vanuit apps/office: npm ci, daarna npm start. De server bindt aan 127.0.0.1.

## Handmatige stappen in het bestaande Supabase-testproject

Deze stappen zijn nog niet op afstand uitgevoerd. Deel geen sleutels of wachtwoorden in het rapport of de chat.

1. Controleer het bestaande project en de migratiehistorie. 202609230001 en 202609240001 moeten al toegepast zijn. Niet resetten, seeden of opnieuw toepassen.
2. Bekijk apps/portal/supabase/migrations/202609240002_office_phase1.sql. Vanuit de reeds aan het juiste testproject gekoppelde apps/portal-directory: voer supabase db push --dry-run uit. Alleen de nieuwe migratie mag klaarstaan. Bij een afwijkende historie eerst stoppen en onderzoeken.
3. Pas daarna uitsluitend deze migratie toe met supabase db push. Alternatief: voer de inhoud van deze nieuwe migratie één keer uit in de SQL Editor van het gecontroleerde testproject en beheer de migratiehistorie consequent met de gekozen werkwijze. Gebruik geen database-reset.
4. Controleer via het beheerdersdashboard dat het bestaande Office-account een actief profiles-record, een actief office_membership en een gekoppelde rol met scope office heeft. Het klantaccount heeft uitsluitend zijn organization_membership; geef dit account geen Office-rol.
5. Controleer dat TOTP-MFA in Supabase Auth beschikbaar is. Meld lokaal aan met het bestaande Office-account en voltooi zelf enrollment/verificatie met de authenticator. Er worden geen bestaande geverifieerde factoren verwijderd.
6. Controleer dat Jansen Bouw Test B.V. niet gearchiveerd is en bij de verwachte customer_relationship hoort. Gebruik bestaande testdata; voeg geen echte klantdata toe.

De migratie voegt uitsluitend policies toe. Eigen Office-membership/rol zijn bij AAL1 leesbaar voor bootstrap. Bedrijfsreads vereisen AAL2; normale Office-writes zijn geblokkeerd, ook buiten de HTTP-server. Bestaande klant-RLS blijft intact. Later gemigreerde modules moeten hun specifieke schrijfrestricties vervangen met geteste rol-, veld- en organisatiecontroles.

Het bestaande is_office_user()-model geeft actieve Office-medewerkers kantoorbrede leestoegang. Er is geen bestaande toewijzing per medewerker aan ondernemingen. Een andere zichtbare onderneming kiezen is binnen dit model geautoriseerd; ongeldige, ontbrekende, gearchiveerde of door RLS verborgen IDs geven geen toegang. Voor beperktere medewerkerrollen is later een expliciet autorisatiemodel nodig.

## Lokale acceptatie met echte testaccounts

1. Start Office met de bovenstaande variabelen. Log in als Office-medewerker. Zonder MFA mag alleen het MFA-scherm zichtbaar zijn; /api/clients moet AAL1 weigeren.
2. Voltooi TOTP. Controleer medewerkernaam, Jansen Bouw Test B.V., relatielijst en ondernemingsdetail. Vernieuw de pagina: de sessie blijft geldig.
3. Open alle andere navigatieonderdelen: een Nederlandse melding geeft aan dat deze nog niet gemigreerd zijn. Er mogen geen lokale democijfers, uploads of geslaagde schrijfacties verschijnen.
4. Meld af en vernieuw de pagina. De login verschijnt opnieuw; beschermde API-routes leveren zonder cookie 401.
5. Probeer het klantaccount in Office: geen toegang. Controleer hetzelfde account in apps/portal volgens de bestaande portaalhandleiding; de eigen onderneming blijft toegankelijk en vreemde organisatie-IDs blijven geweigerd. Office-logout mag het portaal niet uitloggen.
6. Controleer in een beheerde testsessie een tijdelijk inactief Office-membership of geblokkeerd profiel: de volgende API-aanvraag moet weigeren. Herstel de teststatus daarna via het beheerdersdashboard.
7. Test ongeldige en niet-zichtbare organization_id-waarden in URL, query en requestbody. Zij mogen geen extra gegevens of schrijfbevoegdheid opleveren.

De geautomatiseerde tests voeren deze beveiligingsgevallen uit met synthetische accounts; echte remote Auth, TOTP-beleid, projectinstellingen en Jansen-data moeten nog met bovenstaande stappen worden bevestigd.

## Verificatie

apps/office: npm test. apps/portal: npm test, npm run typecheck, npm run lint, npm run build. De Office-RLS-test voert alle drie migraties uit in PGlite, behoudens de niet-beschikbare pgcrypto-extensiedeclaratie; PostgreSQL gen_random_uuid is daar al aanwezig. Dit bewijst lokale policywerking, niet de actuele configuratie van het remote project.

## Hostingvervolg

De huidige Node-server is geen rechtstreeks inzetbare betrouwbare Cloudflare Worker. Workers ondersteunen inmiddels Node HTTP via een adapter en node:fs via een virtueel bestandssysteem; dit maakt lokale uploads, PDF-bestanden, in-memory domeindata en oude processessies niet duurzaam. Zie de officiële [HTTP-documentatie](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/) en [filesystemdocumentatie](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).

De kleinste veilige volgende stap is eerst bovenstaande remote acceptatie, daarna een apart beoordeelde Node 22+-dienst achter een HTTPS-reverse-proxy, met development-auth uit, gecontroleerde origin en uitsluitend deze read-only fase. De huidige loopbackbinding past achter zo'n proxy; een containerplatform kan een expliciete bind-configuratie vereisen. Configureer secrets via de hostingomgeving en test cookies, proxyheaders, rate limiting en bereikbaarheid. Er is nu geen provider gekozen of deployment uitgevoerd.

Voor verdere modules zijn duurzame Supabase-opslag, private objectopslag en expliciete autorisatie vereist. Pas daarna is een Worker-adapter met aparte integratie- en deploymenttests een geschikte vervolgstap. Microsoft/OIDC en WebAuthn zijn in deze fase niet geïmplementeerd.
