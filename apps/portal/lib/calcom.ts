const CALCOM_BASE_URL =
  "https://api.cal.com/v2";

const CALCOM_API_VERSION =
  "2026-02-25";


function getApiKey() {
  const key =
    process.env.CALCOM_API_KEY;

  if (!key) {
    throw new Error(
      "CALCOM_API_KEY ontbreekt.",
    );
  }

  return key;
}


export async function calcomRequest(
  path: string,
  init: RequestInit = {},
) {
  const key =
    getApiKey();

  const response =
    await fetch(
      `${CALCOM_BASE_URL}${path}`,
      {
        ...init,

        headers: {
          Authorization:
            `Bearer ${key}`,

          "cal-api-version":
            CALCOM_API_VERSION,

          "content-type":
            "application/json",

          ...(init.headers ?? {}),
        },

        cache:
          "no-store",
      },
    );

  const text =
    await response.text();

  let data: unknown =
    null;

  if (text) {
    try {
      data =
        JSON.parse(
          text,
        );
    } catch {
      data =
        text;
    }
  }

  if (!response.ok) {
    console.error(
      "Cal.com API error",
      {
        path,
        status:
          response.status,
        data,
      },
    );

    throw new Error(
      `Cal.com API fout (${response.status}).`,
    );
  }

  return data;
}

export function getCalcomSyncKey() {
  const key =
    process.env
      .CALCOM_SYNC_RPC_KEY;

  if (
    !key ||
    key.length < 32
  ) {
    throw new Error(
      "CALCOM_SYNC_RPC_KEY ontbreekt.",
    );
  }

  return key;
}
