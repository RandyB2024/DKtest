# PWA- en passkeyarchitectuur

## Veilige cachegrens

De service worker cachet uitsluitend de openbare app-shell: HTML, CSS, JavaScript, manifest, iconen en de offlinepagina. Requests naar `/api/`, `/documents/` en `/downloads/` worden nooit onderschept of opgeslagen. Beveiligde API-antwoorden gebruiken `Cache-Control: no-store, private`.

Klantdossiers, banktransacties, facturen, belastinggegevens, documenten, communicatie en auditlogs moeten na een geldige sessie opnieuw van de backend komen. Logout trekt de server-side sessie in, wist tijdelijke browserstate en stuurt `Clear-Site-Data`.

## Productie-authenticatie

De lokale Ed/Randy-keuze is uitsluitend beschikbaar wanneer `ALLOW_DEVELOPMENT_AUTH=true`. Bij `NODE_ENV=production` weigert de server te starten zolang die bypass actief is. Productie gebruikt eerst Microsoft/OIDC met MFA en daarna een persoonlijke WebAuthn-passkey.

WebAuthn verwerkt biometrie nooit in Office. Het apparaat voert Face ID, Touch ID, Android-biometrie of Windows Hello uit. Office bewaart uitsluitend credential-id, publieke sleutel, counter, apparaatnaam en tijdstempels. Meerdere niet-ingetrokken credentials per gebruiker zijn toegestaan.

## Step-up en vergrendeling

Sessies hebben `strong_auth_at`, `strong_auth_method`, `last_activity_at` en `locked_at`. Gevoelige serveracties krijgen later een controle die een recente sterke authenticatie vereist. De huidige lokale provider simuleert ontgrendeling; productie moet daarvoor een verse WebAuthn assertion verifiëren.

De browser kan vroegtijdig vergrendelen, maar de server bepaalt altijd of een sessie geldig en ontgrendeld is. Terugkeer uit achtergrondstatus vraagt de status opnieuw op. Een verlopen of ingetrokken sessie geeft `401`; een vergrendelde sessie `423`.

## Deploymentchecklist office.destinationknown.nl

- HTTPS en `Secure` cookies verplicht.
- `ALLOW_DEVELOPMENT_AUTH=false` en een sterk server-side sessiegeheim.
- Microsoft/OIDC-provider plus WebAuthn challengeopslag implementeren.
- RP ID vastzetten op `office.destinationknown.nl` (of bewust op `destinationknown.nl`).
- Origins strikt valideren; challenges eenmalig, kort geldig en server-side bewaren.
- Alle mutaties blijven server-side geautoriseerd; step-up wordt per gevoelige actie afgedwongen.
- Service-workerupdates versiegebonden uitrollen en oude shellcaches tijdens `activate` verwijderen.
