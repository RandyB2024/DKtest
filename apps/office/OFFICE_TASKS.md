# Eerste Office-takenfunctie

Branch: feature/address-business-tax-intake. Alleen lokaal geïmplementeerd; geen migratie toegepast, deployment, commit of push.

## Model en autorisatie

Hergebruikt public.tasks. Enige nieuwe migratie: 202609290001_office_tasks.sql.

- scope heeft standaard customer: bestaande taken behouden hun bestaande klanttoegang. Geen backfill naar interne scope.
- Nieuwe RPC-aanmaak zet expliciet scope=office. Nieuwe restrictieve RLS begrenst deze records tot actieve Office-identiteit, verse AAL2/TOTP en niet-gearchiveerde organisatie/relatie.
- Owner/admin maken aan en ronden af. Accountant/handler/viewer lezen alleen. Bestaande directe schrijfblokkades blijven intact; geen nieuwe DELETE-toegang.
- Verplicht: titel (getrimd, maximaal 200 tekens), organisatie, actieve verantwoordelijke Office-medewerker, deadline en status open/completed. Klantrelatie wordt via organisatie gecontroleerd, niet los vertrouwd.
- Deadline is een kalenderdatum in Europe/Amsterdam, opgeslagen in de bestaande due_at. Vandaag en Achterstallig gebruiken dezelfde tijdzone. Toekomstige taken blijven zichtbaar in het dossier.
- office_task_create en office_task_complete zijn SECURITY DEFINER met search_path=public en authenticated-only EXECUTE. office_cm_actor bewaakt de bestaande owner/admin- en 24-uurs-MFA-grens. Locks beschermen organisatiecontrole en afronden. Herhaald afronden is idempotent en schrijft geen tweede audit.
- office_tasks_read is SECURITY INVOKER, met expliciete Office/MFA-gate en bestaande RLS. Resultaten zijn gepagineerd: 25 plus één vooruitkijkrecord. Alleen interne open taken worden teruggegeven.
- Audit gebruikt bestaande office_cm_audit: actor, relatie/organisatie, object, actie, resultaat en gewijzigde veldnamen. Geen taaktitel of andere inhoud in auditmetadata. Auditfouten rollen taakaanmaak en afronding volledig terug.

## Routes en schermen

- GET /api/relationships/:relationshipId/organizations/:organizationId/tasks?page=1
- POST /api/relationships/:relationshipId/organizations/:organizationId/tasks met uitsluitend title, assignedTo, deadline
- POST /api/relationships/:relationshipId/organizations/:organizationId/tasks/:taskId/complete met lege JSON-objectbody
- GET /api/tasks?bucket=today&page=1 of bucket=overdue

Bestaande sessie-/origincontrole, no-store-envelope en veilige fouten blijven gelden. UUID's, datum, lengte en onbekende velden worden gecontroleerd. Definitieve autorisatie/validatie vindt opnieuw in PostgreSQL plaats.

Dossier → Overzicht toont de open taken van de geselecteerde onderneming, Nieuwe taak en Afronden volgens rol. Office → Overzicht toont echte Vandaag/Achterstallig-resultaten met dossierlinks. Geen nepgegevens, lokale opslag of gesimuleerde succesvolle mutatie in productiecode. Geen agenda, notificaties, herhaling, communicatie of klantportaalwijziging. Nieuwe browsermodule opgenomen in bestaande Worker-assetlijst; geen dependency of shellcachewijziging nodig.

## Lokale verificatie

- Gerichte takentests: 8 geslaagd (6 PostgreSQL/RLS inclusief subtests, 1 HTTP/Worker-handler, 1 UI-interactie).
- Alle Office-tests: 182 geslaagd, 0 mislukt, 0 overgeslagen.
- Werkelijke workerd-runtime: 3 geslaagd, inclusief nieuwe taakroute-integratietest.
- Worker-build, Wrangler dry-run, syntaxcontrole en git diff --check geslaagd.
- Getest: owner/admin creëren/afronden, leesrollen geweigerd bij writes, klantafscherming, bestaande klanttaken, andere klant, ontbrekende/verlopen/toekomstige MFA, ingetrokken membership, geblokkeerd profiel, vreemde relatie/taak/organisatie, ongeldige velden, archivering, auditrollback, datumselectie, paginering, UI-aanmaak/herladen/afronden en dossierlinks.

Belangrijke testgrens: directe SELECT/INSERT/UPDATE en RPC-aanroepen zijn uitgevoerd in echte lokale PostgreSQL (PGlite), onder authenticated met request.jwt.claims zoals PostgREST die gebruikt. Er is lokaal geen PostgREST- of Docker-runtime beschikbaar. **Een echte directe PostgREST-HTTP-test is daarom niet uitgevoerd.** HTTP- en workerd-tests gebruiken een Supabase-transportfixture; deze bewijzen niet de werking van een live PostgREST-installatie. Er is niets online benaderd voor deze taak.

Na afzonderlijke toestemming voor een geschikte acceptatieomgeving blijft een directe PostgREST-controle nodig: klant ziet uitsluitend bestaande toegestane klanttaken en geen interne taak; Office zonder verse MFA ziet geen taken en RPC's weigeren; Office met verse MFA leest interne taken; alleen owner/admin schrijft via RPC; directe writes blijven geblokkeerd. Controleer ook de werkelijke grants en schema-cache na migratie.

Bestaande migraties en fiscale intake zijn niet gewijzigd. Latere migratiecontrole: inspecteer migratiehistorie en dry-run tegen het juiste project; alleen deze nieuwe migratie mag aanvullend worden toegepast. Pas daarna afzonderlijk de goedgekeurde Office-build uitrollen. Deze online stappen zijn niet uitgevoerd.
