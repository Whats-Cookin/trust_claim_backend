import { Values } from "../types/utils";

export const HowKnown = {
  FIRST_HAND: "FIRST_HAND",
  SECOND_HAND: "SECOND_HAND",
  WEB_DOCUMENT: "WEB_DOCUMENT",
  VERIFIED_LOGIN: "VERIFIED_LOGIN",
  BLOCKCHAIN: "BLOCKCHAIN",
  SIGNED_DOCUMENT: "SIGNED_DOCUMENT",
  PHYSICAL_DOCUMENT: "PHYSICAL_DOCUMENT",
  INTEGRATION: "INTEGRATION",
  RESEARCH: "RESEARCH",
  OPINION: "OPINION",
  OTHER: "OTHER",
} as const;

export type HowKnown = Values<typeof HowKnown>;

export const howKnowns = Object.values(HowKnown);
