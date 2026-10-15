import {checkQuery,OfficeError} from "./auth/supabase.mjs";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function chatId(value){
  if(typeof value!=="string"||!uuid.test(value))throw new OfficeError(400,"INVALID_WIZE_CHAT","Deze chat is ongeldig.");
  return value;
}

export async function listChats(client,userId){
  const rows=checkQuery(await client.from("wize_office_chats").select("id,organization_id,title,created_at,updated_at,organizations(name)").eq("created_by",userId).order("updated_at",{ascending:false}).limit(100))??[];
  return rows.map(row=>({id:row.id,organizationId:row.organization_id,organizationName:row.organizations?.name??null,title:row.title,createdAt:row.created_at,updatedAt:row.updated_at}));
}

export async function getChat(client,userId,id){
  const row=checkQuery(await client.from("wize_office_chats").select("id,organization_id,title,created_at,updated_at,organizations(name)").eq("id",id).eq("created_by",userId).maybeSingle());
  if(!row)throw new OfficeError(404,"WIZE_CHAT_NOT_FOUND","Deze chat bestaat niet meer.");
  return row;
}

export async function messages(client,id){
  return checkQuery(await client.from("wize_office_messages").select("id,role,content,created_at").eq("chat_id",id).order("created_at",{ascending:true}).limit(500))??[];
}

export async function createChat(client,userId,organizationId){
  return checkQuery(await client.from("wize_office_chats").insert({created_by:userId,organization_id:organizationId,title:"Nieuwe chat"}).select("id,organization_id,title,created_at,updated_at").single());
}

export async function saveMessage(client,id,role,content){
  checkQuery(await client.from("wize_office_messages").insert({chat_id:id,role,content}));
}

export async function updateChat(client,userId,id,values){
  return checkQuery(await client.from("wize_office_chats").update({...values,updated_at:new Date().toISOString()}).eq("id",id).eq("created_by",userId).select("id,organization_id,title,created_at,updated_at").single());
}

export async function removeChat(client,userId,id){
  checkQuery(await client.from("wize_office_chats").delete().eq("id",id).eq("created_by",userId));
}
