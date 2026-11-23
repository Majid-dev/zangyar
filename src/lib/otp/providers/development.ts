import "server-only";

import { generateOtpCode } from "../code";
import type { OtpConfig } from "../config";
import { maskIranianMobile } from "@/lib/mobile";
import type { OtpDeliveryRequest, OtpDeliveryResult, OtpProvider } from "../provider";

/**
 * Development OTP provider.
 *
 * Issues the configured fixed code instead of a random one and writes it to the
 * server log rather than sending it. That log line is the only place a code is
 * ever printed, and this provider cannot be selected in production: the gate in
 * `../environment.ts` refuses it before it is ever constructed.
 *
 * The code is never rendered to a client. Surfacing it in the UI would place a
 * working credential into the page.
 */
export class DevelopmentOtpProvider implements OtpProvider {
  readonly name = "development";

  constructor(private readonly config: OtpConfig) {}

  issueCode() {
    // Returning the configured value as-is is what makes "in development, OTP
    // requests are accepted using the configured fixed code" true without any
    // environment check in the code that consumes it.
    return this.config.fixedCode;
  }

  async send(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    const mobile = maskIranianMobile(request.mobile) ?? "unknown";
    const expiresInSeconds = Math.max(0, Math.round((request.expiresAt.getTime() - Date.now()) / 1000));
    const school = request.context?.schoolName ? ` school="${request.context.schoolName}"` : "";

    // Deliberately plain and greppable: this is how a developer obtains the code
    // locally. The number stays masked so the log is not a contact list.
    console.info(
      `[otp:development] purpose=${request.purpose} mobile=${mobile}${school} code=${request.code} expiresIn=${expiresInSeconds}s`,
    );

    return { ok: true, providerName: this.name, providerMessageId: `dev-${request.purpose.toLowerCase()}` };
  }
}

/**
 * Random-code provider.
 *
 * Not selected by configuration — it exists so tests can exercise the generation
 * path and so a future provider has a working example of `issueCode` producing a
 * fresh code.
 */
export class RandomOtpProvider implements OtpProvider {
  readonly name = "random";

  constructor(private readonly config: OtpConfig) {}

  issueCode() {
    return generateOtpCode(this.config.codeLength);
  }

  async send(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    return { ok: true, providerName: this.name, providerMessageId: `random-${request.purpose.toLowerCase()}` };
  }
}
