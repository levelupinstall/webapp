/**
 * INTERNAL PRICE BOOK — Level Up Install estimator.
 *
 * NEVER customer-facing. This is the editable cost basis behind every
 * estimate. Tom reviews and adjusts every value here; nothing in this file
 * is a quote, a retailer offer, or a committed price.
 *
 * Pricing convention: every entry carries a `verify` note. Values marked
 * "VERIFY — GTA 2026 placeholder" are Tom's starting guesses and MUST be
 * checked against real supplier quotes before any customer price is issued.
 *
 * No SKUs, store names, or product pitches are recorded here — generic
 * material descriptions only.
 */

export type PriceBookMaterial = {
  /** Generic description, e.g. "4x8x3/4 paint-grade birch plywood". */
  description: string;
  unit: string;
  unitCostCad: number;
  /** e.g. "VERIFY — GTA 2026 placeholder". */
  verify: string;
};

export type PriceBook = {
  materials: Record<string, PriceBookMaterial>;
  labor: {
    /** Shop (fabrication/finishing) rate. INTERNAL — never shown to customers. */
    shopRatePerHrCad: number;
    /** On-site install rate. INTERNAL — never shown to customers. */
    installRatePerHrCad: number;
    verify: string;
  };
  business: {
    /** Markup applied to material cost (fraction, e.g. 0.2 = 20%). */
    materialMarkup: number;
    /** Overhead + contingency applied to (materials + labor) subtotal. */
    overheadContingency: number;
    /** Customer price is rounded to the nearest this many dollars. */
    priceRoundingCad: number;
    verify: string;
  };
  /** Ontario HST — shown as a note on estimates; prices are pre-tax. */
  taxNote: string;
};

export const PRICE_BOOK: PriceBook = {
  materials: {
    birchPly34: {
      description: "4x8x3/4 paint-grade birch plywood sheet",
      unit: "sheet",
      unitCostCad: 95,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    mdf34: {
      description: "4x8x3/4 MDF sheet",
      unit: "sheet",
      unitCostCad: 55,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    ply34Cleat: {
      description: "4x8x3/4 plywood sheet (french cleats)",
      unit: "sheet",
      unitCostCad: 70,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    whiteOakPly34: {
      description: "4x8x3/4 white oak veneer plywood sheet (house wood standard)",
      unit: "sheet",
      unitCostCad: 140,
      verify: "VERIFY — GTA 2026 placeholder; Tom: confirm your white oak sheet price",
    },
    whiteOakSolid: {
      description: "White oak solid stock S4S, per board foot (edgebanding, nosing)",
      unit: "bf",
      unitCostCad: 12,
      verify: "VERIFY — GTA 2026 placeholder; Tom: confirm your white oak bf price",
    },
    rodBracket: {
      description: 'Hidden steel rod bracket, 1/2" x 12"',
      unit: "each",
      unitCostCad: 14,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    screwsBox: {
      description: '#10 x 3" wood screws, box of 100',
      unit: "box",
      unitCostCad: 18,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    primerGal: {
      description: "Primer, 1 gallon",
      unit: "gal",
      unitCostCad: 45,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    paintGal: {
      description: "Finish paint, 1 gallon",
      unit: "gal",
      unitCostCad: 65,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    caulkTube: {
      description: "Paintable caulk, tube",
      unit: "tube",
      unitCostCad: 8,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    fillerTub: {
      description: "Wood filler, small tub",
      unit: "tub",
      unitCostCad: 12,
      verify: "VERIFY — GTA 2026 placeholder",
    },
    consumables: {
      description: "Consumables allowance (sandpaper, tape, glue, etc.)",
      unit: "per wall",
      unitCostCad: 25,
      verify: "VERIFY — GTA 2026 placeholder",
    },
  },
  labor: {
    shopRatePerHrCad: 85,
    installRatePerHrCad: 95,
    verify: "VERIFY — GTA 2026 placeholder rates; INTERNAL ONLY, never on customer paperwork",
  },
  business: {
    materialMarkup: 0.2,
    overheadContingency: 0.1,
    priceRoundingCad: 25,
    verify: "VERIFY — Tom's starting policy; adjust as the business learns real costs",
  },
  taxNote:
    "All prices pre-tax. Ontario HST 13% added at invoice. Tom to confirm tax handling with accountant.",
};

/** Labor time model — target hours per unit of work. Tunable; INTERNAL ONLY. */
export const LABOR_MODEL = {
  /** Fabrication hours per shelf (cut, assemble, cleats). */
  fabHoursPerShelf: 0.75,
  /** Sanding/finishing hours per shelf (prime + paint). */
  finishHoursPerShelf: 0.5,
  /** On-site install hours per shelf (mount, level, caulk). */
  installHoursPerShelf: 0.75,
  /** Site measure visit, per wall (post-deposit confirmation). */
  siteMeasureHoursPerWall: 1,
  /** Drawings/admin time, per wall. */
  adminHoursPerWall: 0.5,
  /** Round-trip drive time, per wall. */
  driveHoursPerWall: 1,
  verify: "VERIFY — GTA 2026 placeholder target hours; INTERNAL ONLY, never on customer paperwork",
} as const;

/** Material usage model. Tunable. */
export const MATERIAL_MODEL = {
  /** 4x8 sheet area, sq in. */
  sheetAreaSqIn: 48 * 96,
  /** Waste/nesting factor applied to net material area before rounding up to sheets. */
  wasteFactor: 1.25,
  /** Finished-surface coverage per gallon of paint/primer, sq ft. */
  coverageSqFtPerGal: 350,
  /** Shelves covered by one box of screws. */
  shelvesPerScrewBox: 4,
  verify: "VERIFY — GTA 2026 placeholder usage factors",
} as const;
