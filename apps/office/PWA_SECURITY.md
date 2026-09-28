# Office beveiliging — Supabase fase 2A

Elke beveiligde API-aanvraag verifieert de Supabase-gebruiker, het actieve profiel, het actieve office_membership, de rol met scope office en is_office_user(). Bedrijfsgegevens vereisen AAL2. Login, status en MFA gebruiken alleen de minimaal noodzakelijke AAL1-bootstrap; een klantaccount komt daar niet doorheen.

De server gebruikt de gebruikerssessie en de publishable key, nooit een service-role-key. RLS vormt de tweede grens. Geblokkeerde profielen en ingetrokken memberships worden bij de volgende aanvraag geweigerd. De bestaande Office-rol is globaal binnen het kantoor; deze fase introduceert geen toewijzing per medewerker of onderneming.

De afzonderlijke dko-supabase-auth-cookie is HttpOnly, SameSite=Strict en in productie Secure. De cookie heeft Max-Age=86400. De afzonderlijke harde MFA-grens is laatste gevalideerde TOTP-timestamp + 86400 seconden; refresh kan deze grens niet verlengen. Logout beëindigt de lokale Supabase-sessie en verwijdert Office-cookies. Reeds uitgegeven bearer access tokens kunnen technisch tot hun vervaldatum bestaan; deel of log ze nooit. Portal-cookies worden niet gewist. Clear-Site-Data wordt daarom niet gebruikt.

Muterende auth-aanvragen vereisen de exacte OFFICE_ORIGIN en weigeren cross-site requests. De frontend bewaart geen tokens in localStorage en toont geen sleutels. API-antwoorden en MFA-materiaal zijn no-store. Wachtwoorden worden na verzending uit het formulier verwijderd. Bij verlies van toegang wordt de klantweergave gewist.

De service worker cachet alleen toegestane openbare assets en de offlinepagina. Auth-, API-, document- en downloadverkeer wordt niet gecachet. De actieve Supabase-JavaScriptcode en beschermde HTML worden via het netwerk geladen. Oude caches worden bij activatie verwijderd.

Klantbeheer loopt via zes transactionele RPCs voor owner/admin met vaste velden en atomair audit. Private helpers zijn niet uitvoerbaar door authenticated. Alle niet-gemigreerde bedrijfsacties worden server-side geweigerd; de additieve migratie blokkeert tevens normale Office-schrijfaanvragen rechtstreeks via PostgREST en private Storage. Auth/MFA en de zes gecontroleerde klantbeheer-RPCs zijn de afgebakende uitzonderingen. Directe tabelwrites blijven geblokkeerd. Accountuitnodigingen en Auth Admin API blijven uitgeschakeld. De oude lokale sessie-, passkey- en vergrendellogica geldt alleen voor de expliciete lokale demo.

Hosting vereist HTTPS, NODE_ENV=production, ALLOW_DEVELOPMENT_AUTH=false, een expliciete HTTPS OFFICE_ORIGIN en de testprojectconfiguratie. Er is in deze opdracht niets gehost of op afstand gemigreerd.

## Vertrouwde TOTP-sessie: harde grens van 24 uur

MFA_TRUST_MAX_AGE_SECONDS heeft de vaste standaard 86400; alleen afwezig of exact de tekst 86400 wordt geaccepteerd. Elke andere waarde sluit toegang af (Office-configuratiefout bij starten, portal-configuratiefout/503). Er is geen instelbare verlenging: de database hanteert dezelfde vaste 86400 seconden. Geen nieuwe secrets nodig.

De server controleert auth.getUser() en gebruikt vervolgens auth.getClaims() voor gevalideerde JWT-claims, gebonden aan dezelfde gebruiker. Alleen aal=aal2 met een geldige amr-array en een succesvolle methode totp verleent toegang. Unix-timestamps moeten positieve gehele seconden zijn, niet in de toekomst liggen en binnen het veilige numerieke bereik vallen. Ontbrekende, misvormde of verlopen claims leiden tot MFA_REQUIRED. Geen tolerantietijd. De laatste totp-timestamp is leidend: nu < laatste_totp + 86400. Op exact 24 uur is toegang verlopen. iat, token_refresh, activiteit en nieuwe cookies tellen nooit als MFA.

