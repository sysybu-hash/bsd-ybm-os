import type { JewishCalendarLocation } from "./types";

const TZ = "Asia/Jerusalem";

/** ערים מרכזיות בישראל — קואורדינטות וגובה משוערים */
export const ISRAEL_LOCATIONS: JewishCalendarLocation[] = [
  { id: "jerusalem", nameHe: "ירושלים", nameEn: "Jerusalem", lat: 31.778, lng: 35.235, elevation: 754, timezone: TZ },
  { id: "tel-aviv", nameHe: "תל אביב", nameEn: "Tel Aviv", lat: 32.0853, lng: 34.7818, elevation: 5, timezone: TZ },
  { id: "haifa", nameHe: "חיפה", nameEn: "Haifa", lat: 32.794, lng: 34.9896, elevation: 40, timezone: TZ },
  { id: "beer-sheva", nameHe: "באר שבע", nameEn: "Beersheba", lat: 31.2518, lng: 34.7913, elevation: 260, timezone: TZ },
  { id: "ashdod", nameHe: "אשדוד", nameEn: "Ashdod", lat: 31.8044, lng: 34.6553, elevation: 25, timezone: TZ },
  { id: "ashkelon", nameHe: "אשקלון", nameEn: "Ashkelon", lat: 31.669, lng: 34.5715, elevation: 20, timezone: TZ },
  { id: "netanya", nameHe: "נתניה", nameEn: "Netanya", lat: 32.3215, lng: 34.8532, elevation: 30, timezone: TZ },
  { id: "rishon-lezion", nameHe: "ראשון לציון", nameEn: "Rishon LeZion", lat: 31.973, lng: 34.7925, elevation: 20, timezone: TZ },
  { id: "petah-tikva", nameHe: "פתח תקווה", nameEn: "Petah Tikva", lat: 32.084, lng: 34.8878, elevation: 35, timezone: TZ },
  { id: "bnei-brak", nameHe: "בני ברק", nameEn: "Bnei Brak", lat: 32.0807, lng: 34.8338, elevation: 45, timezone: TZ },
  { id: "holon", nameHe: "חולון", nameEn: "Holon", lat: 32.0117, lng: 34.7745, elevation: 20, timezone: TZ },
  { id: "ramat-gan", nameHe: "רמת גן", nameEn: "Ramat Gan", lat: 32.0684, lng: 34.8248, elevation: 45, timezone: TZ },
  { id: "bat-yam", nameHe: "בת ים", nameEn: "Bat Yam", lat: 32.0171, lng: 34.7454, elevation: 10, timezone: TZ },
  { id: "rehovot", nameHe: "רחובות", nameEn: "Rehovot", lat: 31.8948, lng: 34.8118, elevation: 65, timezone: TZ },
  { id: "herzliya", nameHe: "הרצליה", nameEn: "Herzliya", lat: 32.1624, lng: 34.8447, elevation: 25, timezone: TZ },
  { id: "kfar-saba", nameHe: "כפר סבא", nameEn: "Kfar Saba", lat: 32.175, lng: 34.9069, elevation: 50, timezone: TZ },
  { id: "raanana", nameHe: "רעננה", nameEn: "Raanana", lat: 32.1844, lng: 34.8708, elevation: 45, timezone: TZ },
  { id: "hod-hasharon", nameHe: "הוד השרון", nameEn: "Hod HaSharon", lat: 32.1593, lng: 34.8932, elevation: 55, timezone: TZ },
  { id: "modiin", nameHe: "מודיעין", nameEn: "Modiin", lat: 31.8969, lng: 35.0097, elevation: 245, timezone: TZ },
  { id: "lod", nameHe: "לוד", nameEn: "Lod", lat: 31.9514, lng: 34.8881, elevation: 70, timezone: TZ },
  { id: "ramla", nameHe: "רמלה", nameEn: "Ramla", lat: 31.9293, lng: 34.7987, elevation: 80, timezone: TZ },
  { id: "nazareth", nameHe: "נצרת", nameEn: "Nazareth", lat: 32.6996, lng: 35.3035, elevation: 347, timezone: TZ },
  { id: "acre", nameHe: "עכו", nameEn: "Acre", lat: 32.9275, lng: 35.0836, elevation: 10, timezone: TZ },
  { id: "tiberias", nameHe: "טבריה", nameEn: "Tiberias", lat: 32.7959, lng: 35.531, elevation: -200, timezone: TZ },
  { id: "safed", nameHe: "צפת", nameEn: "Safed", lat: 32.9646, lng: 35.496, elevation: 900, timezone: TZ },
  { id: "eilat", nameHe: "אילת", nameEn: "Eilat", lat: 29.5577, lng: 34.9519, elevation: 12, timezone: TZ },
  { id: "dimona", nameHe: "דימונה", nameEn: "Dimona", lat: 31.0694, lng: 35.0334, elevation: 550, timezone: TZ },
  { id: "arad", nameHe: "ערד", nameEn: "Arad", lat: 31.2589, lng: 35.2128, elevation: 570, timezone: TZ },
  { id: "kiryat-gat", nameHe: "קריית גת", nameEn: "Kiryat Gat", lat: 31.61, lng: 34.7642, elevation: 125, timezone: TZ },
  { id: "kiryat-malachi", nameHe: "קריית מלאכי", nameEn: "Kiryat Malachi", lat: 31.7301, lng: 34.7461, elevation: 80, timezone: TZ },
  { id: "sderot", nameHe: "שדרות", nameEn: "Sderot", lat: 31.525, lng: 34.5969, elevation: 70, timezone: TZ },
  { id: "ofakim", nameHe: "אופקים", nameEn: "Ofakim", lat: 31.3148, lng: 34.6203, elevation: 140, timezone: TZ },
  { id: "netivot", nameHe: "נתיבות", nameEn: "Netivot", lat: 31.4231, lng: 34.5893, elevation: 160, timezone: TZ },
  { id: "beitar-illit", nameHe: "ביתר עילית", nameEn: "Beitar Illit", lat: 31.6954, lng: 35.1132, elevation: 718, timezone: TZ },
  { id: "modiin-illit", nameHe: "מודיעין עילית", nameEn: "Modiin Illit", lat: 31.9322, lng: 35.0422, elevation: 286, timezone: TZ },
  { id: "elad", nameHe: "אלעד", nameEn: "Elad", lat: 32.0493, lng: 34.9547, elevation: 90, timezone: TZ },
  { id: "beit-shemesh", nameHe: "בית שמש", nameEn: "Beit Shemesh", lat: 31.7514, lng: 34.9888, elevation: 250, timezone: TZ },
  { id: "givat-shmuel", nameHe: "גבעת שמואל", nameEn: "Givat Shmuel", lat: 32.0782, lng: 34.8486, elevation: 70, timezone: TZ },
  { id: "yokneam", nameHe: "יוקנעם", nameEn: "Yokneam", lat: 32.6602, lng: 35.104, elevation: 206, timezone: TZ },
  { id: "afula", nameHe: "עפולה", nameEn: "Afula", lat: 32.6091, lng: 35.2895, elevation: 80, timezone: TZ },
  { id: "nahariya", nameHe: "נהריה", nameEn: "Nahariya", lat: 33.0089, lng: 35.0981, elevation: 10, timezone: TZ },
  { id: "kiryat-shmona", nameHe: "קריית שמונה", nameEn: "Kiryat Shmona", lat: 33.2079, lng: 35.5702, elevation: 120, timezone: TZ },
  { id: "maalot", nameHe: "מעלות", nameEn: "Maalot", lat: 33.0167, lng: 35.2833, elevation: 520, timezone: TZ },
  { id: "zichron-yaakov", nameHe: "זכרון יעקב", nameEn: "Zichron Yaakov", lat: 32.5702, lng: 34.9544, elevation: 95, timezone: TZ },
  { id: "hadera", nameHe: "חדרה", nameEn: "Hadera", lat: 32.434, lng: 34.9195, elevation: 15, timezone: TZ },
  { id: "caesarea", nameHe: "קיסריה", nameEn: "Caesarea", lat: 32.5, lng: 34.9, elevation: 15, timezone: TZ },
  { id: "golan", nameHe: "קצרין (גולן)", nameEn: "Katzrin", lat: 32.9915, lng: 35.6905, elevation: 370, timezone: TZ },
  { id: "maale-adumim", nameHe: "מעלה אדומים", nameEn: "Maale Adumim", lat: 31.7774, lng: 35.298, elevation: 350, timezone: TZ },
  { id: "gush-etzion", nameHe: "גוש עציון", nameEn: "Gush Etzion", lat: 31.6534, lng: 35.1197, elevation: 930, timezone: TZ },
  { id: "ariel", nameHe: "אריאל", nameEn: "Ariel", lat: 32.1046, lng: 35.1797, elevation: 580, timezone: TZ },
];

