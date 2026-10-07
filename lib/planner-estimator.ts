/**
 * INTERNAL ESTIMATOR — Level Up Install.
 *
 * NEVER customer-facing. Builds a planning estimate for one wall from the
 * deterministic fabrication takeoff (FabWallInput). Every line item carries
 * its math as a readable string so Tom can audit the derivation.
 *
 * Honesty contract:
 *  - These are planning estimates, not quotes. Tom verifies the price book
 *    (lib/estimator-price-book.ts) against real supplier quotes before any
 *    customer price is issued.
 *  - `estimateWall()` exposes the full internal view: target hours, labor
 *    rates, material markup, contingency. Internal staff only.
 *  - `customerView()` strips everything a customer must never see
 *    (hours, rates, margins) and returns a fixed-price summary only.
 *    Customers see a fixed price, never hours — no exceptions.
 *  - Nothing here sends anything to customers automatically.
 */

import type { FabWallInput } from "@/lib/planner-fabrication";
import {
  PRICE_BOOK,
  LABOR_MODEL,
  MATERIAL_MODEL,
} from "@/lib/estimator-price-book";
import {
  classifyFinish,
  FINISH_FAMILY_LABELS,
  FINISH_PROCESSES,
  type FinishFamily,
} from "@/lib/estimator-finishes";

export type EstimateLine = {
  section: "Materials" | "Labor" | "Subcontract";
  /** Plain description, e.g. "Birch plywood 4x8 sheets". */
  description: string;
  /** The math, e.g. "3 shelves × 96in × 10in × 2 layers = 5,760 sq in … → 2 sheets". */
  detail: string;
  qty: number;
  unit: string;
  unitCostCad: number;
  totalCad: number;
};

export type FabricationRoute = "in-shop" | "cnc-outsource";

export type EstimateOptions = {
  /**
   * "in-shop" (default): Level Up cuts, edgebands, drills, assembles.
   * "cnc-outsource": trade CNC shop cuts/drills/edgebands/labels;
   * Level Up assembles, finishes, installs. Shop fab labor drops to
   * assembly-only; CNC job costs appear under Subcontract.
   */
  fabricationRoute?: FabricationRoute;
  /**
   * Finish description override, e.g. "white oak, stained" or "painted white".
   * When omitted, input.finish is used. The finish selects the entire
   * finishing process (painted ≠ stained ≠ clear ≠ prefinished).
   */
  finish?: string | null;
  /**
   * Crew size for the install: 1 (default, Tom solo) or 2 (Tom + hired helper).
   * Use 2 when any unit is over ~100–150 lbs, 10 ft or longer, full-height
   * (7 ft+) needing a holder while fastening, or has a stone/wood top.
   * Helper bills at the helper rate ($55/hr) on the same 4/8-hr day blocks.
   */
  crewSize?: 1 | 2;
};

export type WallEstimate = {
  wallLabel: string;
  fabricationRoute: FabricationRoute;
  /** Assumed depth when the input had none (flagged, never silent). */
  depthAssumed: boolean;
  lines: EstimateLine[];
  materialsTotalCad: number;
  materialsWithMarkupCad: number;
  subcontractTotalCad: number;
  subcontractWithMarkupCad: number;
  laborTotalCad: number;
  /** Tom's hands-on time: shop hours (assembly/finishing at the shop rate). */
  shopHoursTotal: number;
  /** Tom's hands-on time: site hours (install/measure/drive/CNC runs). */
  siteHoursTotal: number;
  /** Finish family driving the finishing process. */
  finishFamily: FinishFamily;
  /** True when the finish was assumed (not specified). */
  finishAssumed: boolean;
  /** Unpaid dry/cure calendar holds in days (schedule impact, not payroll). */
  calendarHoldDays: number;
  /** Sheets of 4x8 that go to the CNC shop (0 on in-shop route). */
  sheetsForCnc: number;
  /** Spare sheets bought for CNC recuts (0 on in-shop route). */
  cncSpareSheets: number;
  /** materialsWithMarkup + subcontractWithMarkup + laborTotal */
  subtotalCad: number;
  contingencyCad: number;
  /** Internal cost basis: subtotal + contingency. */
  totalCostCad: number;
  /** Customer-facing fixed price, rounded per price book. */
  customerPriceCad: number;
  /** Ordered human-readable derivation of the whole estimate. */
  math: string[];
};

export type CustomerEstimateLine = {
  description: string;
  totalCad: number;
};

