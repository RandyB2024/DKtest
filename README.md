# Destination Known Platform

Monorepo met twee afzonderlijke applicaties:

- `apps/portal`: Next/vinext-klantportaal met Supabase Auth, TOTP MFA en ondernemingscontext.
- `apps/office`: bestaande Office-app; in deze wijziging niet op Supabase aangesloten.

Werk voor het portaal vanuit `apps/portal`. Daar staan `package.json`, `package-lock.json`, `README.md`, `ARCHITECTURE.md`, `SECURITY.md` en `DEPLOYMENT.md`.

De portaalbasis gebruikt echte Supabase-API's zodra het testproject is geconfigureerd en de nieuwe migratie is toegepast. Financiële en overige modules zijn zichtbaar als **nog niet gemigreerd**; hun oude demo-acties zijn uitgeschakeld. Er is geen claim dat de online acceptatietest al is uitgevoerd.

Zie [portaalinstructies](apps/portal/README.md) en [deployment en acceptatie](apps/portal/DEPLOYMENT.md).