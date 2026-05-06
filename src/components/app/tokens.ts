export const KALA = {
  cream: "#FFF7F2",
  blush: "#FCE6E1",
  ink: "#2E201C",
  berry: "#76214D",
  coral: "#E9745F",
  olive: "#778455",
  orange: "#F58A24",
  border: "#E8CAC1",
  destructive: "#B23A48",
} as const;

export type KalaTone = keyof typeof KALA;
