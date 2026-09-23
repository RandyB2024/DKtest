export type Id = string;
export type Role = "Eigenaar" | "Beheerder" | "Financieel medewerker" | "Documenten aanleveren" | "Alleen bekijken" | "Aangepaste rol";
export type Permission = "dashboard:view" | "financials:view" | "reports:view" | "invoices:view" | "invoice:create" | "invoice:send" | "documents:view" | "document:upload" | "document:delete" | "messages:view" | "message:send" | "appointments:view" | "appointment:plan" | "returns:view" | "return:approve" | "vehicles:manage" | "profile:view" | "profile:edit" | "users:view" | "users:invite" | "users:manage" | "insurance:view" | "policy:view" | "policy-document:download" | "insurance-change:submit" | "claim:submit" | "claim:view" | "insurance-message:view" | "insurance-message:send" | "insurance-advice:request" | "insurance-permissions:manage";
export type AccountStatus = "Uitgenodigd" | "Actief" | "Verlopen" | "Ingetrokken" | "Geblokkeerd";
export interface User { id: Id; name: string; email: string; functionTitle?: string; accountStatus: AccountStatus; lastLogin?: string; lastOrganizationId?: Id }
export interface OrganizationGroup { id: Id; name: string }
export interface Organization { id: Id; groupId?: Id; name: string; legalForm: string; kvk: string; status: "Actief" | "Inactief"; shortName: string; color: string; iban: string; vatNumber: string; address: string }
export interface Membership { id: Id; userId: Id; organizationId: Id; role: Role; status: "active" | "revoked" | "blocked"; createdAt: string; createdBy: Id; validFrom: string; validUntil?: string; additionalPermissions?: Permission[] }
export interface ActiveOrganizationPreference { userId: Id; organizationId: Id; updatedAt: string }
export interface UserInvitation { id: Id; firstName: string; lastName: string; email: string; functionTitle: string; status: AccountStatus; invitedAt: string; expiresAt: string; invitedBy: Id; organizationRoles: Array<{ organizationId: Id; role: Role; permissions?: Permission[] }> }
export interface ActiveOrganizationContext { userId: Id; organizationId: Id | "all"; validatedAt: string }
export interface OrganizationRelation { id: Id; parentOrganizationId: Id; childOrganizationId: Id; type: "holding" | "dochtermaatschappij" | "deelneming" | "verbonden onderneming"; ownershipPercentage?: number; startDate: string; endDate?: string }
export interface OrganizationOwned { id: Id; organizationId: Id }
export interface Factuurregel { id: Id; omschrijving: string; aantal: number; prijs: number; btw: number }
export interface Verkoopfactuur extends OrganizationOwned { nummer: string; debiteur: string; datum: string; vervaldatum: string; regels: Factuurregel[]; status: "Concept" | "Verstuurd" | "Betaald" | "Vervallen" | "Herinnering" | "Gecrediteerd" }
export interface Documentverzoek extends OrganizationOwned { leverancier: string; datum: string; bedrag: number; status: "Bon ontbreekt" | "Ontvangen" | "In controle" | "Gekoppeld" | "Afgekeurd" | "Opnieuw aanleveren" }
export interface Bericht { id: Id; afzender: string; tekst: string; datum: string; gelezen: boolean }
export interface Conversatie { id: Id; organizationId?: Id; onderwerp: string; categorie: string; berichten: Bericht[] }
export interface Afspraak { id: Id; organizationId?: Id; datum: string; tijd: string; onderwerp: string; status: string }
export interface Rapportage extends OrganizationOwned { periode: string; omzet: number; kosten: number; banksaldo: number; bijgewerkt: string }
export interface Aangifte extends OrganizationOwned { soort: string; periode: string; deadline: string; status: string; bedrag?: number }
export interface Notificatie { id: Id; organizationId?: Id; type: string; titel: string; gelezen: boolean; route: string }
export interface Voertuig extends OrganizationOwned { kenteken: string; merk: string; model: string; gebruik: "Zakelijk" | "Privé"; cataloguswaarde: number }
export interface Banktransactie extends OrganizationOwned { datum: string; omschrijving: string; bedrag: number }
export interface Auditgebeurtenis { id: Id; organizationId?: Id; userId: Id; action: string; timestamp: string; objectType: string; objectId: Id; result: "success" | "denied"; change?: string; sessionInfo?: string }
export const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
export function factuurTotalen(regels: Factuurregel[]) { const subtotaal = regels.reduce((s, r) => s + r.aantal * r.prijs, 0); const btw = regels.reduce((s, r) => s + r.aantal * r.prijs * r.btw / 100, 0); return { subtotaal, btw, totaal: subtotaal + btw }; }