export type CustomerEstimate = {
  wallLabel: string;
  lines: CustomerEstimateLine[];
  /** The single fixed price. No hours, rates, or margins anywhere. */
  fixedPriceCad: number;
  taxNote: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtIn = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Deterministic material + labor takeoff for one wall.
 * All money in CAD, rounded to cents internally.
 */
export function estimateWall(input: FabWallInput, opts: EstimateOptions = {}): WallEstimate {
  const lines: EstimateLine[] = [];
  const math: string[] = [];
  const route: FabricationRoute = opts.fabricationRoute ?? "in-shop";
  const n = input.shelves.length;
  const depthIn = input.depthIn ?? 10;
  const depthAssumed = input.depthIn == null;

  // Finish drives the entire finishing process (painted ≠ stained ≠ clear).
  const finishRaw = opts.finish !== undefined ? opts.finish : input.finish;
  const finishInfo = classifyFinish(finishRaw);
  const finishFamily: FinishFamily = finishInfo.family;
  const finishProcess = FINISH_PROCESSES[finishFamily];
  let calendarHoldDays = 0;

  math.push(
    `Wall "${input.wallLabel}": ${n} ${n === 1 ? "shelf" : "shelves"}` +
      (n > 0
        ? ` (${input.shelves.map((s) => `${s.tag} ${fmtIn(s.lengthIn)}in`).join(", ")})`
        : "") +
      `, depth ${fmtIn(depthIn)}in${depthAssumed ? " (ASSUMED — confirm on site)" : ""}` +
      `, fabrication route: ${route === "cnc-outsource" ? "CNC OUTSOURCE (trade shop cuts/drills/edgebands; Level Up assembles)" : "IN-SHOP (Level Up cuts/edgebands/assembles)"}` +
      `, finish: ${FINISH_FAMILY_LABELS[finishFamily]}${finishInfo.assumed ? " — ASSUMED, confirm with customer" : ""} (${finishInfo.basis}).`,
  );

  const pb = PRICE_BOOK;
  const mm = MATERIAL_MODEL;
  const lm = LABOR_MODEL;

  // Sheet counts hoisted so the CNC block can reuse them.
  let boardSheets = 0;
  let cleatSheets = 0;
  let wallSheetsForCnc = 0;
  let wallCncSpareSheets = 0;

  // ---------- MATERIALS ----------
  // Board material follows the finish: stained/clear/oil in oak → white oak
  // plywood (house standard); paint-grade → birch. Never price oak boards
  // with a paint workflow or vice versa.
  const boardMat =
    (finishFamily === "stained" || finishFamily === "clear-coat" || finishFamily === "oil") &&
    /oak/i.test(finishRaw || "")
      ? pb.materials.whiteOakPly34
      : pb.materials.birchPly34;
  if (n > 0) {
    // Shelf boards: length × depth rectangles, 2 laminated layers for 1-1/2" thickness.
    const layers = 2;
    const boardNetSqIn = input.shelves.reduce(
      (a, s) => a + s.lengthIn * depthIn * layers,
      0,
    );
    boardSheets = Math.ceil(
      (boardNetSqIn * mm.wasteFactor) / mm.sheetAreaSqIn,
    );
    const boardCost = r2(boardSheets * boardMat.unitCostCad);
    lines.push({
      section: "Materials",
      description: boardMat.description,
      detail:
        `${n} shelves × ${fmtIn(input.shelves[0].lengthIn)}in × ${fmtIn(depthIn)}in × ${layers} layers` +
        ` = ${fmtIn(boardNetSqIn)} sq in net × ${mm.wasteFactor} waste ÷ ${mm.sheetAreaSqIn.toLocaleString()} sq in/sheet` +
        ` = ${(boardNetSqIn * mm.wasteFactor / mm.sheetAreaSqIn).toFixed(2)} → ${boardSheets} sheet${boardSheets === 1 ? "" : "s"}` +
        ` × ${fmtMoney(boardMat.unitCostCad)}` +
        (boardMat === pb.materials.whiteOakPly34 ? " (white oak — finish-driven)" : ""),
      qty: boardSheets,
      unit: boardMat.unit,
      unitCostCad: boardMat.unitCostCad,
      totalCad: boardCost,
    });
    math.push(
      `Shelf boards: ${fmtIn(boardNetSqIn)} sq in net (${layers} laminated layers for 1-1/2in) → ${boardSheets} sheets = ${fmtMoney(boardCost)}.`,
    );

    // French cleats: 2 per shelf (wall side + shelf side), length × 3-1/2".
    const cleatNetSqIn = input.shelves.reduce(
      (a, s) => a + s.lengthIn * 3.5 * 2,
      0,
    );
    cleatSheets = Math.ceil(
      (cleatNetSqIn * mm.wasteFactor) / mm.sheetAreaSqIn,
    );
    const cleatCost = r2(cleatSheets * pb.materials.ply34Cleat.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.ply34Cleat.description,
      detail:
        `${n} shelves × 2 cleats × ${fmtIn(input.shelves[0].lengthIn)}in × 3.5in` +
        ` = ${fmtIn(cleatNetSqIn)} sq in net × ${mm.wasteFactor} waste ÷ ${mm.sheetAreaSqIn.toLocaleString()}` +
        ` = ${(cleatNetSqIn * mm.wasteFactor / mm.sheetAreaSqIn).toFixed(2)} → ${cleatSheets} sheet${cleatSheets === 1 ? "" : "s"}` +
        ` × ${fmtMoney(pb.materials.ply34Cleat.unitCostCad)}`,
      qty: cleatSheets,
      unit: pb.materials.ply34Cleat.unit,
      unitCostCad: pb.materials.ply34Cleat.unitCostCad,
      totalCad: cleatCost,
    });
    math.push(
      `Cleats: ${fmtIn(cleatNetSqIn)} sq in net → ${cleatSheets} sheet${cleatSheets === 1 ? "" : "s"} = ${fmtMoney(cleatCost)}.`,
    );

    // Hidden rod brackets: industry table by shelf length (primary cantilever
    // load path — cleat is alignment + back-edge support only).
    // ≤36": 2 rods; 36–52": 3; 52–72": 4; >72": 5.
    const rodsFor = (lenIn: number) =>
      lenIn <= 36 ? 2 : lenIn <= 52 ? 3 : lenIn <= 72 ? 4 : 5;
    const rodsPerShelf = input.shelves.map((s) => rodsFor(s.lengthIn));
    const rodCount = rodsPerShelf.reduce((a, b) => a + b, 0);
    const rodCost = r2(rodCount * pb.materials.rodBracket.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.rodBracket.description,
      detail:
        input.shelves
          .map((s, i) => `${s.tag} (${fmtIn(s.lengthIn)}in): ${rodsPerShelf[i]} rods per length table`)
          .join("; ") +
        ` → ${rodCount} × ${fmtMoney(pb.materials.rodBracket.unitCostCad)}`,
      qty: rodCount,
      unit: pb.materials.rodBracket.unit,
      unitCostCad: pb.materials.rodBracket.unitCostCad,
      totalCad: rodCost,
    });
    math.push(`Rod brackets: ${rodCount} total = ${fmtMoney(rodCost)}.`);

    // Screws: 1 box per 4 shelves.
    const screwBoxes = Math.ceil(n / mm.shelvesPerScrewBox);
    const screwCost = r2(screwBoxes * pb.materials.screwsBox.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.screwsBox.description,
      detail: `ceil(${n} shelves ÷ ${mm.shelvesPerScrewBox}/box) = ${screwBoxes} box${screwBoxes === 1 ? "" : "es"} × ${fmtMoney(pb.materials.screwsBox.unitCostCad)}`,
      qty: screwBoxes,
      unit: pb.materials.screwsBox.unit,
      unitCostCad: pb.materials.screwsBox.unitCostCad,
      totalCad: screwCost,
    });

    // Scribe/filler stock: 1 allowance per wall (ripped to fit on site).
    const scribeCost = r2(pb.materials.scribeStock.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.scribeStock.description,
      detail: `1 allowance × ${fmtMoney(pb.materials.scribeStock.unitCostCad)} — filler strips + shims for out-of-plumb walls`,
      qty: 1,
      unit: pb.materials.scribeStock.unit,
      unitCostCad: pb.materials.scribeStock.unitCostCad,
      totalCad: scribeCost,
    });
    math.push(`Scribe/filler stock: ${fmtMoney(scribeCost)} allowance per wall.`);

    // Finish materials per finish family (primer+paint for painted;
    // stain+sealer+topcoat for stained; sealer+topcoat for clear; oil for oil).
    const finishSqIn = input.shelves.reduce(
      (a, s) => a + 2 * (s.lengthIn * depthIn) + 2 * (s.lengthIn + depthIn) * 1.5,
      0,
    );
    const finishSqFt = finishSqIn / 144;
    math.push(
      `Finished surface: ${fmtIn(finishSqFt)} sq ft (top+bottom+edges per shelf).`,
    );
    const finishMatQty = (key: string): { qty: number; unit: string; detail: string } => {
      if (key === "stainQt") {
        const perQt = mm.coverageSqFtPerQtStain;
        const qty = Math.max(1, Math.ceil(finishSqFt / perQt));
        return { qty, unit: "qt", detail: `${fmtIn(finishSqFt)} sq ft ÷ ${perQt}/qt = ${(finishSqFt / perQt).toFixed(2)} → ${qty} qt` };
      }
      if (key === "hardwaxOilL") {
        const qty = Math.max(1, Math.ceil(finishSqFt / mm.coverageSqFtPerLitreOil));
        return { qty, unit: "L", detail: `${fmtIn(finishSqFt)} sq ft ÷ ${mm.coverageSqFtPerLitreOil}/L = ${(finishSqFt / mm.coverageSqFtPerLitreOil).toFixed(2)} → ${qty} L` };
      }
      const qty = Math.max(1, Math.ceil(finishSqFt / mm.coverageSqFtPerGal));
      return { qty, unit: "gal", detail: `${fmtIn(finishSqFt)} sq ft ÷ ${mm.coverageSqFtPerGal}/gal = ${(finishSqFt / mm.coverageSqFtPerGal).toFixed(2)} → ${qty} gal` };
    };
    for (const key of finishProcess.materialKeys) {
      const mat = pb.materials[key as keyof typeof pb.materials];
      if (!mat) continue;
      const { qty, unit, detail } = finishMatQty(key);
      const cost = r2(qty * mat.unitCostCad);
      lines.push({
        section: "Materials",
        description: mat.description,
        detail: `${detail} × ${fmtMoney(mat.unitCostCad)}`,
        qty,
        unit,
        unitCostCad: mat.unitCostCad,
        totalCad: cost,
      });
      math.push(`Finish material: ${mat.description} — ${qty} ${unit} = ${fmtMoney(cost)}.`);
    }

    // Caulk, filler, consumables.
    const caulkTubes = Math.ceil(n / 3);
    const caulkCost = r2(caulkTubes * pb.materials.caulkTube.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.caulkTube.description,
      detail: `ceil(${n} shelves ÷ 3) = ${caulkTubes} tube${caulkTubes === 1 ? "" : "s"} × ${fmtMoney(pb.materials.caulkTube.unitCostCad)}`,
      qty: caulkTubes,
      unit: pb.materials.caulkTube.unit,
      unitCostCad: pb.materials.caulkTube.unitCostCad,
      totalCad: caulkCost,
    });
    const fillerCost = r2(pb.materials.fillerTub.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.fillerTub.description,
      detail: `1 tub × ${fmtMoney(pb.materials.fillerTub.unitCostCad)}`,
      qty: 1,
      unit: pb.materials.fillerTub.unit,
      unitCostCad: pb.materials.fillerTub.unitCostCad,
      totalCad: fillerCost,
    });
    const consCost = r2(pb.materials.consumables.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.consumables.description,
      detail: `flat allowance × ${fmtMoney(pb.materials.consumables.unitCostCad)}`,
      qty: 1,
      unit: pb.materials.consumables.unit,
      unitCostCad: pb.materials.consumables.unitCostCad,
      totalCad: consCost,
    });
  } else {
    math.push("No shelves on this wall — materials limited to consumables.");
    const consCost = r2(pb.materials.consumables.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.consumables.description,
      detail: `flat allowance × ${fmtMoney(pb.materials.consumables.unitCostCad)}`,
      qty: 1,
      unit: pb.materials.consumables.unit,
      unitCostCad: pb.materials.consumables.unitCostCad,
      totalCad: consCost,
    });
  }

  // ---------- DELIVERY ----------
  // Tom has no truck. Sheet goods, CNC parts, and finished millwork move by
  // hired driver with van ("man with a van"). Legs per route:
  //   in-shop: materials → work location, finished goods → site (2 legs)
  //   cnc-outsource: sheets → CNC shop, parts → work location, finished → site (3 legs)
  // Supplier delivery (often free/$60–75) can replace the first leg — adjust per job.
  const del = pb.delivery;
  const legs = route === "cnc-outsource" ? del.legsCncOutsource : del.legsInShop;
  const legDescriptions =
    route === "cnc-outsource"
      ? "sheets → CNC shop, parts → work location, finished → site"
      : "materials → work location, finished goods → site";
  const delCost = r2(legs * del.hiredDriverPerLegCad);
  lines.push({
    section: "Subcontract",
    description: "Delivery — hired driver with van",
    detail: `${legs} legs (${legDescriptions}) × ${fmtMoney(del.hiredDriverPerLegCad)}/leg`,
    qty: legs,
    unit: "leg",
    unitCostCad: del.hiredDriverPerLegCad,
    totalCad: delCost,
  });
  math.push(
    `Delivery: ${legs} hired-driver legs × ${fmtMoney(del.hiredDriverPerLegCad)} = ${fmtMoney(delCost)} (no truck; "man with a van" GTA rates).` +
      (route === "cnc-outsource"
        ? " Book the CNC pickup driver at drop-off — missed same-day pickup risks $150/day/skid storage."
        : " If the supplier delivers sheets free, drop one leg."),
  );

  // ---------- CNC OUTSOURCE ROUTE ----------
  // Trade shop cuts, drills, edgebands, labels. Shop still buys all sheets
  // (plus spares) and supplies its own edge tape; fab labor drops to assembly.
  if (route === "cnc-outsource" && n > 0) {
    const cnc = pb.cnc;
    wallSheetsForCnc = boardSheets + cleatSheets;

    // Spare sheets for recuts/defects — a shop material purchase.
    wallCncSpareSheets = Math.ceil(wallSheetsForCnc / cnc.spareSheetsPerN);
    const spareCost = r2(wallCncSpareSheets * pb.materials.birchPly34.unitCostCad);
    lines.push({
      section: "Materials",
      description: "Spare sheets for CNC recuts/defects (shop-supplied)",
      detail:
        `ceil(${wallSheetsForCnc} sheets ÷ ${cnc.spareSheetsPerN}) = ${wallCncSpareSheets} sheet${wallCncSpareSheets === 1 ? "" : "s"}` +
        ` × ${fmtMoney(pb.materials.birchPly34.unitCostCad)} (CNC shop requires spares; unused come back)`,
      qty: wallCncSpareSheets,
      unit: pb.materials.birchPly34.unit,
      unitCostCad: pb.materials.birchPly34.unitCostCad,
      totalCad: spareCost,
    });
    math.push(`CNC spare sheets: ${wallCncSpareSheets} × ${fmtMoney(pb.materials.birchPly34.unitCostCad)} = ${fmtMoney(spareCost)} (material purchase, not CNC billing).`);

    // CNC billing: per-sheet with a minimum billable count per job.
    const billableSheets = Math.max(wallSheetsForCnc, cnc.minimumBillableSheets);
    const cutCost = r2(billableSheets * cnc.perSheetCad);
    lines.push({
      section: "Subcontract",
      description: "CNC cutting — cut, drill, edgeband, label (trade shop)",
      detail:
        `max(${wallSheetsForCnc} sheets needed, ${cnc.minimumBillableSheets} minimum/job) = ${billableSheets} × ${fmtMoney(cnc.perSheetCad)}` +
        ` (edge tape supplied by shop; flat-slab parts only)`,
      qty: billableSheets,
      unit: "sheet",
      unitCostCad: cnc.perSheetCad,
      totalCad: cutCost,
    });
    const progCost = r2(cnc.programmingPerJobCad);
    lines.push({
      section: "Subcontract",
      description: "CNC programming (per job, non-refundable)",
      detail: `1 job × ${fmtMoney(cnc.programmingPerJobCad)} — shop programs from your sizes/drawings`,
      qty: 1,
      unit: "job",
      unitCostCad: cnc.programmingPerJobCad,
      totalCad: progCost,
    });
    const skidCost = r2(cnc.skidPerJobCad);
    lines.push({
      section: "Subcontract",
      description: "CNC skid / wrap / strapping",
      detail: `1 job × ${fmtMoney(cnc.skidPerJobCad)}`,
      qty: 1,
      unit: "job",
      unitCostCad: cnc.skidPerJobCad,
      totalCad: skidCost,
    });
    math.push(
      `CNC subcontract: ${billableSheets} sheets × ${fmtMoney(cnc.perSheetCad)} = ${fmtMoney(cutCost)}` +
        ` + programming ${fmtMoney(progCost)} + skid ${fmtMoney(skidCost)} = ${fmtMoney(r2(cutCost + progCost + skidCost))}.`,
    );
    math.push(
      "NOTE: this wall is priced as its own CNC job (programming fee + sheet minimum). " +
        "On multi-wall projects, use estimateProject with the cnc-outsource route — " +
        "it pools CNC billing across all walls (one programming fee, one minimum).",
    );
  }

  const materialsTotalCad = r2(
    lines.filter((l) => l.section === "Materials").reduce((a, l) => a + l.totalCad, 0),
  );
  const materialsWithMarkupCad = r2(
    materialsTotalCad * (1 + pb.business.materialMarkup),
  );
  math.push(
    `Materials: ${fmtMoney(materialsTotalCad)} × ${(1 + pb.business.materialMarkup).toFixed(2)} (${Math.round(pb.business.materialMarkup * 100)}% markup) = ${fmtMoney(materialsWithMarkupCad)}.`,
  );

  // ---------- SUBCONTRACT (CNC route only) ----------
  const subcontractTotalCad = r2(
    lines.filter((l) => l.section === "Subcontract").reduce((a, l) => a + l.totalCad, 0),
  );
  const subcontractWithMarkupCad = r2(
    subcontractTotalCad * (1 + pb.business.subcontractMarkup),
  );
  if (subcontractTotalCad > 0) {
    math.push(
      `Subcontract: ${fmtMoney(subcontractTotalCad)} × ${(1 + pb.business.subcontractMarkup).toFixed(2)} (${Math.round(pb.business.subcontractMarkup * 100)}% markup) = ${fmtMoney(subcontractWithMarkupCad)}.`,
    );
  }

  // ---------- LABOR (INTERNAL — target hours × rates; never customer-facing) ----------
  let shopHoursTotal = 0;
  let siteHoursTotal = 0;
  const labor = (
    description: string,
    hours: number,
    rate: number,
    detail: string,
  ) => {
    const total = r2(hours * rate);
    lines.push({
      section: "Labor",
      description,
      detail: `${detail} = ${hours.toFixed(2)}h × ${fmtMoney(rate)}/h`,
      qty: r2(hours),
      unit: "hr",
      unitCostCad: rate,
      totalCad: total,
    });
    if (rate === pb.labor.shopRatePerHrCad) shopHoursTotal = r2(shopHoursTotal + hours);
    else siteHoursTotal = r2(siteHoursTotal + hours);
    return total;
  };

  const fabH = n * lm.fabHoursPerShelf;
  const instH = n * lm.mountLevelFastenHoursPerUnit;
  const scribeH = lm.scribeFitHoursPerWall;
  if (route === "cnc-outsource") {
    // Parts arrive cut/drilled/edgebanded/labelled — shop labor is assembly only.
    const asmH = n * lm.cncAssemblyHoursPerShelf;
    labor("Assembly — parts arrive CNC-cut/drilled/edgebanded (shop)", asmH, pb.labor.shopRatePerHrCad,
      `${n} units × ${lm.cncAssemblyHoursPerShelf}h (no shop cutting on CNC route)`);
    labor("CNC shop runs — drop off sheets + pick up parts", lm.cncRunHoursPerWall, pb.labor.installRatePerHrCad,
      `${lm.cncRunHoursPerWall}h per wall (field time)`);
  } else {
    labor("Fabrication — cut, edgeband, assemble (shop)", fabH, pb.labor.shopRatePerHrCad,
      `${n} units × ${lm.fabHoursPerShelf}h`);
  }

  // ---------- FINISHING — process selected by finish family ----------
  // Painted, stained, clear-coat, oil, and prefinished are fundamentally
  // different shop processes (see lib/estimator-finishes.ts). White oak is
  // stained, never primed/painted.
  math.push(`Finishing process (${FINISH_FAMILY_LABELS[finishFamily]}): ${finishProcess.notes}`);
  for (const step of finishProcess.steps) {
    const hours = r2(n * step.hoursPerUnit + step.hoursPerWall);
    if (step.calendarDays) calendarHoldDays += step.calendarDays;
    if (hours <= 0 && !step.calendarDays) continue;
    const perUnit = step.hoursPerUnit > 0 ? `${n} units × ${step.hoursPerUnit}h` : null;
    const perWall = step.hoursPerWall > 0 ? `${step.hoursPerWall}h per wall batch` : null;
    const hold = step.calendarDays ? `${step.calendarDays}-day calendar hold` : null;
    if (hours > 0) {
      labor(step.label, hours, pb.labor.shopRatePerHrCad,
        [perUnit, perWall, hold].filter(Boolean).join(" + ") + ` — ${step.detail}`);
    } else {
      math.push(`${step.label}: ${hold} — ${step.detail} (no paid labor; parts sit while the finisher does other work).`);
    }
  }
  if (calendarHoldDays > 0) {
    math.push(`Schedule: ${calendarHoldDays} calendar day${calendarHoldDays === 1 ? "" : "s"} of dry/cure holds — unpaid, but the job spans extra days.`);
  }
  labor("Install — dry-fit, shim level/plumb, fasten, caulk (on site)", instH, pb.labor.installRatePerHrCad,
    `${n} units × ${lm.mountLevelFastenHoursPerUnit}h (base shimming for normal walls included)`);
  labor("Scribe + fit to walls (on site)", scribeH, pb.labor.installRatePerHrCad,
    `${lm.scribeFitHoursPerWall}h allowance/wall — shim box true first, then scribe sides/fillers to out-of-plumb walls; adjust at site measure`);
  labor("Load-in tools + materials (on site)", lm.loadInHoursPerWall, pb.labor.installRatePerHrCad,
    `${lm.loadInHoursPerWall}h flat per visit`);
  labor("Pack-up + clean-up (on site)", lm.cleanupHoursPerWall, pb.labor.installRatePerHrCad,
    `${lm.cleanupHoursPerWall}h flat per visit`);
  labor("Site measure (on site)", lm.siteMeasureHoursPerWall, pb.labor.installRatePerHrCad,
    `${lm.siteMeasureHoursPerWall}h flat per wall`);
  labor("Drawings/admin", lm.adminHoursPerWall, pb.labor.shopRatePerHrCad,
    `${lm.adminHoursPerWall}h flat per wall`);
  labor("Material handling — receive/unload, load truck (shop)", lm.matHandlingHoursPerWall, pb.labor.shopRatePerHrCad,
    `${lm.matHandlingHoursPerWall}h flat per wall`);
  labor("Drive time", lm.driveHoursPerWall, pb.labor.installRatePerHrCad,
    `${lm.driveHoursPerWall}h round trip per wall`);

  // ---------- INSTALLER DAY MINIMUM ----------
  // On-site installers bill a 4-hour minimum, then 8-hour days: <4h bills 4,
  // 4–8h bills 8, etc. Applies to the install-day block (mount/level/fasten +
  // scribe + load-in + clean-up + drive). Site measure is a separate visit;
  // CNC runs are separate trips — neither is subject to the install-day minimum.
  const installDayActual = r2(instH + scribeH + lm.loadInHoursPerWall + lm.cleanupHoursPerWall + lm.driveHoursPerWall);
  const installDayBilled = Math.ceil(installDayActual / 4) * 4;
  const minimumBump = r2(installDayBilled - installDayActual);
  if (minimumBump > 0) {
    const bumpCost = r2(minimumBump * pb.labor.installRatePerHrCad);
    lines.push({
      section: "Labor",
      description: "Installer day minimum — rounded to 4/8-hr day",
      detail: `install-day work is ${installDayActual}h actual → billed ${installDayBilled}h (4-hr minimum / 8-hr day) = +${minimumBump}h × ${fmtMoney(pb.labor.installRatePerHrCad)}/h`,
      qty: minimumBump,
      unit: "hr",
      unitCostCad: pb.labor.installRatePerHrCad,
      totalCad: bumpCost,
    });
    math.push(`Installer day minimum: ${installDayActual}h actual → ${installDayBilled}h billed (+${fmtMoney(bumpCost)}).`);
  } else {
    math.push(`Installer day: ${installDayActual}h actual = ${installDayBilled}h billed (no minimum bump).`);
  }

  // ---------- SECOND PERSON (crew of 2) ----------
  // Heavy lifts, 10 ft+ units, full-height pieces needing a holder while
  // fastening: Tom hires a helper for the install day. Helper bills the same
  // minimum-rounded day hours at the helper rate (GTA 4-hr minimum is standard
  // for day labour too).
  const crewSize = opts.crewSize ?? 1;
  if (crewSize === 2) {
    const helperCost = r2(installDayBilled * pb.labor.helperRatePerHrCad);
    lines.push({
      section: "Labor",
      description: "Helper — second person for install day (lifting/holding)",
      detail: `${installDayBilled}h (same billed day as installer) × ${fmtMoney(pb.labor.helperRatePerHrCad)}/h`,
      qty: installDayBilled,
      unit: "hr",
      unitCostCad: pb.labor.helperRatePerHrCad,
      totalCad: helperCost,
    });
    math.push(`2-person install: helper ${installDayBilled}h × ${fmtMoney(pb.labor.helperRatePerHrCad)}/h = ${fmtMoney(helperCost)}. Triggers: unit >~100–150 lbs, 10 ft+, full-height needing a holder, or stone/wood top.`);
  }

  const laborTotalCad = r2(
    lines.filter((l) => l.section === "Labor").reduce((a, l) => a + l.totalCad, 0),
  );
  math.push(
    `Labor: ${fmtMoney(laborTotalCad)} ` +
      `(shop ${fmtMoney(pb.labor.shopRatePerHrCad)}/h on ${route === "cnc-outsource" ? "assembly" : "fab"}/${finishProcess.steps.map((s) => s.key).join("/")}/admin, ` +
      `on-site ${fmtMoney(pb.labor.installRatePerHrCad)}/h on mount+scribe/load-in/clean-up/measure/drive${route === "cnc-outsource" ? "/CNC runs" : ""}${crewSize === 2 ? `; helper ${fmtMoney(pb.labor.helperRatePerHrCad)}/h` : ""}; ` +
      `includes paid dry/wait time between finish coats).`,
  );

  // ---------- TOTALS ----------
  const subtotalCad = r2(materialsWithMarkupCad + subcontractWithMarkupCad + laborTotalCad);
  const contingencyCad = r2(subtotalCad * pb.business.overheadContingency);
  const totalCostCad = r2(subtotalCad + contingencyCad);
  const customerPriceCad =
    Math.round(totalCostCad / pb.business.priceRoundingCad) *
    pb.business.priceRoundingCad;

  math.push(
    `Subtotal: ${fmtMoney(materialsWithMarkupCad)} materials` +
      (subcontractWithMarkupCad > 0 ? ` + ${fmtMoney(subcontractWithMarkupCad)} subcontract` : "") +
      ` + ${fmtMoney(laborTotalCad)} labor = ${fmtMoney(subtotalCad)}.`,
  );
  math.push(
    `Contingency/overhead ${Math.round(pb.business.overheadContingency * 100)}%: ${fmtMoney(subtotalCad)} × ${(1 + pb.business.overheadContingency).toFixed(2)} → internal cost ${fmtMoney(totalCostCad)}.`,
  );
  math.push(
    `Customer fixed price: ${fmtMoney(totalCostCad)} rounded to nearest $${pb.business.priceRoundingCad} = ${fmtMoney(customerPriceCad)} (pre-tax; ${pb.taxNote}).`,
  );

  return {
    wallLabel: input.wallLabel,
    fabricationRoute: route,
    depthAssumed,
    lines,
    materialsTotalCad,
    materialsWithMarkupCad,
    subcontractTotalCad,
    subcontractWithMarkupCad,
    laborTotalCad,
    shopHoursTotal,
    siteHoursTotal,
    finishFamily,
    finishAssumed: finishInfo.assumed,
    calendarHoldDays,
    sheetsForCnc: wallSheetsForCnc,
    cncSpareSheets: wallCncSpareSheets,
    subtotalCad,
    contingencyCad,
    totalCostCad,
    customerPriceCad,
    math,
  };
}

