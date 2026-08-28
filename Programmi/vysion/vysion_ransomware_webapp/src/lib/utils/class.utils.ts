import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
/**
 * Merges and returns a string of CSS class names.
 * @param classes - The tailwind class names to be merged.
 * @returns A string of merged CSS class names.
 */
export function cn(...classes: ClassValue[]): string {
    return twMerge(clsx(classes));
}