De SDK-cookie heeft Max-Age=86400 en blijft HttpOnly, SameSite=Strict, Path=/ en Secure in productie. Refresh kan de sessiecookie opnieuw bewaren, maar nooit MFA-toegang verlengen. Een verlopen vertrouwde sessie kan alleen de minimale auth-bootstrap gebruiken om opnieuw TOTP te verifiëren. Na succesvolle verificatie geeft Supabase de nieuwe timestamp uit. Geen client-side trusted-vlag, localStorage, sessionStorage of extra leesbare auth-cookie.

Een nieuwe browser, incognitovenster of gewist cookieprofiel heeft geen sessie: eerst opnieuw aanmelden en daarna TOTP. Expliciet uitloggen of opnieuw aanmelden begint eveneens een nieuwe sessie. Office en portal behouden hun afzonderlijke cookienamen; vertrouwen geldt per Supabase-sessie, niet als apparaatregistratie of gedeelde cross-app bypass. Bestaande sessies met geldige claims werken tot hun oorspronkelijke deadline; zonder geldige TOTP-claim is opnieuw MFA nodig. Passkeys zijn standaard uitgeschakeld; de optionele eerste-factorintegratie hieronder behoudt TOTP.

De nieuwe additieve migratie 202609250001_trusted_mfa_sessions.sql versterkt has_aal2() zonder oude migraties of policies te verwijderen. Daardoor gelden dezelfde checks voor bestaande financiële/Storage-policies en Office-RPCs. Aanvullende restrictieve policies sluiten ook overige bedrijfsdata en ondernemingsnamen af. Eigen profiel, memberships en bijbehorende rollen blijven beschikbaar voor bootstrap; bedrijfsgegevens niet. Portal mfa_required=false is geen uitzondering meer. Rollen, actieve status en organisatiegrenzen blijven vereist.

Het harde autorisatiemoment is de serveraanvraag/SQL-statement. De UI controleert bestaande context periodiek en bij focus; reeds ontvangen weergavegegevens worden niet op afstand uit een screenshot of geheugen teruggenomen. Bij hervatten volgt de servercontrole. Er wordt niets offline opgeslagen.

### Later afzonderlijk controleren

Er is niets online toegepast. Vanuit apps/portal in het gecontroleerde bestaande testproject: eerst supabase migration list en supabase db push --dry-run. Alleen 202609250001_trusted_mfa_sessions.sql mag nieuw zijn als de vier eerdere migraties al zijn toegepast. Bij afwijkende historie stoppen; geen reset of repair. Controleer daarna in een apart geautoriseerd vervolg de nieuwe functie/policies en echte Supabase-AMR-claims rond een refresh. Geen bestaande migraties herschrijven.

De lokale tests controleren direct na MFA, 23:59, exact 24 uur, refresh zonder verlenging, malformed claims, herverificatie, een leeg cookieprofiel en directe RLS/RPC/Storage-toegang. Live testaccount- en projectacceptatie zijn niet uitgevoerd. Supabase-sessie-intrekking of een kortere ingestelde Auth-sessielimiet kan eerder opnieuw inloggen vereisen.

