import type { FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { rulesFor, type AudienceRules } from "@/lib/projects/scene3d/rules";
import type { MaterialId } from "@/lib/projects/scene3d/types";

/**
 * A style kit, as something a renderer can use.
 *
 * The kits in floorplan-viz-styles.ts are written for a model to read: a
 * palette and a page of prose. A renderer reads neither. So each kit maps to a
 * table — what every surface is made of, and what the light is like — and the
 * mapping is the whole of the difference between the seven presets.
 *
 * The rules travel with it, and there is no path that skips them: a custom kit
 * whose audience is haredi gets exactly the rules the haredi presets get.
 */

export type MaterialSpec = { color: number; roughness: number; metalness: number; opacity?: number };

export type SceneLighting = {
  /** Colour temperature of the interior lamps and of the sun. */
  kelvin: number;
  /** Tone-mapping exposure. Warmer, not brighter, is the house rule. */
  exposure: number;
  /** Where the sun stands, in the drawing's own frame, so every sheet matches. */
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  sunIntensity: number;
  skyIntensity: number;
  /** The horizon and ground colours the sky is built from. */
  skyColor: number;
  groundColor: number;
};

export type SceneStyle = {
  id: string;
  labelHe: string;
  materials: Record<MaterialId, MaterialSpec>;
  lighting: SceneLighting;
  rules: AudienceRules;
};

/** The neutral finish every style starts from and then overrides. */
const BASE: Record<MaterialId, MaterialSpec> = {
  wall: { color: 0xf1e9dd, roughness: 0.95, metalness: 0 },
  wallCut: { color: 0xb9ae9d, roughness: 0.95, metalness: 0 },
  floorWood: { color: 0xc59d74, roughness: 0.55, metalness: 0 },
  floorTile: { color: 0xd9d3c7, roughness: 0.35, metalness: 0 },
  floorStone: { color: 0xe0d4be, roughness: 0.75, metalness: 0 },
  skirting: { color: 0xf8f4ec, roughness: 0.5, metalness: 0 },
  glass: { color: 0xcfe4ec, roughness: 0.06, metalness: 0, opacity: 0.3 },
  joinery: { color: 0xece7de, roughness: 0.45, metalness: 0 },
  metal: { color: 0x9a958c, roughness: 0.3, metalness: 0.85 },
  linen: { color: 0xf6f2e9, roughness: 0.9, metalness: 0 },
  upholstery: { color: 0xd6c9b2, roughness: 0.95, metalness: 0 },
  timber: { color: 0xa5764c, roughness: 0.5, metalness: 0 },
  worktop: { color: 0xe9e4db, roughness: 0.3, metalness: 0 },
  ceramic: { color: 0xf8fbfc, roughness: 0.12, metalness: 0 },
  steel: { color: 0x8f969d, roughness: 0.25, metalness: 0.8 },
  neutral: { color: 0xc9b89c, roughness: 0.8, metalness: 0 },
};

const GOLDEN_HOUR: SceneLighting = {
  kelvin: 3000,
  exposure: 1.05,
  // Fixed in the drawing's frame, so every sheet in a booklet carries the same
  // light and the set reads as a series rather than as a pile of renders.
  sunAzimuthDeg: 135,
  sunElevationDeg: 52,
  sunIntensity: 2.4,
  skyIntensity: 1.05,
  skyColor: 0xfff1dc,
  groundColor: 0x8d8272,
};

type StyleOverrides = {
  labelHe: string;
  materials?: Partial<Record<MaterialId, MaterialSpec>>;
  lighting?: Partial<SceneLighting>;
};

/**
 * What actually separates the seven.
 *
 * Not a hue each: a different floor material, a different joinery, and a
 * different light. A set of styles that differ only in albedo reads as one
 * apartment in seven tints, which is the failure this table exists to avoid.
 */
const PRESETS: Record<string, StyleOverrides> = {
  contemporary: {
    labelHe: "עכשווי ישראלי",
    materials: {
      floorWood: { color: 0xc49a6a, roughness: 0.5, metalness: 0 },
      worktop: { color: 0xe7e2d8, roughness: 0.25, metalness: 0 },
    },
  },
  luxury: {
    labelHe: "פרמיום / יוקרתי",
    materials: {
      floorWood: { color: 0x8a6a4a, roughness: 0.35, metalness: 0 },
      floorTile: { color: 0xe8e2d6, roughness: 0.18, metalness: 0 },
      timber: { color: 0x6f4a32, roughness: 0.4, metalness: 0 },
      worktop: { color: 0x2f2b27, roughness: 0.2, metalness: 0.05 },
      metal: { color: 0xb08d57, roughness: 0.25, metalness: 0.9 },
      wall: { color: 0xece2d2, roughness: 0.9, metalness: 0 },
    },
    lighting: { kelvin: 2900, exposure: 1.0, sunElevationDeg: 44, sunIntensity: 2.9 },
  },
  scandi: {
    labelHe: "סקנדינבי-מינימל",
    materials: {
      floorWood: { color: 0xdcc6a6, roughness: 0.6, metalness: 0 },
      timber: { color: 0xc8a97f, roughness: 0.6, metalness: 0 },
      wall: { color: 0xfaf7f2, roughness: 0.95, metalness: 0 },
      joinery: { color: 0xf6f3ee, roughness: 0.5, metalness: 0 },
      upholstery: { color: 0xdfd8cb, roughness: 0.95, metalness: 0 },
    },
    lighting: { kelvin: 3300, exposure: 1.12, sunElevationDeg: 60, sunIntensity: 2.3, skyIntensity: 1.1 },
  },
  jerusalem_stone: {
    labelHe: "אבן ירושלמי",
    materials: {
      floorStone: { color: 0xdcc9a8, roughness: 0.85, metalness: 0 },
      floorTile: { color: 0xd9c8a6, roughness: 0.7, metalness: 0 },
      floorWood: { color: 0xbb9769, roughness: 0.6, metalness: 0 },
      wall: { color: 0xeadfc9, roughness: 0.98, metalness: 0 },
      timber: { color: 0xb08a5c, roughness: 0.55, metalness: 0 },
    },
    lighting: { kelvin: 3000, exposure: 1.08, sunElevationDeg: 64, sunIntensity: 3.1 },
  },
  developer_white: {
    labelHe: "דירת קבלן",
    materials: {
      floorWood: { color: 0xdad3c8, roughness: 0.4, metalness: 0 },
      floorTile: { color: 0xe4e0d8, roughness: 0.3, metalness: 0 },
      wall: { color: 0xfbfaf7, roughness: 0.95, metalness: 0 },
      joinery: { color: 0xf4f2ee, roughness: 0.4, metalness: 0 },
      timber: { color: 0xd8d2c6, roughness: 0.5, metalness: 0 },
      upholstery: { color: 0xdedad2, roughness: 0.95, metalness: 0 },
    },
    lighting: { kelvin: 3500, exposure: 1.15, sunElevationDeg: 66, sunIntensity: 2.2, skyIntensity: 1.2 },
  },
  haredi_classic: {
    labelHe: "חרדי חדשני",
    materials: {
      floorWood: { color: 0xc0925f, roughness: 0.5, metalness: 0 },
      timber: { color: 0x9a6f47, roughness: 0.45, metalness: 0 },
      joinery: { color: 0xeee8dc, roughness: 0.4, metalness: 0 },
    },
    lighting: { kelvin: 2900, exposure: 1.06, sunElevationDeg: 50 },
  },
  haredi_modern: {
    labelHe: "חרדי מינימל חדשני",
    materials: {
      floorTile: { color: 0xe2ddd2, roughness: 0.25, metalness: 0 },
      floorWood: { color: 0xcdae86, roughness: 0.5, metalness: 0 },
      joinery: { color: 0xf3efe7, roughness: 0.35, metalness: 0 },
      timber: { color: 0xb48f63, roughness: 0.5, metalness: 0 },
      metal: { color: 0xa9a49a, roughness: 0.3, metalness: 0.8 },
    },
    lighting: { kelvin: 3100, exposure: 1.1, sunElevationDeg: 56 },
  },
};

/** #rrggbb, #rgb or a bare hex, as a number. Anything else: null. */
export function parseHexColour(raw: string | undefined): number | null {
  if (!raw) return null;
  const hex = raw.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.replace(/(.)/g, "$1$1") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return Number.parseInt(full, 16);
}

/** Perceived lightness, 0..1, for sorting a custom kit's palette. */
export function lightnessOf(colour: number): number {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * A custom kit, which carries colours and no material names.
 *
 * The palette is sorted by lightness and read the way a room is built: the
 * lightest colour goes on the walls, the darkest on the joinery, and what is
 * left on the textiles. The floor keeps the base timber, because a floor in an
 * arbitrary accent colour is the one way to make every custom style look wrong.
 */
function customMaterials(colors: string[]): Partial<Record<MaterialId, MaterialSpec>> {
  const parsed = colors
    .map(parseHexColour)
    .filter((c): c is number => c != null)
    .sort((a, b) => lightnessOf(b) - lightnessOf(a));
  if (parsed.length === 0) return {};
  const lightest = parsed[0]!;
  const darkest = parsed[parsed.length - 1]!;
  const middle = parsed[Math.floor(parsed.length / 2)]!;
  return {
    wall: { color: lightest, roughness: 0.95, metalness: 0 },
    joinery: { color: middle, roughness: 0.45, metalness: 0 },
    upholstery: { color: darkest, roughness: 0.95, metalness: 0 },
  };
}

export function sceneStyleFor(kit: FloorplanVizStyleKit): SceneStyle {
  const preset = PRESETS[kit.id];
  const materials: Record<MaterialId, MaterialSpec> = {
    ...BASE,
    ...(preset?.materials ?? {}),
    ...(kit.id === "custom" ? customMaterials(kit.colors ?? []) : {}),
  };
  return {
    id: kit.id,
    labelHe: preset?.labelHe ?? kit.labelHe,
    materials,
    lighting: { ...GOLDEN_HOUR, ...(preset?.lighting ?? {}) },
    rules: rulesFor(kit.audience),
  };
}

/** The sun's direction, as a unit vector in scene coordinates. */
export function sunDirection(lighting: SceneLighting): { x: number; y: number; z: number } {
  const az = (lighting.sunAzimuthDeg * Math.PI) / 180;
  const el = (lighting.sunElevationDeg * Math.PI) / 180;
  return {
    x: Math.cos(el) * Math.sin(az),
    y: Math.sin(el),
    z: Math.cos(el) * Math.cos(az),
  };
}
