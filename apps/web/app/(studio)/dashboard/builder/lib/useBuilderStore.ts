"use client";

import { useReducer } from "react";
import type { ShopLayout } from "@xgamefi/shared";

export type BuilderState = {
  layout: ShopLayout;
  featuredItemIds: string[];
  selectedItemId: string | null;
};

export type BuilderAction =
  | { type: "SET_MODE"; mode: "grid" | "list" }
  | { type: "ADD_ITEM"; sectionId: string; itemId: string; index?: number }
  | { type: "REMOVE_ITEM"; itemId: string }
  | { type: "REORDER"; sectionId: string; from: number; to: number }
  | { type: "TOGGLE_FEATURED"; itemId: string }
  | { type: "SELECT_ITEM"; itemId: string | null };

function mapSections(
  layout: ShopLayout,
  fn: (s: ShopLayout["sections"][number]) => ShopLayout["sections"][number],
): ShopLayout {
  return { ...layout, sections: layout.sections.map(fn) };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, layout: { ...state.layout, mode: action.mode } };
    case "ADD_ITEM":
      console.log("[builder reducer] ADD_ITEM", action.sectionId, action.itemId);
      return {
        ...state,
        layout: mapSections(state.layout, (s) => {
          if (s.id !== action.sectionId || s.itemIds.includes(action.itemId)) return s;
          const next = [...s.itemIds];
          next.splice(action.index ?? next.length, 0, action.itemId);
          return { ...s, itemIds: next };
        }),
      };
    case "REMOVE_ITEM":
      return {
        ...state,
        layout: mapSections(state.layout, (s) => ({ ...s, itemIds: s.itemIds.filter((id) => id !== action.itemId) })),
        featuredItemIds: state.featuredItemIds.filter((id) => id !== action.itemId),
        selectedItemId: state.selectedItemId === action.itemId ? null : state.selectedItemId,
      };
    case "REORDER":
      return {
        ...state,
        layout: mapSections(state.layout, (s) => {
          if (s.id !== action.sectionId) return s;
          const next = [...s.itemIds];
          const [moved] = next.splice(action.from, 1);
          if (!moved) return s;
          next.splice(action.to, 0, moved);
          return { ...s, itemIds: next };
        }),
      };
    case "TOGGLE_FEATURED":
      return {
        ...state,
        featuredItemIds: state.featuredItemIds.includes(action.itemId)
          ? state.featuredItemIds.filter((id) => id !== action.itemId)
          : [...state.featuredItemIds, action.itemId],
      };
    case "SELECT_ITEM":
      return { ...state, selectedItemId: action.itemId };
    default:
      return state;
  }
}

export function useBuilderStore(initial: BuilderState) {
  const [state, dispatch] = useReducer(builderReducer, initial);
  return { state, dispatch };
}
