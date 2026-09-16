export const STORE_UPDATED_EVENT = "helpit:store-updated";

export function notifyStoreUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORE_UPDATED_EVENT));
  }
}
