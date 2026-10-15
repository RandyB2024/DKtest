import {OfficeError} from "./auth/supabase.mjs";
import {chatId,listChats,getChat,messages,createChat,saveMessage,updateChat,removeChat} from "./wize-office-history-note.mjs";

const roles=new Set(["owner","admin"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAccess(user){
 if(!roles.has(user?.roleCode))throw new OfficeError(403,"WIZE_OFFICE_DENIED","Geen rechten voor Wize Office.");
}

function requireOrg(value){
 if(typeof value!=="string"||!uuid.test(value))throw new OfficeError(400,"ORGANIZATION_REQUIRED","Kies eerst een onderneming.");
 return value;
}

function titleFrom(text){
 const value=String(text??"").replace(/\s+/g," ").trim();
 return value.length<=54?value:`${value.slice(0,51).trim()}…`;
}

export async function wizeOfficeHistoryRoute(req,url,client,user,readBody){
 if(url.pathname!=="/api/wize-office/history")return null;
 requireAccess(user);

 if(req.method==="GET"){
   const id=url.searchParams.get("chatId");
   if(!id)return {status:200,data:{chats:await listChats(client,user.id)}};
   const chat=await getChat(client,user.id,chatId(id));
   return {status:200,data:{
     chat:{id:chat.id,organizationId:chat.organization_id,organizationName:chat.organizations?.name??null,title:chat.title,createdAt:chat.created_at,updatedAt:chat.updated_at},
     messages:await messages(client,chat.id),
   }};
 }

 if(req.method!=="POST")throw new OfficeError(405,"METHOD_NOT_ALLOWED","Methode niet toegestaan.");
 const input=await readBody(req);
 const action=typeof input.action==="string"?input.action:"";

 if(action==="new"){
   const org=requireOrg(input.organizationId);
   const chat=await createChat(client,user.id,org);
   return {status:200,data:{chat:{id:chat.id,organizationId:chat.organization_id,title:chat.title,createdAt:chat.created_at,updatedAt:chat.updated_at}}};
 }

 if(action==="rename"){
   const id=chatId(input.chatId);
   await getChat(client,user.id,id);
   const title=String(input.title??"").trim();
   if(!title||title.length>160)throw new OfficeError(400,"INVALID_WIZE_TITLE","De chatnaam is ongeldig.");
   return {status:200,data:{chat:await updateChat(client,user.id,id,{title})}};
 }

 if(action==="delete"){
   const id=chatId(input.chatId);
   await getChat(client,user.id,id);
   await removeChat(client,user.id,id);
   return {status:200,data:{deleted:true}};
 }

 if(action==="append"){
   const id=chatId(input.chatId);
   const chat=await getChat(client,user.id,id);
   const role=input.role==="assistant"?"assistant":"user";
   const content=String(input.content??"").trim();
   if(!content||content.length>12000)throw new OfficeError(400,"INVALID_WIZE_MESSAGE","Het chatbericht is ongeldig.");
   await saveMessage(client,id,role,content);
   const history=await messages(client,id);
   const values={};
   if(chat.title==="Nieuwe chat"&&role==="user"&&history.length===1)values.title=titleFrom(content);
   const updated=await updateChat(client,user.id,id,values);
   return {status:200,data:{chat:updated}};
 }

 throw new OfficeError(400,"INVALID_WIZE_ACTION","Ongeldige Wize-actie.");
}
