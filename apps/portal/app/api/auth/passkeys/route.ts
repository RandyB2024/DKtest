import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";
import { passkeyAction, passkeyConfig, PasskeyError } from "../../../../../shared/passkeys.mjs";

async function handle(request: Request) {
  return portalApi(request, async session => {
    try {
      const result = await passkeyAction({client:session.client,config:passkeyConfig(process.env),origin:new URL(request.url).origin,
        input:request.method === "GET" ? {action:"list"} : await readBody(request),
        identity:async () => {const i=await requirePortalIdentity(session.client);return {id:i.profile.id,aal2:i.aal2};},
        getChallenge:() => session.getCookie("mdk-passkey-challenge"),setChallenge:session.setChallenge,
      });
      return Response.json(result);
    } catch (error) {
      if(error instanceof PasskeyError) throw new AccessError(error.status,error.message,error.code);
      throw error;
    }
  });
}
export const GET = handle;
export const POST = handle;
