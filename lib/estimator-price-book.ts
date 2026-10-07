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
    /**
     * Helper/second-person day rate. Tom Oct 7: $30/hr not workable —
     * a capable helper costs $50–60/hr. $55 mid-range pick.
     * INTERNAL — never shown to customers.
     */
    helperRatePerHrCad: number;
    verify: string;
  };
  business: {
    /** Markup applied to material cost (fraction, e.g. 0.2 = 20%). */
    materialMarkup: number;
    /** Markup applied to subcontracted trade work (CNC cutting), fraction. */
    subcontractMarkup: number;
    /** Overhead + contingency applied to (materials + subcontract + labor) subtotal. */
    overheadContingency: number;
    /** Customer price is rounded to the nearest this many dollars. */
    priceRoundingCad: number;
    verify: string;
  };
  /**
   * CNC outsource route — trade shop cuts, drills, edgebands, labels;
   * Level Up assembles + finishes + installs. Rates from Kali Custom
   * Cabinetry (Scarborough) published trade price list, Oct 2026.
   * INTERNAL — never customer-facing.
   */
  cnc: {
    /** Per 4x8 sheet: cut to size, drilled, edgebanded (tape supplied by shop), labelled. */
    perSheetCad: number;
    /** Programming fee per job — paid up front, non-refundable. */
    programmingPerJobCad: number;
    /** Skid, wrap, strapping per job. */
    skidPerJobCad: number;
    /** Minimum billable sheets per CNC job. */
    minimumBillableSheets: number;
    /** Shop must supply this many spare sheets per N sheets (recuts/defects). */
    spareSheetsPerN: number;
    verify: string;
  };
  /** Ontario HST — shown as a note on estimates; prices are pre-tax. */
  taxNote: string;
  /**
   * Delivery — Tom has no truck. Sheet goods, CNC parts, and finished
   * millwork move by hired driver with van ("man with a van") or supplier
   * delivery. Rates from GTA Kijiji cargo-van listings + TaskRabbit, Oct 2026.
   * INTERNAL — never customer-facing.
   */
  delivery: {
    /** One hired-driver leg (~2 hr GTA run): driver with cargo van, no labour. */
    hiredDriverPerLegCad: number;
    /** Legs on the in-shop route: materials in + finished goods to site. */
    legsInShop: number;
    /** Legs on the CNC route: sheets → CNC + parts → work location + finished → site. */
    legsCncOutsource: number;
    verify: string;
  };
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
    scribeStock: {
      description: "Scribe/filler stock allowance — 1×3 × 8 ft + cedar shims (ripped to fit on site)",
      unit: "wall",
      unitCostCad: 25,
      verify: "VERIFY — GTA 2026 placeholder; scribe molding ~$1–2/LF, shim bundle ~$8–10 covers several jobs",
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
    stainQt: {
      description: "Wood stain, 1 quart (stained finishes)",
      unit: "qt",
      unitCostCad: 22,
      verify: "VERIFY — GTA 2026 placeholder; Tom: confirm your stain price",
    },
    sealerGal: {
      description: "Sanding sealer, 1 gallon (stained/clear finishes)",
      unit: "gal",
      unitCostCad: 55,
      verify: "VERIFY — GTA 2026 placeholder; Tom: confirm your sealer price",
    },
    topcoatGal: {
      description: "Clear topcoat (lacquer/conversion varnish), 1 gallon",
      unit: "gal",
      unitCostCad: 75,
      verify: "VERIFY — GTA 2026 placeholder; Tom: confirm your topcoat price + type",
    },
    hardwaxOilL: {
      description: "Hardwax oil finish, 1 litre (oil finishes)",
      unit: "L",
      unitCostCad: 65,
      verify: "VERIFY — GTA 2026 placeholder; Tom: confirm your oil price",
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
    helperRatePerHrCad: 55,
    verify: "VERIFY — GTA 2026 placeholder rates; INTERNAL ONLY, never on customer paperwork",
  },
  business: {
    materialMarkup: 0.2,
    subcontractMarkup: 0.2,
    overheadContingency: 0.1,
    priceRoundingCad: 25,
    verify: "VERIFY — Tom's starting policy; adjust as the business learns real costs",
  },
  cnc: {
    perSheetCad: 150,
    programmingPerJobCad: 250,
    skidPerJobCad: 100,
    minimumBillableSheets: 6,
    spareSheetsPerN: 15,
    verify:
      "VERIFY — from Kali Custom Cabinetry (Scarborough) published trade price list, Oct 2026; Tom: confirm with the CNC shop you actually use",
  },
  taxNote:
    "All prices pre-tax. Ontario HST 13% added at invoice. Tom to confirm tax handling with accountant.",
  delivery: {
    hiredDriverPerLegCad: 125,
    legsInShop: 2,
    legsCncOutsource: 3,
    verify:
      "VERIFY — GTA Oct 2026: Kijiji cargo-van $90 first hr + $40/hr (~$130/2hr run), $99 flat-rate floor; TaskRabbit from ~$40/hr. Tom: confirm with the driver(s) you actually use",
  },
};

