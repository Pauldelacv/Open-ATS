import localFont from "next/font/local";

// Instrument Sans and Instrument Serif — SIL Open Font License 1.1, see src/fonts/.
export const instrumentSans = localFont({
  src: "../fonts/InstrumentSans-Variable-latin.woff2",
  variable: "--font-instrument-sans",
  weight: "400 700",
  display: "swap",
});

export const instrumentSerif = localFont({
  src: "../fonts/InstrumentSerif-Regular-latin.woff2",
  variable: "--font-instrument-serif",
  weight: "400",
  display: "swap",
});

