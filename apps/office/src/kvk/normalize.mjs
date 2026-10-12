import { OfficeError } from '../auth/supabase.mjs';

const fail = () => {
  throw new OfficeError(
    503,
    'KVK_RESPONSE',
    'KvK-gegevens zijn niet volledig te controleren. Probeer het later opnieuw.'
  );
};

const text = (
  value,
  max = 200,
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !==
      'string'
  ) {
    fail();
  }

  const result =
    value.trim();

  if (
    result.length >
    max
  ) {
    fail();
  }

  return result ||
    null;
};

function address(
  value,
) {
  if (!value) {
    return null;
  }

  if (
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    fail();
  }

  const result = {};

  if (
    value.street !==
      undefined
  ) {
    result.straatnaam =
      text(
        value.street,
        300,
      );
  }

  if (
    value.houseNumber !==
      undefined &&
    value.houseNumber !==
      null
  ) {
    result.huisnummer =
      text(
        String(
          value.houseNumber,
        ),
        30,
      );
  }

  if (
    value.postalCode !==
      undefined
  ) {
    result.postcode =
      text(
        value.postalCode,
        30,
      );
  }

  if (
    value.city !==
      undefined
  ) {
    result.plaats =
      text(
        value.city,
        200,
      );
  }

  if (
    value.country !==
      undefined
  ) {
    result.land =
      text(
        value.country,
        100,
      );
  }

  return Object.keys(
    result,
  ).length
    ? result
    : null;
}

export function normalizeSearch(
  raw,
  requestedPage = 1,
) {
  if (
    !raw ||
    !Array.isArray(
      raw.results,
    )
  ) {
    fail();
  }

  const page =
    Number.isSafeInteger(
      Number(raw.page),
    )
      ? Number(
          raw.page,
        )
      : Number(
          requestedPage,
        );

  const pageSize =
    Number.isSafeInteger(
      Number(
        raw.pageSize,
      ),
    )
      ? Number(
          raw.pageSize,
        )
      : 10;

  const total =
    Number.isSafeInteger(
      Number(raw.total),
    )
      ? Number(
          raw.total,
        )
      : raw.results.length;

  const results =
    raw.results
      .slice(
        0,
        10,
      )
      .map(
        (
          company,
        ) => {
          if (
            !company ||
            !/^\d{8}$/.test(
              company.kvkNumber ??
                '',
            )
          ) {
            fail();
          }

          return {
            kvkNumber:
              company.kvkNumber,

            name:
              text(
                company.name,
              ),

            type:
              'rechtspersoon',

            status:
              company.isActive ===
                true
                ? 'active'
                : company.isActive ===
                    false
                  ? 'inactive'
                  : 'unknown',

            city:
              text(
                company.city ??
                  company.address
                    ?.city,
              ),
          };
        },
      );

  return {
    results,

    page,

    hasMore:
      page < 10 &&
      total >
        page *
          pageSize,
  };
}

export function normalizeLookup(
  raw,
  number,
) {
  if (
    !raw ||
    raw.kvkNumber !==
      number
  ) {
    fail();
  }

  const name =
    text(
      raw.name,
    );

  if (!name) {
    fail();
  }

  const tradeNames =
    raw.tradingNames ===
      undefined
      ? []
      : Array.isArray(
          raw.tradingNames,
        )
        ? raw.tradingNames
            .slice(
              0,
              100,
            )
            .map(
              (
                value,
              ) =>
                text(
                  value,
                ),
            )
            .filter(
              Boolean,
            )
        : fail();

  const activities =
    raw.activities ===
      undefined
      ? []
      : Array.isArray(
          raw.activities,
        )
        ? raw.activities
            .slice(
              0,
              100,
            )
            .map(
              (
                activity,
              ) => {
                if (
                  !activity ||
                  typeof activity !==
                    'object'
                ) {
                  fail();
                }

                return {
                  code:
                    text(
                      activity.sbiCode,
                      10,
                    ),

                  description:
                    text(
                      activity.description,
                      500,
                    ),

                  primary:
                    activity.isMain ===
                      true,
                };
              },
            )
        : fail();

  return {
    kvkNumber:
      number,

    name,

    legalName:
      text(
        raw.legalName,
      ),

    tradeNames,

    legalForm:
      text(
        raw.legalForm,
      ),

    status:
      raw.isActive ===
        true
        ? 'active'
        : raw.isActive ===
            false
          ? 'inactive'
          : 'unknown',

    registeredAt:
      text(
        raw.registrationDate,
        40,
      ),

    startedAt:
      null,

    visitAddress:
      address(
        raw.address,
      ),

    postalAddress:
      null,

    mainBranchNumber:
      null,

    branchCount:
      Number.isSafeInteger(
        raw.branchCount,
      )
        ? raw.branchCount
        : null,

    activities,
  };
}
