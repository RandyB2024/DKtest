# Mijn Destination Known

Next/vinext-klantportaal met Supabase Auth, sessieherstel, TOTP MFA, profiel, actieve memberships en ondernemingskeuze. Het huidige ontwerp, merkassets en de PWA-installatie/service worker blijven behouden. Er worden geen lokale demogegevens bij online ondernemingen getoond.

## Lokaal starten

Vereist Node.js 22.13 of hoger. Vanuit `apps/portal`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Vul in het **lokale bestand** de project-URL en publishable key van het bestaande Supabase-testproject in. Deel ze niet via chat of logs. De template bevat lege projectplaceholders en een vaste MFA-duur:

- `NEXT_PUBLIC_SUPABASE_URL`: HTTPS-project-URL uit Supabase Project Settings / API.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key uit Project Settings / API Keys.
- `MFA_TRUST_MAX_AGE_SECONDS`: optioneel, standaard 86400; andere waarden sluiten toegang af.

Er is bewust één configuratie: geen anon-key-fallback, databasewachtwoord of bevoorrechte sleutel. Een verkeerd sleuteltype of ontbrekende configuratie geeft een algemene 503 en nooit demotoegang. Herstart de devserver na configuratiewijzigingen. Open lokaal poort 5173.

De bestaande migratiebasis blijft vereist. De nieuwe 202609250001_trusted_mfa_sessions.sql is uitsluitend lokaal voorbereid; zie SECURITY.md voor afzonderlijke dry-runcontrole. De reeds uitgevoerde basismigratie en bestaande accounts blijven behouden. Voer geen seed of reset uit.

## Wat is aangesloten?

- Persoonlijke login met Supabase `signInWithPassword`; geen vooringevulde login.
- Server-side `auth.getUser()` op iedere beveiligde aanvraag.
- HttpOnly SDK-sessiecookies, sessieherstel en tokenvernieuwing via routehandlers.
- Logout via Supabase; browser verwijdert de sessiecookies.
- Alleen actieve profielen met minstens één actuele klantmembership en toegankelijke onderneming.
- Alleen eigen profiel, memberships en ondernemingen in de context-API.
- Eén onderneming automatisch; meerdere ondernemingen afzonderlijk of als "Alle ondernemingen".
- TOTP-inschrijving met QR-code, verificatie en bestaande-factorchallenge na opnieuw inloggen.
- Verplichte gevalideerde AAL2/TOTP, exact maximaal 24 uur na de laatste TOTP-verificatie, voor alle bedrijfsdata. Token-refresh verlengt dit niet.

Dit beschrijft de implementatie. De echte online accounts en deployment moeten nog de handmatige acceptatiematrix doorlopen; lokale tests gebruiken uitsluitend fictieve gegevens.

## Nog niet gemigreerd

Facturen, financiële dashboards, documenten, communicatie, agenda, rapportages, aangiften, voertuigen, verzekeringen, notificaties, profielwijzigingen en gebruikersbeheer zijn tijdelijk uitgeschakeld. De interface vermeldt dit. API's retourneren na toegangscontrole 503; financiële/documentroutes weigeren AAL1 met 403.

Historische componenten, domeinberekeningen en fixtures blijven beschikbaar voor vervolgwerk en bestaande regressietests. Ze worden niet geïmporteerd door de actieve portaalpagina of API-routes. Hun tests bewijzen geen online modulewerking. Zie ARCHITECTURE.md voor het vervolgplan.

## Verificatie

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

`tests/supabase-auth.test.mjs` test de echte SDK en routehandlers met een in-memory HTTP-fixture. `tests/supabase-rls.test.mjs` voert beide migraties uit in lokaal PostgreSQL via PGlite en controleert echte RLS. PGlite en tsx zijn uitsluitend ontwikkeldependencies; ze komen niet in de applicatieruntime. De pgcrypto-extensiedeclaratie wordt alleen in die test overgeslagen, omdat UUID-generatie daar al ingebouwd is. Alle beveiligings-SQL wordt ongewijzigd uitgevoerd.

Deze tests vervangen de online Supabase-/Storage-/browseracceptatie niet.

## PWA

De ongewijzigde service worker cachet uitsluitend vier expliciet toegestane publieke assets. Geen klant-HTML, API-antwoorden, QR-codes, documenten of tokens in de cache of localStorage. De app-shell toont zonder netwerk geen opgeslagen klantgegevens.
Voor de harde TOTP-grens, cookievoorwaarden, AAL1-bootstrap en directe RLS/RPC-tests: zie SECURITY.md en de nieuwe Office-test trusted-mfa-rls.test.mjs. Passkeys zijn nog niet geactiveerd.
