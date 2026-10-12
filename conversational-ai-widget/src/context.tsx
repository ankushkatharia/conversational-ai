"use client";

import { createContext, useContext, type ReactNode } from "react";

export type WidgetCallbacks = {
  onNavigate?: (url: string) => void;
  onAddToCart?: (productId: string, sku?: string) => void;
};

const WidgetCallbacksContext = createContext<WidgetCallbacks>({});

export function WidgetCallbacksProvider({
  value,
  children,
}: {
  value: WidgetCallbacks;
  children: ReactNode;
}) {
  return (
    <WidgetCallbacksContext.Provider value={value}>
      {children}
    </WidgetCallbacksContext.Provider>
  );
}

export function useWidgetCallbacks(): WidgetCallbacks {
  return useContext(WidgetCallbacksContext);
}