export const DEFAULT_LOCATION_ID = "jerusalem";

export function getLocationById(id: string): JewishCalendarLocation | undefined {
  return ISRAEL_LOCATIONS.find((loc) => loc.id === id);
}

export function getDefaultLocation(): JewishCalendarLocation {
  return getLocationById(DEFAULT_LOCATION_ID)!;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveLocation(coords: { lat: number; lng: number }): JewishCalendarLocation {
  let best = getDefaultLocation();
  let bestDist = Infinity;
  for (const loc of ISRAEL_LOCATIONS) {
    const d = haversineKm(coords.lat, coords.lng, loc.lat, loc.lng);
    if (d < bestDist) {
      bestDist = d;
      best = loc;
    }
  }
  if (bestDist > 80) {
    return {
      id: "custom",
      nameHe: "מיקום מותאם",
      nameEn: "Custom location",
      lat: coords.lat,
      lng: coords.lng,
      elevation: 0,
      timezone: TZ,
    };
  }
  return best;
}

export function searchLocations(query: string, limit = 20): JewishCalendarLocation[] {
  const q = query.trim().toLowerCase();
  if (!q) return ISRAEL_LOCATIONS.slice(0, limit);
  return ISRAEL_LOCATIONS.filter(
    (loc) =>
      loc.nameHe.includes(query.trim()) ||
      loc.nameEn.toLowerCase().includes(q) ||
      loc.id.includes(q),
  ).slice(0, limit);
}

export function resolveLocationInput(input: {
  locationId?: string | null;
  lat?: number | null;
  lng?: number | null;
  elevation?: number | null;
}): JewishCalendarLocation {
  if (input.locationId) {
    const found = getLocationById(input.locationId);
    if (found) return found;
  }
  if (typeof input.lat === "number" && typeof input.lng === "number") {
    const base = resolveLocation({ lat: input.lat, lng: input.lng });
    if (base.id === "custom") {
      return {
        ...base,
        lat: input.lat,
        lng: input.lng,
        elevation: input.elevation ?? 0,
      };
    }
    if (typeof input.elevation === "number") {
      return { ...base, elevation: input.elevation };
    }
    return base;
  }
  return getDefaultLocation();
}
