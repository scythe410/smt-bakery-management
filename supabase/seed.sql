-- seed.sql — internally consistent demo data for Samanthas Bake House (BizCore demo)
--
-- Loaded after migrations on `supabase db reset` (see config.toml [db.seed]).
--
-- Design goals (CLAUDE.md §1, §3):
--   * ONE tenant ("Samanthas Bake House"). Every row scoped by its business_id.
--   * Every figure the app shows (Dashboard / Finance / Reports) is DERIVED from
--     these rows — never hardcoded downstream. To keep Dashboard "today" alive no
--     matter when the seed is loaded, orders/expenses/bookings are dated RELATIVE
--     to now()/current_date, not pinned to a calendar date.
--   * Money is integer minor units (LKR cents). No floats stored.
--   * Order totals are self-consistent: order.subtotal_cents = Σ(order_item qty ×
--     unit_price_cents); commission_cents = round(subtotal × rate_bps / 10000)
--     using the matching commission_rule; total_cents = subtotal_cents.
--   * order_item snapshots name + unit_price at time of sale.
--   * Low-stock (qty_on_hand <= low_stock_threshold) is true for exactly 11 items,
--     matching the reference implementation's badge count.
--
-- Re-runnable: the header removes this business (cascades all domain rows) and the
-- three demo auth users (cascades their profiles) before re-inserting, so applying
-- the seed twice is safe.
--
-- Fixed UUIDs (so children can reference parents deterministically):
--   business  11111111-1111-1111-1111-111111111111
--   owner     aaaaaaaa-0000-0000-0000-000000000001
--   manager   aaaaaaaa-0000-0000-0000-000000000002
--   staff     aaaaaaaa-0000-0000-0000-000000000003
--   customer  cccccccc-0000-0000-0000-0000000000NN
--   inventory dddddddd-0000-0000-0000-0000000000NN
--   menu      eeeeeeee-0000-0000-0000-0000000000NN

begin;

-- ---------------------------------------------------------------------------
-- 0. Idempotent cleanup (order matters: business cascade drops domain rows +
--    profiles; then remove the auth users).
-- ---------------------------------------------------------------------------
delete from public.business where id = '11111111-1111-1111-1111-111111111111';
delete from auth.users where email in (
  'owner@samanthas.demo', 'manager@samanthas.demo', 'staff@samanthas.demo'
);

-- ---------------------------------------------------------------------------
-- 1. Business (tenant root)
-- ---------------------------------------------------------------------------
insert into public.business (id, name, address, logo_url, currency, timezone, locale_default, tax_config)
values (
  '11111111-1111-1111-1111-111111111111',
  'Samanthas Bake House',
  'Walahanduwa, Galle',
  null,
  'LKR',
  'Asia/Colombo',
  'en',
  '{"vat_rate_bps": 0, "registered": false}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 2. Auth users (+ identities). The on_auth_user_created trigger reads
--    business_id + role from raw_app_meta_data (service-role-only) and creates
--    the matching public.profile row. Name/language come from user_metadata.
--    Passwords are dev-only and documented in LOG.md.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'owner@samanthas.demo',
  crypt('Owner#12345', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"business_id":"11111111-1111-1111-1111-111111111111","role":"owner"}'::jsonb,
  '{"name":"Samantha Perera","language":"en"}'::jsonb,
  now() - interval '120 days', now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'manager@samanthas.demo',
  crypt('Manager#12345', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"business_id":"11111111-1111-1111-1111-111111111111","role":"manager"}'::jsonb,
  '{"name":"Nadeesha Fernando","language":"en"}'::jsonb,
  now() - interval '110 days', now(), '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'authenticated', 'authenticated', 'staff@samanthas.demo',
  crypt('Staff#12345', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"business_id":"11111111-1111-1111-1111-111111111111","role":"staff"}'::jsonb,
  '{"name":"Kasun Silva","language":"si"}'::jsonb,
  now() - interval '90 days', now(), '', '', '', ''
);

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
(
  'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"owner@samanthas.demo","email_verified":true,"phone_verified":false}'::jsonb,
  'email', now(), now() - interval '120 days', now()
),
(
  'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","email":"manager@samanthas.demo","email_verified":true,"phone_verified":false}'::jsonb,
  'email', now(), now() - interval '110 days', now()
),
(
  'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","email":"staff@samanthas.demo","email_verified":true,"phone_verified":false}'::jsonb,
  'email', now(), now() - interval '90 days', now()
);

