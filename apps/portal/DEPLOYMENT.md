# Testdeployment

1. Maak een afzonderlijk Supabase-testproject in EU-regio en schakel openbare registratie uit.
2. Voer `supabase db push` uit en daarna uitsluitend in test `supabase db seed`.
3. Configureer invite-only e-mail, verplichte TOTP en redirect-URL's voor `https://portaal-test.destinationknown.nl` en `https://office-test.destinationknown.nl`.
4. Vul per Cloudflare Worker de variabelen uit `.env.example` in. Plaats service-role en Azure-secret uitsluitend als encrypted server secrets.
5. Deploy portal en Office vanuit een private GitHub-repository en een gecontroleerde `develop`-branch.
6. Koppel beide testsubdomeinen, forceer HTTPS en controleer `X-Robots-Tag: noindex, nofollow`.
7. Maak Randy en Ed als afzonderlijke invite-only Office-gebruikers. Voeg `office_memberships` pas toe na geverifieerde identiteit en MFA.

Niet automatisch uitvoerbaar zonder beheerderstoegang: Supabase-project maken, GitHub-repository maken, DNS wijzigen, Cloudflare secrets plaatsen en Azure/Entra-app registreren.

## Back-up en herstel

Maak vóór migratie een export van lokale JSON/SQLite-data. Gebruik voor PostgreSQL `supabase db dump --linked -f backups/test-YYYYMMDD.sql` en herstel alleen naar een leeg testproject. Back-ups met persoonsgegevens horen niet in Git.
