"use client";

import { useMe, hasPermission } from "../../../../lib/useMe";
import { RecipeBook } from "../../../../components/recipes/RecipeBook";

export default function RecipesPage() {
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "inventoryRecipes.edit") || hasPermission(me, "inventoryRecipes.create") || hasPermission(me, "products.edit");
  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-neutral-500">
        The kitchen&apos;s recipe book: how to make each dish, with its ingredients and steps. Kitchen staff read these from the Kitchen screen. Recipes are instructions only and never change stock.
      </p>
      <RecipeBook canEdit={canEdit} />
    </div>
  );
}
