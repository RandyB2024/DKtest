# Passkeys: beveiligingsbeoordeling en ingebruikname

Onderzocht op 25 september 2026, branch `feature/passkey-login`. Niets online ingesteld, toegepast, gecommit of gepusht.

## Besluit

Passkeys zijn een optionele eerste inlogfactor voor Office en klantportaal. Na een nieuwe passkey-login blijft TOTP verplicht. Dit is **geen volledige Face ID-MFA** en geen vervanging van de bestaande 24-uurscontrole. Wachtwoord plus TOTP blijft de terugval. Face ID, Touch ID, Windows Hello of een apparaat-PIN worden door browser/apparaat gekozen; de app ontvangt geen biometrie of private sleutel.

Supabase documenteert eerste-factorpasskeys als experimenteel. De huidige SDK in beide apps (2.117.1) bevat de benodigde `auth.passkey`-methoden. De tweede-factorvariant van WebAuthn is eveneens experimenteel. De officiële Auth-bron telt `MFAWebAuthn` als AAL2, terwijl eerste-factor `PasskeyLogin` geen AAL2-methode is. Een biometrische prompt impliceert dus geen AAL2. Bovendien verlangt onze ongewijzigde `has_aal2()` naast AAL2 een geldige `amr`-TOTP-timestamp van minder dan 86400 seconden oud. Ook een echte WebAuthn-AAL2-sessie zonder die TOTP-claim wordt geweigerd. Daarom wordt WebAuthn-MFA hier niet ingeschakeld.

Bronnen, momentopname; de experimentele API en de gehoste projectversie moeten bij ingebruikname opnieuw worden gecontroleerd:

- [Supabase passkeys: status, API en RP-configuratie](https://supabase.com/docs/guides/auth/passkeys)
- [Supabase MFA: TOTP stabiel, WebAuthn experimenteel](https://supabase.com/docs/reference/swift/auth-mfa-api)
- [Auth AMR: welke methoden AAL2 opleveren](https://github.com/supabase/auth/blob/master/internal/models/amr.go)
- [Auth: eerste-factorpasskey en sessie-uitgifte](https://github.com/supabase/auth/blob/master/internal/api/passkey_authentication.go)
- [Auth: beheer en eigen credentialcontrole](https://github.com/supabase/auth/blob/master/internal/api/passkey_manage.go)

## Toegangsgrenzen

- De server gebruikt de gewone publishable key, Supabase SSR-cookies en `getUser()` plus gevalideerde `getClaims()`. Er wordt geen Admin API of service-role gebruikt.
- De browser ontvangt alleen WebAuthn-opties, challenge-ID en beperkte metadata. Access-/refresh-tokens blijven in HttpOnly-cookies, SameSite=Strict, Path=/, Secure in productie. Geen localStorage/sessionStorage en geen logging van ceremonies, sleutels, cookies of tokens.
- Origincontrole, geen cache, actieve profielen, juiste persoonlijke memberships/rolscope en bedrijfs-RLS blijven gelden. Randy en Ed houden afzonderlijke accounts; de client kan geen user-ID voor beheer kiezen. Een passkey kan alleen de eigen accountidentiteit bewijzen, geen Office-rol verlenen.
- Voor tonen, registreren (ook bij voltooien) en verwijderen: geldige bestaande TOTP-toegang plus TOTP jonger dan vijf minuten. Token-refresh verandert de verificatietijd niet. Accountinstellingen bieden opnieuw verifiëren met de bestaande authenticator.
- Verwijderen vereist ook een ondertekende `password`-AMR-claim jonger dan vijf minuten en een nog geverifieerde TOTP-factor. Zo wordt een bewezen wachtwoord/TOTP-terugval behouden, ook bij verwijderen van de laatste optionele passkey. Bij aanwezige WebAuthn-MFA-factoren wordt verwijderen geblokkeerd: de upstream passkeylijst onderscheidt dergelijke credentials niet voldoende. De app biedt geen wachtwoord- of geverifieerde-TOTP-verwijdering.
- Challengecookies zijn per app gescheiden, HttpOnly en maximaal 300 seconden aanwezig, bij verificatie gewist en bij registratie gebonden aan de huidige gebruiker. Supabase controleert challenge, vervaldatum, ondertekening, RP en origin; de provider consumeert challenges eenmalig. De browser vraagt user verification en discoverable credentials, zonder attestation-identificatie.
- Geen nieuwe database-RPC of migratie nodig: native Supabase Auth beheert de passkeys. Alle vijf bestaande migraties blijven byte-ongewijzigd. De bestaande 24-uursmigratie moet wel aanwezig zijn voordat deze variant online gebruikt wordt.

De extra vijfminuten- en herstelcontroles beschermen **onze applicatieroutes**. De directe Supabase Auth-API hanteert upstream-autorisatie; deze applicatie kan daar geen eigen policy installeren. Het is onjuist om de vijfminutengrens als een projectbrede Supabase Auth-garantie te presenteren. Directe PostgREST/RPC/Storage-toegang blijft wél onder de bestaande database-RLS en de harde TOTP-grens vallen.

## API-contract

Beide apps: `GET /api/auth/passkeys` toont de eigen lijst na recente MFA. `POST /api/auth/passkeys` accepteert uitsluitend:

| action | Extra velden | Voorwaarde/resultaat |
| --- | --- | --- |
| authentication-options | geen | Openbare challenge voor optionele login |
| authentication-verify | challengeId, credential | Browserbinding plus Supabase-verificatie; authenticated/mfaRequired, nooit tokens |
| registration-options | geen | Actieve eigen identiteit, recente TOTP |
| registration-verify | challengeId, credential | Dezelfde identiteit en nog steeds recente TOTP |
| list | geen | Dezelfde controle als GET |
| delete | passkeyId | Eigen credential, recente TOTP én wachtwoord, herstelcontrole |

UUIDs worden gecontroleerd; onbekende velden worden geweigerd. De bestaande requestlimiet en JSON-foutstructuur blijven gelden (Office `{ok,data/error}`, portal gewone JSON/error). Veilige codes omvatten `PASSKEY_DISABLED`, `RECENT_MFA_REQUIRED`, `CHALLENGE_EXPIRED`, `PASSWORD_FALLBACK_REQUIRED`, `KEEP_RECOVERY` en `PASSKEY_FAILED`. Geen ruwe Supabase-foutberichten naar de gebruiker.

## Configuratie later, na afzonderlijke toestemming

1. Controleer in het bedoelde testproject de werkelijke Auth-versie, beschikbaarheid van Authentication > Passkeys en bestaande MFA/RLS-instellingen. Controleer migratiehistorie; pas hier niets toe. Als de 24-uursmigratie ontbreekt, behandel dat als aparte migratiecontrole, nooit als reden de controle te omzeilen.
2. Behoud TOTP enrollment/verify, wachtwoordlogin en afzonderlijke bevestigde persoonlijke accounts voor Randy en Ed. Zet experimentele WebAuthn-MFA enrollment/verify niet aan voor deze fase. Controleer bestaande Supabase-rate-limits. Als CAPTCHA verplicht is, is aanvullend CAPTCHA-transport nodig; deze versie faalt dan veilig en schakelt CAPTCHA niet uit.
3. Configureer Supabase eerste-factorpasskeys: RP ID exact `testadmin.nl`; weergavenaam `Destination Known`; RP origins uitsluitend de daadwerkelijk gebruikte exacte HTTPS-origins van Office en portal (geen wildcard, pad of trailing slash). Stel geen hypothetische subdomeinen in.
4. Stel per server `PASSKEYS_ENABLED=true`, `PASSKEY_RP_ID=testadmin.nl`, `PASSKEY_ORIGIN=<exacte HTTPS-origin van deze app>`. Office vereist dezelfde origin als `OFFICE_ORIGIN`. Laat `MFA_TRUST_MAX_AGE_SECONDS=86400` intact. De voorbeeldbestanden staan bewust op disabled. Ongeldige configuratie faalt gesloten.
5. Test met een persoonlijk testaccount eerst wachtwoord plus TOTP; registreer dan een passkey in Instellingen. Test uitloggen, passkey-login, verplichte TOTP, nieuw browserprofiel, intrekken, verkeerde rol en een vervallen TOTP-sessie. Controleer dat access-/refresh-tokens niet in JSON of browseropslag verschijnen. Log geen tokens tijdens deze controle.
6. Controleer via echte PostgREST-verzoeken met testaccounts dat AAL1 en AAL2 zonder verse TOTP geen zakelijke rijen/RPC-toegang krijgen; valideer ook precies 24 uur en refresh. Voer op Safari/iOS/macOS en Windows Hello de echte ceremonies uit. Deze online/apparaattests zijn nog niet uitgevoerd.

Een localhost-ceremonie kan niet namens `testadmin.nl` registreren. Voor werkelijke apparaten is een vertrouwde HTTPS-origin onder dat domein nodig. Bij verhuizing naar een ander officieel RP-domein moeten gebruikers opnieuw registreren. Gesynchroniseerde passkeys kunnen op een nieuw apparaat beschikbaar zijn, maar een nieuwe sessie moet nog steeds door TOTP.

## Testdekking en beperkingen

Lokale tests gebruiken de echte Supabase SDK en SSR-cookieverwerking met synthetische Auth-transportfixtures; zij bewijzen geen echte Face ID-handtekening of beschikbaarheid van het gehoste project. Afzonderlijke PostgreSQL/PGlite-tests voeren de echte migraties en RLS uit als de `authenticated`-rol van PostgREST. Zij testen AAL1/passkey, AAL2/WebAuthn zonder TOTP, verlopen TOTP, verse TOTP, RPCs en organisatie-isolatie; er wordt geen live PostgREST-server aangeroepen.

Verlies van alleen het passkeyapparaat: wachtwoord plus TOTP, daarna verloren passkey verwijderen. Zonder bruikbare TOTP blijft toegang geblokkeerd en is een aparte gecontroleerde herstelprocedure nodig. Intrekken voorkomt nieuwe passkey-logins; het beëindigt niet automatisch al uitgegeven sessies/JWTs op andere apparaten. Bestaande 24-uurs-RLS en sessielimieten blijven van kracht. Gedeelde/gekopieerde wachtwoorden of een elders verwijderd wachtwoord kan de app niet detecteren; de recente password-claim bewijst een succesvolle verificatie, niet bezit op elk toekomstig moment.

Geen nieuwe npm-pakketten, Auth Admin-integratie, uitnodigingen of online wijzigingen. Rollback van de optionele UI/API: zet `PASSKEYS_ENABLED=false`; wachtwoord/TOTP en RLS blijven werken.


## Uitgevoerde controles

- Office `npm test`: **125 geslaagd, 0 mislukt**.
- Portal `npm test`: **138 geslaagd, 0 mislukt**.
- Portal `npm run typecheck`, `npm run lint`, `npm run build`: geslaagd.
- Office heeft geen afzonderlijke build-, typecheck- of lint-scripts. `node --check` op de gewijzigde Office-runtimebestanden en de gedeelde servermodule: geslaagd.
- `git diff --check`: geslaagd. Branch blijft `feature/passkey-login`; niets gestaged, gecommit, gepusht of online toegepast.
- Geen gewijzigde bestaande migraties. Geen `.env.local`, secrets, node_modules, private-storage, outputs of buildbestanden in de wijzigingsset. Testlogs en de portalbuild staan uitsluitend in reeds genegeerde werk-/buildmappen.
- De build meldt bestaande experimentele frameworkfunctionaliteit en statische routeclassificatie; dit zijn geen buildfouten. De lokale SDK-tests vervangen de providertransportlaag en testen geen echte biometrische handtekeningen. Echte apparaten en live Supabase/PostgREST moeten later worden geaccepteerd.

## Volledige gewijzigde bestandslijst

- `apps/office/.env.example`
- `apps/office/PWA_SECURITY.md`
- `apps/office/README.md`
- `apps/office/SHARED_BACKEND_CONTRACTS.md`
- `apps/office/SUPABASE_INTEGRATION.md`
- `apps/office/public/passkeys.js`
- `apps/office/public/supabase-app.js`
- `apps/office/src/auth/supabase.mjs`
- `apps/office/src/config.mjs`
- `apps/office/src/supabase-api.mjs`
- `apps/office/tests/helpers/passkey-fixture.mjs`
- `apps/office/tests/helpers/supabase-fixture.mjs`
- `apps/office/tests/passkey-api.test.mjs`
- `apps/office/tests/passkeys.test.mjs`
- `apps/office/tests/trusted-mfa-rls.test.mjs`
- `apps/portal/.env.example`
- `apps/portal/README.md`
- `apps/portal/SECURITY.md`
- `apps/portal/app/api/auth/passkeys/route.ts`
- `apps/portal/components/login.tsx`
- `apps/portal/components/passkey-settings.tsx`
- `apps/portal/components/portal.tsx`
- `apps/portal/lib/supabase/server.ts`
- `apps/portal/public/passkeys.js`
- `apps/portal/tests/passkey-api.test.mjs`
- `apps/shared/PASSKEY_SECURITY.md`
- `apps/shared/passkeys.mjs`
