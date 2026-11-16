# BESTEMD — directe Meta WhatsApp OTP-login

Status: code staat op aparte ontwikkelbranch; **niet geactiveerd of op productie getest**. Wachtwoord, e-mailcode en TOTP blijven intact.

## Architectuur (geen Twilio)
1. Klant vult het geregistreerde WhatsApp-mobielnummer in. Nederlandse `06` wordt genormaliseerd naar `+316...`.
2. Portal POST `/api/auth/whatsapp-code/request` vraagt via **Supabase Auth** `signInWithOtp({ phone, options: { shouldCreateUser:false } })` een OTP aan. Supabase moet de telefoon reeds aan dezelfde bestaande user-ID hebben gekoppeld en geverifieerd. Geen klant uit CRM afleiden.
3. Supabase **Send SMS HTTP Hook** roept `https://app.mijnbestemd.nl/api/auth/hooks/send-whatsapp-otp` aan. Onze Worker controleert de Standard Webhooks HMAC-handtekening en verstuurt het goedgekeurde Meta Authentication-sjabloon `bestemd_login_verificatie` via de Meta Graph API. Hiervoor is **geen** Twilio vereist.
4. Klant voert code in. Portal `verifyOtp({ phone,token,type:"sms" })` laat **Supabase** de code verifiëren en de sessie uitgeven. Vervolgens dezelfde bestaand-account-, membership- en TOTP/AAL2-controles als andere inlogmethoden.
5. Een OTP of een CRM-nummer geeft nooit zelfstandig toegang. Supabase houdt gebruikersidentiteit en codes bij.

## Vereist vóór eerste activatie

- Verifieer in **Supabase Auth > Users** dat de bestaande klantgebruiker precies één correct, reeds bevestigd `auth.users.phone` in E.164-indeling (`+316...`) heeft. Het telefoonnummer in een CRM-contactveld is géén geverifieerde loginidentiteit. Koppel telefoons uitsluitend via een veilige gebruikersverificatie-/beheerdersflow; **geen massale updates of automatische koppeling op naam/e-mail**.
- Zet in **Supabase Auth > Providers > Phone** de Phone provider aan. Zorg dat aanmaken van nieuwe accounts op de loginroute verboden blijft. Controleer het rate-limit-beleid en zet CAPTCHA / Cloudflare rate limiting op zowel OTP-request als code-verificatie; gebruik geen echte klantdata voor eerste tests.
- Configureer onder **Supabase Auth > Hooks > Send SMS** het **HTTP endpoint** `https://app.mijnbestemd.nl/api/auth/hooks/send-whatsapp-otp`. De hook moet ook daadwerkelijk deze URL gebruiken; anders kan een andere SMS-provider worden aangeroepen. Bewaar de gegenereerde signing secret uitsluitend in Cloudflare.
- Stel via `wrangler secret put --name bestemd-portal <NAAM>` de secrets `SUPABASE_SEND_SMS_HOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` in. De bestaande Meta phone number ID in productie is `1414116601788514`; alleen in de **Portal Worker** zetten, niet in de browser of GitHub. De token heeft benodigde WhatsApp message permissies. Geen Twilio-credentials nodig.
- De template `bestemd_login_verificatie` moet voor de echte WABA actief zijn, met Nederlandse taalcode **nl** en een **copy-code** knop. Dit is de taalcode die de API-aanroep nu gebruikt; controleer de exacte Meta-template taalcode en componenten in de WhatsApp Manager.
- Bouw en test in een aparte omgeving dat de signed hook met de daadwerkelijke Supabase payload werkt, een code aankomt, foutieve codes afvallen, telefoonnummer van een andere gebruiker niets ontsluit, het account blijft bestaan en **TOTP nog altijd verplicht is**.
- Stel pas **na** bovenstaande controles op `bestemd-portal` de twee niet-geheime configuratievariabelen `WHATSAPP_SMS_HOOK_CONFIRMED=true` en `WHATSAPP_LOGIN_ENABLED=true` in. Code weigert de route zolang één van beide ontbreekt of vereiste Meta/hook-secrets ontbreken.
- Bewaak de bestaande `app.mijnbestemd.nl` custom-domainroute, `TURNSTILE_ENFORCE_LOGIN`, Supabase secrets, `keep_vars`, en andere productievariabelen tijdens deployment.

## Beveiliging/operationeel

- De HTTP hook moet de **raw body** en standaardheaders (`webhook-id`, `webhook-timestamp`, `webhook-signature`) controleren met HMAC-SHA256; OTP komt niet in logs terecht.
- Hook-URL is geen publiek API voor willekeurige Meta-berichten. Ongelukte verzending resulteert in een fout; geen alternatieve SMS-fallback.
- OTP-aanvraag geeft een neutrale respons, zodat geen accounts geïdentificeerd kunnen worden.
- In Cloudflare verplicht rate limiting op beide publieke OTP-endpoints; Supabase eigen throttling blijft ook gelden. Controleer recovery, oude telefoons, SIM-swaps en WhatsApp-nummerwissels.
- Als er ongewenste berichten/kosten of auth-fouten ontstaan: zet `WHATSAPP_LOGIN_ENABLED=false`; de UI schakelt terug naar 'Binnenkort beschikbaar'. **Geen andere auth-functie uitzetten**.
- Dit ontwerp is afhankelijk van productieconfiguratie van Supabase die niet vanuit de GitHub-connector kan worden gecontroleerd. Geen claim dat end-to-end WhatsApp-login operationeel is zonder die configuratie en live acceptatie.
