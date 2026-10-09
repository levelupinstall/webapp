/**
 * Finish & hardware product catalog for the customer configurator.
 *
 * Every product here is purchasable in Toronto (in-store or online with
 * Toronto delivery). Prices marked priceVerified:false are approximate —
 * Tom confirms them against current supplier pricing before they go firm.
 *
 * Sourcing research: October 8, 2026. Unverified items are flagged, never
 * presented as fact.
 *
 * The customer picks finishes AFTER the concept is approved and BEFORE the
 * proposal is finalized. Selections flow into the estimator (finish-specific
 * labor + material deltas) and appear on the proposal as fixed line items.
 */

export type FinishSheen = "matte" | "eggshell" | "satin" | "semi-gloss" | "high-gloss";

export type PaintColor = {
  id: string;
  brand: "Benjamin Moore" | "Sherwin-Williams";
  name: string;
  code: string;
  /** Hex for the configurator swatch (approximate). */
  hex: string;
  /** The cabinet-grade paint line this color is mixed in. */
  paintLine: string;
  whereToBuy: string[];
};

export type StainColor = {
  id: string;
  brand: string;
  productLine: string;
  name: string;
  /** Hex for the configurator swatch (approximate). */
  hex: string;
  whereToBuy: string[];
  /** VERIFY-flagged price CAD for the typical project size. */
  priceCAD: number | null;
  priceVerified: boolean;
};

export type HardwareProduct = {
  id: string;
  category: "bar-pull" | "knob" | "cup-pull" | "drawer-slide" | "hinge";
  brand: string;
  model: string;
  sku?: string;
  /** Finish name for pulls/knobs (e.g. "Matte black"). Omitted for slides/hinges. */
  finish?: string;
  /** Center-to-center for pulls, diameter for knobs (inches). */
  sizeIn?: number;
  /** VERIFY-flagged unit price CAD. */
  priceCAD: number | null;
  priceVerified: boolean;
  whereToBuy: string[];
  notes?: string;
};

export type CustomerFinishSelection = {
  /** "paint" or "stain" */
  finishType: "paint" | "stain";
  paintColorId?: string;
  stainColorId?: string;
  sheen: FinishSheen;
  /** Hardware product IDs. */
  pullId?: string;
  knobId?: string;
  drawerSlideId?: string;
  hingeId?: string;
};

/** Sheen labor multiplier relative to satin (baseline 1.0). High-gloss needs more prep. */
export const SHEEN_LABOR_MULTIPLIER: Record<FinishSheen, number> = {
  matte: 1.0,
  eggshell: 1.0,
  satin: 1.0,
  "semi-gloss": 1.1,
  "high-gloss": 1.35,
};

export const SHEEN_LABELS: Record<FinishSheen, string> = {
  matte: "Matte",
  eggshell: "Eggshell",
  satin: "Satin",
  "semi-gloss": "Semi-Gloss",
  "high-gloss": "High Gloss",
};

// ---------------------------------------------------------------------------
// Paint colors — Benjamin Moore Advance / Sherwin-Williams Emerald Urethane.
// ---------------------------------------------------------------------------

