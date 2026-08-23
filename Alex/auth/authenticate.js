export class AuthenticationService {
  constructor(users, credentials, sessions) {
    this.users = users;
    this.credentials = credentials;
    this.sessions = sessions;
  }

  async authenticate(userId, password) {
    const user = await this.users.getById(userId);
    const valid = user && await this.credentials.verifyPassword(userId, password);
    if (!valid) return undefined;

    return this.sessions.create(userId);
  }
}