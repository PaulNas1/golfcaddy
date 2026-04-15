import type { CourseHole, CourseTeeSet, HoleType, Round, SpecialHoles } from "@/types";

export type SeededCourse = {
  id: string;
  name: string;
  location: string;
  aliases: string[];
  teeSets: CourseTeeSet[];
};

type TeeSetSeed = Omit<CourseTeeSet, "holes"> & {
  pars: number[];
  strokeIndexes: number[];
  distances: number[];
};

const DEFAULT_NTP_HOLES = [3, 6, 12, 16];

function holeType(par: number): HoleType {
  if (par === 3) return "par3";
  if (par === 5) return "par5";
  return "par4";
}

function buildHoles(seed: TeeSetSeed): CourseHole[] {
  return seed.pars.map((par, index) => ({
    number: index + 1,
    par,
    strokeIndex: seed.strokeIndexes[index],
    type: holeType(par),
    distanceMeters: seed.distances[index],
  }));
}

function teeSet(seed: TeeSetSeed): CourseTeeSet {
  return {
    id: seed.id,
    name: seed.name,
    gender: seed.gender,
    par: seed.par,
    distanceMeters: seed.distanceMeters,
    courseRating: seed.courseRating,
    slopeRating: seed.slopeRating,
    holes: buildHoles(seed),
    source: seed.source,
  };
}

