/**
 * Resolves a Choice Section's own required/selection-type/min/max against an optional
 * per-attachment override (set when a product attaches the section — see ProductChoiceGroup).
 * Deal slots don't support overrides, so callers pass `undefined` there.
 */

export type ChoiceGroupRules = {
  isRequired: boolean;
  selectionType: "SINGLE" | "MULTIPLE";
  minSelect: number;
  maxSelect: number;
};

export type ChoiceGroupOverride = {
  isRequiredOverride?: boolean | null;
  minSelectOverride?: number | null;
  maxSelectOverride?: number | null;
};

export function resolveChoiceGroupRules(group: ChoiceGroupRules, override?: ChoiceGroupOverride | null): ChoiceGroupRules {
  return {
    isRequired: override?.isRequiredOverride ?? group.isRequired,
    selectionType: group.selectionType,
    minSelect: override?.minSelectOverride ?? group.minSelect,
    maxSelect: override?.maxSelectOverride ?? group.maxSelect,
  };
}

/** Returns the lone option's id if exactly one active option exists (auto-select, still shown as pre-checked), else []. */
export function autoSelectSingleOption(activeOptions: { id: string }[]): string[] {
  return activeOptions.length === 1 ? [activeOptions[0]!.id] : [];
}
