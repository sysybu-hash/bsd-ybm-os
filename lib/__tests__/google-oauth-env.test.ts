import { accountUsesRestrictedGoogleScopes } from "@/lib/google-oauth-env";
import { GOOGLE_DRIVE_FILE_SCOPE } from "@/lib/google-drive-config";

describe("accountUsesRestrictedGoogleScopes", () => {
  it("treats drive.file as integrations scope", () => {
    expect(accountUsesRestrictedGoogleScopes(`openid email ${GOOGLE_DRIVE_FILE_SCOPE}`)).toBe(true);
  });

  it("treats calendar scope as integrations scope", () => {
    expect(accountUsesRestrictedGoogleScopes("openid https://www.googleapis.com/auth/calendar")).toBe(
      true,
    );
  });

  it("sign-in-only scopes use sign-in client", () => {
    expect(accountUsesRestrictedGoogleScopes("openid email profile")).toBe(false);
  });
});
