/** Service catalogue for the Level Up Install website.
 *  Powers the "What we do" cards on the homepage and the dedicated service
 *  detail views. Card visuals are abstract SVG line art (see ServiceIcon in
 *  app/page.tsx) — never presented as photos of completed work.
 */

export type Service = {
  slug: string;
  title: string;
  short: string;
  included: string[];
  process: string[];
};

export const SERVICES: Service[] = [
  {
    slug: "custom-builtins",
    title: "Custom Built-ins",
    short:
      "Wall units, libraries, mudrooms, and window seats designed around your space.",
    included: [
      "Wall units, bookcases, and libraries sized to your room",
      "Mudrooms, window seats, and reading nooks",
      "Scribed to your walls — no caulk-filled gaps",
      "Paint- or stain-grade finish, installed like furniture",
      "Hardware, lighting cutouts, and cable management planned in",
    ],
    process: [
      "Share photos and chat with Alex to explore directions",
      "We confirm measurements and details on a site visit",
      "You approve a fixed written quote before we build",
    ],
  },
  {
    slug: "gallery-walls",
    title: "Gallery Walls",
    short:
      "Pictures, mirrors, and art hung level and secure — plus rods, hooks, and more.",
    included: [
      "Gallery walls and art hung level and secure on any wall type",
      "Mirrors, including heavy pieces with proper anchors",
      "Curtain rods, hooks, and house numbers",
      "Layout planning so spacing looks intentional",
      "Patch-free approach — we get placement right the first time",
    ],
    process: [
      "Tell Alex what you're hanging and where",
      "We confirm wall type and layout on the visit",
      "You approve a fixed quote, then we hang it straight",
    ],
  },
  {
    slug: "floating-shelves",
    title: "Floating Shelves",
    short:
      "Floating shelves, bracketed units, and closet systems — level and anchored to last.",
    included: [
      "Floating shelves with hidden hardware",
      "Bracketed and decorative shelf units",
      "Closet systems and storage walls",
      "Anchored into studs or rated for your wall type",
      "Level, evenly spaced, and load-ready",
    ],
    process: [
      "Explore shelf styles and placement with Alex",
      "We verify walls and spans on site",
      "Fixed quote approved, then we install",
    ],
  },
  {
    slug: "flat-pack-assembly",
    title: "Flat-Pack Assembly",
    short:
      "IKEA and flat-pack furniture built square, leveled, and wall-anchored.",
    included: [
      "Bookcases, wardrobes, desks, and storage units",
      "Built square and leveled — doors and drawers aligned",
      "Wall-anchoring where safety calls for it",
      "We haul away the packaging",
      "Small fixes and adjustments to existing pieces",
    ],
    process: [
      "Send Alex your item list and room photos",
      "We confirm access, placement, and anchoring needs",
      "Fixed quote, then we build it right",
    ],
  },
  {
    slug: "cabinets",
    title: "Cabinets",
    short:
      "Wall and base cabinet installs with fillers, scribes, and dialed-in hardware.",
    included: [
      "Wall and base cabinet installation",
      "Filler panels and scribes for a built-in look",
      "Hardware installation and adjustment",
      "Fit dialed in around your appliances",
      "Level runs, plumb faces, even reveals",
    ],
    process: [
      "Walk Alex through your kitchen or storage plans",
      "Site measure confirms every dimension",
      "Approve the fixed quote before install day",
    ],
  },
  {
    slug: "trim-moulding",
    title: "Trim & Moulding",
    short:
      "Baseboard, casing, and crown installed tight, with clean miters and returns.",
    included: [
      "Baseboard, door and window casing",
      "Crown moulding, including built-up profiles",
      "Tight joints, clean miters, and proper returns",
      "Coped inside corners where they belong",
      "Caulked and ready for paint",
    ],
    process: [
      "Pick profiles and rooms with Alex",
      "We measure and confirm quantities on site",
      "Fixed quote approved, then we trim it out",
    ],
  },
  {
    slug: "accent-walls",
    title: "Accent Walls",
    short:
      "Wood slat walls, board-and-batten, and panel moulding for a feature wall.",
    included: [
      "Wood slat feature walls",
      "Board-and-batten and picture-frame moulding",
      "Shiplap-style and geometric panel designs",
      "Paint- or stain-grade finishes",
      "Designed to your wall's proportions — never one-size-fits-all",
    ],
    process: [
      "Explore feature-wall directions with Alex",
      "We check your wall and confirm the design on site",
      "Approve the fixed quote, then we build it",
    ],
  },
  {
    slug: "doors",
    title: "Doors",
    short:
      "Prehung interior door installs and slab replacement, hardware set right.",
    included: [
      "Prehung interior door installation",
      "Slab replacement in existing frames",
      "Hinges, handles, and locksets installed and adjusted",
      "Clearances set so doors swing and latch properly",
      "Casing and trim finished around the opening",
    ],
    process: [
      "Tell Alex which doors need attention",
      "We confirm sizes and swing directions on site",
      "Fixed quote approved, then we hang them",
    ],
  },
  {
    slug: "bigger-renovations",
    title: "Bigger Renovations",
    short:
      "Larger projects and multi-trade work — we scope the carpentry and flag the rest.",
    included: [
      "Multi-room carpentry packages",
      "Coordination with your other trades",
      "Honest flagging of work outside carpentry",
      "Help lining up the right partner for the rest",
      "One point of contact for the woodwork",
    ],
    process: [
      "Describe the bigger picture to Alex",
      "Site visit to separate carpentry from other trades",
      "Fixed quote for our scope — no mystery, no drift",
    ],
  },
];

export function getService(slug: string | null | undefined): Service | null {
  if (!slug) return null;
  return SERVICES.find((s) => s.slug === slug) ?? null;
}
