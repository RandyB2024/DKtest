# Implementatiestatus boekhouding

## Fase 1 - financiële basis

Werkelijk geïmplementeerd en geautomatiseerd getest:

- dubbel boekhouden met server-side gelijkheidscontrole;
- definitieve bedragen als integer centen;
- conceptboekingen en expliciete definitieve verwerking;
- onveranderlijke definitieve boekingen met herleidbare correctieboekingen;
- bank-, kas-, inkoop-, verkoop- en memoriaaldagboek met eigen nummerreeks;
- grootboekschema per administratie, activeren/deactiveren en grootboekkaarten met filters;
- proef-/kolommenbalans, balans en winst-en-verlies vanuit dezelfde journaalregels;
- debiteuren en crediteuren met openstaand bedrag en gedeeltelijke betalingen;
- CSV-bankimport met dubbele-importbeveiliging;
- voorbereid importcontract voor MT940 en CAMT.053 (de daadwerkelijke formaatparsers volgen nog);
- bankaansluitingsverschil;
- client- en organization-isolatie;
- gedeelde bron met de klantgerichte rapportageservice.

## Nog niet als voltooid presenteren

- Fase 2: volledige Nederlandse BTW-rubrieken, versievaste berekening en BTW-PDF;
- Fase 3: uitgebreide periodevergelijkingen en formele rapportages;
- Fase 4: begeleide jaarafsluiting en conceptjaarstukken;
- Fase 5: IB- en VPB-voorbereiding met belastingjaarafhankelijke regelsets;
- definitieve CAMT.053- en MT940-parser;
- duurzame PostgreSQL-opslag en transacties. De lokale MVP gebruikt nog procesgeheugen;
- productieklare automatische bankkoppeling of rechtstreekse fiscale indiening.

Deze fasering voorkomt dat fiscale of jaarrekeningfunctionaliteit betrouwbaarder wordt voorgesteld dan zij werkelijk is.
