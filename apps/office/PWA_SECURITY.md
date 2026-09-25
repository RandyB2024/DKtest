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

Een nieuwe browser, incognitovenster of gewist cookieprofiel heeft geen sessie: eerst opnieuw aanmelden en daarna TOTP. Expliciet uitloggen of opnieuw aanmelden begint eveneens een nieuwe sessie. Office en portal behouden hun afzonderlijke cookienamen; vertrouwen geldt per Supabase-sessie, niet als apparaatregistratie of gedeelde cross-app bypass. Bestaande sessies met geldige claims werken tot hun oorspronkelijke deadline; zonder geldige TOTP-claim is opnieuw MFA nodig. Passkeys zijn niet geactiveerd.

De nieuwe additieve migratie 202609250001_trusted_mfa_sessions.sql versterkt has_aal2() zonder oude migraties of policies te verwijderen. Daardoor gelden dezelfde checks voor bestaande financiële/Storage-policies en Office-RPCs. Aanvullende restrictieve policies sluiten ook overige bedrijfsdata en ondernemingsnamen af. Eigen profiel, memberships en bijbehorende rollen blijven beschikbaar voor bootstrap; bedrijfsgegevens niet. Portal mfa_required=false is geen uitzondering meer. Rollen, actieve status en organisatiegrenzen blijven vereist.

Het harde autorisatiemoment is de serveraanvraag/SQL-statement. De UI controleert bestaande context periodiek en bij focus; reeds ontvangen weergavegegevens worden niet op afstand uit een screenshot of geheugen teruggenomen. Bij hervatten volgt de servercontrole. Er wordt niets offline opgeslagen.

### Later afzonderlijk controleren

Er is niets online toegepast. Vanuit apps/portal in het gecontroleerde bestaande testproject: eerst supabase migration list en supabase db push --dry-run. Alleen 202609250001_trusted_mfa_sessions.sql mag nieuw zijn als de vier eerdere migraties al zijn toegepast. Bij afwijkende historie stoppen; geen reset of repair. Controleer daarna in een apart geautoriseerd vervolg de nieuwe functie/policies en echte Supabase-AMR-claims rond een refresh. Geen bestaande migraties herschrijven.

De lokale tests controleren direct na MFA, 23:59, exact 24 uur, refresh zonder verlenging, malformed claims, herverificatie, een leeg cookieprofiel en directe RLS/RPC/Storage-toegang. Live testaccount- en projectacceptatie zijn niet uitgevoerd. Supabase-sessie-intrekking of een kortere ingestelde Auth-sessielimiet kan eerder opnieuw inloggen vereisen.

Bronnen: [gevalideerde JWT-claims](https://supabase.com/docs/reference/javascript/auth-getclaims) en [AMR/TOTP-claimdefinitie](https://supabase.com/docs/guides/auth/jwt-fields).
