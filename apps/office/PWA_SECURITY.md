# Office beveiliging — Supabase fase 2A

Elke beveiligde API-aanvraag verifieert de Supabase-gebruiker, het actieve profiel, het actieve office_membership, de rol met scope office en is_office_user(). Bedrijfsgegevens vereisen AAL2. Login, status en MFA gebruiken alleen de minimaal noodzakelijke AAL1-bootstrap; een klantaccount komt daar niet doorheen.

De server gebruikt de gebruikerssessie en de publishable key, nooit een service-role-key. RLS vormt de tweede grens. Geblokkeerde profielen en ingetrokken memberships worden bij de volgende aanvraag geweigerd. De bestaande Office-rol is globaal binnen het kantoor; deze fase introduceert geen toewijzing per medewerker of onderneming.

De afzonderlijke dko-supabase-auth-cookie is HttpOnly, SameSite=Strict en in productie Secure. De maximale cookielevensduur is acht uur en kan bij tokenvernieuwing worden vernieuwd; absolute sessielimieten worden in Supabase beheerd. Logout beëindigt de lokale Supabase-sessie en verwijdert Office-cookies. Reeds uitgegeven bearer access tokens kunnen technisch tot hun vervaldatum bestaan; deel of log ze nooit. Portal-cookies worden niet gewist. Clear-Site-Data wordt daarom niet gebruikt.

Muterende auth-aanvragen vereisen de exacte OFFICE_ORIGIN en weigeren cross-site requests. De frontend bewaart geen tokens in localStorage en toont geen sleutels. API-antwoorden en MFA-materiaal zijn no-store. Wachtwoorden worden na verzending uit het formulier verwijderd. Bij verlies van toegang wordt de klantweergave gewist.

De service worker cachet alleen toegestane openbare assets en de offlinepagina. Auth-, API-, document- en downloadverkeer wordt niet gecachet. De actieve Supabase-JavaScriptcode en beschermde HTML worden via het netwerk geladen. Oude caches worden bij activatie verwijderd.

Klantbeheer loopt via zes transactionele RPCs voor owner/admin met vaste velden en atomair audit. Private helpers zijn niet uitvoerbaar door authenticated. Alle niet-gemigreerde bedrijfsacties worden server-side geweigerd; de additieve migratie blokkeert tevens normale Office-schrijfaanvragen rechtstreeks via PostgREST en private Storage. Auth/MFA en de zes gecontroleerde klantbeheer-RPCs zijn de afgebakende uitzonderingen. Directe tabelwrites blijven geblokkeerd. Accountuitnodigingen en Auth Admin API blijven uitgeschakeld. De oude lokale sessie-, passkey- en vergrendellogica geldt alleen voor de expliciete lokale demo.

Hosting vereist HTTPS, NODE_ENV=production, ALLOW_DEVELOPMENT_AUTH=false, een expliciete HTTPS OFFICE_ORIGIN en de testprojectconfiguratie. Er is in deze opdracht niets gehost of op afstand gemigreerd.
