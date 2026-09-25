# Beveiligingsmodel

## Identiteit en context

Elke beveiligde route maakt een nieuwe Supabase-client en controleert `auth.getUser()` bij Auth. Het user-object uit een browsercookie of een aangeleverd userId is geen autorisatiebron. AAL wordt pas na geldige gebruikerscontrole gelezen.

Toegang vereist `profiles.account_status = active`, een actieve organisatie-membership binnen de geldigheidsperiode, een klantrol en een door RLS zichtbare niet-gearchiveerde onderneming. Office-only, geblokkeerd, verwijderd, niet-gekoppeld, verlopen of toekomstig gekoppeld krijgt geen portaaltoegang. Bevoegdheden worden per aanvraag opnieuw uit PostgreSQL geladen.

RLS blijft actief; geen bevoorrechte sleutel of adminclient voor klantacties. Publieke configuratie accepteert alleen een HTTPS-project-URL en een publishable key. Geen alternatieve omgevingsvariabelen met database- of beheergeheimen.

## Sessies, cookies en fouten

- Officiële SDK-cookies met getAll/setAll, inclusief chunking en refresh; geen zelfgemaakte sessie-ID.
- HttpOnly, SameSite=Strict, Path=/, Secure in productie en Max-Age=24 uur. SDK-verwijderingen krijgen Max-Age=0. Cookie-refresh verlengt nooit de harde MFA-grens van 24 uur vanaf de gevalideerde TOTP-timestamp.
- HttpOnly is mogelijk doordat login, MFA en alle aangemelde queries via de eigen serverroutes lopen. De anonieme browserclient leest deze cookies niet.
- Login gebruikt een algemene 401 voor een onjuist wachtwoord, onbekend account en ontbrekende klanttoegang.
- Geen Supabase-foutdetails, wachtwoorden, tokens, QR-inhoud of omgevingswaarden in logging.
- State-changing requests vereisen een exact passende Origin en weigeren cross-site fetches. SameSite alleen is niet de enige CSRF-controle.
- Na login is de bestemming altijd `/`; redirectparameters worden niet gebruikt.
- API-antwoorden zijn private/no-store. De serverpagina bevat uitsluitend een publieke shell.
- Logout trekt via Supabase de huidige sessie/refreshmogelijkheid in en verwijdert browsercookies. Een eerder buitgemaakt JWT kan bij rechtstreekse databaseaanroepen geldig blijven tot zijn ingestelde expiratie; kies een korte JWT-duur en test intrekking bij online acceptatie. De app vertrouwt nooit alleen op lokale JWT-decodering.

## MFA

Alle gebruikers ontvangen vóór verse AAL2/TOTP geen profiel-/organisatiepayload, maar een MFA-prompt. Zonder bestaande TOTP-factor kan de gebruiker zelf inschrijven; de QR en handmatige sleutel bestaan alleen in het no-store-antwoord en tijdelijk in componentgeheugen. Na verificatie worden de verhoogde SDK-sessiecookies opgeslagen.

Bij een bestaande geverifieerde factor wordt geen nieuwe inschrijving of verwijdering daarvan aangeboden. Na opnieuw inloggen volgt challenge + verify. Een onjuiste code geeft een algemene fout. Verlies van de authenticator vereist een apart gecontroleerd beheerdersherstel; er is geen overslaan-knop. Passkeys en herstelcodes zijn niet geïmplementeerd.

Alle bedrijfsroutes en -policies vereisen verse AAL2/TOTP, ook als `mfa_required` voor een profiel false is. Geen AAL2-verlaging in migraties of tests.

## Niet-gemigreerde acties

Oude demo-API's zijn afgesloten. Restrictieve databasepolicies verhinderen dat gewone klanten de applicatieblokkade via directe REST-/Storage-mutaties omzeilen. Bij toekomstige migratie moet elke blokkade doelgericht worden vervangen door geteste rol-/veld-/organisatiecontroles. Uitgeschakelde UI is op zichzelf geen autorisatiegrens.

De SQL behoudt bestaande Office-toegang voor afzonderlijke Office-identiteiten. Ken Office-rollen alleen na verificatie toe en test deze afzonderlijk bij Office-integratie.

## Browser en PWA

Geen sessies of klantgegevens in localStorage/sessionStorage. De service worker cachet uitsluitend manifest en merkiconen en negeert HTML, API, document- en MFA-verkeer. QR-codes gaan niet door een beeldoptimalisatiedienst. Offline zijn klantgegevens niet beschikbaar.

## Verificatiegrenzen en productievoorwaarden

SDK-/HTTP-tests bewijzen appgedrag; lokale PostgreSQL-tests bewijzen de meegeleverde policies. Ze bewijzen niet dat de remote database dezelfde migratie en geen extra permissieve policies, grants, views of functies bevat. Controleer het echte testproject vóór vrijgave. Stop bij afwijkende regels in plaats van RLS uit te schakelen.

