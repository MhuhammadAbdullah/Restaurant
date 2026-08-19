import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CategoriesController } from "./categories/categories.controller";
import { CategoriesService } from "./categories/categories.service";
import { ProductsController } from "./products/products.controller";
import { ProductsService } from "./products/products.service";
import { ChoiceGroupsController } from "./choice-groups/choice-groups.controller";
import { ChoiceGroupsService } from "./choice-groups/choice-groups.service";
import { AddonGroupsController } from "./addon-groups/addon-groups.controller";
import { AddonGroupsService } from "./addon-groups/addon-groups.service";
import { AddonsController } from "./addons/addons.controller";
import { AddonsService } from "./addons/addons.service";
import { RecommendationsController } from "./recommendations/recommendations.controller";
import { RecommendationsService } from "./recommendations/recommendations.service";

@Module({
  imports: [AuthModule],
  controllers: [
    CategoriesController,
    ProductsController,
    ChoiceGroupsController,
    AddonGroupsController,
    AddonsController,
    RecommendationsController,
  ],
  providers: [CategoriesService, ProductsService, ChoiceGroupsService, AddonGroupsService, AddonsService, RecommendationsService],
  exports: [ProductsService],
})
export class CatalogModule {}
