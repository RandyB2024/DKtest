# Gedeelde backendcontracten

Destination Known Office en Mijn Destination Known gebruiken één autoritatief domein. Office beheert `CustomerRelationship`, `Organization`, `OrganizationProfile`, `OrganizationFeature`, `User`, `Membership` en `OrganizationChangeRequest`. Het klantportaal leest dezelfde records via beveiligde, rolgefilterde API-contracten.

- `organization_id` is de beveiligingsgrens voor ondernemingsdata.
- Een `Membership` verleent één gebruiker één rol binnen precies één onderneming.
- Een feitelijk kenmerk staat in `OrganizationProfile`; zichtbaarheid staat in `OrganizationFeature`; een gebruikersrecht staat in `Membership.permissions`.
- Wijzigingen worden als `OrganizationChangeRequest` ontvangen en pas na Office-goedkeuring atomair toegepast.
- Modules hebben status, ingangs- en einddatum, bron, reden en wijzigingsmetadata.
- Historische aangiften, taken, documenten en auditregels worden niet verwijderd wanneer een module eindigt.
- Productie migreert deze contracten naar PostgreSQL/Supabase met applicatie-autorisatie plus Row Level Security.

De lokale MVP gebruikt dezelfde veldnamen en services in geheugen. Hierdoor kan opslag later worden vervangen zonder de Office- of portaalbeslislogica te dupliceren.

## Scheiding boekhouding en klantrapportage

`CustomerReportingService` is de enige vertaallaag tussen de technische boekhouding en Mijn Destination Known. De service leest de autoritatieve totalen uit de Office-boekhouding en publiceert uitsluitend geaggregeerde, begrijpelijke rapportagevelden. Maand, kwartaal en year-to-date gebruiken daarmee dezelfde financiële bron als Office.

- Office gebruikt de `dko_session`; het klantportaal gebruikt de afzonderlijke, beperkt gescope-te `dkp_session`.
- Iedere klantrequest wordt server-side getoetst aan de actieve `Membership` voor de gevraagde `organization_id`.
- Klantcontracten bevatten geen grootboekrekeningen, journaalposten, memoriaalboekingen, boekingsregels, controlepunten, interne notities of administratieve werkvoorraad.
- Een portaalcookie verleent geen toegang tot Office-routes, ook niet wanneer een URL handmatig wordt aangepast.
- PDF-bestanden staan buiten de publieke webroot, worden alleen na dezelfde autorisatiecontrole gestreamd en krijgen `Cache-Control: no-store, private`.
- Onverwerkte transacties en ontbrekende documenten leiden tot een expliciet voorlopig-kenmerk en een begrijpelijke kwaliteitsmelding.

In productie worden dezelfde contracten afgedwongen met applicatie-autorisatie én databasebeleid (Row Level Security). Rapport-PDF's worden daar per geautoriseerde aanvraag gegenereerd of uit versleutelde private objectopslag geleverd; publieke object-URL's zijn niet toegestaan.
