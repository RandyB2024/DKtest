export type EvidenceMime = "application/pdf" | "image/jpeg" | "image/png" | "image/heic";
export const MAX_EXPENSE_FILE_BYTES = 15 * 1024 * 1024;

export function detectExpenseEvidenceMime(bytes: Uint8Array): EvidenceMime | null {
  if(bytes.length < 12) return null;
  if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d) return "application/pdf";
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) return "image/jpeg";
  if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return "image/png";
  const ascii=(start:number,count:number)=>String.fromCharCode(...bytes.slice(start,start+count));
  if(ascii(4,4)==="ftyp"&&["heic","heix","hevc","hevx","heim","heis","mif1"].includes(ascii(8,4))) return "image/heic";
  return null;
}
export function normalizedExpenseMime(declared:string):string {
  return declared==="image/heif" ? "image/heic" : declared;
}
export function safeExpenseFilename(name:string,mime:EvidenceMime):string {
  const ext=mime==="application/pdf"?"pdf":mime==="image/png"?"png":mime==="image/jpeg"?"jpg":"heic";
  const stem=name.replace(/\.[^.]*$/,"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Za-z0-9_-]/g,"-").replace(/-+/g,"-").replace(/^[-_]+|[-_]+$/g,"").slice(0,80)||"bon";
  return stem+"."+ext;
}
