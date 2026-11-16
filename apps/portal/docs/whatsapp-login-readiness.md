# BESTEMD — WhatsApp-login voorbereidingsstatus

Status: **niet geactiveerd**. Het formulier toont WhatsApp als toekomstige derde methode. De serverroutes zijn fail-closed (503); er worden geen codes aangemaakt of verstuurd.

## Afhankelijkheden vóór activering

1. **Meta:** bestaand productie-WABA van BESTEMD B.V. behoudt de WhatsApp Business-app (coexistence). Authentication-template `bestemd_login_verificatie` in Nederlands met copy-code moet in productie zijn goedgekeurd. Test Messaging Account is ongeschikt. Geen token in GitHub.
2. **Eigenaar telefoonnummer:** vertrouw uitsluitend een apart geverifieerd en actueel mobiel nummer dat via een veilige serverkoppeling aan de geauthenticeerde Supabase-user-ID is gebonden. Alleen het nummer dat een klant in CRM invoert is niet genoeg. Voorkom dubbelzinnige telefoonmatches en associaties tussen ondernemingen.
3. **Challenge:** voor toekomstige implementatie een transactioneel opgeslagen, eenmalig bruikbare challenge met accountgebonden cryptografische digest, TTL <= 5 minuten, max. aantal pogingen, cooldown per account en bron, generieke antwoorden, audit zonder leesbare OTP of telefoonnummer.
4. **Aanmelden:** alleen een code controleren geeft nooit zomaar een Supabase-authenticatiesessie. Ontwerp een ondersteunde identity-bound sessie-uitgifte na onafhankelijke security review, met accountstatus/membership checks. De bestaande `/api/auth/available-portals` vereist daarnaast Supabase AAL2/TOTP; dit blijft verplicht.
5. **Rollout:** server-side expliciete beveiligingsschakelaar na review en gerichte tests; alle bestaande wachtwoord-, e-mail- en TOTP-routes intact houden. Eerst test- en acceptatieomgeving; dan pas `app.mijnbestemd.nl`.

## Huidige concrete bestanden
- `components/central-login.tsx`: derde keuze WhatsApp, maar duidelijk nog niet beschikbaar.
- `app/api/auth/whatsapp-code/request/route.ts`: 503, geen side effects.
- `app/api/auth/whatsapp-code/verify/route.ts`: 503, nooit sessie-uitgifte.
- `lib/security/whatsapp-login-readiness.ts`: expliciet uitgeschakeld.

**Niet doen:** generieke Meta messaging-templates gebruiken als login-OTP, TOTP vervangen, bekende mobiele nummers zonder verificatie vertrouwen, een ongeteste auth-route op productie aanzetten.
