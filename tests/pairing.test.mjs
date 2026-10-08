import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingError, RemotePairing, parseRemoteOrigin } from '../dist/server/remote-pairing.js';

const origin = 'https://mayuna.example';

test('origin parser requires one exact HTTPS origin', () => {
  assert.equal(parseRemoteOrigin(origin), origin);
  assert.equal(parseRemoteOrigin(undefined), null);
  assert.equal(parseRemoteOrigin('http://localhost:8080'), 'http://localhost:8080');
  for (const value of ['http://mayuna.example', 'https://mayuna.example/path', 'https://user:pass@mayuna.example']) {
    assert.throws(() => parseRemoteOrigin(value));
  }
});

test('pairing code is one-use, short-lived, origin-bound and revocable', () => {
  let now = 1_000_000;
  const pairing = new RemotePairing(origin, () => now);
  const created = pairing.createCode();
  assert.throws(() => pairing.exchange(created.code, 'https://attacker.example', 'ip-a'), error => error.status === 403);
  const session = pairing.exchange(created.code, origin, 'ip-a');
  assert.equal(pairing.authorize(`Bearer ${session.token}`, origin), session.token);
  assert.equal(pairing.authorize(`Bearer ${session.token}`, 'https://attacker.example'), null);
  assert.throws(() => pairing.exchange(created.code, origin, 'ip-a'), error => error.status === 401);
  pairing.revoke(session.token);
  assert.equal(pairing.authorize(`Bearer ${session.token}`, origin), null);
});

test('expired codes and repeated guesses are rejected without issuing sessions', () => {
  let now = 0;
  const pairing = new RemotePairing(origin, () => now);
  const code = pairing.createCode().code;
  now += 120_001;
  assert.throws(() => pairing.exchange(code, origin, 'ip'), error => error.status === 401);
  const next = pairing.createCode().code;
  for (let i = 0; i < 5; i++) assert.throws(() => pairing.exchange('99999999', origin, 'ip'), error => error.status === 401);
  assert.throws(() => pairing.exchange(next, origin, 'ip'), error => error.status === 401);
  assert.throws(() => pairing.exchange(next, origin, 'ip'), error => error.status === 401);
  assert.throws(() => pairing.exchange(next, origin, 'ip'), error => error.status === 401);
  assert.throws(() => pairing.exchange(next, origin, 'ip'), error => error.status === 401);
  assert.throws(() => pairing.exchange(next, origin, 'ip'), error => error.status === 429);
});

test('pairing is disabled unless an exact allowed origin is configured', () => {
  const pairing = new RemotePairing(null);
  assert.deepEqual(pairing.status(), { enabled: false, codeTtlSeconds: 120, sessionTtlSeconds: 7200 });
  assert.throws(() => pairing.createCode(), error => error instanceof PairingError && error.status === 503);
});
