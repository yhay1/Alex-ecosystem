import test from "node:test";
import assert from "node:assert/strict";

import {
  AccountIdentifier,
  AuthenticationService,
  CredentialService,
  SessionService,
  UserService,
} from "../Alex/auth/index.js";
import { InMemoryDatabaseService } from "../Alex/database/memory.js";

function services() {
  const database = new InMemoryDatabaseService();
  const users = new UserService(database);
  const credentials = new CredentialService(database);
  const sessions = new SessionService(database);
  return { users, credentials, sessions };
}

test("creates users and stores credentials through the shared database", async () => {
  const { users, credentials } = services();
  const user = await users.create({ id: "user-1", accountId: "account-1" });

  await credentials.setPassword(user.id, "correct horse battery staple");
  assert.equal(await credentials.verifyPassword(user.id, "correct horse battery staple"), true);
  assert.equal(await credentials.verifyPassword(user.id, "wrong password"), false);
});

test("rejects weak passwords", async () => {
  const { credentials } = services();

  await assert.rejects(() => credentials.setPassword("user-1", "short"), /8 characters/);
});

test("authenticates users and identifies accounts from session tokens", async () => {
  const { users, credentials, sessions } = services();
  const user = await users.create({ id: "user-1", accountId: "account-1" });
  await credentials.setPassword(user.id, "correct horse battery staple");
  const authentication = new AuthenticationService(users, credentials, sessions);
  const identifier = new AccountIdentifier(users, sessions);

  assert.equal(await authentication.authenticate(user.id, "wrong password"), undefined);
  const session = await authentication.authenticate(user.id, "correct horse battery staple");
  assert.equal((await identifier.identify(session.token)).accountId, "account-1");
});

test("does not identify expired sessions", async () => {
  const { users, sessions } = services();
  const user = await users.create({ id: "user-1" });
  const session = await sessions.create(user.id, { expiresAt: "2000-01-01T00:00:00.000Z" });
  const identifier = new AccountIdentifier(users, sessions);

  assert.equal(await identifier.identify(session.token), undefined);
});