/** Labor time model — target hours per unit of work. Tunable; INTERNAL ONLY.
 *
 * Finishing steps live in FINISH_PROCESSES (lib/estimator-finishes.ts),
 * keyed by finish family — painted, stained, clear-coat, oil, and
 * prefinished are fundamentally different shop processes. The fields below
 * cover everything EXCEPT finishing.
 */
export const LABOR_MODEL = {
  /** Fabrication hours per shelf/cabinet unit (cut, edgeband, assemble carcass). */
  fabHoursPerShelf: 1.0,
  /**
   * Assembly-only hours per unit on the CNC-outsource route — parts arrive
   * cut, drilled, edgebanded and labelled, so the shop only assembles.
   * Tom's note Oct 7: shop labor goes down on this route.
   */
  cncAssemblyHoursPerShelf: 0.5,
  /** CNC shop runs: drop off sheets + pick up finished parts, per wall. */
  cncRunHoursPerWall: 1.5,
  /**
   * Mount/level/fasten per unit: dry-fit, shim level + plumb, fasten to studs,
   * caulk. Base shimming for normal walls (≤1/4" over 8 ft) is inside this —
   * no separate shim line. Replaces the old flat installHoursPerShelf.
   */
  mountLevelFastenHoursPerUnit: 0.5,
  /**
   * Scribe + fit allowance per wall: scribe sides/fillers to out-of-plumb
   * walls, shelf back edges to wavy walls (2 abutments × 0.5h). Trade rule:
   * shim the box true FIRST, then scribe to the wall. Adjusted at the
   * post-deposit site measure if walls are worse than typical.
   */
  scribeFitHoursPerWall: 1.0,
  /** Load-in: unload truck, carry tools + materials into the home, per visit. */
  loadInHoursPerWall: 0.5,
  /** Pack-up + clean-up: tools out, work area cleaned, per visit. */
  cleanupHoursPerWall: 0.5,
  /** Site measure visit, per wall (post-deposit confirmation). */
  siteMeasureHoursPerWall: 1,
  /** Drawings/admin time, per wall. */
  adminHoursPerWall: 0.5,
  /** Round-trip drive time, per wall. */
  driveHoursPerWall: 1,
  /** Material handling at the shop: receive/unload sheet goods, stock, load finished pieces on the truck, per wall. */
  matHandlingHoursPerWall: 0.5,
  verify: "VERIFY — GTA 2026 placeholder target hours; finishing workflow per Tom Oct 7; INTERNAL ONLY, never on customer paperwork",
} as const;

/** Material usage model. Tunable. */
export const MATERIAL_MODEL = {
  /** 4x8 sheet area, sq in. */
  sheetAreaSqIn: 48 * 96,
  /** Waste/nesting factor applied to net material area before rounding up to sheets. */
  wasteFactor: 1.25,
  /** Finished-surface coverage per gallon of paint/primer/sealer/topcoat, sq ft. */
  coverageSqFtPerGal: 350,
  /** Wiping stain coverage, sq ft per quart (~800/gal per manufacturer tech sheets). */
  coverageSqFtPerQtStain: 200,
  /** Hardwax oil coverage, sq ft per litre. */
  coverageSqFtPerLitreOil: 250,
  /** Shelves covered by one box of screws. */
  shelvesPerScrewBox: 4,
  verify: "VERIFY — GTA 2026 placeholder usage factors",
} as const;
