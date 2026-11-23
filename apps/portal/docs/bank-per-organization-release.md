# BESTEMD — bankkoppeling per onderneming

## Implementatie in deze branch
- Klant kiest zijn eigen onderneming in Mijn Onderneming → Bankieren.
- De knop Bank koppelen verschijnt alleen als `BANK_CONNECT_ENABLED=true` én de gebruiker een actieve klantrol owner/admin heeft.
- Een nieuwe `POST /api/financial/bank/connect` valideert de gebruiker, TOTP (AAL2), organisatie, klantrol, herkomst van het verzoek en featureflag.
- Salt Edge V6 maakt per connectpoging een afzonderlijke customer en Connect-sessie aan met alleen de AIS-scopes `accounts` en `transactions`; geen betalingen.
- De connect-URL wordt gecontroleerd op `https://www.saltedge.com/connect`.
- Een beveiligde SQL-functie registreert de koppeling als pending en controleert opnieuw de organisatie en owner/admin-rol.
- De terugkeerpagina is `https://app.mijnbestemd.nl/mijn-onderneming?view=banking`.
- De bestaande Bankieren-schermen blijven de per-onderneming gescheiden databasegegevens lezen.

## Nog vereist vóór het inschakelen van echte bankkoppelingen
1. Bouw de **geauthenticeerde en cryptografisch geverifieerde Salt Edge-callback** die de ontvangen `customer_id` / `connection_id` aan de pending-koppeling relateert. Behandel een browserredirect nooit als bewijs van toestemming.
2. Bouw een **server-side transactiesynchronisatie**, inclusief idempotente upserts per organisatie, bescherming tegen kruisverbanden, consent-verloop, monitoring en het veilig beëindigen van een verbinding.
3. Test met twee geïsoleerde fictieve ondernemingen, verschillende rollen, en replay/cross-org aanvalsscenario's; laat echte banktoegang uit staan.
4. Voer `apps/portal/sql/customer-bank-connect-20261123.sql` uit **pas na een geslaagde review**. Deze vervangt de huidige fake-only constraints door een model dat fake providers nog steeds als fake afdwingt en echte verbindingen kan registreren.
5. Configureer de twee Salt Edge-API-secrets uitsluitend als server-side Worker secrets in de portal-Worker. **Plaats secrets nooit in GitHub, frontend, browser of chat**.
6. Publiceer de portal via de bestaande releaseprocedure en schakel `BANK_CONNECT_ENABLED=true` pas in na de volledige callback/importtest.

## Veiligheid
- De geïmporteerde `SANDBOX - Salt Edge Banktest` blijft intact.
- De database is nog niet aangepast door deze branch.
- De publieke functie is bewust standaard uit.
- Niet geschikt voor live aansluitingen totdat ook de callback en synchronisatie zijn geïmplementeerd.
