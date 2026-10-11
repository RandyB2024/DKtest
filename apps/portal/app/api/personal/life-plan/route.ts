import {
  requireAal2,
} from "@/lib/portal-access";

import {
  requirePersonalIdentity,
} from "@/lib/personal-access";

import {
  portalApi,
  readBody,
} from "@/lib/portal-api";


export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePersonalIdentity(
          client,
        );

      requireAal2(identity);


      const {
        data,
        error,
      } =
        await client.rpc(
          "personal_life_plan_get",
        );


      if (error) {
        console.error(
          "personal_life_plan_get failed",
          {
            code: error.code,
            message: error.message,
          },
        );

        return Response.json(
          {
            error:
              "Uw levensplan kan tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }


      return Response.json(
        data,
      );
    },
  );
}


export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePersonalIdentity(
          client,
        );

      requireAal2(identity);

      const body =
        await readBody(
          request,
        );


      if (
        body.action ===
        "save-plan"
      ) {
        const {
          data,
          error,
        } =
          await client.rpc(
            "personal_life_plan_save",
            {
              p_input:
                body.plan,
            },
          );


        if (error) {
          console.error(
            "personal_life_plan_save failed",
            {
              code: error.code,
              message: error.message,
            },
          );

          return Response.json(
            {
              error:
                "Het levensplan kon niet worden opgeslagen.",
            },
            {
              status: 400,
            },
          );
        }


        return Response.json(
          data,
        );
      }


      if (
        body.action ===
        "save-goal"
      ) {
        const {
          error,
        } =
          await client.rpc(
            "personal_life_goal_save",
            {
              p_goal_id:
                typeof body.goalId ===
                  "string"
                  ? body.goalId
                  : null,

              p_input:
                body.goal,
            },
          );


        if (error) {
          return Response.json(
            {
              error:
                "Het doel kon niet worden opgeslagen.",
            },
            {
              status: 400,
            },
          );
        }


        return Response.json({
          ok: true,
        });
      }


      if (
        body.action ===
        "delete-goal" &&
        typeof body.goalId ===
          "string"
      ) {
        const {
          error,
        } =
          await client.rpc(
            "personal_life_goal_delete",
            {
              p_goal_id:
                body.goalId,
            },
          );


        if (error) {
          return Response.json(
            {
              error:
                "Het doel kon niet worden verwijderd.",
            },
            {
              status: 400,
            },
          );
        }


        return Response.json({
          ok: true,
        });
      }


      return Response.json(
        {
          error:
            "Ongeldige actie.",
        },
        {
          status: 400,
        },
      );
    },
  );
}