-- ---------------------------------------------------------------------------
-- 3. Customers (phone is the spine of a WhatsApp-native product)
-- ---------------------------------------------------------------------------
insert into public.customer (id, business_id, name, phone, notes) values
('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Dilani Wickramasinghe', '+94771234501', 'Regular — oat milk cappuccino'),
('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Roshan Mendis',          '+94771234502', 'Orders cakes for the office'),
('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Ishara Gunawardena',     '+94771234503', null),
('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Tharindu Bandara',       '+94771234504', 'Allergic to nuts'),
('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Menaka Rajapaksa',       '+94771234505', 'Weekly milk tea'),
('cccccccc-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Sanduni Perera',         '+94771234506', null),
('cccccccc-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Ajith Kumara',           '+94771234507', 'Corporate account'),
('cccccccc-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Hansi Jayawardena',      '+94771234508', 'Prefers pickup');

-- ---------------------------------------------------------------------------
-- 4. Inventory (22 items; ingredient + merchandise). Low-stock =
--    qty_on_hand <= low_stock_threshold. Exactly 11 rows are low (marked LOW).
-- ---------------------------------------------------------------------------
insert into public.inventory_item
  (id, business_id, name, kind, category, qty_on_hand, unit, unit_cost_cents, low_stock_threshold, barcode, sku) values
