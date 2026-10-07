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

  math.push(
    `Wall "${input.wallLabel}": ${n} ${n === 1 ? "shelf" : "shelves"}` +
      (n > 0
        ? ` (${input.shelves.map((s) => `${s.tag} ${fmtIn(s.lengthIn)}in`).join(", ")})`
        : "") +
      `, depth ${fmtIn(depthIn)}in${depthAssumed ? " (ASSUMED — confirm on site)" : ""}` +
      `, fabrication route: ${route === "cnc-outsource" ? "CNC OUTSOURCE (trade shop cuts/drills/edgebands; Level Up assembles)" : "IN-SHOP (Level Up cuts/edgebands/assembles)"}.`,
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
    const boardCost = r2(boardSheets * pb.materials.birchPly34.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.birchPly34.description,
      detail:
        `${n} shelves × ${fmtIn(input.shelves[0].lengthIn)}in × ${fmtIn(depthIn)}in × ${layers} layers` +
        ` = ${fmtIn(boardNetSqIn)} sq in net × ${mm.wasteFactor} waste ÷ ${mm.sheetAreaSqIn.toLocaleString()} sq in/sheet` +
        ` = ${(boardNetSqIn * mm.wasteFactor / mm.sheetAreaSqIn).toFixed(2)} → ${boardSheets} sheet${boardSheets === 1 ? "" : "s"}` +
        ` × ${fmtMoney(pb.materials.birchPly34.unitCostCad)}`,
      qty: boardSheets,
      unit: pb.materials.birchPly34.unit,
      unitCostCad: pb.materials.birchPly34.unitCostCad,
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

    // Finish: top+bottom+edges per shelf, primer + paint at coverage rate.
    const finishSqIn = input.shelves.reduce(
      (a, s) => a + 2 * (s.lengthIn * depthIn) + 2 * (s.lengthIn + depthIn) * 1.5,
      0,
    );
    const finishSqFt = finishSqIn / 144;
    const gals = Math.max(1, Math.ceil(finishSqFt / mm.coverageSqFtPerGal));
    const primerCost = r2(gals * pb.materials.primerGal.unitCostCad);
    const paintCost = r2(gals * pb.materials.paintGal.unitCostCad);
    lines.push({
      section: "Materials",
      description: pb.materials.primerGal.description,
      detail: `${fmtIn(finishSqFt)} sq ft finished surface ÷ ${mm.coverageSqFtPerGal}/gal = ${(finishSqFt / mm.coverageSqFtPerGal).toFixed(2)} → ${gals} gal × ${fmtMoney(pb.materials.primerGal.unitCostCad)}`,
      qty: gals,
      unit: pb.materials.primerGal.unit,
      unitCostCad: pb.materials.primerGal.unitCostCad,
      totalCad: primerCost,
    });
    lines.push({
      section: "Materials",
      description: pb.materials.paintGal.description,
      detail: `same coverage → ${gals} gal × ${fmtMoney(pb.materials.paintGal.unitCostCad)}`,
      qty: gals,
      unit: pb.materials.paintGal.unit,
      unitCostCad: pb.materials.paintGal.unitCostCad,
      totalCad: paintCost,
    });
    math.push(
      `Finish: ${fmtIn(finishSqFt)} sq ft → ${gals} gal primer (${fmtMoney(primerCost)}) + ${gals} gal paint (${fmtMoney(paintCost)}).`,
    );

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

  // Delivery charge: flat per wall (supplier → shop).
  const delCost = r2(pb.materials.deliveryFee.unitCostCad);
  lines.push({
    section: "Materials",
    description: pb.materials.deliveryFee.description,
    detail: `1 trip × ${fmtMoney(pb.materials.deliveryFee.unitCostCad)}`,
    qty: 1,
    unit: pb.materials.deliveryFee.unit,
    unitCostCad: pb.materials.deliveryFee.unitCostCad,
    totalCad: delCost,
  });
  math.push(`Delivery: ${fmtMoney(delCost)} flat per wall.`);

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
  const knockH = n * lm.knockdownHoursPerShelf;
  const primeH = n * lm.primeHoursPerShelf;
  const paintH = n * lm.paintHoursPerShelf;
  const instH = n * lm.installHoursPerShelf;
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
  labor("Knock-down for finishing + reassembly (shop)", knockH, pb.labor.shopRatePerHrCad,
    `${n} units × ${lm.knockdownHoursPerShelf}h`);
  labor("Prime coat (shop)", primeH, pb.labor.shopRatePerHrCad,
    `${n} units × ${lm.primeHoursPerShelf}h`);
  labor("Dry/wait after prime — PAID (shop)", lm.dryWaitHoursAfterPrimePerWall, pb.labor.shopRatePerHrCad,
    `${lm.dryWaitHoursAfterPrimePerWall}h per wall batch (all parts dry together)`);
  labor("Topcoats ×2 + sand between (shop)", paintH, pb.labor.shopRatePerHrCad,
    `${n} units × ${lm.paintHoursPerShelf}h`);
  labor("Dry/wait after final coat — PAID (shop)", lm.dryWaitHoursAfterPaintPerWall, pb.labor.shopRatePerHrCad,
    `${lm.dryWaitHoursAfterPaintPerWall}h per wall batch before handling`);
  labor("Install — mount, level, caulk (on site)", instH, pb.labor.installRatePerHrCad,
    `${n} units × ${lm.installHoursPerShelf}h`);
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

  const laborTotalCad = r2(
    lines.filter((l) => l.section === "Labor").reduce((a, l) => a + l.totalCad, 0),
  );
  math.push(
    `Labor: ${fmtMoney(laborTotalCad)} ` +
      `(shop ${fmtMoney(pb.labor.shopRatePerHrCad)}/h on ${route === "cnc-outsource" ? "assembly" : "fab"}/knock-down/prime/paint/admin, ` +
      `on-site ${fmtMoney(pb.labor.installRatePerHrCad)}/h on install/load-in/clean-up/measure/drive${route === "cnc-outsource" ? "/CNC runs" : ""}; ` +
      `includes paid dry/wait time after prime and after final coat).`,
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
