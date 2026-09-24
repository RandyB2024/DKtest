# Testdeployment en acceptatie

## Bestaand Supabase-testproject

Gebruik uitsluitend het bestaande afzonderlijke testproject. Vraag of verstuur geen wachtwoorden, access tokens, geheime API-sleutels of databasewachtwoorden in chat. Gebruik uw eigen beheerderssessie.

1. Controleer de actuele migratiehistorie. `202609230001_initial_test_foundation.sql` hoort al toegepast te zijn. Wijzig of herhaal deze migratie niet en voer geen database-reset of seed uit.
2. Review de nieuwe migratie `supabase/migrations/202609240001_portal_auth_boundary.sql`. Deze voegt klantrol-SELECT, aanvullende RLS, actuele membershipcontrole, AAL2-versterking en tijdelijke klantmutatieblokkades toe.
3. Gebruik vanuit `apps/portal` de al gekoppelde Supabase CLI: eerst `supabase db push --dry-run`. Controleer dat uitsluitend de nieuwe migratie gepland is. Voer daarna `supabase db push` uit. Bij drift, ontbrekende geschiedenis of andere geplande SQL: stop en onderzoek. Geef Codex geen beheercredentials.
4. Controleer in Authentication dat de bestaande testgebruikers actief zijn, openbare registratie uit staat en TOTP enrollment **en** verification aan staan.
5. Controleer per klant: actief profiel met `mfa_required=true`, actieve klantrelatie, niet-gearchiveerde onderneming en actieve `organization_memberships` met klantrol en geldige datums. Geef gewone klanten geen `office_memberships`.
6. Controleer dat Storage-buckets privé zijn en alle publieke tabellen RLS hebben. Inspecteer ook eventuele policies/views/functies die buiten de meegeleverde migraties zijn toegevoegd; lokale tests kunnen zulke drift niet zien.

## Omgeving

Kopieer `.env.example` naar `.env.local` en vul uitsluitend:

- `NEXT_PUBLIC_SUPABASE_URL` met de HTTPS-project-URL van dat testproject.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` met de publishable key van hetzelfde project.

Er staan geen echte waarden in de repository. `.env*` en Cloudflare `.dev.vars*` worden genegeerd; alleen `.env.example` is toegestaan in Git. Geen legacy anon-key-fallback. Nooit een databasewachtwoord of privileged API key in een NEXT_PUBLIC-variabele plaatsen.

Configureer dezelfde twee variabelen voor de build en de Cloudflare Worker-runtime. De anonieme browserclient vereist publieke buildvariabelen zodra hij in een component wordt gebruikt; de actieve BFF vereist ze bij uitvoering. Gebruik de bestaande nodejs_compat-Workerconfiguratie en HTTPS. Geen Node-only databaseverbinding of D1-binding nodig.

Vanuit `apps/portal`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. De bestaande portable runner gebruikt vinext; de Worker-build gebruikt de aanwezige Vite/Cloudflare-configuratie. Deploy pas nadat de acceptatie hieronder slaagt. Deze opdracht publiceert niets.

## Handmatige acceptatiematrix

Gebruik de bestaande fictieve accounts; maak alleen indien nodig aanvullende fictieve gevallen in het testproject. Geen echte klantgegevens. Laat testwachtwoorden in uw wachtwoordmanager en gebruik ze uitsluitend zelf in de browser.

1. Login met verkeerd wachtwoord en onbekend adres: dezelfde algemene fout, geen accountinformatie.
2. Login met actieve klant zonder factor: TOTP instellen, QR scannen, onjuiste code weigeren, geldige code accepteren. Controleer dat QR/secret niet in cache of logs staan.
3. Uitloggen en opnieuw inloggen: bestaande authenticatorchallenge, geen nieuwe inschrijving. Bij verloren factor geen toegang zonder gecontroleerd herstel.
4. Eén membership: automatische onderneming. Meerdere: afzonderlijke keuze en "Alle ondernemingen"; nooit een andere onderneming.
5. Herlaad de pagina na login en na contextwissel. Laat ook een access token verlopen om cookievernieuwing te controleren.
6. Manipuleer een organisatie-ID in contextbody, organisatiepad en voorkeurcookie. Body/pad: 403; achterhaalde voorkeur: veilige fallback. Een aangeleverd userId mag identiteit niet veranderen.
7. Controleer Office-only, geblokkeerd/verwijderd profiel, geen membership, revoked/expired/future membership en gearchiveerde onderneming. Geen portaaltoegang. Trek ook een membership in terwijl de gebruiker ingelogd is.
8. Zonder sessie: context 401. Na logout: context 401, SDK-cookies verwijderd. Controleer ook server-side sessie-intrekking en de ingestelde JWT-vervaltijd.
9. AAL1: geen financiële of documentdata, ook bij rechtstreekse Supabase-query met de gewone gebruikerssessie. AAL2: alleen eigen onderneming. Controleer factuurregels en Storage apart.
10. Niet-gemigreerde acties: melding in de UI, API 503 na geldige autorisatie; AAL1 financieel/document 403. Gewone klantmutaties rechtstreeks op REST/Storage moeten door RLS geweigerd worden.
11. Verwijder tijdelijk één lokale omgevingsvariabele: veilige configuratiefout, geen demologin. Herstel daarna lokaal.
12. Controleer mobiel/desktop en PWA-installatie, offlinegedrag, Secure/HttpOnly/SameSite-cookies op HTTPS en no-store-headers. Cache geen /api/* op Cloudflare.

## Niet uitgevoerd door deze wijziging

Geen online migratie, accountwijziging, seed, deployment, commit of push. Geen live Supabase-gebruikerssessie gebruikt. Live Auth-/Storage-configuratie en eventuele schema-/policy-drift moeten nog worden gecontroleerd.

## Vervolgmodules

Zie ARCHITECTURE.md. Wijzig per module de API, UI, databasepolicies, audit en tests samen. Heractiveer geen oude demomutaties.