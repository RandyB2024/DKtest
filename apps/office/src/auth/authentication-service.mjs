/** Toekomstvast contract: lokale keuze en WebAuthn delen dezelfde sessielaag. */
export class AuthenticationService {
  async beginAuthentication() { throw new Error("Not implemented"); }
  async completeAuthentication() { throw new Error("Not implemented"); }
  async beginStepUp() { throw new Error("Not implemented"); }
  async completeStepUp() { throw new Error("Not implemented"); }
}

export class LocalDevelopmentAuthenticationProvider extends AuthenticationService {
  constructor({ enabled }) {
    super();
    if (!enabled) throw new Error("Lokale authenticatieprovider is uitgeschakeld.");
  }
  async completeAuthentication({ userId }) {
    if (!['randy', 'ed'].includes(userId)) throw new Error("Onbekende lokale gebruiker.");
    return { userId, displayName: userId === 'randy' ? 'Randy' : 'Ed', method: 'development-bypass' };
  }
}

export class WebAuthnAuthenticationProvider extends AuthenticationService {
  async beginAuthentication() {
    throw new Error("WebAuthn wordt geactiveerd bij online deployment.");
  }
}