export const PAINT_COLORS: PaintColor[] = [
  // Benjamin Moore — mixed in Advance (waterborne alkyd, cabinet-grade).
  // Sheens: satin, semi-gloss, high gloss. ~CAD $90–100/gal (unverified).
  { id: "bm-oc17", brand: "Benjamin Moore", name: "White Dove", code: "OC-17", hex: "#EFE9DC", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  { id: "bm-oc65", brand: "Benjamin Moore", name: "Chantilly Lace", code: "OC-65", hex: "#F4F5F0", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  { id: "bm-oc117", brand: "Benjamin Moore", name: "Simply White", code: "OC-117", hex: "#F2EFE6", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  { id: "bm-oc45", brand: "Benjamin Moore", name: "Swiss Coffee", code: "OC-45", hex: "#E8E0CE", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  { id: "bm-hc154", brand: "Benjamin Moore", name: "Hale Navy", code: "HC-154", hex: "#3B4A5C", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  { id: "bm-hc172", brand: "Benjamin Moore", name: "Revere Pewter", code: "HC-172", hex: "#CBC4B5", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  { id: "bm-hc168", brand: "Benjamin Moore", name: "Chelsea Gray", code: "HC-168", hex: "#7A7B76", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  { id: "bm-hc114", brand: "Benjamin Moore", name: "Saybrook Sage", code: "HC-114", hex: "#9BA88D", paintLine: "Advance", whereToBuy: ["Benjamin Moore dealers (GTA)"] },
  // Sherwin-Williams — mixed in Emerald Urethane Trim Enamel.
  // Sheens: satin, semi-gloss, gloss.
  { id: "sw-7005", brand: "Sherwin-Williams", name: "Pure White", code: "SW 7005", hex: "#EDEAE3", paintLine: "Emerald Urethane", whereToBuy: ["Sherwin-Williams stores (GTA)"] },
  { id: "sw-7008", brand: "Sherwin-Williams", name: "Alabaster", code: "SW 7008", hex: "#EDE6D6", paintLine: "Emerald Urethane", whereToBuy: ["Sherwin-Williams stores (GTA)"] },
  { id: "sw-7015", brand: "Sherwin-Williams", name: "Repose Gray", code: "SW 7015", hex: "#C9CBC9", paintLine: "Emerald Urethane", whereToBuy: ["Sherwin-Williams stores (GTA)"] },
  { id: "sw-6244", brand: "Sherwin-Williams", name: "Naval", code: "SW 6244", hex: "#2E3E4E", paintLine: "Emerald Urethane", whereToBuy: ["Sherwin-Williams stores (GTA)"] },
  { id: "sw-7069", brand: "Sherwin-Williams", name: "Iron Ore", code: "SW 7069", hex: "#43464B", paintLine: "Emerald Urethane", whereToBuy: ["Sherwin-Williams stores (GTA)"] },
  { id: "sw-9130", brand: "Sherwin-Williams", name: "Evergreen Fog", code: "SW 9130", hex: "#A8B09A", paintLine: "Emerald Urethane", whereToBuy: ["Sherwin-Williams stores (GTA)"] },
];

// ---------------------------------------------------------------------------
// Stain colors — Rubio Monocoat Oil Plus 2C (white oak house standard).
// NOT at Lee Valley (unverified) — Ardec.ca, Steel And Timber (Ancaster),
// Jeff Mack Supply (Mississauga), rubiomonocoatcanada.com.
// ---------------------------------------------------------------------------

export const STAIN_COLORS: StainColor[] = [
  { id: "rm-pure", brand: "Rubio Monocoat", productLine: "Oil Plus 2C", name: "Pure", hex: "#E3D3B8", whereToBuy: ["Ardec.ca", "Steel And Timber (Ancaster)", "Jeff Mack Supply (Mississauga)"], priceCAD: 100, priceVerified: false },
  { id: "rm-natural", brand: "Rubio Monocoat", productLine: "Oil Plus 2C", name: "Natural", hex: "#D9C4A3", whereToBuy: ["Ardec.ca", "Steel And Timber (Ancaster)", "Jeff Mack Supply (Mississauga)"], priceCAD: 100, priceVerified: false },
  { id: "rm-cotton-white", brand: "Rubio Monocoat", productLine: "Oil Plus 2C", name: "Cotton White", hex: "#E8E2D4", whereToBuy: ["Ardec.ca", "Steel And Timber (Ancaster)", "Jeff Mack Supply (Mississauga)"], priceCAD: 100, priceVerified: false },
  { id: "rm-smoke-5", brand: "Rubio Monocoat", productLine: "Oil Plus 2C", name: "Smoke 5%", hex: "#C9BCA8", whereToBuy: ["Ardec.ca", "Steel And Timber (Ancaster)", "Jeff Mack Supply (Mississauga)"], priceCAD: 100, priceVerified: false },
  { id: "rm-oyster", brand: "Rubio Monocoat", productLine: "Oil Plus 2C", name: "Oyster", hex: "#D5C9B4", whereToBuy: ["Ardec.ca", "Steel And Timber (Ancaster)", "Jeff Mack Supply (Mississauga)"], priceCAD: 100, priceVerified: false },
];

// ---------------------------------------------------------------------------
// Hardware — Richelieu (Home Depot Canada retail SKUs verified) / Blum.
// Trade pricing via Richelieu GTA beats retail; Tom to confirm.
// ---------------------------------------------------------------------------

export const HARDWARE: HardwareProduct[] = [
  // Bar pulls — matte black (Richelieu, Home Depot Canada SKUs verified)
  { id: "bp-armadale-128-mb", category: "bar-pull", brand: "Richelieu", model: "Armadale", sku: "BP8160128900", finish: "Matte black", sizeIn: 5.04, priceCAD: null, priceVerified: false, whereToBuy: ["Home Depot Canada (1001532265)", "Richelieu trade"] },
  { id: "bp-greenwich-128-mb", category: "bar-pull", brand: "Richelieu", model: "Greenwich", sku: "BP5016128900", finish: "Matte black", sizeIn: 5.04, priceCAD: null, priceVerified: false, whereToBuy: ["Home Depot Canada (1001872096)", "Richelieu trade"] },
  { id: "bp-lambton-128-mb", category: "bar-pull", brand: "Richelieu", model: "Lambton", sku: "BP873128900", finish: "Matte black", sizeIn: 5.04, priceCAD: null, priceVerified: false, whereToBuy: ["Home Depot Canada (1001532244)", "Richelieu trade"] },
  { id: "bp-laconia-160-mb", category: "bar-pull", brand: "Richelieu", model: "Laconia", sku: "BP801160195900", finish: "Matte black / brushed nickel", sizeIn: 6.3, priceCAD: null, priceVerified: false, whereToBuy: ["Home Depot Canada (1001872104)", "Richelieu trade"] },
  // Knobs
  { id: "knob-gatineau-35-mb", category: "knob", brand: "Richelieu", model: "Gatineau", sku: "BP486900", finish: "Matte black", sizeIn: 1.38, priceCAD: null, priceVerified: false, whereToBuy: ["Home Depot Canada", "Richelieu trade"] },
  { id: "knob-mckenzie-32-bn", category: "knob", brand: "Richelieu", model: "McKenzie", sku: "BP53082195", finish: "Brushed nickel", sizeIn: 1.26, priceCAD: null, priceVerified: false, whereToBuy: ["Home Depot Canada", "Richelieu trade"] },
  // Drawer slides — Blum Tandem undermount soft-close (premium standard)
  { id: "blum-tandem-18", category: "drawer-slide", brand: "Blum", model: "Tandem plus 563H undermount soft-close (18\")", sku: "B563H4570B", priceCAD: 42, priceVerified: false, whereToBuy: ["Richelieu trade", "Amazon.ca"], notes: "Full-extension, 100 lb, BLUMOTION soft-close. Locking devices + rear brackets separate." },
  { id: "blum-tandem-21", category: "drawer-slide", brand: "Blum", model: "Tandem plus 563H undermount soft-close (21\")", sku: "B563H5330B", priceCAD: 48, priceVerified: false, whereToBuy: ["Richelieu trade", "Amazon.ca"], notes: "Full-extension, 100 lb, BLUMOTION soft-close. Locking devices + rear brackets separate." },
  // Hinges — Blum Clip Top Blumotion (soft-close standard)
  { id: "blum-hinge-110", category: "hinge", brand: "Blum", model: "Clip Top Blumotion 110° full overlay", sku: "71B3550", priceCAD: 8, priceVerified: false, whereToBuy: ["Richelieu trade"], notes: "Soft-close concealed Euro hinge. Mounting plates separate." },
  { id: "blum-hinge-95", category: "hinge", brand: "Blum", model: "Clip Top Blumotion 95° (thick doors)", sku: "71B9550", priceCAD: 8, priceVerified: false, whereToBuy: ["Richelieu trade"], notes: "For doors up to 30–32 mm. Mounting plates separate." },
];

/** Look up a paint color by id. */
export function getPaintColor(id: string | undefined): PaintColor | undefined {
  return PAINT_COLORS.find((c) => c.id === id);
}

/** Look up a stain color by id. */
export function getStainColor(id: string | undefined): StainColor | undefined {
  return STAIN_COLORS.find((c) => c.id === id);
}

/** Look up a hardware product by id. */
export function getHardware(id: string | undefined): HardwareProduct | undefined {
  return HARDWARE.find((h) => h.id === id);
}

/** Human-readable summary of a finish selection for proposals. */
export function describeFinishSelection(sel: CustomerFinishSelection): string {
  const parts: string[] = [];
  if (sel.finishType === "paint") {
    const c = getPaintColor(sel.paintColorId);
    parts.push(c ? `${c.brand} ${c.name} (${c.code}) — ${c.paintLine}` : "Paint — color TBD");
  } else {
    const s = getStainColor(sel.stainColorId);
    parts.push(s ? `${s.brand} ${s.productLine} — ${s.name}` : "Stain — color TBD");
  }
  parts.push(SHEEN_LABELS[sel.sheen]);
  const pull = getHardware(sel.pullId);
  if (pull) parts.push(`${pull.brand} ${pull.model} (${pull.finish})`);
  const knob = getHardware(sel.knobId);
  if (knob) parts.push(`${knob.brand} ${knob.model} knob (${knob.finish})`);
  const slide = getHardware(sel.drawerSlideId);
  if (slide) parts.push(`${slide.brand} ${slide.model}`);
  const hinge = getHardware(sel.hingeId);
  if (hinge) parts.push(`${hinge.brand} ${hinge.model}`);
  return parts.join(" · ");
}
