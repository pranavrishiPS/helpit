import { useEffect } from "react";
import { STORE_UPDATED_EVENT } from "@/lib/store-events";

export function useStoreUpdated(callback: () => void): void {
  useEffect(() => {
    window.addEventListener(STORE_UPDATED_EVENT, callback);
    return () => window.removeEventListener(STORE_UPDATED_EVENT, callback);
  }, [callback]);
}
