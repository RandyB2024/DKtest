import { OfficeError } from '../auth/supabase.mjs';

export const invalid = () =>
  new OfficeError(
    400,
    'INVALID_KVK_INPUT',
    'Controleer het KvK-nummer en de ingevulde velden.'
  );

export function kvkNumber(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{8}$/.test(value)
  ) {
    throw invalid();
  }

  return value;
}

export function kvkConfig(env) {
  const base =
    env.KVKBASE_API_BASE_URL ||
    'https://api.kvkbase.nl/v1';

  if (
    base !== 'https://api.kvkbase.nl/v1'
  ) {
    throw new OfficeError(
      503,
      'KVK_CONFIGURATION',
      'De KvK-koppeling is nog niet geconfigureerd.'
    );
  }

  return Object.freeze({
    provider:
      'kvkbase',

    mode:
      'production',

    base,

    key:
      env.KVKBASE_API_KEY,

    rpcKey:
      env.KVK_INTAKE_RPC_KEY,
  });
}

export function searchInput(params) {
  const allowed =
    [
      'kvkNumber',
      'name',
      'city',
      'page',
    ];

  for (
    const key of params.keys()
  ) {
    if (
      !allowed.includes(key) ||
      params.getAll(key).length !== 1
    ) {
      throw invalid();
    }
  }

  const number =
    params.get('kvkNumber');

  const name =
    params.get('name')
      ?.trim();

  const city =
    params.get('city')
      ?.trim();

  const page =
    params.get('page') ??
    '1';

  if (
    !/^(?:[1-9]|10)$/.test(
      page,
    )
  ) {
    throw invalid();
  }

  if (
    number !== null
  ) {
    kvkNumber(number);

    if (
      name ||
      city
    ) {
      throw invalid();
    }

    return new URLSearchParams({
      kvkNumber:
        number,

      page,
    });
  }

  if (
    !name ||
    name.length < 2 ||
    name.length > 120 ||
    /^\d+$/.test(name) ||
    /[\x00-\x1f]/.test(name)
  ) {
    throw invalid();
  }

  if (
    city &&
    (
      city.length > 80 ||
      /[\x00-\x1f]/.test(city)
    )
  ) {
    throw invalid();
  }

  return new URLSearchParams({
    q:
      city
        ? `${name} ${city}`
        : name,

    page,

    pageSize:
      '10',
  });
}

export function createKvkClient(
  config,
  transport = fetch,
  timeoutMs = 7000,
) {
  if (
    typeof config.key !==
      'string' ||
    !config.key.trim() ||
    /[\r\n]/.test(
      config.key,
    )
  ) {
    throw new OfficeError(
      503,
      'KVK_CONFIGURATION',
      'De KvK-koppeling is nog niet geconfigureerd.'
    );
  }

  async function get(
    path,
  ) {
    const controller =
      new AbortController();

    let timer;

    const timeout =
      new Promise(
        (
          _,
          reject,
        ) => {
          timer =
            setTimeout(
              () => {
                controller.abort();

                reject(
                  new OfficeError(
                    504,
                    'KVK_TIMEOUT',
                    'KvK reageert niet op tijd. Probeer het later opnieuw.'
                  )
                );
              },
              timeoutMs,
            );
        },
      );

    try {
      return await Promise.race([
        timeout,

        (async () => {
          const response =
            await transport(
              config.base +
                path,

              {
                method:
                  'GET',

                headers: {
                  Authorization:
                    `Bearer ${config.key}`,

                  Accept:
                    'application/json',
                },

                redirect:
                  'manual',

                cache:
                  'no-store',

                signal:
                  controller.signal,
              },
            );

          if (
            !response.ok
          ) {
            throw new OfficeError(
              response.status ===
                404
                ? 404
                : 503,

              response.status ===
                404
                ? 'KVK_NOT_FOUND'
                : 'KVK_UNAVAILABLE',

              response.status ===
                404
                ? 'Geen onderneming gevonden.'
                : 'KvK is tijdelijk niet beschikbaar. Probeer het later opnieuw.'
            );
          }

          const reader =
            response.body
              ?.getReader();

          if (!reader) {
            throw new Error();
          }

          let size =
            0;

          const parts =
            [];

          try {
            while (true) {
              const {
                done,
                value,
              } =
                await reader.read();

              if (done) {
                break;
              }

              size +=
                value.length;

              if (
                size >
                1000000
              ) {
                await reader.cancel();

                throw new Error();
              }

              parts.push(
                value,
              );
            }
          } finally {
            reader.releaseLock();
          }

          const bytes =
            new Uint8Array(
              size,
            );

          let offset =
            0;

          for (
            const part of parts
          ) {
            bytes.set(
              part,
              offset,
            );

            offset +=
              part.length;
          }

          return JSON.parse(
            new TextDecoder()
              .decode(bytes),
          );
        })(),
      ]);
    } catch (error) {
      if (
        error instanceof
          OfficeError
      ) {
        throw error;
      }

      throw new OfficeError(
        503,
        'KVK_UNAVAILABLE',
        'KvK is tijdelijk niet beschikbaar. Probeer het later opnieuw.'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async search(
      query,
    ) {
      const exact =
        query.get(
          'kvkNumber',
        );

      if (exact) {
        try {
          const company =
            await get(
              `/lookup/${kvkNumber(
                exact,
              )}`,
            );

          return {
            results:
              [
                company,
              ],

            total:
              1,

            page:
              1,

            pageSize:
              10,
          };
        } catch (
          error
        ) {
          if (
            error instanceof
              OfficeError &&
            error.code ===
              'KVK_NOT_FOUND'
          ) {
            return {
              results:
                [],

              total:
                0,

              page:
                1,

              pageSize:
                10,
            };
          }

          throw error;
        }
      }

      const providerQuery =
        new URLSearchParams({
          q:
            query.get(
              'q',
            ) ||
            '',

          page:
            query.get(
              'page',
            ) ||
            '1',

          pageSize:
            '10',
        });

      return get(
        `/search?${providerQuery.toString()}`,
      );
    },

    lookup(
      number,
    ) {
      return get(
        `/lookup/${kvkNumber(
          number,
        )}?enrich=true`,
      );
    },
  };
}