/**
 * Customer-safe view: fixed price + plain descriptions only.
 * Strips hours, rates, margins, and the math trace. There is no way to
 * recover internal numbers from this object.
 */
export function customerView(est: WallEstimate): CustomerEstimate {
  const materialLines = est.lines.filter((l) => l.section === "Materials");
  const laborLines = est.lines.filter((l) => l.section === "Labor");
  const lines: CustomerEstimateLine[] = [];
  const matTotal = r2(materialLines.reduce((a, l) => a + l.totalCad, 0));
  if (matTotal > 0) {
    lines.push({ description: "Materials & hardware", totalCad: matTotal });
  }
  const labCount = laborLines.length;
  if (labCount > 0) {
    lines.push({
      description: "Fabrication, finishing & installation",
      totalCad: est.customerPriceCad - matTotal,
    });
  }
  return {
    wallLabel: est.wallLabel,
    lines,
    fixedPriceCad: est.customerPriceCad,
    taxNote: PRICE_BOOK.taxNote,
  };
}

/**
 * Sum several wall estimates into one project figure (internal view).
 *
 * On the cnc-outsource route, CNC billing is pooled across all walls: the
 * programming fee and the sheet minimum apply once per JOB, and spare
 * sheets are pooled (1 per N of total sheets). Per-wall estimates price
 * CNC as a standalone job, so the pooled project figure is the honest one
 * for multi-wall quotes.
 */
