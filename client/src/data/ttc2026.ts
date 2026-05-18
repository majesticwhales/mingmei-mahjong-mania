import type { Network, Station, SubwayLine } from "./types";

const LINE_1_COLOR = "#FFC72C";
const LINE_2_COLOR = "#00923F";
const LINE_5_COLOR = "#F58025";

const stations: Station[] = [
  // Line 1 University (NW) arm — labels point west so they don't crowd the Yonge corridor at x=575.
  { id: "finch-west", name: "Finch West", x: 215, y: 115, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "downsview-park", name: "Downsview Park", x: 246, y: 144, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "sheppard-west", name: "Sheppard West", x: 278, y: 172, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "wilson", name: "Wilson", x: 309, y: 201, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "yorkdale", name: "Yorkdale", x: 341, y: 229, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "lawrence-west", name: "Lawrence West", x: 372, y: 258, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "glencairn", name: "Glencairn", x: 404, y: 286, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "cedarvale", name: "Cedarvale", x: 435, y: 315, lineIds: ["1", "5"], isInterchange: true, accessible: true, labelAnchor: "sw" },
  { id: "st-clair-west", name: "St. Clair West", x: 450, y: 365, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "w" },
  { id: "dupont", name: "Dupont", x: 470, y: 400, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "w" },

  // Line 1 + Line 2 interchanges — labels above (north) to clear both lines.
  { id: "spadina", name: "Spadina", x: 475, y: 460, lineIds: ["1", "2"], isInterchange: true, accessible: true, labelAnchor: "s" },
  { id: "st-george", name: "St. George", x: 515, y: 460, lineIds: ["1", "2"], isInterchange: true, accessible: true, labelAnchor: "n" },

  // Line 1 University arm downtown (x=515 column) — labels west.
  { id: "museum", name: "Museum", x: 515, y: 495, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "w" },
  { id: "queens-park", name: "Queen's Park", x: 515, y: 525, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "w" },
  { id: "st-patrick", name: "St. Patrick", x: 515, y: 555, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "w" },
  { id: "osgoode", name: "Osgoode", x: 515, y: 585, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "w" },
  { id: "st-andrew", name: "St. Andrew", x: 515, y: 625, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "w" },

  // Union sits at the bottom of the U; label below.
  { id: "union", name: "Union", x: 555, y: 685, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "s" },

  // Line 1 Yonge arm (x=595 column) — labels east, clear of any other line.
  { id: "king", name: "King", x: 595, y: 625, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "e" },
  { id: "queen", name: "Queen", x: 595, y: 585, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "e" },
  { id: "dundas", name: "Dundas", x: 595, y: 555, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "college", name: "College", x: 595, y: 525, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "wellesley", name: "Wellesley", x: 595, y: 495, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "e" },
  { id: "bloor-yonge", name: "Bloor-Yonge", x: 595, y: 460, lineIds: ["1", "2"], isInterchange: true, accessible: true, labelAnchor: "ne", labelRotate: -30 },
  { id: "rosedale", name: "Rosedale", x: 595, y: 405, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "e" },
  { id: "summerhill", name: "Summerhill", x: 595, y: 380, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "e" },
  { id: "st-clair", name: "St. Clair", x: 595, y: 360, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "davisville", name: "Davisville", x: 595, y: 340, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "eglinton", name: "Eglinton", x: 595, y: 315, lineIds: ["1", "5"], isInterchange: true, accessible: true, labelAnchor: "sw" },
  { id: "lawrence", name: "Lawrence", x: 595, y: 275, lineIds: ["1"], isInterchange: false, accessible: false, labelAnchor: "e" },
  { id: "york-mills", name: "York Mills", x: 595, y: 245, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "sheppard-yonge", name: "Sheppard-Yonge", x: 595, y: 210, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "north-york-centre", name: "North York Centre", x: 595, y: 180, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "finch", name: "Finch", x: 595, y: 145, lineIds: ["1"], isInterchange: false, accessible: true, labelAnchor: "e" },
  { id: "kipling", name: "Kipling", x: 25, y: 470, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "islington", name: "Islington", x: 55, y: 470, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "royal-york", name: "Royal York", x: 85, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "old-mill", name: "Old Mill", x: 115, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "jane", name: "Jane", x: 145, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "runnymede", name: "Runnymede", x: 175, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "high-park", name: "High Park", x: 205, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "keele", name: "Keele", x: 235, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "dundas-west", name: "Dundas West", x: 265, y: 470, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "lansdowne", name: "Lansdowne", x: 295, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "dufferin", name: "Dufferin", x: 325, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "ossington", name: "Ossington", x: 355, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "christie", name: "Christie", x: 385, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "bathurst", name: "Bathurst", x: 415, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },

  // Bay sits between St-George and Bloor-Yonge in the interchange dip;
  // tucked below to clear the three interchange labels stacked above.
  { id: "bay", name: "Bay", x: 555, y: 460, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "s", labelRotate: 0 },

  { id: "sherbourne", name: "Sherbourne", x: 630, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "castle-frank", name: "Castle Frank", x: 660, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "broadview", name: "Broadview", x: 700, y: 470, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "chester", name: "Chester", x: 730, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "pape", name: "Pape", x: 760, y: 470, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "donlands", name: "Donlands", x: 790, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "greenwood", name: "Greenwood", x: 820, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "coxwell", name: "Coxwell", x: 850, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "woodbine", name: "Woodbine", x: 880, y: 470, lineIds: ["2"], isInterchange: false, accessible: false, labelAnchor: "n" },
  { id: "main-street", name: "Main Street", x: 915, y: 470, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "victoria-park", name: "Victoria Park", x: 945, y: 475, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "warden", name: "Warden", x: 975, y: 470, lineIds: ["2"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "kennedy", name: "Kennedy", x: 1020, y: 440, lineIds: ["2", "5"], isInterchange: true, accessible: true, labelAnchor: "e" },
  // Line 5 Eglinton — alternate N/S for the horizontal run, switch to east
  // once the line starts bending south toward Kennedy.
  { id: "mount-dennis", name: "Mount Pennis", x: 200, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "s" },
  { id: "keelesdale", name: "Keelesdale", x: 240, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "s" },
  { id: "caledonia", name: "Caledonia", x: 280, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "s" },
  { id: "fairbank", name: "Fairbank", x: 310, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "s" },
  { id: "oakwood", name: "Oakwood", x: 340, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "s" },
  { id: "forest-hill", name: "Forest Hill", x: 475, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "chaplin", name: "Chaplin", x: 515, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "avenue", name: "Avenue", x: 555, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "mount-pleasant", name: "Mount Pleasant", x: 625, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "leaside", name: "Leaside", x: 655, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "laird", name: "Laird", x: 685, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "sunnybrook-park", name: "Sunnybrook Park", x: 715, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "science-centre", name: "Science Centre", x: 745, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "aga-khan", name: "Aga Khan Park & Museum", x: 775, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "wynford", name: "Wynford", x: 805, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "sloane", name: "Sloane", x: 835, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "oconnor", name: "O'Connor", x: 865, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "pharmacy", name: "Pharmacy", x: 895, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "golden-mile", name: "Golden Mile", x: 925, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "hakimi-lebovic", name: "Hakimi Lebovic", x: 955, y: 315, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "n" },
  { id: "birchmount", name: "Birchmount", x: 980, y: 325, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "ne" },
  { id: "ionview", name: "Ionview", x: 1000, y: 365, lineIds: ["5"], isInterchange: false, accessible: true, labelAnchor: "e" },
];

const stationsById = new Map(stations.map((s) => [s.id, s]));

const lines: SubwayLine[] = [
  {
    id: "1",
    name: "Line 1 Yonge-University",
    shortName: "Line 1",
    color: LINE_1_COLOR,
    stationIds: [
      "finch-west", "downsview-park", "sheppard-west", "wilson", "yorkdale", "lawrence-west",
      "glencairn", "cedarvale", "st-clair-west", "dupont", "spadina", "st-george", "museum",
      "queens-park", "st-patrick", "osgoode", "st-andrew", "union", "king", "queen", "dundas",
      "college", "wellesley", "bloor-yonge", "rosedale", "summerhill", "st-clair", "davisville",
      "eglinton", "lawrence", "york-mills", "sheppard-yonge", "north-york-centre", "finch",
    ],
    bends: {
      // Trace a half-ellipse through the bottom of the Yonge U so the loop
      // reads as a continuous smooth arc. Points sampled at roughly 30° steps
      // along the half-ellipse with rx=40, ry=35, centered at (555, 650).
      "st-andrew": [
        { x: 515, y: 650 },
        { x: 520, y: 668 },
        { x: 535, y: 680 },
      ],
      "union": [
        { x: 575, y: 680 },
        { x: 590, y: 668 },
        { x: 595, y: 650 },
      ],
    },
  },
  {
    id: "2",
    name: "Line 2 Bloor-Danforth",
    shortName: "Line 2",
    color: LINE_2_COLOR,
    stationIds: [
      "kipling", "islington", "royal-york", "old-mill", "jane", "runnymede", "high-park",
      "keele", "dundas-west", "lansdowne", "dufferin", "ossington", "christie", "bathurst",
      "spadina", "st-george", "bay", "bloor-yonge", "sherbourne", "castle-frank", "broadview",
      "chester", "pape", "donlands", "greenwood", "coxwell", "woodbine", "main-street",
      "victoria-park", "warden", "kennedy", "lawrence-east", "scarborough-centre",
    ],
  },
  {
    id: "5",
    name: "Line 5 Eglinton",
    shortName: "Line 5",
    color: LINE_5_COLOR,
    stationIds: [
      "mount-dennis", "keelesdale", "caledonia", "fairbank", "oakwood", "cedarvale",
      "forest-hill", "chaplin", "avenue", "eglinton", "mount-pleasant", "leaside", "laird",
      "sunnybrook-park", "science-centre", "aga-khan", "wynford", "sloane", "oconnor",
      "pharmacy", "golden-mile", "hakimi-lebovic", "birchmount", "ionview", "kennedy",
    ],
  },
];

if (import.meta.env?.DEV) {
  for (const line of lines) {
    for (const id of line.stationIds) {
      if (!stationsById.has(id)) {
        console.warn(`[ttc2026] Line ${line.id} references unknown station "${id}"`);
      }
    }
  }
}

export const network: Network = { lines, stations };
