# Beveiligingsmodel

## Identiteit en context

Elke beveiligde route maakt een nieuwe Supabase-client en controleert `auth.getUser()` bij Auth. Het user-object uit een browsercookie of een aangeleverd userId is geen autorisatiebron. AAL wordt pas na geldige gebruikerscontrole gelezen.

Toegang vereist `profiles.account_status = active`, een actieve organisatie-membership binnen de geldigheidsperiode, een klantrol en een door RLS zichtbare niet-gearchiveerde onderneming. Office-only, geblokkeerd, verwijderd, niet-gekoppeld, verlopen of toekomstig gekoppeld krijgt geen portaaltoegang. Bevoegdheden worden per aanvraag opnieuw uit PostgreSQL geladen.

RLS blijft actief; geen bevoorrechte sleutel of adminclient voor klantacties. Publieke configuratie accepteert alleen een HTTPS-project-URL en een publishable key. Geen alternatieve omgevingsvariabelen met database- of beheergeheimen.

## Sessies, cookies en fouten

- Officiële SDK-cookies met getAll/setAll, inclusief chunking en refresh; geen zelfgemaakte sessie-ID.
- HttpOnly, SameSite=Strict, Path=/, Secure in productie en Max-Age=8 uur. SDK-verwijderingen krijgen Max-Age=0. Actieve refresh kan deze browserbewaartermijn verlengen; stel voor een harde absolute sessieduur ook Supabase Auth-sessielimieten in.
- HttpOnly is mogelijk doordat login, MFA en alle aangemelde queries via de eigen serverroutes lopen. De anonieme browserclient leest deze cookies niet.
- Login gebruikt een algemene 401 voor een onjuist wachtwoord, onbekend account en ontbrekende klanttoegang.
- Geen Supabase-foutdetails, wachtwoorden, tokens, QR-inhoud of omgevingswaarden in logging.
- State-changing requests vereisen een exact passende Origin en weigeren cross-site fetches. SameSite alleen is niet de enige CSRF-controle.
- Na login is de bestemming altijd `/`; redirectparameters worden niet gebruikt.
- API-antwoorden zijn private/no-store. De serverpagina bevat uitsluitend een publieke shell.
- Logout trekt via Supabase de huidige sessie/refreshmogelijkheid in en verwijdert browsercookies. Een eerder buitgemaakt JWT kan bij rechtstreekse databaseaanroepen geldig blijven tot zijn ingestelde expiratie; kies een korte JWT-duur en test intrekking bij online acceptatie. De app vertrouwt nooit alleen op lokale JWT-decodering.

## MFA

MFA-plichtige gebruikers ontvangen vóór AAL2 geen profiel-/organisatiepayload, maar een MFA-prompt. Zonder bestaande TOTP-factor kan de gebruiker zelf inschrijven; de QR en handmatige sleutel bestaan alleen in het no-store-antwoord en tijdelijk in componentgeheugen. Na verificatie worden de verhoogde SDK-sessiecookies opgeslagen.

Bij een bestaande geverifieerde factor wordt geen nieuwe inschrijving of verwijdering daarvan aangeboden. Na opnieuw inloggen volgt challenge + verify. Een onjuiste code geeft een algemene fout. Verlies van de authenticator vereist een apart gecontroleerd beheerdersherstel; er is geen overslaan-knop. Passkeys en herstelcodes zijn niet geïmplementeerd.

Financiële/documentroutes en -policies vereisen altijd AAL2, ook als `mfa_required` voor een profiel false is. Geen AAL2-verlaging in migraties of tests.

## Niet-gemigreerde acties

Oude demo-API's zijn afgesloten. Restrictieve databasepolicies verhinderen dat gewone klanten de applicatieblokkade via directe REST-/Storage-mutaties omzeilen. Bij toekomstige migratie moet elke blokkade doelgericht worden vervangen door geteste rol-/veld-/organisatiecontroles. Uitgeschakelde UI is op zichzelf geen autorisatiegrens.

De SQL behoudt bestaande Office-toegang voor afzonderlijke Office-identiteiten. Ken Office-rollen alleen na verificatie toe en test deze afzonderlijk bij Office-integratie.

## Browser en PWA

Geen sessies of klantgegevens in localStorage/sessionStorage. De service worker cachet uitsluitend manifest en merkiconen en negeert HTML, API, document- en MFA-verkeer. QR-codes gaan niet door een beeldoptimalisatiedienst. Offline zijn klantgegevens niet beschikbaar.

## Verificatiegrenzen en productievoorwaarden

SDK-/HTTP-tests bewijzen appgedrag; lokale PostgreSQL-tests bewijzen de meegeleverde policies. Ze bewijzen niet dat de remote database dezelfde migratie en geen extra permissieve policies, grants, views of functies bevat. Controleer het echte testproject vóór vrijgave. Stop bij afwijkende regels in plaats van RLS uit te schakelen.

Controleer vóór productie ook Supabase Auth-rate limits en MFA-instellingen, HTTPS, Worker/CDN cache bypass voor API's, security headers/CSP/HSTS, sessieduur, monitoring, back-ups en het herstelproces. Er wordt geen eigen in-memory rate limiter gebruikt: die is onbetrouwbaar over Worker-instances. Gebruik Supabase Auth en waar nodig Cloudflare-rate limits. Geen productieacceptatieclaim op basis van alleen lokale tests.

Referenties: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa).