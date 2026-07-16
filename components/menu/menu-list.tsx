// Menu list — server component. Loads the full menu list + ingredient options
// and hands both to the client MenuBrowser.

import {
  getMenuList,
  getIngredientOptions,
  getFinishedGoodOptions,
} from "@/lib/db/selectors/menu";
import { MenuBrowser } from "@/components/menu/menu-browser";

export async function MenuList() {
  const [{ items, unavailableCount, categories }, ingredients, finishedGoods] = await Promise.all([
    getMenuList(),
    getIngredientOptions(),
    getFinishedGoodOptions(),
  ]);
  return (
    <MenuBrowser
      items={items}
      unavailableCount={unavailableCount}
      categories={categories}
      ingredients={ingredients}
      finishedGoods={finishedGoods}
    />
  );
}
