import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class combiner: conditional classes + Tailwind conflict merge. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
