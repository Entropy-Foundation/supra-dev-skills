// node assets/scripts/check-suprans.mjs [testnet]
//
// Asserts the on-chain shape that `lib/suprans.ts` parses: the router module is
// deployed, `get_primary_name` returns a 2-tuple of Move Options in
// (subdomain, domain) order, and an account with no name is a successful 200
// rather than an error.
//
// Run this after changing the resolver, and whenever every account suddenly
// resolves to "no name" — it separates "our parsing broke" from "we're pointed
// at the wrong network".
import assert from 'node:assert/strict';

const NETWORKS = {
  mainnet: {
    rpc: 'https://rpc-mainnet.supra.com',
    router: '0x41aa7e05da1d6f014a59247d06c1832fc4437964b8d21e1f8df7a464f06ea920',
    // An account that has a primary name set. If this ever stops having one the
    // "named" assertions fail loudly — swap in any other named account.
    named: '0x944f432f645bc38929c1995a71ac02366bd86af8c6f75ab378efc147d776c2f1',
  },
  testnet: {
    rpc: 'https://rpc-testnet.supra.com',
    router: '0x5b3edb4f28b69c21d11ca55120460f1ad1f0baa20fb5ccbe4663092faee9ac48',
    named: process.env.SUPRANS_TESTNET_NAMED_ADDRESS,
  },
};

const network = process.argv[2] ?? 'mainnet';
const config = NETWORKS[network];
assert.ok(config, `unknown network "${network}" — use mainnet or testnet`);

const view = async (fn, args) => {
  const response = await fetch(`${config.rpc}/rpc/v3/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      function: `${config.router}::router::${fn}`,
      type_arguments: [],
      arguments: args,
    }),
  });
  assert.equal(response.status, 200, `${fn} should return 200`);
  return (await response.json()).result;
};

// 1. The router is actually deployed at this address on this network.
const modules = await fetch(
  `${config.rpc}/rpc/v3/accounts/${config.router}/modules`,
).then((r) => r.json());
const names = modules.map((m) => m.abi?.name);
assert.ok(names.includes('router'), `no "router" module at ${config.router} — got [${names}]`);

// 2. An account with no name is a successful empty answer, not an error.
const unnamed = await view('get_primary_name', [`0x${'0'.repeat(61)}123`]);
assert.deepEqual(unnamed, [{ vec: [] }, { vec: [] }], 'no name should be 200 + empty options');

// 3. An account with a name returns (subdomain, domain). Assert the *shape*,
//    not the literal label — the name belongs to a third party and is transferable.
if (!config.named) {
  console.log(`${network}: router OK, empty-case OK (set SUPRANS_TESTNET_NAMED_ADDRESS for the named case)`);
  process.exit(0);
}

const named = await view('get_primary_name', [config.named]);
assert.ok(Array.isArray(named) && named.length === 2, 'get_primary_name returns a 2-tuple');
assert.deepEqual(named[0], { vec: [] }, 'result[0] is the subdomain Option (None for a bare domain)');
assert.equal(named[1].vec.length, 1, 'result[1] is the domain Option (Some)');
assert.equal(typeof named[1].vec[0], 'string', 'domain label is a string');

// 4. Round trip: the domain must resolve forward to the same account. This is
//    what proves result[1] really is the domain and not the subdomain.
const domain = named[1].vec[0];
const target = await view('get_target_addr', [domain, { vec: [] }]);
assert.equal(target[0].vec.length, 1, `get_target_addr("${domain}") should resolve`);
assert.equal(
  BigInt(target[0].vec[0]),
  BigInt(config.named),
  'forward resolution must return the account we reverse-resolved from',
);

console.log(`${network}: SupraNS contract shape OK (${domain}.supra round-trips)`);
