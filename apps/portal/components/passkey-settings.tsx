"use client";
import { useEffect, useRef } from "react";
import { mountPasskeySettings } from "../public/passkeys.js";

export async function passkeyApi(path: string, body?: unknown) {
  const response=await fetch(path,{method:body === undefined ? "GET" : "POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const data=await response.json() as { error?: string };
  if(!response.ok)throw new Error(data.error ?? "Passkeys zijn tijdelijk niet beschikbaar.");
  return data;
}
export default function PasskeySettings(){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(root.current)return mountPasskeySettings(root.current,passkeyApi);},[]);
  return <div ref={root}/>;
}