-- baking ingredients
('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'All-Purpose Flour',      'ingredient', 'baking',          8.000,  'kg',   32000,  10.000, '4001000000011', 'ING-FLR'),   -- LOW
('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Caster Sugar',           'ingredient', 'baking',          6.000,  'kg',   28000,   8.000, '4001000000028', 'ING-SGR'),   -- LOW
('dddddddd-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Unsalted Butter',        'ingredient', 'baking',          4.000,  'kg',  210000,   5.000, '4001000000035', 'ING-BTR'),   -- LOW
('dddddddd-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Eggs',                   'ingredient', 'baking',         90.000,  'unit',  4500,  60.000, '4001000000042', 'ING-EGG'),
('dddddddd-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Fresh Milk',             'ingredient', 'beverages',      12.000,  'L',    38000,  15.000, '4001000000059', 'ING-MLK'),   -- LOW
('dddddddd-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Cocoa Powder',           'ingredient', 'baking',          2.000,  'kg',  180000,   3.000, '4001000000066', 'ING-COC'),   -- LOW
('dddddddd-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Baking Powder',          'ingredient', 'baking',          3.000,  'kg',   90000,   2.000, '4001000000073', 'ING-BKP'),
('dddddddd-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Vanilla Essence',        'ingredient', 'syrups_toppings', 1.500,  'L',   220000,   2.000, '4001000000080', 'ING-VAN'),   -- LOW
('dddddddd-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Icing Sugar',            'ingredient', 'baking',          8.000,  'kg',   34000,   6.000, '4001000000097', 'ING-ICS'),
('dddddddd-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'Dark Chocolate',         'ingredient', 'baking',          3.000,  'kg',  280000,   4.000, '4001000000103', 'ING-DCH'),   -- LOW
('dddddddd-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'Whipping Cream',         'ingredient', 'syrups_toppings', 4.000,  'L',   150000,   6.000, '4001000000110', 'ING-WCR'),   -- LOW
('dddddddd-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'Cream Cheese',           'ingredient', 'baking',          2.000,  'kg',  240000,   3.000, '4001000000127', 'ING-CCH'),   -- LOW
('dddddddd-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'Arabica Coffee Beans',   'ingredient', 'beverages',       7.000,  'kg',  520000,   5.000, '4001000000134', 'ING-COF'),
('dddddddd-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'Ceylon Tea Leaves',      'ingredient', 'beverages',       6.000,  'kg',  260000,   4.000, '4001000000141', 'ING-TEA'),
('dddddddd-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'Strawberry Syrup',       'ingredient', 'syrups_toppings', 3.000,  'L',   145000,   2.000, '4001000000158', 'ING-STS'),
('dddddddd-0000-0000-0000-000000000016', '11111111-1111-1111-1111-111111111111', 'Caramel Syrup',          'ingredient', 'syrups_toppings', 1.000,  'L',   155000,   2.000, '4001000000165', 'ING-CRS'),   -- LOW
('dddddddd-0000-0000-0000-000000000017', '11111111-1111-1111-1111-111111111111', 'Assorted Sprinkles',     'ingredient', 'syrups_toppings', 5.000,  'kg',   88000,   3.000, '4001000000172', 'ING-SPR'),
-- packaging (ingredient lane — recipe-deducted per sale, not daily-counted)
('dddddddd-0000-0000-0000-000000000018', '11111111-1111-1111-1111-111111111111', 'Paper Cups (12oz)',      'ingredient', 'other',          400.000, 'unit',  2500, 200.000, '4001000000189', 'ING-CUP'),
('dddddddd-0000-0000-0000-000000000019', '11111111-1111-1111-1111-111111111111', 'Cake Boxes (medium)',    'ingredient', 'other',           60.000, 'unit', 12000,  80.000, '4001000000196', 'ING-BOX'),   -- LOW
-- merchandise (physical daily count lane; sale_price_cents set below)
('dddddddd-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111111', 'Branded Tote Bag',       'merchandise', 'merch',          25.000, 'unit', 45000,  15.000, '4001000000202', 'MRC-TOT'),
('dddddddd-0000-0000-0000-000000000021', '11111111-1111-1111-1111-111111111111', 'Ceramic Coffee Mug',     'merchandise', 'merch',          18.000, 'unit', 68000,  10.000, '4001000000219', 'MRC-MUG'),
('dddddddd-0000-0000-0000-000000000022', '11111111-1111-1111-1111-111111111111', 'Napkins (pack of 100)',  'ingredient', 'other',           30.000, 'unit', 15000,  20.000, '4001000000226', 'ING-NAP');

-- Explicit retail prices for merchandise items (migration 012: sale_price_cents column).
update public.inventory_item set sale_price_cents =  95000 where id = 'dddddddd-0000-0000-0000-000000000020';  -- Tote Bag    LKR 950
update public.inventory_item set sale_price_cents = 120000 where id = 'dddddddd-0000-0000-0000-000000000021';  -- Coffee Mug  LKR 1,200

-- Bought-in resale goods (merchandise sold-from-stock, migration 019): received by
-- scan on receipt, DECREMENTED per billed sale 1:1, low-stock alerted. Barcodes are
-- scannable at both receipt and billing. Sprite sits one sale above its threshold so
-- a single completed order trips the low-stock alert (demo).
insert into public.inventory_item
  (id, business_id, name, kind, category, qty_on_hand, unit, unit_cost_cents, low_stock_threshold, barcode, sku, sale_price_cents) values
('dddddddd-0000-0000-0000-000000000023', '11111111-1111-1111-1111-111111111111', 'Coca-Cola 330ml',     'merchandise', 'beverages', 24.000, 'unit', 12000, 6.000, '5449000000996', 'MRC-COK', 25000),
('dddddddd-0000-0000-0000-000000000024', '11111111-1111-1111-1111-111111111111', 'Sprite 330ml',        'merchandise', 'beverages',  7.000, 'unit', 12000, 6.000, '5449000014535', 'MRC-SPR', 25000),
('dddddddd-0000-0000-0000-000000000025', '11111111-1111-1111-1111-111111111111', 'Bottled Water 500ml', 'merchandise', 'beverages', 30.000, 'unit',  6000, 8.000, '4791111111118', 'MRC-WTR', 12000);

-- ---------------------------------------------------------------------------
-- 5. Menu (12 items) with prices
-- ---------------------------------------------------------------------------
insert into public.menu_item (id, business_id, name, price_cents, category, is_available) values
('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Chocolate Fudge Cake', 85000, 'Cakes',     true),
('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Red Velvet Slice',     90000, 'Cakes',     true),
('eeeeeeee-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Vanilla Cupcake',      35000, 'Pastries',  true),
('eeeeeeee-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Butter Croissant',     45000, 'Pastries',  true),
('eeeeeeee-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Chocolate Chip Cookie',25000, 'Cookies',   true),
('eeeeeeee-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'New York Cheesecake',  95000, 'Cakes',     true),
('eeeeeeee-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Cappuccino',           55000, 'Beverages', true),
('eeeeeeee-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Cafe Latte',           58000, 'Beverages', true),
('eeeeeeee-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Ceylon Milk Tea',      40000, 'Beverages', true),
('eeeeeeee-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'Strawberry Milkshake', 68000, 'Beverages', true),
('eeeeeeee-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'Caramel Macchiato',    62000, 'Beverages', true),
('eeeeeeee-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'Cinnamon Roll',        48000, 'Pastries',  true),
-- Sold-from-stock drinks (linked to merchandise stock below): no recipe; each sale
-- decrements the tracked good 1:1. Priced at the merchandise retail price.
('eeeeeeee-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'Coca-Cola 330ml',     25000, 'Beverages', true),
('eeeeeeee-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'Sprite 330ml',        25000, 'Beverages', true),
('eeeeeeee-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'Bottled Water 500ml', 12000, 'Beverages', true);

-- Link each drink menu item to its merchandise stock (sold-from-stock, migration
-- 019). Done as an UPDATE after both rows exist; the enforce trigger checks the
-- tracked item is merchandise/finished_good and the menu item has no recipe.
update public.menu_item set tracked_inventory_item_id = 'dddddddd-0000-0000-0000-000000000023' where id = 'eeeeeeee-0000-0000-0000-000000000013';
update public.menu_item set tracked_inventory_item_id = 'dddddddd-0000-0000-0000-000000000024' where id = 'eeeeeeee-0000-0000-0000-000000000014';
update public.menu_item set tracked_inventory_item_id = 'dddddddd-0000-0000-0000-000000000025' where id = 'eeeeeeee-0000-0000-0000-000000000015';

-- ---------------------------------------------------------------------------
-- 6. Recipe lines (BOM) — power auto stock deduction + COGS. qty is per unit sold.
-- ---------------------------------------------------------------------------
insert into public.recipe_line (business_id, menu_item_id, inventory_item_id, qty, unit) values
-- Chocolate Fudge Cake
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 0.120, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 0.100, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', 0.080, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004', 2.000, 'unit'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000006', 0.040, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000010', 0.050, 'kg'),
-- Red Velvet Slice
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 0.120, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 0.100, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000003', 0.070, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', 2.000, 'unit'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000006', 0.020, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000012', 0.060, 'kg'),
-- Vanilla Cupcake
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 0.050, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 0.040, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000003', 0.030, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004', 1.000, 'unit'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000008', 0.005, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000017', 0.010, 'kg'),
-- Butter Croissant
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 0.080, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000003', 0.050, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004', 0.500, 'unit'),
-- Chocolate Chip Cookie
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000001', 0.040, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000002', 0.030, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000003', 0.020, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000010', 0.020, 'kg'),
-- New York Cheesecake
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000001', 0.040, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000002', 0.060, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000012', 0.100, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000004', 1.000, 'unit'),
-- Cappuccino
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000013', 0.018, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000005', 0.150, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000018', 1.000, 'unit'),
-- Cafe Latte
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000008', 'dddddddd-0000-0000-0000-000000000013', 0.018, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000008', 'dddddddd-0000-0000-0000-000000000005', 0.200, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000008', 'dddddddd-0000-0000-0000-000000000018', 1.000, 'unit'),
-- Ceylon Milk Tea
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-000000000014', 0.012, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-000000000005', 0.100, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-000000000018', 1.000, 'unit'),
-- Strawberry Milkshake
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000010', 'dddddddd-0000-0000-0000-000000000005', 0.200, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000010', 'dddddddd-0000-0000-0000-000000000015', 0.030, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000010', 'dddddddd-0000-0000-0000-000000000011', 0.020, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000010', 'dddddddd-0000-0000-0000-000000000018', 1.000, 'unit'),
-- Caramel Macchiato
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-000000000013', 0.018, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-000000000005', 0.180, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-000000000016', 0.020, 'L'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-000000000018', 1.000, 'unit'),
-- Cinnamon Roll
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-000000000001', 0.070, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-000000000002', 0.040, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-000000000003', 0.030, 'kg'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000012', 'dddddddd-0000-0000-0000-000000000009', 0.020, 'kg');

-- ---------------------------------------------------------------------------
-- 7. Commission rules (basis points) — drive Reports "Commission"/"Net Revenue"
--    and Finance "Platform Earnings" as COMPUTED values. Own channels are 0%;
--    aggregators take a cut.
-- ---------------------------------------------------------------------------
insert into public.commission_rule (business_id, source, rate_bps) values
('11111111-1111-1111-1111-111111111111', 'dine_in',     0),
('11111111-1111-1111-1111-111111111111', 'walk_in',     0),
('11111111-1111-1111-1111-111111111111', 'whatsapp',    0),
('11111111-1111-1111-1111-111111111111', 'online',      0),
('11111111-1111-1111-1111-111111111111', 'pickme_food', 1800),
('11111111-1111-1111-1111-111111111111', 'uber_eats',   2500);

-- ---------------------------------------------------------------------------
-- 8. Orders + order_items — ~6 weeks (42 days) up to and including "today".
--    Generated relative to now() so Dashboard "today" is always populated.
--    Internal consistency by construction:
--      subtotal_cents  = Σ(qty × unit_price_cents) of the order's items
--      discount_cents  = round(subtotal × discount_pct / 100)   -- occasional
--      total_cents      = subtotal_cents − discount_cents        -- NET
--      commission_cents = round(total × rate_bps / 10000)        -- on the net base
--    Today (d=0) is forced to 6 orders: 3 completed, 2 pending, 1 cancelled,
--    so the Dashboard 2×2 grid (Total/Completed/Pending/Cancelled) is non-trivial.
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz constant uuid := '11111111-1111-1111-1111-111111111111';

  m_ids   uuid[] := array[
    'eeeeeeee-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000002',
    'eeeeeeee-0000-0000-0000-000000000003','eeeeeeee-0000-0000-0000-000000000004',
    'eeeeeeee-0000-0000-0000-000000000005','eeeeeeee-0000-0000-0000-000000000006',
    'eeeeeeee-0000-0000-0000-000000000007','eeeeeeee-0000-0000-0000-000000000008',
    'eeeeeeee-0000-0000-0000-000000000009','eeeeeeee-0000-0000-0000-000000000010',
    'eeeeeeee-0000-0000-0000-000000000011','eeeeeeee-0000-0000-0000-000000000012'];
  m_names text[] := array[
    'Chocolate Fudge Cake','Red Velvet Slice','Vanilla Cupcake','Butter Croissant',
    'Chocolate Chip Cookie','New York Cheesecake','Cappuccino','Cafe Latte',
    'Ceylon Milk Tea','Strawberry Milkshake','Caramel Macchiato','Cinnamon Roll'];
  m_prices int[] := array[85000,90000,35000,45000,25000,95000,55000,58000,40000,68000,62000,48000];

  sources public.order_source[] := array['dine_in','walk_in','whatsapp','online','pickme_food','uber_eats'];
  rates   int[]                 := array[0,0,0,0,1800,2500];  -- parallel to sources

  cust_ids uuid[] := array[
    'cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002',
    'cccccccc-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000004',
    'cccccccc-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000006',
    'cccccccc-0000-0000-0000-000000000007','cccccccc-0000-0000-0000-000000000008'];
  cust_names text[] := array[
    'Dilani Wickramasinghe','Roshan Mendis','Ishara Gunawardena','Tharindu Bandara',
    'Menaka Rajapaksa','Sanduni Perera','Ajith Kumara','Hansi Jayawardena'];

  d int; k int; i int; seq int := 0;
  n_orders int; n_items int;
  src_idx int; cust_idx int; item_idx int;
  v_source public.order_source; v_rate int;
  v_status public.order_status; v_pay public.payment_method; v_paystat public.payment_status;
  v_subtotal int; v_commission int; v_qty int;
  v_discount_pct int; v_discount int; v_total int;
  v_created timestamptz;
  v_order_id uuid;
  v_customer_id uuid; v_customer_name text;
  it_menu uuid[]; it_names text[]; it_qty int[]; it_price int[];
begin
  for d in reverse 41..0 loop
    if d = 0 then
      n_orders := 6;                 -- today: guaranteed variety for the grid
    else
      n_orders := 3 + (d % 4);       -- 3..6 orders/day
    end if;

    for k in 1..n_orders loop
      seq := seq + 1;

      src_idx  := 1 + (seq % 6);
      v_source := sources[src_idx];
      v_rate   := rates[src_idx];

      -- every 3rd order is an anonymous walk-in (no customer link)
      if seq % 3 = 0 then
        v_customer_id   := null;
        v_customer_name := null;
      else
        cust_idx        := 1 + (seq % 8);
        v_customer_id   := cust_ids[cust_idx];
        v_customer_name := cust_names[cust_idx];
      end if;

      -- timestamp within the trading day
      v_created := date_trunc('day', now())
                 - (d || ' days')::interval
                 + ((8 + (k * 2)) || ' hours')::interval
                 + ((seq % 55) || ' minutes')::interval;

      -- build 1..3 line items; accumulate the subtotal from snapshots
      n_items := 1 + (seq % 3);
      it_menu := '{}'; it_names := '{}'; it_qty := '{}'; it_price := '{}';
      v_subtotal := 0;
      for i in 1..n_items loop
        item_idx   := 1 + ((seq + i) % 12);
        v_qty      := 1 + ((seq + i) % 2);       -- 1 or 2
        v_subtotal := v_subtotal + v_qty * m_prices[item_idx];
        it_menu    := it_menu  || m_ids[item_idx];
        it_names   := it_names || m_names[item_idx];
        it_qty     := it_qty   || v_qty;
        it_price   := it_price || m_prices[item_idx];
      end loop;

      -- occasional whole-order discount, to demo the feature end-to-end. Today's
      -- first (completed) order always carries one so the receipt + Reports
      -- reconciliation are populated on load.
      if d = 0 and k = 1 then v_discount_pct := 15;
      elsif seq % 9 = 0 then  v_discount_pct := 10;
      elsif seq % 13 = 0 then v_discount_pct := 15;
      elsif seq % 17 = 0 then v_discount_pct := 20;
      else v_discount_pct := 0;
      end if;
      v_discount   := round(v_subtotal::numeric * v_discount_pct / 100.0);
      v_total      := v_subtotal - v_discount;
      v_commission := round(v_total::numeric * v_rate / 10000.0);

      -- status: today mixes states; history is settled (completed, rare cancel)
      if d = 0 then
        if k <= 3 then v_status := 'completed';
        elsif k <= 5 then v_status := 'pending';
        else v_status := 'cancelled';
        end if;
      elsif seq % 23 = 0 then
        v_status := 'cancelled';
      else
        v_status := 'completed';
      end if;

      -- payment method by channel
      if v_source in ('pickme_food','uber_eats') then
        v_pay := 'wallet';
      elsif v_source in ('whatsapp','online') then
        v_pay := (array['online','wallet']::public.payment_method[])[1 + (seq % 2)];
      else
        v_pay := (array['cash','card']::public.payment_method[])[1 + (seq % 2)];
      end if;

      if v_status = 'completed' then v_paystat := 'paid';
      elsif v_status = 'pending' then v_paystat := 'unpaid';
      else v_paystat := 'refunded';
      end if;

      insert into public."order" (
        business_id, order_no, source, customer_id, customer_name,
        subtotal_cents, discount_pct, discount_cents, commission_cents, total_cents,
        payment_method, payment_status, status, created_at, updated_at
      ) values (
        v_biz, 'ORD-' || (1000 + seq)::text, v_source, v_customer_id, v_customer_name,
        v_subtotal, v_discount_pct, v_discount, v_commission, v_total,
        v_pay, v_paystat, v_status, v_created, v_created
      ) returning id into v_order_id;

      for i in 1..n_items loop
        insert into public.order_item (
          business_id, order_id, menu_item_id, name_snapshot, qty, unit_price_cents, created_at, updated_at
        ) values (
          v_biz, v_order_id, it_menu[i], it_names[i], it_qty[i], it_price[i], v_created, v_created
        );
      end loop;
    end loop;
  end loop;
end;
$$;

-- Advance the per-tenant order counter past the seeded numbers, so the first
-- app-created order (via public.create_order) continues from ORD-<max+1> instead
-- of colliding with seeded ORD-1001..ORD-1190. Mirrors the migration's backfill.
update public.business b
set order_seq = coalesce((
  select max((regexp_replace(o.order_no, '[^0-9]', '', 'g'))::bigint)
  from public."order" o
  where o.business_id = b.id
    and o.order_no ~ '[0-9]'
), order_seq);

-- ---------------------------------------------------------------------------
-- 9. Expenses across categories (relative dates so Finance "this month" is live).
-- ---------------------------------------------------------------------------
insert into public.expense (business_id, date, category, amount_cents, note, created_by) values
('11111111-1111-1111-1111-111111111111', current_date - 35, 'Rent',       25000000, 'Monthly shop rent',                  'aaaaaaaa-0000-0000-0000-000000000001'),
('11111111-1111-1111-1111-111111111111', current_date - 5,  'Rent',       25000000, 'Monthly shop rent',                  'aaaaaaaa-0000-0000-0000-000000000001'),
('11111111-1111-1111-1111-111111111111', current_date - 34, 'Salaries',   18000000, 'Staff salaries — prior period',      'aaaaaaaa-0000-0000-0000-000000000001'),
('11111111-1111-1111-1111-111111111111', current_date - 4,  'Salaries',   18000000, 'Staff salaries — current period',    'aaaaaaaa-0000-0000-0000-000000000001'),
('11111111-1111-1111-1111-111111111111', current_date - 30, 'Ingredients',  4500000, 'Flour, sugar, butter restock',      'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date - 21, 'Ingredients',  6200000, 'Chocolate + dairy wholesale order',  'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date - 12, 'Ingredients',  3800000, 'Coffee beans + tea leaves',          'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date - 2,  'Ingredients',  4100000, 'Weekly dairy + eggs',                'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date - 28, 'Utilities',    3500000, 'Electricity',                        'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date - 7,  'Utilities',    2800000, 'Water + electricity',                'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date - 18, 'Packaging',    1200000, 'Cake boxes + paper cups',            'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date - 15, 'Marketing',    2000000, 'WhatsApp broadcast + flyers',        'aaaaaaaa-0000-0000-0000-000000000001'),
('11111111-1111-1111-1111-111111111111', current_date - 9,  'Equipment',    5500000, 'Oven servicing + repair',            'aaaaaaaa-0000-0000-0000-000000000001'),
('11111111-1111-1111-1111-111111111111', current_date - 1,  'Utilities',    1500000, 'Gas cylinder refill',                'aaaaaaaa-0000-0000-0000-000000000002'),
('11111111-1111-1111-1111-111111111111', current_date,      'Ingredients',  2600000, 'Same-day top-up: milk + cream',      'aaaaaaaa-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------------
-- 10. Bookings — BOTH types. Reservations carry party_size; custom_order cake
--     pre-orders carry item_description, deposit/balance, and pickup_at.
-- ---------------------------------------------------------------------------
insert into public.booking (
  business_id, type, date, time, status, source,
  customer_id, customer_name, customer_phone,
  party_size, item_description, deposit_cents, balance_cents, pickup_at
) values
-- reservations
('11111111-1111-1111-1111-111111111111', 'reservation', current_date + 2, '19:00', 'confirmed', 'whatsapp',
 'cccccccc-0000-0000-0000-000000000001', 'Dilani Wickramasinghe', '+94771234501', 4, null, null, null, null),
('11111111-1111-1111-1111-111111111111', 'reservation', current_date + 5, '11:30', 'pending', 'online',
 'cccccccc-0000-0000-0000-000000000007', 'Ajith Kumara', '+94771234507', 12, null, null, null, null),
('11111111-1111-1111-1111-111111111111', 'reservation', current_date + 1, '16:00', 'confirmed', 'dine_in',
 null, 'Walk-in guest', '+94770000001', 2, null, null, null, null),
('11111111-1111-1111-1111-111111111111', 'reservation', current_date - 3, '18:00', 'completed', 'whatsapp',
 'cccccccc-0000-0000-0000-000000000005', 'Menaka Rajapaksa', '+94771234505', 6, null, null, null, null),
('11111111-1111-1111-1111-111111111111', 'reservation', current_date - 10, '12:00', 'cancelled', 'online',
 'cccccccc-0000-0000-0000-000000000003', 'Ishara Gunawardena', '+94771234503', 3, null, null, null, null),
-- custom_order cake pre-orders
('11111111-1111-1111-1111-111111111111', 'custom_order', current_date + 7, '15:00', 'confirmed', 'whatsapp',
 'cccccccc-0000-0000-0000-000000000002', 'Roshan Mendis', '+94771234502', null,
 'Two-tier wedding cake, vanilla + red velvet, white fondant', 1500000, 3500000, (date_trunc('day', now()) + interval '7 days 15 hours')),
('11111111-1111-1111-1111-111111111111', 'custom_order', current_date + 2, '10:00', 'confirmed', 'whatsapp',
 'cccccccc-0000-0000-0000-000000000004', 'Tharindu Bandara', '+94771234504', null,
 'Birthday cake, chocolate fudge, "Happy 7th Nimna", no nuts', 500000, 800000, (date_trunc('day', now()) + interval '2 days 10 hours')),
('11111111-1111-1111-1111-111111111111', 'custom_order', current_date + 4, '17:00', 'pending', 'online',
 'cccccccc-0000-0000-0000-000000000006', 'Sanduni Perera', '+94771234506', null,
 'Anniversary cake, cheesecake base, gold accents', 700000, 1300000, (date_trunc('day', now()) + interval '4 days 17 hours')),
('11111111-1111-1111-1111-111111111111', 'custom_order', current_date + 1, '09:00', 'confirmed', 'whatsapp',
 'cccccccc-0000-0000-0000-000000000008', 'Hansi Jayawardena', '+94771234508', null,
 '24 cupcake tower, assorted flavours for office event', 400000, 600000, (date_trunc('day', now()) + interval '1 day 9 hours')),
('11111111-1111-1111-1111-111111111111', 'custom_order', current_date - 2, '14:00', 'completed', 'whatsapp',
 'cccccccc-0000-0000-0000-000000000007', 'Ajith Kumara', '+94771234507', null,
 'Corporate logo sheet cake, 40 servings', 600000, 0, (date_trunc('day', now()) - interval '2 days' + interval '14 hours'));

-- ---------------------------------------------------------------------------
-- 11. Employees (owner/manager/staff link to profiles; two are non-login staff).
--     salary_cents in LKR minor units; 2 of 5 paid → non-trivial payroll bar.
--     Total payroll LKR 253,000 (25,300,000 cents); 2 paid, 3 pending.
-- ---------------------------------------------------------------------------
insert into public.employee
  (business_id, name, role, permissions, shift_schedule, profile_id,
   salary_cents, pay_status, paid_at)
values
('11111111-1111-1111-1111-111111111111', 'Samantha Perera', 'Owner',
 '{"all": true}'::jsonb,
 '{"mon":"08:00-17:00","tue":"08:00-17:00","wed":"08:00-17:00","thu":"08:00-17:00","fri":"08:00-17:00"}'::jsonb,
 'aaaaaaaa-0000-0000-0000-000000000001',
 7500000, 'paid', now() - interval '3 days'),
('11111111-1111-1111-1111-111111111111', 'Nadeesha Fernando', 'Manager',
 '{"orders": true, "inventory": true, "reports": true, "finance": true, "settings": false}'::jsonb,
 '{"mon":"07:00-16:00","wed":"07:00-16:00","thu":"07:00-16:00","fri":"07:00-16:00","sat":"07:00-16:00"}'::jsonb,
 'aaaaaaaa-0000-0000-0000-000000000002',
 5800000, 'paid', now() - interval '3 days'),
('11111111-1111-1111-1111-111111111111', 'Kasun Silva', 'Barista',
 '{"orders": true, "inventory": true, "menu": true, "bookings": true}'::jsonb,
 '{"tue":"09:00-18:00","wed":"09:00-18:00","fri":"09:00-18:00","sat":"09:00-18:00","sun":"09:00-16:00"}'::jsonb,
 'aaaaaaaa-0000-0000-0000-000000000003',
 4000000, 'pending', null),
('11111111-1111-1111-1111-111111111111', 'Amara Jayasinghe', 'Head Baker',
 '{"inventory": true, "menu": true}'::jsonb,
 '{"mon":"05:00-13:00","tue":"05:00-13:00","wed":"05:00-13:00","thu":"05:00-13:00","sat":"05:00-13:00"}'::jsonb,
 null,
 4800000, 'pending', null),
('11111111-1111-1111-1111-111111111111', 'Ruwan Dias', 'Cashier',
 '{"orders": true}'::jsonb,
 '{"thu":"10:00-19:00","fri":"10:00-19:00","sat":"10:00-19:00","sun":"10:00-19:00"}'::jsonb,
 null,
 3200000, 'pending', null);

-- ---------------------------------------------------------------------------
-- 12. Notifications — some unread (drive the bell badge; unread count = 4).
-- ---------------------------------------------------------------------------
insert into public.notification (business_id, type, message, is_read, created_at) values
('11111111-1111-1111-1111-111111111111', 'low_stock', '11 items are at or below their low-stock threshold.', false, now() - interval '25 minutes'),
('11111111-1111-1111-1111-111111111111', 'low_stock', 'Unsalted Butter is running low — 4 kg left.',           false, now() - interval '3 hours'),
('11111111-1111-1111-1111-111111111111', 'booking',   'New custom cake order for pickup this week.',            false, now() - interval '6 hours'),
('11111111-1111-1111-1111-111111111111', 'new_order', 'New Uber Eats order received.',                          false, now() - interval '40 minutes'),
('11111111-1111-1111-1111-111111111111', 'new_order', 'New WhatsApp order ORD-1042 received.',                  true,  now() - interval '1 day'),
('11111111-1111-1111-1111-111111111111', 'payment',   'Payment received for order ORD-1039.',                   true,  now() - interval '1 day 2 hours'),
('11111111-1111-1111-1111-111111111111', 'booking',   'Reservation confirmed for a party of 4.',               true,  now() - interval '2 days');

-- ---------------------------------------------------------------------------
-- 13. Daily merchandise stock-take — one CLOSED session for today (the tenant's
--     local Colombo date), so the Dashboard card + the End-of-Day report show
--     live figures on first load. closing_qty == the seeded qty_on_hand, so the
--     close was a zero-variance reconcile (no count_adjust needed) and the seed's
--     low-stock states stay intact. opening = closing + out captures the day's
--     merchandise sales; revenue = out * unit_price_cents (the selling price
--     snapshot). Packaging (cups/napkins) has no retail price ⇒ counted but 0
--     revenue. Inserted directly (not via the RPC), representing an already-closed,
--     already-reconciled day.
-- ---------------------------------------------------------------------------
insert into public.stock_day (id, business_id, date, status, opened_by, opened_at, closed_by, closed_at) values
('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 (timezone('Asia/Colombo', now()))::date, 'closed',
 'aaaaaaaa-0000-0000-0000-000000000001', (timezone('Asia/Colombo', now()))::date + time '08:00',
 'aaaaaaaa-0000-0000-0000-000000000001', (timezone('Asia/Colombo', now()))::date + time '19:15');

insert into public.stock_count_line
  (business_id, stock_day_id, inventory_item_id, opening_qty, received_qty, closing_qty, unit_price_cents) values
-- item                                                     open   recv  close  price(cents)
-- Only true merchandise (physical daily count lane). Packaging items (cups/boxes/napkins)
-- are ingredient-kind and deducted via recipe; they do not appear in the daily count.
('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000020',  31.000, 0.000,  25.000,  95000),  -- Tote Bag   (out 6  @ LKR 950)
('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000021',  22.000, 0.000,  18.000, 120000);  -- Coffee Mug (out 4  @ LKR 1200)

commit;
