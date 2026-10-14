export function lookup(
  number = '68750110',
  active = true
) {
  return {
    kvkNumber: number,
    name:
      number === '69599084'
        ? 'Fixture Eenmanszaak'
        : 'Fixture BV',
    legalName:
      number === '69599084'
        ? null
        : 'Fixture BV',
    tradingNames: [
      'Fixture handel',
      'Andere handelsnaam',
    ],
    legalForm:
      number === '69599084'
        ? 'Eenmanszaak'
        : 'Besloten Vennootschap',
    isActive: active,
    registrationDate: '2020-01-01',
    branchCount: 2,
    address: {
      street: 'Teststraat',
      houseNumber: '1',
      postalCode: '1234AB',
      city: 'Testplaats',
      country: 'NL',
    },
    activities: [
      {
        sbiCode: '62010',
        description: 'Testactiviteit',
        isMain: true,
      },
    ],
  };
}


export function search(
  number = '68750110',
  active = true
) {
  return {
    results: [
      {
        kvkNumber: number,
        name: 'Fixture',
        isActive: active,
        city: 'Testplaats',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  };
}


export function kvkTransport(
  state = {}
) {
  return async (
    input,
    init
  ) => {
    const url =
      new URL(input);

    if (
      url.origin !==
        'https://api.kvkbase.nl'
      ||
      !url.pathname.startsWith(
        '/v1/'
      )
    ) {
      throw new Error(
        'Geen live providerverkeer toegestaan in tests.'
      );
    }


    state.calls ??=
      [];

    state.calls.push(
      url
    );


    if (
      init.headers.Authorization !==
      `Bearer ${state.key}`
    ) {
      throw new Error(
        'Fixture API key ontbreekt.'
      );
    }


    if (
      url.pathname ===
        '/v1/search'
    ) {
      return Response.json(
        state.search ??
        search()
      );
    }


    if (
      url.pathname.startsWith(
        '/v1/lookup/'
      )
    ) {
      const number =
        url.pathname
          .split('/')
          .pop();

      if (
        number ===
        '90004973'
      ) {
        return Response.json(
          {
            message:
              'PRIVATE UPSTREAM',
          },
          {
            status: 500,
          }
        );
      }


      return Response.json(
        state.lookup ??
        lookup(
          number
        )
      );
    }


    return Response.json(
      {},
      {
        status: 404,
      }
    );
  };
}
