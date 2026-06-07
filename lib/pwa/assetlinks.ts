import { webApkPackageNamesForSite } from "@/lib/pwa/webapk-package";

/**
 * SHA-256 signing certificates used by Chrome's WebAPK minting service.
 * Multiple entries cover Chrome release channels / key rotations.
 * @see https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs
 */
const CHROME_WEBAPK_SHA256_FINGERPRINTS = [
  "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:3F:49:FF:6A:83:87:5C:89:89:60:67:C6:60:2E:E9",
  "58:FE:82:EB:0E:41:E2:64:84:86:87:DF:15:8F:36:74:20:DB:46:8A:DE:EC:32:15:37:16:32:44:27:48:73:5A",
  "7C:42:CE:EA:30:EE:0F:63:91:72:BF:27:21:0A:63:69:56:0F:A1:C5:32:13:46:11:27:A1:1C:9B:A7:CF:4D:EF",
  "18:46:5B:78:92:2B:46:79:DC:77:69:34:91:59:12:70:54:83:48:70:30:EE:58:84:50:71:90:71:65:15:94:18",
] as const;

export type AssetLinkStatement = {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

/** Digital Asset Links for Chrome WebAPK verification (Add to Home Screen / Install app). */
export function buildWebApkAssetLinkStatements(): AssetLinkStatement[] {
  return webApkPackageNamesForSite().map((packageName) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: [...CHROME_WEBAPK_SHA256_FINGERPRINTS],
    },
  }));
}

export function buildAssetLinksJson(): string {
  return `${JSON.stringify(buildWebApkAssetLinkStatements(), null, 2)}\n`;
}
