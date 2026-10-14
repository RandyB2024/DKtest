import test from 'node:test';
import assert from 'node:assert/strict';
import {
  randomBytes,
} from 'node:crypto';

import {
  createKvkClient,
  kvkConfig,
  searchInput,
} from '../src/kvk/client.mjs';

import {
  normalizeSearch,
  normalizeLookup,
} from '../src/kvk/normalize.mjs';

import {
  manualInput,
} from '../src/kvk/intake.mjs';

import {
  lookup,
  search,
  kvkTransport,
} from './helpers/kvk-fixture.mjs';


test(
  'zoekinvoer accepteert exact KvK-nummer of naam en plaats',
  () => {
    assert.equal(
      searchInput(
        new URLSearchParams({
          kvkNumber:
            '68750110',
        })
      ).get(
        'kvkNumber'
      ),
      '68750110'
    );


    const query =
      searchInput(
        new URLSearchParams({
          name:
            ' Fixture ',
          city:
            ' Testplaats ',
          page:
            '2',
        })
      );


    assert.equal(
      query.get('q'),
      'Fixture Testplaats'
    );

    assert.equal(
      query.get('page'),
      '2'
    );

    assert.equal(
      query.get('pageSize'),
      '10'
    );


    for (
      const value of [
        'kvkNumber=123',
        'kvkNumber=68750110&name=test',
        'name=a',
        'name=1234567',
        'name=test&page=11',
        'name=test&url=https://evil.invalid',
        'name=test&name=other',
        'name=' +
          'x'.repeat(121),
        'name=test&city=' +
          'x'.repeat(81),
      ]
    ) {
      assert.throws(
        () =>
          searchInput(
            new URLSearchParams(
              value
            )
          )
      );
    }
  }
);


test(
  'KVKBase search wordt beperkt en genormaliseerd',
  () => {
    const result =
      normalizeSearch(
        search()
      );

    assert.equal(
      result.results.length,
      1
    );

    assert.equal(
      result.results[0]
        .kvkNumber,
      '68750110'
    );

    assert.equal(
      result.results[0]
        .status,
      'active'
    );

    assert.equal(
      result.results[0]
        .city,
      'Testplaats'
    );
  }
);


test(
  'KVKBase lookup bevat alleen toegestane bedrijfsgegevens',
  () => {
    const result =
      normalizeLookup(
        lookup(),
        '68750110'
      );


    assert.equal(
      result.kvkNumber,
      '68750110'
    );

    assert.equal(
      result.legalName,
      'Fixture BV'
    );

    assert.equal(
      result.status,
      'active'
    );

    assert.equal(
      result.branchCount,
      2
    );

    assert.equal(
      result.activities[0]
        .primary,
      true
    );


    for (
      const forbidden of [
        'rsin',
        'iban',
        'email',
        'phone',
        'contactPerson',
        'owner',
      ]
    ) {
      assert.equal(
        result[forbidden],
        undefined
      );
    }
  }
);


test(
  'inactief en ongeldige providerrespons falen veilig',
  () => {
    assert.equal(
      normalizeLookup(
        lookup(
          '96354429',
          false
        ),
        '96354429'
      ).status,
      'inactive'
    );


    assert.throws(
      () =>
        normalizeLookup(
          {
            name:
              'Verkeerd',
          },
          '68750110'
        )
    );
  }
);


test(
  'KVKBase configuratie en transport falen veilig',
  async () => {
    assert.throws(
      () =>
        kvkConfig({
          KVKBASE_API_BASE_URL:
            'https://evil.invalid',
        })
    );


    assert.throws(
      () =>
        createKvkClient(
          kvkConfig({})
        )
    );


    const key =
      randomBytes(16)
        .toString('hex');


    const config =
      kvkConfig({
        KVKBASE_API_KEY:
          key,
      });


    const state = {
      key,
    };


    const client =
      createKvkClient(
        config,
        kvkTransport(
          state
        )
      );


    await client.lookup(
      '68750110'
    );


    assert.equal(
      state.calls[0]
        .pathname,
      '/v1/lookup/68750110'
    );


    await assert.rejects(
      client.lookup(
        '90004973'
      ),
      error =>
        error.code ===
          'KVK_UNAVAILABLE'
        &&
        !error.message.includes(
          key
        )
    );


    await assert.rejects(
      createKvkClient(
        config,
        () =>
          new Promise(
            () => {}
          ),
        5
      ).lookup(
        '68750110'
      ),
      error =>
        error.code ===
          'KVK_TIMEOUT'
    );
  }
);


test(
  'handmatige intake blijft begrensd en expliciet',
  () => {
    assert.deepEqual(
      manualInput({
        relationshipName:
          ' Client ',
        email:
          '',
      }),
      {
        relationshipName:
          'Client',
        email:
          '',
      }
    );


    for (
      const input of [
        {},
        {
          relationshipName:
            '',
        },
        {
          relationshipName:
            'Client',
          kvkNumber:
            '68750110',
        },
        {
          relationshipName:
            'Client',
          iban:
            3,
        },
        {
          relationshipName:
            'Client',
          email:
            'bad',
        },
        {
          relationshipName:
            'Client',
          services:
            'x'.repeat(1001),
        },
      ]
    ) {
      assert.throws(
        () =>
          manualInput(
            input
          )
      );
    }
  }
);