export function estimateProject(walls: WallEstimate[], opts: EstimateOptions = {}): {
  walls: WallEstimate[];
  fabricationRoute: FabricationRoute;
  projectCustomerPriceCad: number;
  projectTotalCostCad: number;
  math: string[];
} {
  const route: FabricationRoute = opts.fabricationRoute ?? "in-shop";
  const pb = PRICE_BOOK;
  const rounding = pb.business.priceRoundingCad;
  const math: string[] = [];

  let projectSubtotalCad: number;
  if (route === "cnc-outsource") {
    const cnc = pb.cnc;
    const totalSheets = walls.reduce((a, w) => a + (w.sheetsForCnc ?? 0), 0);
    const perWallSpares = walls.reduce((a, w) => a + (w.cncSpareSheets ?? 0), 0);
    const pooledSpares = Math.ceil(totalSheets / cnc.spareSheetsPerN);
    const billableSheets = Math.max(totalSheets, cnc.minimumBillableSheets);
    const cncJobCost = r2(
      billableSheets * cnc.perSheetCad + cnc.programmingPerJobCad + cnc.skidPerJobCad,
    );
    const cncWithMarkup = r2(cncJobCost * (1 + pb.business.subcontractMarkup));
    // Walls carry per-wall CNC billing + per-wall spares; replace both with pooled figures.
    const wallsExCnc = r2(
      walls.reduce(
        (a, w) =>
          a +
          w.materialsWithMarkupCad +
          w.laborTotalCad -
          (w.cncSpareSheets ?? 0) * pb.materials.birchPly34.unitCostCad * (1 + pb.business.materialMarkup),
        0,
      ),
    );
    const pooledSpareCost = r2(
      pooledSpares * pb.materials.birchPly34.unitCostCad * (1 + pb.business.materialMarkup),
    );
    projectSubtotalCad = r2(wallsExCnc + pooledSpareCost + cncWithMarkup);
    math.push(
      `CNC pooled across ${walls.length} wall${walls.length === 1 ? "" : "s"}: ${totalSheets} sheets needed → ` +
        `${billableSheets} billable × ${fmtMoney(cnc.perSheetCad)} + ${fmtMoney(cnc.programmingPerJobCad)} programming + ${fmtMoney(cnc.skidPerJobCad)} skid` +
        ` = ${fmtMoney(cncJobCost)} × ${(1 + pb.business.subcontractMarkup).toFixed(2)} markup = ${fmtMoney(cncWithMarkup)} (ONE programming fee and ONE sheet minimum for the whole job).`,
    );
    math.push(
      `Spare sheets pooled: ${perWallSpares} (per-wall) → ${pooledSpares} (1 per ${cnc.spareSheetsPerN} of ${totalSheets} total) = ${fmtMoney(pooledSpareCost)} with markup.`,
    );
  } else {
    projectSubtotalCad = r2(walls.reduce((a, w) => a + w.subtotalCad, 0));
  }

  const contingencyCad = r2(projectSubtotalCad * pb.business.overheadContingency);
  const projectTotalCostCad = r2(projectSubtotalCad + contingencyCad);
  const projectCustomerPriceCad =
    Math.round(projectTotalCostCad / rounding) * rounding;

  math.push(
    ...walls.map(
      (w) => `"${w.wallLabel}" (${w.fabricationRoute}): cost ${"$" + w.totalCostCad.toFixed(2)} → fixed ${"$" + w.customerPriceCad.toFixed(2)}`,
    ),
    `Project subtotal ${"$" + projectSubtotalCad.toFixed(2)} + ${Math.round(pb.business.overheadContingency * 100)}% overhead/contingency` +
      ` → project cost ${"$" + projectTotalCostCad.toFixed(2)} → project fixed price ${"$" + projectCustomerPriceCad.toFixed(2)} (pre-tax).`,
  );

  return {
    walls,
    fabricationRoute: route,
    projectCustomerPriceCad,
    projectTotalCostCad,
    math,
  };
}
