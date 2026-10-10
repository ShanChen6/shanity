export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Long titles step down so they fit in about three lines. */
export const titleSize = (title: string) =>
  title.length > 90 ? 52 : title.length > 60 ? 60 : 72;
