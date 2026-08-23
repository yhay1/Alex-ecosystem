export class AccountIdentifier {
  constructor(users, sessions) {
    this.users = users;
    this.sessions = sessions;
  }

  async identify(sessionToken) {
    if (!sessionToken) return undefined;
    const session = await this.sessions.findByToken(sessionToken);
    return session ? this.users.getById(session.userId) : undefined;
  }
}