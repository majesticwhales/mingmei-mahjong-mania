'use strict';

/**
 * Canonical TTC 2026 map template (source of truth for DB seeding).
 *
 * Each station has explicit WGS84 coordinates used for geofence check-in.
 * Replace latitude/longitude with real entrance locations (Google Maps, OSM, etc.).
 * Initial values may be schematic affine placeholders until you fill them in.
 *
 * x / y are schematic SVG layout coords for the client map only.
 *
 * Re-sync layout from client without wiping coordinates:
 *   npm run build:ttc2026-seed-data
 */

module.exports = {
  template: {
    name: 'TTC 2026',
    description: 'Toronto subway schematic (Lines 1, 2, 5) for mahjong-jet-lag',
    defaultDurationSeconds: 7200,
    defaultHandSize: 13,
    nodeCount: 84,
  },
  stations: [
  {
    "code": "finch-west",
    "name": "Finch West",
    "x": 215,
    "y": 115,
    "latitude": 43.749058,
    "longitude": -79.518508,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "downsview-park",
    "name": "Downsview Park",
    "x": 246,
    "y": 144,
    "latitude": 43.744591,
    "longitude": -79.507477,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "sheppard-west",
    "name": "Sheppard West",
    "x": 278,
    "y": 172,
    "latitude": 43.740464,
    "longitude": -79.496258,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "wilson",
    "name": "Wilson",
    "x": 309,
    "y": 201,
    "latitude": 43.735997,
    "longitude": -79.485227,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "yorkdale",
    "name": "Yorkdale",
    "x": 341,
    "y": 229,
    "latitude": 43.73187,
    "longitude": -79.474009,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "lawrence-west",
    "name": "Lawrence West",
    "x": 372,
    "y": 258,
    "latitude": 43.727403,
    "longitude": -79.462978,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "glencairn",
    "name": "Glencairn",
    "x": 404,
    "y": 286,
    "latitude": 43.723276,
    "longitude": -79.451759,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "cedarvale",
    "name": "Cedarvale",
    "x": 435,
    "y": 315,
    "latitude": 43.718809,
    "longitude": -79.440728,
    "lineIds": [
      "1",
      "5"
    ],
    "isInterchange": true,
    "labelAnchor": "sw",
    "labelRotate": null
  },
  {
    "code": "st-clair-west",
    "name": "St. Clair West",
    "x": 450,
    "y": 365,
    "latitude": 43.707668,
    "longitude": -79.432269,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "w",
    "labelRotate": null
  },
  {
    "code": "dupont",
    "name": "Dupont",
    "x": 470,
    "y": 400,
    "latitude": 43.700719,
    "longitude": -79.423738,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "w",
    "labelRotate": null
  },
  {
    "code": "spadina",
    "name": "Spadina",
    "x": 475,
    "y": 460,
    "latitude": 43.686187,
    "longitude": -79.417156,
    "lineIds": [
      "1",
      "2"
    ],
    "isInterchange": true,
    "labelAnchor": "s",
    "labelRotate": null
  },
  {
    "code": "st-george",
    "name": "St. George",
    "x": 515,
    "y": 460,
    "latitude": 43.689766,
    "longitude": -79.406171,
    "lineIds": [
      "1",
      "2"
    ],
    "isInterchange": true,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "museum",
    "name": "Museum",
    "x": 515,
    "y": 495,
    "latitude": 43.681028,
    "longitude": -79.403133,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "w",
    "labelRotate": null
  },
  {
    "code": "queens-park",
    "name": "Queen's Park",
    "x": 515,
    "y": 525,
    "latitude": 43.673538,
    "longitude": -79.400529,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "w",
    "labelRotate": null
  },
  {
    "code": "st-patrick",
    "name": "St. Patrick",
    "x": 515,
    "y": 555,
    "latitude": 43.666048,
    "longitude": -79.397925,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "w",
    "labelRotate": null
  },
  {
    "code": "osgoode",
    "name": "Osgoode",
    "x": 515,
    "y": 585,
    "latitude": 43.658558,
    "longitude": -79.395321,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "w",
    "labelRotate": null
  },
  {
    "code": "st-andrew",
    "name": "St. Andrew",
    "x": 515,
    "y": 625,
    "latitude": 43.648571,
    "longitude": -79.391848,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "w",
    "labelRotate": null
  },
  {
    "code": "union",
    "name": "Union",
    "x": 555,
    "y": 685,
    "latitude": 43.63717,
    "longitude": -79.375655,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "s",
    "labelRotate": null
  },
  {
    "code": "king",
    "name": "King",
    "x": 595,
    "y": 625,
    "latitude": 43.655729,
    "longitude": -79.369878,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "queen",
    "name": "Queen",
    "x": 595,
    "y": 585,
    "latitude": 43.665716,
    "longitude": -79.37335,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "dundas",
    "name": "Dundas",
    "x": 595,
    "y": 555,
    "latitude": 43.673206,
    "longitude": -79.375954,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "college",
    "name": "College",
    "x": 595,
    "y": 525,
    "latitude": 43.680696,
    "longitude": -79.378558,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "wellesley",
    "name": "Wellesley",
    "x": 595,
    "y": 495,
    "latitude": 43.688186,
    "longitude": -79.381163,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "bloor-yonge",
    "name": "Bloor-Yonge",
    "x": 595,
    "y": 460,
    "latitude": 43.696924,
    "longitude": -79.384201,
    "lineIds": [
      "1",
      "2"
    ],
    "isInterchange": true,
    "labelAnchor": "ne",
    "labelRotate": -30
  },
  {
    "code": "rosedale",
    "name": "Rosedale",
    "x": 595,
    "y": 405,
    "latitude": 43.710656,
    "longitude": -79.388975,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "summerhill",
    "name": "Summerhill",
    "x": 595,
    "y": 380,
    "latitude": 43.716898,
    "longitude": -79.391145,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "st-clair",
    "name": "St. Clair",
    "x": 595,
    "y": 360,
    "latitude": 43.721891,
    "longitude": -79.392881,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "davisville",
    "name": "Davisville",
    "x": 595,
    "y": 340,
    "latitude": 43.726884,
    "longitude": -79.394617,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "eglinton",
    "name": "Eglinton",
    "x": 595,
    "y": 315,
    "latitude": 43.733126,
    "longitude": -79.396787,
    "lineIds": [
      "1",
      "5"
    ],
    "isInterchange": true,
    "labelAnchor": "sw",
    "labelRotate": null
  },
  {
    "code": "lawrence",
    "name": "Lawrence",
    "x": 595,
    "y": 275,
    "latitude": 43.743113,
    "longitude": -79.40026,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "york-mills",
    "name": "York Mills",
    "x": 595,
    "y": 245,
    "latitude": 43.750603,
    "longitude": -79.402864,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "sheppard-yonge",
    "name": "Sheppard-Yonge",
    "x": 595,
    "y": 210,
    "latitude": 43.759341,
    "longitude": -79.405902,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "north-york-centre",
    "name": "North York Centre",
    "x": 595,
    "y": 180,
    "latitude": 43.766831,
    "longitude": -79.408506,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "finch",
    "name": "Finch",
    "x": 595,
    "y": 145,
    "latitude": 43.775569,
    "longitude": -79.411544,
    "lineIds": [
      "1"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "kipling",
    "name": "Kipling",
    "x": 25,
    "y": 470,
    "latitude": 43.643425,
    "longitude": -79.539872,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "islington",
    "name": "Islington",
    "x": 55,
    "y": 470,
    "latitude": 43.64611,
    "longitude": -79.531633,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "royal-york",
    "name": "Royal York",
    "x": 85,
    "y": 470,
    "latitude": 43.648794,
    "longitude": -79.523394,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "old-mill",
    "name": "Old Mill",
    "x": 115,
    "y": 470,
    "latitude": 43.651478,
    "longitude": -79.515155,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "jane",
    "name": "Jane",
    "x": 145,
    "y": 470,
    "latitude": 43.654163,
    "longitude": -79.506916,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "runnymede",
    "name": "Runnymede",
    "x": 175,
    "y": 470,
    "latitude": 43.656847,
    "longitude": -79.498677,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "high-park",
    "name": "High Park",
    "x": 205,
    "y": 470,
    "latitude": 43.659531,
    "longitude": -79.490438,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "keele",
    "name": "Keele",
    "x": 235,
    "y": 470,
    "latitude": 43.662216,
    "longitude": -79.482199,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "dundas-west",
    "name": "Dundas West",
    "x": 265,
    "y": 470,
    "latitude": 43.6649,
    "longitude": -79.473961,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "lansdowne",
    "name": "Lansdowne",
    "x": 295,
    "y": 470,
    "latitude": 43.667584,
    "longitude": -79.465722,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "dufferin",
    "name": "Dufferin",
    "x": 325,
    "y": 470,
    "latitude": 43.670269,
    "longitude": -79.457483,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "ossington",
    "name": "Ossington",
    "x": 355,
    "y": 470,
    "latitude": 43.672953,
    "longitude": -79.449244,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "christie",
    "name": "Christie",
    "x": 385,
    "y": 470,
    "latitude": 43.675637,
    "longitude": -79.441005,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "bathurst",
    "name": "Bathurst",
    "x": 415,
    "y": 470,
    "latitude": 43.678322,
    "longitude": -79.432766,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "bay",
    "name": "Bay",
    "x": 555,
    "y": 460,
    "latitude": 43.693345,
    "longitude": -79.395186,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "s",
    "labelRotate": 0
  },
  {
    "code": "sherbourne",
    "name": "Sherbourne",
    "x": 630,
    "y": 470,
    "latitude": 43.697559,
    "longitude": -79.373721,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "castle-frank",
    "name": "Castle Frank",
    "x": 660,
    "y": 470,
    "latitude": 43.700244,
    "longitude": -79.365482,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "broadview",
    "name": "Broadview",
    "x": 700,
    "y": 470,
    "latitude": 43.703823,
    "longitude": -79.354497,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "chester",
    "name": "Chester",
    "x": 730,
    "y": 470,
    "latitude": 43.706507,
    "longitude": -79.346258,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "pape",
    "name": "Pape",
    "x": 760,
    "y": 470,
    "latitude": 43.709191,
    "longitude": -79.338019,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "donlands",
    "name": "Donlands",
    "x": 790,
    "y": 470,
    "latitude": 43.711876,
    "longitude": -79.32978,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "greenwood",
    "name": "Greenwood",
    "x": 820,
    "y": 470,
    "latitude": 43.71456,
    "longitude": -79.321541,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "coxwell",
    "name": "Coxwell",
    "x": 850,
    "y": 470,
    "latitude": 43.717244,
    "longitude": -79.313302,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "woodbine",
    "name": "Woodbine",
    "x": 880,
    "y": 470,
    "latitude": 43.719929,
    "longitude": -79.305063,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "main-street",
    "name": "Main Street",
    "x": 915,
    "y": 470,
    "latitude": 43.72306,
    "longitude": -79.295451,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "victoria-park",
    "name": "Victoria Park",
    "x": 945,
    "y": 475,
    "latitude": 43.724496,
    "longitude": -79.286778,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "warden",
    "name": "Warden",
    "x": 975,
    "y": 470,
    "latitude": 43.728429,
    "longitude": -79.278973,
    "lineIds": [
      "2"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "kennedy",
    "name": "Kennedy",
    "x": 1020,
    "y": 440,
    "latitude": 43.739945,
    "longitude": -79.269219,
    "lineIds": [
      "2",
      "5"
    ],
    "isInterchange": true,
    "labelAnchor": "e",
    "labelRotate": null
  },
  {
    "code": "mount-dennis",
    "name": "Mount Pennis",
    "x": 200,
    "y": 315,
    "latitude": 43.697782,
    "longitude": -79.505266,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "s",
    "labelRotate": null
  },
  {
    "code": "keelesdale",
    "name": "Keelesdale",
    "x": 240,
    "y": 315,
    "latitude": 43.701361,
    "longitude": -79.494281,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "s",
    "labelRotate": null
  },
  {
    "code": "caledonia",
    "name": "Caledonia",
    "x": 280,
    "y": 315,
    "latitude": 43.70494,
    "longitude": -79.483296,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "s",
    "labelRotate": null
  },
  {
    "code": "fairbank",
    "name": "Fairbank",
    "x": 310,
    "y": 315,
    "latitude": 43.707625,
    "longitude": -79.475057,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "s",
    "labelRotate": null
  },
  {
    "code": "oakwood",
    "name": "Oakwood",
    "x": 340,
    "y": 315,
    "latitude": 43.710309,
    "longitude": -79.466818,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "s",
    "labelRotate": null
  },
  {
    "code": "forest-hill",
    "name": "Forest Hill",
    "x": 475,
    "y": 315,
    "latitude": 43.722389,
    "longitude": -79.429743,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "chaplin",
    "name": "Chaplin",
    "x": 515,
    "y": 315,
    "latitude": 43.725968,
    "longitude": -79.418758,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "avenue",
    "name": "Avenue",
    "x": 555,
    "y": 315,
    "latitude": 43.729547,
    "longitude": -79.407773,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "mount-pleasant",
    "name": "Mount Pleasant",
    "x": 625,
    "y": 315,
    "latitude": 43.73581,
    "longitude": -79.388549,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "leaside",
    "name": "Leaside",
    "x": 655,
    "y": 315,
    "latitude": 43.738495,
    "longitude": -79.38031,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "laird",
    "name": "Laird",
    "x": 685,
    "y": 315,
    "latitude": 43.741179,
    "longitude": -79.372071,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "sunnybrook-park",
    "name": "Sunnybrook Park",
    "x": 715,
    "y": 315,
    "latitude": 43.743863,
    "longitude": -79.363832,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "science-centre",
    "name": "Science Centre",
    "x": 745,
    "y": 315,
    "latitude": 43.746548,
    "longitude": -79.355593,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "aga-khan",
    "name": "Aga Khan Park & Museum",
    "x": 775,
    "y": 315,
    "latitude": 43.749232,
    "longitude": -79.347354,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "wynford",
    "name": "Wynford",
    "x": 805,
    "y": 315,
    "latitude": 43.751916,
    "longitude": -79.339115,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "sloane",
    "name": "Sloane",
    "x": 835,
    "y": 315,
    "latitude": 43.754601,
    "longitude": -79.330876,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "oconnor",
    "name": "O'Connor",
    "x": 865,
    "y": 315,
    "latitude": 43.757285,
    "longitude": -79.322637,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "pharmacy",
    "name": "Pharmacy",
    "x": 895,
    "y": 315,
    "latitude": 43.759969,
    "longitude": -79.314398,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "golden-mile",
    "name": "Golden Mile",
    "x": 925,
    "y": 315,
    "latitude": 43.762653,
    "longitude": -79.30616,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "hakimi-lebovic",
    "name": "Hakimi Lebovic",
    "x": 955,
    "y": 315,
    "latitude": 43.765338,
    "longitude": -79.297921,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "n",
    "labelRotate": null
  },
  {
    "code": "birchmount",
    "name": "Birchmount",
    "x": 980,
    "y": 325,
    "latitude": 43.765078,
    "longitude": -79.290187,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "ne",
    "labelRotate": null
  },
  {
    "code": "ionview",
    "name": "Ionview",
    "x": 1000,
    "y": 365,
    "latitude": 43.756881,
    "longitude": -79.281222,
    "lineIds": [
      "5"
    ],
    "isInterchange": false,
    "labelAnchor": "e",
    "labelRotate": null
  }
],
  lines: [
  {
    "code": "1",
    "name": "Line 1 Yonge-University",
    "shortName": "Line 1",
    "color": "#FFC72C",
    "stationIds": [
      "finch-west",
      "downsview-park",
      "sheppard-west",
      "wilson",
      "yorkdale",
      "lawrence-west",
      "glencairn",
      "cedarvale",
      "st-clair-west",
      "dupont",
      "spadina",
      "st-george",
      "museum",
      "queens-park",
      "st-patrick",
      "osgoode",
      "st-andrew",
      "union",
      "king",
      "queen",
      "dundas",
      "college",
      "wellesley",
      "bloor-yonge",
      "rosedale",
      "summerhill",
      "st-clair",
      "davisville",
      "eglinton",
      "lawrence",
      "york-mills",
      "sheppard-yonge",
      "north-york-centre",
      "finch"
    ],
    "bends": {
      "st-andrew": [
        {
          "x": 515,
          "y": 650
        },
        {
          "x": 520,
          "y": 668
        },
        {
          "x": 535,
          "y": 680
        }
      ],
      "union": [
        {
          "x": 575,
          "y": 680
        },
        {
          "x": 590,
          "y": 668
        },
        {
          "x": 595,
          "y": 650
        }
      ]
    }
  },
  {
    "code": "2",
    "name": "Line 2 Bloor-Danforth",
    "shortName": "Line 2",
    "color": "#00923F",
    "stationIds": [
      "kipling",
      "islington",
      "royal-york",
      "old-mill",
      "jane",
      "runnymede",
      "high-park",
      "keele",
      "dundas-west",
      "lansdowne",
      "dufferin",
      "ossington",
      "christie",
      "bathurst",
      "spadina",
      "st-george",
      "bay",
      "bloor-yonge",
      "sherbourne",
      "castle-frank",
      "broadview",
      "chester",
      "pape",
      "donlands",
      "greenwood",
      "coxwell",
      "woodbine",
      "main-street",
      "victoria-park",
      "warden",
      "kennedy",
      "lawrence-east",
      "scarborough-centre"
    ],
    "bends": null
  },
  {
    "code": "5",
    "name": "Line 5 Eglinton",
    "shortName": "Line 5",
    "color": "#F58025",
    "stationIds": [
      "mount-dennis",
      "keelesdale",
      "caledonia",
      "fairbank",
      "oakwood",
      "cedarvale",
      "forest-hill",
      "chaplin",
      "avenue",
      "eglinton",
      "mount-pleasant",
      "leaside",
      "laird",
      "sunnybrook-park",
      "science-centre",
      "aga-khan",
      "wynford",
      "sloane",
      "oconnor",
      "pharmacy",
      "golden-mile",
      "hakimi-lebovic",
      "birchmount",
      "ionview",
      "kennedy"
    ],
    "bends": null
  }
],
};
