# Testarchitectuur Destination Known

Mijn Destination Known (Next/Vinext) en Destination Known Office (Node/PWA) blijven twee frontends. Beide gebruiken één afzonderlijk Supabase-testproject. PostgreSQL is de bron voor alle records; Auth levert identiteiten en MFA; private Storage bewaart bestanden. Er is geen databasesynchronisatie.

De canonical migration staat in `supabase/migrations`. Klanttoegang loopt via `organization_memberships`; interne toegang uitsluitend via `office_memberships`. RLS en servercontroles zijn beide verplicht. Bedragen worden in centen opgeslagen. Browsercode gebruikt alleen de publieke project-URL en anon key; service-role en uitnodigingsbeheer blijven server-side.

Huidige inventaris: het portaal bevat centrale TypeScript-seeds en gesimuleerde httpOnly ontwikkelsessies. Office is een zelfstandige Node/PWA met lokale opslag en ontwikkellogin. De projecten hebben geen Git-repository en zijn nog niet online gekoppeld. Deze lokale data wordt behouden tot de database-export en acceptatietest geslaagd zijn.
