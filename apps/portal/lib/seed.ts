import type { User, Organization, OrganizationGroup, Membership, OrganizationRelation, Verkoopfactuur, Documentverzoek, Conversatie, Afspraak, Rapportage, Aangifte, Notificatie, Voertuig, UserInvitation, Auditgebeurtenis } from "./models";
export const users: User[] = [
  { id: "user-randy", name: "Jan Jansen", email: "demo@destinationknown.test", functionTitle: "Eigenaar", accountStatus: "Actief", lastLogin: "2026-09-18T09:14:00+02:00", lastOrganizationId: "org-work" },
  { id: "user-ed", name: "Sanne de Vries", email: "ed@example.test", functionTitle: "Financieel medewerker", accountStatus: "Actief", lastLogin: "2026-09-17T16:42:00+02:00", lastOrganizationId: "org-work" },
  { id: "user-blocked", name: "Pieter Smit", email: "pieter@example.test", functionTitle: "Oud-medewerker", accountStatus: "Geblokkeerd" },
];
export const groups: OrganizationGroup[] = [];
export const organizations: Organization[] = [
  { id: "org-work", name: "Jansen Bouw B.V.", shortName: "Jansen Bouw", legalForm: "Besloten vennootschap", kvk: "88776655", status: "Actief", color: "#0b4b78", iban: "NL00 TEST 0123 4567 89", vatNumber: "NL000000001B01", address: "Kade 18, 3511 AB Utrecht" },
];
const membershipBase = { status: "active" as const, createdAt: "2026-01-01", createdBy: "user-randy", validFrom: "2026-01-01" };
export const memberships: Membership[] = [
  { ...membershipBase, id: "mem-1", userId: "user-randy", organizationId: "org-work", role: "Eigenaar" },
  { ...membershipBase, id: "mem-3", userId: "user-ed", organizationId: "org-work", role: "Financieel medewerker", additionalPermissions: ["insurance:view", "policy:view", "policy-document:download"] },
  { ...membershipBase, id: "mem-blocked", userId: "user-blocked", organizationId: "org-work", role: "Financieel medewerker" },
];
export const invitations: UserInvitation[] = [{ id: "invite-1", firstName: "Mila", lastName: "Bos", email: "mila@example.test", functionTitle: "Documenten aanleveren", status: "Uitgenodigd", invitedAt: "2026-09-17", expiresAt: "2026-09-24", invitedBy: "user-randy", organizationRoles: [{ organizationId: "org-work", role: "Documenten aanleveren" }] }];
export const auditEvents: Auditgebeurtenis[] = [{ id: "audit-1", organizationId: "org-work", userId: "user-randy", action: "invitation.sent", timestamp: "2026-09-17T14:10:00+02:00", objectType: "UserInvitation", objectId: "invite-1", result: "success", change: "Uitnodiging verzonden aan mila@example.test", sessionInfo: "lokale ontwikkelsessie" }];
export const relations: OrganizationRelation[] = [];
export const reports: Rapportage[] = [{ id: "rep-work", organizationId: "org-work", periode: "September 2026", omzet: 42500, kosten: 25700, banksaldo: 28640, bijgewerkt: "2026-09-17T08:45:00+02:00" }];
export const invoices: Verkoopfactuur[] = [{ id: "inv-work-1", organizationId: "org-work", nummer: "2026-0031", debiteur: "Noord & Co", datum: "2026-09-02", vervaldatum: "2026-10-02", status: "Verstuurd", regels: [{ id: "l1", omschrijving: "Bouwbegeleiding augustus", aantal: 18, prijs: 85, btw: 21 }] }];
export const requests: Documentverzoek[] = [{ id: "req-work-1", organizationId: "org-work", leverancier: "Shell", bedrag: 86.40, datum: "2026-09-16", status: "Bon ontbreekt" }, { id: "req-work-2", organizationId: "org-work", leverancier: "Bouwmaat", bedrag: 124.95, datum: "2026-09-11", status: "Bon ontbreekt" }];
export const conversations: Conversatie[] = [{ id: "conv-work", organizationId: "org-work", onderwerp: "Materieel zakelijk boeken", categorie: "Aftrekbaarheid", berichten: [{ id: "m1", afzender: "U", tekst: "Kan ik dit materieel zakelijk boeken?", datum: "15 sep. 10:24", gelezen: true }] }, { id: "conv-general", onderwerp: "Jaarplanning", categorie: "Algemeen", berichten: [{ id: "m2", afzender: "Randy", tekst: "De jaarplanning voor de groep staat klaar.", datum: "16 sep. 09:10", gelezen: false }] }];
export const appointments: Afspraak[] = [{ id: "apt-1", datum: "2026-09-24", tijd: "10:30", onderwerp: "Groepsbespreking", status: "Bevestigd" }];
export const returnsData: Aangifte[] = [{ id: "ret-work", organizationId: "org-work", soort: "Btw-aangifte", periode: "Q3 2026", deadline: "2026-10-31", status: "Wacht op akkoord", bedrag: 4120 }];
export const notifications: Notificatie[] = [{ id: "n-work", organizationId: "org-work", type: "document", titel: "Bon van Shell ontbreekt", gelezen: false, route: "Documenten" }, { id: "n-return", organizationId: "org-work", type: "aangifte", titel: "Btw-aangifte klaar voor akkoord", gelezen: false, route: "Aangiften" }, { id: "n-general", type: "bericht", titel: "Nieuw algemeen bericht van Randy", gelezen: true, route: "Communicatie" }];
export const vehicles: Voertuig[] = [{ id: "car-work", organizationId: "org-work", kenteken: "1-ABC-23", merk: "Volvo", model: "XC40", gebruik: "Zakelijk", cataloguswaarde: 48300 }];
