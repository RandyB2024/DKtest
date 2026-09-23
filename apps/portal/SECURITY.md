# Beveiliging

## Reeds aanwezig

- De verzekeringsmodule vereist zowel een gecontroleerde Klaas Vis-relatie als een afzonderlijke verzekeringsbevoegdheid.
- Zakelijke en persoonlijke polisdata hebben afzonderlijke eigenaarvelden; toegang wordt server-side per organisatie, persoon, polis en document gecontroleerd.
- Polisdocumenten gebruiken private opslagverwijzingen en worden uitsluitend via een `no-store` downloadroute aangeboden.
- Wijzigingen en schademeldingen zijn verzoeken en bevestigen nooit automatisch een poliswijziging of dekking.
- Algemene e-mailnotificaties bevatten geen polis-, schade- of medische inhoud.
- Destination Known Office ontvangt alleen expliciet toegestane administratieve signalen en geen persoonlijke of medische verzekeringsinformatie.

- Fail-closed serverrendering: zonder geldige httpOnly sessie verschijnt geen portaaldata.
- Server-side controle op sessie en klant-ID; een andere klant retourneert 403.
- `SameSite=Strict`; `Secure` wordt in productie gezet.
- Centrale `organization_id`-velden in alle bedrijfsgebonden domeinrecords.
- Many-to-many-memberships met rollen en direct blokkeren van ingetrokken memberships.
- Actieve organisatiecontext wordt bij iedere serveraanvraag opnieuw gevalideerd; een voorkeur of requestbody verleent nooit toegang.
- Mutatieroutes controleren organisatie-ID in pad én body en toetsen de benodigde rolpermissie.
- Persoonlijke accountstatus, membershipstatus en geldigheidsperiode worden centraal gecontroleerd.
- Uitnodigings- en beheeracties vereisen afzonderlijke permissies; de laatste eigenaar is beschermd.
- Belangrijke toegangsacties hebben een gestructureerd auditmodel zonder wachtwoorden of tokens.
- Uploadacceptatie voor PDF/JPG/PNG, niet-leeg en maximaal 10 MB.
- Geen wachtwoorden, tokens of financiële payloads in logging.
- De service worker cachet alleen vier expliciete publieke statische bestanden.

## Alleen voor lokale ontwikkeling

De vaste demo-inlog, vaste sessiewaarde, in-memory mutaties, gesimuleerde uploads, berichten en notificaties zijn niet productieveilig. Er is geen claim dat biometrie al actief is; biometrische gegevens horen nooit in de applicatiedatabase.

## Verplicht vóór productie

- Passkey/WebAuthn (Face ID, Android-biometrie, Windows Hello), fallback met sterk wachtwoord, verplichte TOTP-2FA en herstelcodes.
- Cryptografische, roterende sessies; CSRF; rate limiting; CSP/HSTS en beveiligingsheaders.
- PostgreSQL Row Level Security als primaire organisatiegrens: `auth.uid()` → actieve membership → record-`organization_id` → rolpermissie, plus serverautorisatie op iedere query, actie en download.
- Autorisatie- en IDOR-tests voor iedere resource en medewerkersrol.
- Persoonlijke uitnodigingstokens moeten eenmalig, gehasht, kort geldig en intrekbaar zijn; e-mailaflevering en acceptatie zijn nu gesimuleerd.
- Audittrail zonder gevoelige payloads, secrets manager, monitoring, back-ups en incidentprocedure.
- Malware-/contentinspectie en server-side herkenning van daadwerkelijke bestandstypen.

## Private documenten

Sla bytes op in een private Supabase Storage-bucket of gelijkwaardige objectopslag. Bewaar eigenaarschap in PostgreSQL. Downloads verlopen alleen via een geautoriseerde serveractie met een zeer korte signed URL of gestreamde response. Publieke permanente URL's zijn verboden.

## Nooit offline cachen

API-responses, HTML met klantdata, facturen, uploads, rapportages, aangiften, gesprekken, notificaties, bankgegevens en persoonsgegevens mogen nooit door de service worker of browseropslag worden gecachet.