export const SEEDED_COURSES: SeededCourse[] = [
  {
    id: "morack-public-golf-course",
    name: "Morack Golf Club",
    location: "Vermont South, Victoria",
    aliases: [
      "Morack",
      "Morack Public Golf Course",
      "Morack Golf Course",
      "Morack Public",
    ],
    teeSets: [
      teeSet({
        id: "morack-blue",
        name: "Blue",
        gender: "men",
        par: 70,
        distanceMeters: 5282,
        courseRating: 68,
        slopeRating: 125,
        pars: [4, 5, 4, 3, 4, 3, 4, 4, 4, 3, 4, 5, 3, 4, 5, 3, 4, 4],
        strokeIndexes: [7, 3, 5, 9, 18, 14, 11, 13, 2, 17, 12, 8, 16, 1, 15, 10, 6, 4],
        distances: [336, 467, 351, 178, 270, 149, 290, 298, 360, 128, 273, 432, 151, 338, 431, 163, 329, 338],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/morack-public-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "morack-red",
        name: "Red",
        gender: "women",
        par: 70,
        distanceMeters: 4881,
        courseRating: 71,
        slopeRating: 127,
        pars: [4, 5, 4, 3, 4, 3, 4, 4, 4, 3, 4, 5, 3, 4, 5, 3, 4, 4],
        strokeIndexes: [7, 2, 10, 17, 15, 14, 8, 11, 4, 18, 12, 5, 16, 1, 9, 13, 6, 3],
        distances: [318, 435, 299, 111, 250, 144, 263, 288, 338, 127, 262, 411, 128, 323, 408, 145, 314, 317],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/morack-public-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "waterford-valley-golf-course",
    name: "Waterford Golf Club",
    location: "Knoxfield, Victoria",
    aliases: [
      "Waterford",
      "Waterford Valley",
      "Waterford Valley Golf Course",
      "Waterford Valley Golf Club",
    ],
    teeSets: [
      teeSet({
        id: "waterford-blue",
        name: "Blue",
        gender: "men",
        par: 72,
        distanceMeters: 6666,
        courseRating: 72,
        slopeRating: 137,
        pars: [4, 3, 4, 4, 3, 5, 4, 5, 4, 4, 5, 4, 3, 5, 4, 4, 3, 4],
        strokeIndexes: [14, 7, 8, 11, 16, 6, 9, 3, 12, 5, 15, 18, 2, 10, 17, 4, 13, 1],
        distances: [361, 177, 342, 362, 130, 554, 393, 546, 360, 364, 584, 389, 219, 545, 312, 411, 183, 396],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35684-waterford-valley-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "waterford-red",
        name: "Red",
        gender: "women",
        par: 72,
        distanceMeters: 5179,
        courseRating: 72,
        slopeRating: 122,
        pars: [4, 3, 4, 4, 3, 5, 4, 5, 4, 4, 5, 4, 3, 5, 4, 4, 3, 4],
        strokeIndexes: [16, 10, 3, 11, 18, 2, 14, 4, 7, 12, 13, 17, 8, 9, 5, 1, 15, 6],
        distances: [313, 103, 320, 287, 116, 429, 294, 456, 302, 300, 462, 321, 137, 440, 277, 338, 126, 358],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35684-waterford-valley-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "cardinia-beaconhills-golf-links",
    name: "Cardinia Beaconhills Golf Links",
    location: "Beaconsfield Upper, Victoria",
    aliases: [
      "Cardinia Beaconhills",
      "Beaconhills",
      "Cardinia",
      "Cardinia Beaconhills Golf Club",
      "Cardinia Beaconhills Golf Links",
    ],
    teeSets: [
      teeSet({
        id: "cardinia-beaconhills-white",
        name: "White",
        gender: "men",
        par: 71,
        distanceMeters: 6299,
        courseRating: 69.7,
        slopeRating: 119,
        pars: [4, 3, 5, 5, 4, 3, 4, 4, 4, 5, 3, 4, 3, 5, 3, 4, 4, 4],
        strokeIndexes: [8, 6, 18, 4, 10, 12, 2, 16, 14, 17, 9, 1, 13, 15, 7, 3, 5, 11],
        distances: [401, 223, 489, 537, 347, 141, 392, 375, 346, 531, 201, 417, 171, 492, 152, 363, 382, 339],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35679-cardinia-beaconhills-golf-links",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "cardinia-beaconhills-red",
        name: "Red",
        gender: "women",
        par: 71,
        distanceMeters: 5525,
        courseRating: 71.2,
        slopeRating: 121,
        pars: [4, 3, 5, 5, 4, 3, 4, 4, 4, 5, 3, 4, 3, 5, 3, 4, 4, 4],
        strokeIndexes: [8, 6, 18, 4, 10, 12, 2, 16, 14, 17, 9, 1, 13, 15, 7, 3, 5, 11],
        distances: [401, 189, 363, 523, 327, 124, 327, 358, 316, 446, 182, 371, 154, 441, 139, 312, 354, 315],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35679-cardinia-beaconhills-golf-links",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "yarrambat-park-golf-course",
    name: "Yarrambat Park Golf Course",
    location: "Yarrambat, Victoria",
    aliases: [
      "Yarrambat Park",
      "Yarrambat",
      "Yarrambat Golf Course",
      "Yarrambat Park Golf Club",
    ],
    teeSets: [
      teeSet({
        id: "yarrambat-blue",
        name: "Blue",
        gender: "men",
        par: 72,
        distanceMeters: 6698,
        courseRating: 72,
        slopeRating: 126,
        pars: [4, 5, 4, 4, 3, 4, 5, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4],
        strokeIndexes: [18, 8, 12, 3, 14, 6, 10, 1, 16, 5, 11, 2, 15, 7, 13, 4, 17, 9],
        distances: [329, 564, 370, 412, 177, 381, 490, 214, 359, 381, 475, 209, 360, 367, 561, 214, 376, 459],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35689-yarrambat-park-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "yarrambat-red",
        name: "Red",
        gender: "women",
        par: 72,
        distanceMeters: 5577,
        courseRating: 72,
        slopeRating: 124,
        pars: [4, 5, 4, 4, 3, 4, 5, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4],
        strokeIndexes: [14, 5, 12, 7, 18, 4, 8, 16, 10, 2, 11, 15, 3, 17, 6, 13, 1, 9],
        distances: [264, 446, 323, 359, 126, 360, 409, 145, 336, 311, 390, 123, 348, 336, 436, 132, 335, 398],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35689-yarrambat-park-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "sandhurst-club-champions-course",
    name: "Sandhurst Club",
    location: "Sandhurst, Victoria",
    aliases: [
      "Sandhurst",
      "Sandhurst Club",
      "Sandhurst Golf Club",
      "Sandhurst Champions",
      "Sandhurst Champions Course",
    ],
    teeSets: [
      teeSet({
        id: "sandhurst-champions-blue",
        name: "Champions Blue",
        gender: "men",
        par: 72,
        distanceMeters: 6283,
        courseRating: 75,
        slopeRating: 134,
        pars: [4, 5, 4, 4, 3, 4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4],
        strokeIndexes: [13, 9, 1, 3, 15, 5, 7, 17, 11, 10, 18, 14, 2, 4, 8, 12, 16, 6],
        distances: [376, 499, 377, 391, 164, 422, 492, 128, 348, 373, 466, 167, 434, 390, 385, 187, 455, 329],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/sandhurst-club",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "sandhurst-champions-red",
        name: "Champions Red",
        gender: "women",
        par: 72,
        distanceMeters: 5177,
        courseRating: 73,
        slopeRating: 122,
        pars: [4, 5, 4, 4, 3, 4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4],
        strokeIndexes: [13, 9, 1, 3, 15, 5, 7, 17, 11, 10, 18, 14, 2, 4, 8, 12, 16, 6],
        distances: [321, 410, 299, 299, 123, 363, 449, 108, 295, 321, 421, 116, 354, 307, 311, 123, 384, 273],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/sandhurst-club",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "bay-views-golf-course",
    name: "Bay Views Golf Course",
    location: "Rosebud, Victoria",
    aliases: [
      "Bay Views",
      "Bayviews",
      "Bay Views Golf Club",
      "Bay Views Rosebud",
    ],
    teeSets: [
      teeSet({
        id: "bay-views-blue",
        name: "Blue",
        gender: "men",
        par: 70,
        distanceMeters: 6261,
        courseRating: 71,
        slopeRating: 129,
        pars: [5, 4, 3, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 3, 4],
        strokeIndexes: [10, 12, 18, 4, 2, 16, 14, 6, 8, 7, 13, 3, 9, 11, 15, 5, 17, 1],
        distances: [513, 443, 157, 480, 375, 172, 357, 433, 363, 346, 200, 402, 493, 360, 160, 392, 144, 511],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35643-bay-views-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "bay-views-red",
        name: "Red",
        gender: "women",
        par: 70,
        distanceMeters: 4937,
        courseRating: 71,
        slopeRating: 128,
        pars: [5, 4, 3, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 3, 4],
        strokeIndexes: [10, 12, 18, 4, 2, 16, 14, 6, 8, 7, 13, 3, 9, 11, 15, 5, 17, 1],
        distances: [420, 326, 104, 417, 308, 136, 291, 357, 323, 332, 128, 326, 420, 286, 109, 315, 121, 318],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35643-bay-views-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "albert-park-golf-course",
    name: "Albert Park Golf Course",
    location: "Melbourne, Victoria",
    aliases: [
      "Albert Park",
      "Albert Park Golf Club",
      "Albert Park Melbourne",
    ],
    teeSets: [
      teeSet({
        id: "albert-park-blue",
        name: "Blue",
        gender: "men",
        par: 72,
        distanceMeters: 5794,
        courseRating: null,
        slopeRating: null,
        pars: [4, 4, 4, 4, 3, 4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 5, 4, 3],
        strokeIndexes: [10, 12, 2, 8, 18, 4, 16, 14, 6, 11, 15, 1, 13, 5, 7, 3, 9, 17],
        distances: [347, 344, 387, 386, 121, 389, 440, 155, 371, 362, 171, 389, 440, 374, 376, 444, 354, 144],
        source: {
          provider: "Albert Park Golf Course",
          url: "https://albertparkgolf.com.au/golf-scorecard/",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "albert-park-red",
        name: "Red",
        gender: "women",
        par: 72,
        distanceMeters: 5086,
        courseRating: null,
        slopeRating: null,
        pars: [4, 4, 4, 4, 3, 4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 5, 4, 3],
        strokeIndexes: [10, 12, 2, 8, 18, 4, 16, 14, 6, 11, 15, 1, 13, 5, 7, 3, 9, 17],
        distances: [295, 307, 343, 328, 99, 346, 387, 121, 343, 302, 136, 346, 387, 331, 320, 399, 324, 72],
        source: {
          provider: "Albert Park Golf Course",
          url: "https://albertparkgolf.com.au/golf-scorecard/",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "ringwood-golf-course",
    name: "Ringwood Golf Course",
    location: "Ringwood, Victoria",
    aliases: [
      "Ringwood",
      "Ringwood Golf Club",
      "Ringwood Golf",
    ],
    teeSets: [
      teeSet({
        id: "ringwood-back",
        name: "Back",
        gender: "men",
        par: 70,
        distanceMeters: 5357,
        courseRating: 67,
        slopeRating: 103,
        pars: [4, 4, 3, 5, 3, 5, 4, 3, 4, 4, 4, 3, 5, 4, 4, 3, 4, 4],
        strokeIndexes: [15, 1, 9, 10, 14, 5, 13, 11, 17, 16, 18, 12, 7, 2, 3, 8, 6, 4],
        distances: [275, 392, 141, 424, 128, 469, 254, 136, 255, 254, 231, 135, 450, 355, 355, 174, 339, 390],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/ringwood-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "ringwood-forward",
        name: "Forward",
        gender: "women",
        par: 71,
        distanceMeters: 4996,
        courseRating: 70,
        slopeRating: 113,
        pars: [4, 5, 3, 5, 3, 5, 4, 3, 4, 4, 4, 3, 5, 4, 4, 3, 4, 4],
        strokeIndexes: [12, 8, 10, 9, 16, 4, 7, 18, 17, 14, 13, 15, 1, 2, 5, 11, 3, 6],
        distances: [269, 363, 120, 420, 102, 425, 246, 128, 246, 234, 229, 120, 432, 342, 337, 159, 306, 318],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/ringwood-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "gardiners-run-golf-course",
    name: "Gardiners Run Golf Course",
    location: "Lilydale, Victoria",
    aliases: [
      "Gardiners Run",
      "Gariners Run",
      "Gardiners",
      "Gardiners Run Golf Club",
    ],
    teeSets: [
      teeSet({
        id: "gardiners-run-blue",
        name: "Blue",
        gender: "men",
        par: 72,
        distanceMeters: 7105,
        courseRating: 73,
        slopeRating: 133,
        pars: [4, 5, 3, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4],
        strokeIndexes: [1, 11, 15, 3, 18, 5, 9, 13, 7, 8, 12, 2, 10, 6, 17, 14, 16, 4],
        distances: [399, 501, 189, 405, 334, 393, 190, 536, 344, 570, 200, 437, 405, 421, 318, 173, 568, 422],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35656-gardiners-run",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "gardiners-run-red",
        name: "Red",
        gender: "women",
        par: 72,
        distanceMeters: 5298,
        courseRating: 72,
        slopeRating: 127,
        pars: [4, 5, 3, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4],
        strokeIndexes: [1, 11, 15, 3, 18, 5, 9, 13, 7, 8, 12, 2, 10, 6, 17, 14, 16, 4],
        distances: [310, 375, 120, 293, 250, 308, 128, 383, 263, 451, 131, 354, 287, 297, 250, 124, 435, 294],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35656-gardiners-run",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "dorset-golf-course",
    name: "Dorset Golf Course",
    location: "Croydon, Victoria",
    aliases: [
      "Dorset",
      "Dorset Golf Club",
      "Dorset Croydon",
    ],
    teeSets: [
      teeSet({
        id: "dorset-back",
        name: "Back",
        gender: "men",
        par: 69,
        distanceMeters: 5485,
        courseRating: 68,
        slopeRating: 118,
        pars: [5, 4, 4, 4, 3, 4, 4, 3, 3, 4, 3, 4, 5, 4, 4, 4, 3, 4],
        strokeIndexes: [1, 3, 9, 5, 11, 7, 15, 17, 13, 6, 18, 4, 16, 12, 2, 8, 14, 10],
        distances: [456, 356, 373, 378, 159, 354, 348, 118, 135, 362, 142, 392, 447, 291, 384, 315, 129, 346],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/dorset-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "dorset-forward",
        name: "Forward",
        gender: "women",
        par: 70,
        distanceMeters: 5096,
        courseRating: 70,
        slopeRating: 116,
        pars: [5, 4, 4, 4, 3, 4, 4, 3, 3, 4, 3, 4, 5, 4, 4, 5, 3, 4],
        strokeIndexes: [1, 13, 11, 3, 15, 7, 5, 17, 9, 2, 14, 4, 8, 10, 6, 12, 18, 16],
        distances: [434, 319, 312, 335, 131, 342, 311, 105, 131, 351, 132, 345, 392, 252, 323, 285, 127, 330],
        source: {
          provider: "All Square Golf",
          url: "https://www.allsquaregolf.com/golf-courses/australia/dorset-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "growling-frog-golf-course",
    name: "Growling Frog Golf Course",
    location: "Yan Yean, Victoria",
    aliases: [
      "Growling Frog",
      "The Growling Frog",
      "Growling Frog Golf Club",
      "Growling Frog Yan Yean",
    ],
    teeSets: [
      teeSet({
        id: "growling-frog-white",
        name: "White",
        gender: "men",
        par: 72,
        distanceMeters: 6575,
        courseRating: 72,
        slopeRating: 113,
        pars: [4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 4, 5, 3, 4],
        strokeIndexes: [10, 15, 3, 7, 9, 17, 1, 13, 5, 18, 12, 4, 6, 8, 14, 2, 16, 11],
        distances: [380, 184, 543, 410, 352, 179, 551, 391, 400, 143, 363, 542, 426, 394, 328, 542, 173, 294],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35658-growling-frog-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
      teeSet({
        id: "growling-frog-red",
        name: "Red",
        gender: "women",
        par: 72,
        distanceMeters: 5027,
        courseRating: null,
        slopeRating: null,
        pars: [4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 4, 5, 3, 4],
        strokeIndexes: [10, 15, 3, 7, 9, 17, 1, 13, 5, 18, 12, 4, 6, 8, 14, 2, 16, 11],
        distances: [270, 100, 429, 300, 304, 126, 423, 277, 331, 100, 273, 434, 319, 313, 252, 390, 134, 252],
        source: {
          provider: "GolfPass",
          url: "https://www.golfpass.com/travel-advisor/courses/35658-growling-frog-golf-course",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
  {
    id: "eagle-ridge-golf-club-vic",
    name: "Eagle Ridge Golf Club",
    location: "Boneo, Victoria",
    aliases: [
      "Eagle Ridge",
      "Eagle Ridge Golf Course",
      "Eagle Ridge Golf Club Mornington Peninsula",
    ],
    teeSets: [
      teeSet({
        id: "eagle-ridge-white",
        name: "White",
        gender: "men",
        par: 72,
        distanceMeters: 5867,
        courseRating: 71,
        slopeRating: 130,
        pars: [4, 4, 4, 4, 4, 3, 5, 3, 5, 4, 3, 4, 4, 4, 4, 5, 3, 5],
        strokeIndexes: [17, 13, 2, 6, 11, 12, 5, 18, 14, 1, 15, 9, 16, 10, 3, 8, 7, 4],
        distances: [290, 324, 362, 367, 345, 170, 462, 155, 443, 400, 153, 350, 272, 330, 315, 445, 204, 480],
        source: {
          provider: "Golfify",
          url: "https://www.golfify.io/courses/eagle-ridge-golf-club",
          lastVerified: "2026-04-15",
          confidence: "seeded",
        },
      }),
    ],
  },
];

export function getCourseById(courseId: string) {
  return SEEDED_COURSES.find((course) => course.id === courseId) ?? null;
}

function courseSearchTerms(course: SeededCourse) {
  return [
    course.name,
    course.location,
    course.id.replace(/-/g, " "),
    ...course.aliases,
  ].map(normalizeCourseName);
}

export function findSeededCourseByName(courseName: string) {
  const normalized = normalizeCourseName(courseName);
  if (!normalized) return null;
  return (
    SEEDED_COURSES.find((course) =>
      courseSearchTerms(course).some((term) => term === normalized)
    ) ??
    SEEDED_COURSES.find((course) =>
      courseSearchTerms(course).some(
        (term) =>
          normalized.includes(term) ||
          normalized.includes(term.replace(" golf club", "")) ||
          normalized.includes(term.replace(" golf course", ""))
      )
    ) ??
    null
  );
}

export function searchSeededCourses(query: string, limit = 6) {
  const normalized = normalizeCourseName(query);
  if (normalized.length < 2) return [];

  return SEEDED_COURSES.map((course) => {
    const terms = courseSearchTerms(course);
    const score = terms.some((term) => term === normalized)
      ? 0
      : terms.some((term) => term.startsWith(normalized))
      ? 1
      : terms.some((term) => term.includes(normalized))
      ? 2
      : Number.POSITIVE_INFINITY;

    return { course, score };
  })
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || a.course.name.localeCompare(b.course.name))
    .slice(0, limit)
    .map((item) => item.course);
}

export function getCourseSearchLabel(course: SeededCourse) {
  return `${course.name} - ${course.location}`;
}

export function getTeeSet(courseId: string, teeSetId: string) {
  return (
    getCourseById(courseId)?.teeSets.find((teeSet) => teeSet.id === teeSetId) ??
    null
  );
}

function normalizeCourseName(courseName: string) {
  return courseName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getDefaultTeeSet(courseId: string) {
  return getCourseById(courseId)?.teeSets[0] ?? null;
}

export function getParThreeHoles(teeSet: CourseTeeSet) {
  return teeSet.holes
    .filter((hole) => hole.par === 3)
    .map((hole) => hole.number);
}

export function getHoleOptionLabel(hole: Pick<CourseHole, "number" | "par" | "strokeIndex" | "distanceMeters">) {
  return [
    `Hole ${hole.number}`,
    `Par ${hole.par}`,
    `SI ${hole.strokeIndex}`,
    hole.distanceMeters ? `${hole.distanceMeters}m` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

export function getDriveHoleOptions(holes: CourseHole[]) {
  return holes.filter((hole) => hole.par >= 4);
}

function arraysEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeSpecialHoles(
  specialHoles: SpecialHoles | undefined,
  courseHoles: CourseHole[]
): SpecialHoles {
  const existing = specialHoles ?? {
    ntp: DEFAULT_NTP_HOLES,
    ld: null,
    t2: null,
    t3: null,
  };
  const existingNtp = existing.ntp ?? [];
  const parThreeHoles =
    courseHoles.length === 18
      ? courseHoles.filter((hole) => hole.par === 3).map((hole) => hole.number)
      : [];
  const shouldUseCourseNtp =
    parThreeHoles.length > 0 &&
    (existingNtp.length === 0 || arraysEqual(existingNtp, DEFAULT_NTP_HOLES));

  return {
    ...existing,
    ntp: shouldUseCourseNtp ? parThreeHoles : existingNtp,
  };
}

export function withSeededCourseData(round: Round): Round {
  const seededCourse =
    (round.courseId ? getCourseById(round.courseId) : null) ??
    findSeededCourseByName(round.courseName);
  const seededTeeSet =
    (seededCourse && round.teeSetId
      ? getTeeSet(seededCourse.id, round.teeSetId)
      : null) ?? seededCourse?.teeSets[0] ?? null;
  const courseHoles =
    round.courseHoles && round.courseHoles.length === 18
      ? round.courseHoles
      : seededTeeSet?.holes ?? round.courseHoles ?? [];

  return {
    ...round,
    courseId: round.courseId || seededCourse?.id || "",
    teeSetId: round.teeSetId ?? seededTeeSet?.id ?? null,
    teeSetName: round.teeSetName ?? seededTeeSet?.name ?? null,
    coursePar: round.coursePar ?? seededTeeSet?.par ?? null,
    courseRating: round.courseRating ?? seededTeeSet?.courseRating ?? null,
    slopeRating: round.slopeRating ?? seededTeeSet?.slopeRating ?? null,
    courseHoles,
    courseSource: round.courseSource ?? seededTeeSet?.source ?? null,
    specialHoles: normalizeSpecialHoles(round.specialHoles, courseHoles),
  };
}

export function getFallbackCourseHoles(): CourseHole[] {
  return Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    const par = [3, 6, 12, 16].includes(number) ? 3 : 4;
    return {
      number,
      par,
      strokeIndex: number,
      type: holeType(par),
    };
  });
}
