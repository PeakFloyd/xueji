// Stage, palette and the beat sheet. All times are global seconds from the moment the user authorises.

export const W = 1920;
export const H = 1080;
export const CX = W / 2;
export const CY = H / 2;

/** Palette: black, white + three colours. Nothing else is ever painted. */
export const C = {
  ink: "#0B0B0B",
  void: "#000000",
  strip: "#121212",
  paper: "#F2F0EA",
  red: "#FF3D24", // vermilion: seal ink, "restricted"
  yellow: "#FFD21F", // signal: scan, "granted"
};

/** Five showcase segments, equal length. */
export const SEG = 4;
export const SEGMENTS = [
  { at: 0, en: "ACCESS", zh: "访问" }, // kinetic type
  { at: 4, en: "IDENTITY", zh: "身份" }, // shape morph
  { at: 8, en: "REQUEST", zh: "请求" }, // 2D -> 3D
  { at: 12, en: "PROCESS", zh: "处理" }, // data / UI
  { at: 16, en: "WELCOME", zh: "欢迎" }, // end title
] as const;
export const DURATION = SEGMENTS.length * SEG;

/** Voice clips, in the order given by their file names, and when each starts. */
export const VOICE = [
  { src: "/audio/intro/01-access-permission-required.mp3", at: 0 },
  { src: "/audio/intro/02-id-confirmed.mp3", at: 4 },
  { src: "/audio/intro/03-request-received.mp3", at: 8 },
  { src: "/audio/intro/04-start-processing.mp3", at: 12 },
  { src: "/audio/intro/05-permission-authorized.mp3", at: 14 },
  { src: "/audio/intro/06-welcome.mp3", at: 16 },
];

/** Measured syllable onsets in the voice clips, mapped to global time. Visual hits land on these. */
export const BEAT = {
  access: 0.62,
  permission: 1.18,
  required: 1.9,
  id: 4.5,
  idD: 4.81,
  confirmed: 5.01,
  request: 8.46,
  received: 8.97,
  start: 12.43,
  processing: 12.76,
  permission2: 14.03,
  authorized: 14.91,
  welcome: 16.29,
  welcome2: 17.67,
};

/** Demo dataset (db/xueji.db, view v_student_credit): earned credits per student, by class. */
export const CLASSES: { id: string; required: number; credits: number[] }[] = [
  { id: "CS2301", required: 20, credits: [31, 25, 20, 7, 18] },
  { id: "CS2302", required: 20, credits: [22, 20, 20, 31, 17] },
  { id: "CS2303", required: 20, credits: [4, 24, 21, 25, 21] },
  { id: "CS2304", required: 20, credits: [24, 31, 15, 21, 15] },
  { id: "SE2201", required: 20, credits: [19, 22, 22, 16, 29] },
  { id: "SE2202", required: 20, credits: [17, 20, 17, 20, 18] },
  { id: "SE2203", required: 20, credits: [19, 12, 29, 16, 22] },
  { id: "MA2401", required: 24, credits: [25, 29, 13, 25, 29] },
  { id: "MA2402", required: 24, credits: [32, 24, 28, 20, 25] },
  { id: "MA2403", required: 24, credits: [8, 16, 28, 32, 20] },
];
export const COUNTS = { students: 50, courses: 18, enrollments: 350 };
