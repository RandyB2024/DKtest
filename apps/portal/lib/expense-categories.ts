export const expenseCategories = [
  ["kantoorartikelen","Kantoorartikelen"],
  ["kantinekosten","Kantinekosten"],
  ["representatiekosten","Representatiekosten"],
  ["relatiegeschenken","Relatiegeschenken"],
  ["lunches_en_diners","Lunches en diners"],
  ["telefoonkosten","Telefoonkosten"],
  ["internetkosten","Internetkosten"],
  ["portikosten","Portikosten"],
  ["reclamekosten","Reclamekosten"],
  ["kilometervergoeding","Kilometervergoeding"],
  ["brandstof","Brandstof"],
  ["parkeerkosten","Parkeerkosten"],
  ["beurzen_en_congressen","Beurzen en congressen"],
  ["overige_zakelijke_kosten","Overige zakelijke kosten"],
] as const;
export type ExpenseCategory = typeof expenseCategories[number][0];
export const categoryName = (code:string) => expenseCategories.find(item=>item[0]===code)?.[1] ?? code;