Bronnen: [gevalideerde JWT-claims](https://supabase.com/docs/reference/javascript/auth-getclaims) en [AMR/TOTP-claimdefinitie](https://supabase.com/docs/guides/auth/jwt-fields).


## Optionele passkey-login (25 september 2026)

Office en klantportaal ondersteunen nu passkeys als optionele eerste factor. Na een nieuwe passkey-login blijft TOTP nodig; dit is geen volledige Face ID-MFA. De harde 24-uursgrens en bestaande RLS/migraties zijn ongewijzigd. In Instellingen kunnen gebruikers eigen passkeys registreren, tonen en intrekken na TOTP jonger dan vijf minuten. Intrekken vereist ook een recent bewezen wachtwoordlogin en een nog geverifieerde TOTP-factor. Randy en Ed behouden afzonderlijke persoonlijke accounts.

`GET/POST /api/auth/passkeys` gebruikt Supabase Auth via de gewone server-side SDK. `PASSKEYS_ENABLED=false` is de veilige standaard. Voor latere ingebruikname zijn RP ID `testadmin.nl` en exacte HTTPS-origins vereist; registratie op een ander officieel domein moet mogelijk opnieuw. Er is geen nieuwe migratie en er is niets online ingesteld of toegepast.

Zie [de beveiligingsbeoordeling, het API-contract en de exacte configuratie-/acceptatiestappen](../shared/PASSKEY_SECURITY.md). Daar staan ook de beperkingen van de experimentele Supabase-API, directe Auth-aanroepen, herstel bij verlies en intrekking van reeds bestaande sessies. Uitnodigingen en Auth-gebruikersbeheer blijven uitgeschakeld. De monorepo-deployment moet `apps/shared/passkeys.mjs` meenemen; Office heeft geen bundelstap die dit bestand kopieert.


## KvK-gestuurde klantintake (27 september 2026)

Nieuwe klant gebruikt een vierstapswizard met officiële KvK-zoekresultaten, Basisprofielcontrole, handmatige klantgegevens en bevestiging. De server haalt het profiel vóór opslaan opnieuw op. Alleen owner/admin met bestaande verse TOTP mogen aanmaken; andere actieve Office-rollen mogen zoeken/controleren. Klantaccounts hebben geen toegang. Uitgeschreven/onbekende status en dubbele actieve KvK-nummers worden geblokkeerd.

De nieuwe additieve migratie `202609270001_kvk_customer_onboarding.sql` maakt een beperkte intake-RPC, een afgeschermde server-capability en een Office-only intake-momentopname mogelijk. Klant, onderneming en audit ontstaan in één transactie. Bestaande RPC-contracten blijven beschikbaar; dubbele KvK-nummers worden nu ook daar geweigerd. Er is geen boekhouding of uitnodigingsfunctie toegevoegd.

Configureer later `KVK_API_MODE=test`, `KVK_API_BASE_URL=https://api.kvk.nl/test/api` en uitsluitend Worker-secrets voor `KVK_API_KEY` en `KVK_INTAKE_RPC_KEY`. Die tweede capability voorkomt dat directe RPC-aanroepen een server-side KvK-controle kunnen veinzen; de database bewaart alleen de SHA-256 ervan. Zonder configuratie geen KvK-intake. De migratie moet vóór eventuele ingebruikname apart worden gecontroleerd en toegepast.

Zie [KvK-beveiligingsbeoordeling en configuratieprocedure](KVK_ONBOARDING.md) voor het volledige API-/databasecontract, secret-provisioning, duplicaatcontrole, tests en beperkingen. De KvK-wijziging is uitsluitend lokaal; niets online toegepast, gecommit, gepusht of gedeployed.

## Volledig klantprofiel (lokale featurebranch)

Zie [CUSTOMER_PROFILE.md](CUSTOMER_PROFILE.md) voor datamodel, rollenmatrix, interne velden, API, migratieprocedure, tests en terugkeerplan. De acht dossieronderdelen gebruiken de bestaande Office-sessie en 24-uurs-TOTP; alleen owner/admin schrijven. Accountant leest fiscale instellingen, handler/viewer alleen algemene gegevens. RSIN, interne contactopmerkingen, prijsafspraken, notities, audit en bankgegevens worden rolgericht afgeschermd, ook bij directe databaseaanroepen.

De nieuwe additieve migratie `202609280001_complete_customer_profile.sql` moet later apart worden gecontroleerd en toegepast vóór een eventuele Worker-uitrol. Bestaande migraties blijven ongewijzigd. KvK-nummers zijn na aanmaak alleen-lezen. De Worker bouwt ook `customer-profile.js` en `profile-fields.js`; dossierdata blijven network-only. Geen nieuwe secrets, passkeys, accountuitnodigingen of boekhoudautomatisering. Niets online toegepast, gecommit of gepusht.