Controleer vóór productie ook Supabase Auth-rate limits en MFA-instellingen, HTTPS, Worker/CDN cache bypass voor API's, security headers/CSP/HSTS, sessieduur, monitoring, back-ups en het herstelproces. Er wordt geen eigen in-memory rate limiter gebruikt: die is onbetrouwbaar over Worker-instances. Gebruik Supabase Auth en waar nodig Cloudflare-rate limits. Geen productieacceptatieclaim op basis van alleen lokale tests.

Referenties: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa).
## Vertrouwde TOTP-sessie: harde grens van 24 uur

MFA_TRUST_MAX_AGE_SECONDS heeft de vaste standaard 86400; alleen afwezig of exact de tekst 86400 wordt geaccepteerd. Elke andere waarde sluit toegang af (Office-configuratiefout bij starten, portal-configuratiefout/503). Er is geen instelbare verlenging: de database hanteert dezelfde vaste 86400 seconden. Geen nieuwe secrets nodig.

De server controleert auth.getUser() en gebruikt vervolgens auth.getClaims() voor gevalideerde JWT-claims, gebonden aan dezelfde gebruiker. Alleen aal=aal2 met een geldige amr-array en een succesvolle methode totp verleent toegang. Unix-timestamps moeten positieve gehele seconden zijn, niet in de toekomst liggen en binnen het veilige numerieke bereik vallen. Ontbrekende, misvormde of verlopen claims leiden tot MFA_REQUIRED. Geen tolerantietijd. De laatste totp-timestamp is leidend: nu < laatste_totp + 86400. Op exact 24 uur is toegang verlopen. iat, token_refresh, activiteit en nieuwe cookies tellen nooit als MFA.

De SDK-cookie heeft Max-Age=86400 en blijft HttpOnly, SameSite=Strict, Path=/ en Secure in productie. Refresh kan de sessiecookie opnieuw bewaren, maar nooit MFA-toegang verlengen. Een verlopen vertrouwde sessie kan alleen de minimale auth-bootstrap gebruiken om opnieuw TOTP te verifiëren. Na succesvolle verificatie geeft Supabase de nieuwe timestamp uit. Geen client-side trusted-vlag, localStorage, sessionStorage of extra leesbare auth-cookie.

Een nieuwe browser, incognitovenster of gewist cookieprofiel heeft geen sessie: eerst opnieuw aanmelden en daarna TOTP. Expliciet uitloggen of opnieuw aanmelden begint eveneens een nieuwe sessie. Office en portal behouden hun afzonderlijke cookienamen; vertrouwen geldt per Supabase-sessie, niet als apparaatregistratie of gedeelde cross-app bypass. Bestaande sessies met geldige claims werken tot hun oorspronkelijke deadline; zonder geldige TOTP-claim is opnieuw MFA nodig. Passkeys zijn niet geactiveerd.

De nieuwe additieve migratie 202609250001_trusted_mfa_sessions.sql versterkt has_aal2() zonder oude migraties of policies te verwijderen. Daardoor gelden dezelfde checks voor bestaande financiële/Storage-policies en Office-RPCs. Aanvullende restrictieve policies sluiten ook overige bedrijfsdata en ondernemingsnamen af. Eigen profiel, memberships en bijbehorende rollen blijven beschikbaar voor bootstrap; bedrijfsgegevens niet. Portal mfa_required=false is geen uitzondering meer. Rollen, actieve status en organisatiegrenzen blijven vereist.

Het harde autorisatiemoment is de serveraanvraag/SQL-statement. De UI controleert bestaande context periodiek en bij focus; reeds ontvangen weergavegegevens worden niet op afstand uit een screenshot of geheugen teruggenomen. Bij hervatten volgt de servercontrole. Er wordt niets offline opgeslagen.

### Later afzonderlijk controleren

Er is niets online toegepast. Vanuit apps/portal in het gecontroleerde bestaande testproject: eerst supabase migration list en supabase db push --dry-run. Alleen 202609250001_trusted_mfa_sessions.sql mag nieuw zijn als de vier eerdere migraties al zijn toegepast. Bij afwijkende historie stoppen; geen reset of repair. Controleer daarna in een apart geautoriseerd vervolg de nieuwe functie/policies en echte Supabase-AMR-claims rond een refresh. Geen bestaande migraties herschrijven.

De lokale tests controleren direct na MFA, 23:59, exact 24 uur, refresh zonder verlenging, malformed claims, herverificatie, een leeg cookieprofiel en directe RLS/RPC/Storage-toegang. Live testaccount- en projectacceptatie zijn niet uitgevoerd. Supabase-sessie-intrekking of een kortere ingestelde Auth-sessielimiet kan eerder opnieuw inloggen vereisen.

Bronnen: [gevalideerde JWT-claims](https://supabase.com/docs/reference/javascript/auth-getclaims) en [AMR/TOTP-claimdefinitie](https://supabase.com/docs/guides/auth/jwt-fields).
