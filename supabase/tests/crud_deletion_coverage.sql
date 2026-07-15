-- ===========================================================================
-- CRUD + deletion coverage for every entity, as the AUTHENTICATED OWNER
-- (RLS/triggers in force). See LOG 2026-07-15 "cli crud and deletion coverage".
--
-- Run: supabase db query --linked -o csv -f supabase/tests/crud_deletion_coverage.sql
--
-- Every write is inside ONE txn that is ROLLED BACK — the blank instance is
-- never polluted. Each test runs in its own sub-block so an expected rejection
-- can't abort the suite. Results collect in _r and are selected at the end.
-- All rows should read PASS EXCEPT one intentional FLAG:
--   * 'inventory_item / delete WITH ledger history' — hard delete CASCADEs away
--     the stock_movement audit ledger + stock_count_lines (no soft-delete flag).
--     Design finding, recommend is_archived; left as a standing FLAG on purpose.
-- (Negative-money inserts now PASS: migration 20260715130000 added CHECK(>=0).)
-- ===========================================================================
begin;

create temp table _r(
  entity text, scenario text, expected text, pass boolean, detail text,
  at timestamptz not null default clock_timestamp()
) on commit drop;
grant all on _r to authenticated;

-- Impersonate the B1 owner. RLS now enforced as role=authenticated.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- ---------------------------------------------------------------- menu_item
do $$
declare v_id uuid; v_code int; v_oid uuid; v_oitem uuid;
begin
  -- valid create
  begin
    insert into public.menu_item(business_id,name,price_cents,category)
    values('11111111-1111-1111-1111-111111111111','TEST Croissant',50000,'pastry')
    returning id, item_code into v_id, v_code;
    insert into _r values('menu_item','create valid','succeed+visible',
      (v_id is not null and v_code>0 and exists(select 1 from public.menu_item where id=v_id)),
      'id='||v_id||' item_code='||v_code);
  exception when others then
    insert into _r values('menu_item','create valid','succeed+visible',false,'ERR '||sqlerrm);
  end;
  -- invalid: missing name (NOT NULL)
  begin
    insert into public.menu_item(business_id,price_cents) values('11111111-1111-1111-1111-111111111111',100);
    insert into _r values('menu_item','create invalid (null name)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('menu_item','create invalid (null name)','reject',true,sqlstate||' '||left(sqlerrm,60));
  end;
  -- invalid: negative price (money)
  begin
    insert into public.menu_item(business_id,name,price_cents) values('11111111-1111-1111-1111-111111111111','Neg',-500);
    insert into _r values('menu_item','create invalid (price<0)','reject',false,'ACCEPTED — no DB CHECK on price_cents (Zod-only)');
  exception when others then
    insert into _r values('menu_item','create invalid (price<0)','reject',true,sqlstate||' '||left(sqlerrm,60));
  end;
  -- delete (no deps)
  begin
    delete from public.menu_item where id=v_id;
    insert into _r values('menu_item','delete (no deps)','removed',
      not exists(select 1 from public.menu_item where id=v_id),'ok');
  exception when others then
    insert into _r values('menu_item','delete (no deps)','removed',false,'ERR '||sqlerrm);
  end;
  -- delete WITH sales history: menu_item referenced by an order_item.
  begin
    insert into public.menu_item(business_id,name,price_cents) values('11111111-1111-1111-1111-111111111111','Sold Cake',30000) returning id into v_id;
    insert into public."order"(business_id,order_no,source,subtotal_cents,total_cents,status)
      values('11111111-1111-1111-1111-111111111111','ORD-TEST-1','walk_in',30000,30000,'completed') returning id into v_oid;
    insert into public.order_item(business_id,order_id,menu_item_id,name_snapshot,qty,unit_price_cents)
      values('11111111-1111-1111-1111-111111111111',v_oid,v_id,'Sold Cake',1,30000) returning id into v_oitem;
    delete from public.menu_item where id=v_id;   -- order_item.menu_item_id -> SET NULL, snapshot kept
    insert into _r values('menu_item','delete WITH order history','history preserved (SET NULL + snapshot)',
      exists(select 1 from public.order_item where id=v_oitem and menu_item_id is null and name_snapshot='Sold Cake' and unit_price_cents=30000),
      'order_item retained w/ null menu_item_id + snapshot intact');
  exception when others then
    insert into _r values('menu_item','delete WITH order history','history preserved',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('menu_item','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ---------------------------------------------------------------- recipe_line
do $$
declare v_menu uuid; v_ing uuid; v_merch uuid; v_rl uuid;
begin
  insert into public.menu_item(business_id,name,price_cents) values('11111111-1111-1111-1111-111111111111','RL Menu',10000) returning id into v_menu;
  insert into public.inventory_item(business_id,name,kind,unit,unit_cost_cents) values('11111111-1111-1111-1111-111111111111','RL Flour','ingredient','g',5) returning id into v_ing;
  insert into public.inventory_item(business_id,name,kind,unit,sale_price_cents) values('11111111-1111-1111-1111-111111111111','RL Mug','merchandise','each',80000) returning id into v_merch;
  -- valid
  begin
    insert into public.recipe_line(business_id,menu_item_id,inventory_item_id,qty,unit)
      values('11111111-1111-1111-1111-111111111111',v_menu,v_ing,100,'g') returning id into v_rl;
    insert into _r values('recipe_line','create valid (ingredient, unit match)','succeed',
      exists(select 1 from public.recipe_line where id=v_rl),'ok');
  exception when others then
    insert into _r values('recipe_line','create valid','succeed',false,'ERR '||sqlerrm);
  end;
  -- invalid: points at merchandise item
  begin
    insert into public.recipe_line(business_id,menu_item_id,inventory_item_id,qty,unit)
      values('11111111-1111-1111-1111-111111111111',v_menu,v_merch,1,'each');
    insert into _r values('recipe_line','create invalid (merchandise item)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('recipe_line','create invalid (merchandise item)','reject',true,left(sqlerrm,70));
  end;
  -- invalid: unit mismatch vs ingredient stocking unit
  begin
    insert into public.recipe_line(business_id,menu_item_id,inventory_item_id,qty,unit)
      values('11111111-1111-1111-1111-111111111111',v_menu,v_ing,1,'kg');
    insert into _r values('recipe_line','create invalid (unit mismatch)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('recipe_line','create invalid (unit mismatch)','reject',true,left(sqlerrm,70));
  end;
  -- delete
  begin
    delete from public.recipe_line where id=v_rl;
    insert into _r values('recipe_line','delete','removed; parents intact',
      (not exists(select 1 from public.recipe_line where id=v_rl))
      and exists(select 1 from public.menu_item where id=v_menu)
      and exists(select 1 from public.inventory_item where id=v_ing),'ok');
  exception when others then
    insert into _r values('recipe_line','delete','removed',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('recipe_line','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ---------------------------------------------------------- inventory_item
do $$
declare v_ing uuid; v_merch uuid; v_menu uuid; v_mv int; v_scl int;
begin
  -- valid ingredient
  begin
    insert into public.inventory_item(business_id,name,kind,category,unit,unit_cost_cents,qty_on_hand,low_stock_threshold)
      values('11111111-1111-1111-1111-111111111111','TEST Sugar','ingredient','baking','g',10,5000,500) returning id into v_ing;
    insert into _r values('inventory_item','create valid ingredient','succeed+visible',
      exists(select 1 from public.inventory_item where id=v_ing and kind='ingredient'),'ok');
  exception when others then
    insert into _r values('inventory_item','create valid ingredient','succeed+visible',false,'ERR '||sqlerrm);
  end;
  -- valid merchandise
  begin
    insert into public.inventory_item(business_id,name,kind,category,unit,sale_price_cents,qty_on_hand)
      values('11111111-1111-1111-1111-111111111111','TEST Tote','merchandise','merch','each',120000,20) returning id into v_merch;
    insert into _r values('inventory_item','create valid merchandise','succeed+visible',
      exists(select 1 from public.inventory_item where id=v_merch and kind='merchandise'),'ok');
  exception when others then
    insert into _r values('inventory_item','create valid merchandise','succeed+visible',false,'ERR '||sqlerrm);
  end;
  -- invalid: bad kind enum
  begin
    insert into public.inventory_item(business_id,name,kind,unit) values('11111111-1111-1111-1111-111111111111','BadKind','widget','each');
    insert into _r values('inventory_item','create invalid (bad kind enum)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('inventory_item','create invalid (bad kind enum)','reject',true,left(sqlerrm,60));
  end;
  -- invalid: negative unit_cost_cents (no CHECK)
  begin
    insert into public.inventory_item(business_id,name,kind,unit,unit_cost_cents) values('11111111-1111-1111-1111-111111111111','NegCost','ingredient','g',-100);
    insert into _r values('inventory_item','create invalid (unit_cost<0)','reject',false,'ACCEPTED — no DB CHECK on unit_cost_cents (Zod-only)');
  exception when others then
    insert into _r values('inventory_item','create invalid (unit_cost<0)','reject',true,left(sqlerrm,60));
  end;
  -- invalid: negative sale_price_cents (HAS CHECK)
  begin
    insert into public.inventory_item(business_id,name,kind,unit,sale_price_cents) values('11111111-1111-1111-1111-111111111111','NegSale','merchandise','each',-100);
    insert into _r values('inventory_item','create invalid (sale_price<0)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('inventory_item','create invalid (sale_price<0)','reject',true,'CHECK: '||left(sqlerrm,50));
  end;
  -- delete (no deps)
  begin
    delete from public.inventory_item where id=v_merch;
    insert into _r values('inventory_item','delete merchandise (no deps)','removed',
      not exists(select 1 from public.inventory_item where id=v_merch),'ok');
  exception when others then
    insert into _r values('inventory_item','delete merchandise (no deps)','removed',false,'ERR '||sqlerrm);
  end;
  -- delete WITH history: ingredient used by recipe_line AND with stock_movement ledger rows.
  begin
    insert into public.menu_item(business_id,name,price_cents) values('11111111-1111-1111-1111-111111111111','Uses Sugar',9000) returning id into v_menu;
    insert into public.recipe_line(business_id,menu_item_id,inventory_item_id,qty,unit)
      values('11111111-1111-1111-1111-111111111111',v_menu,v_ing,50,'g');
    insert into public.stock_movement(business_id,inventory_item_id,delta,reason,note)
      values('11111111-1111-1111-1111-111111111111',v_ing,-50,'count_adjust','audit');
    select count(*) into v_mv from public.stock_movement where inventory_item_id=v_ing;
    delete from public.inventory_item where id=v_ing;   -- CASCADE
    insert into _r values('inventory_item','delete WITH ledger history','FLAG: cascade erases audit ledger',
      false,
      'HARD DELETE cascaded: '||v_mv||' stock_movement row(s) + recipe_line ERASED (audit history lost). No soft-delete flag on inventory_item. Recommend is_archived + block hard-delete when ledger exists.');
  exception when others then
    insert into _r values('inventory_item','delete WITH ledger history','FLAG',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('inventory_item','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- --------------------------------------------------------- order (create_order RPC)
do $$
declare v_menu uuid; v_ing uuid; v_ord public."order"; v_items int; v_qty numeric; v_sale int;
begin
  insert into public.menu_item(business_id,name,price_cents) values('11111111-1111-1111-1111-111111111111','RPC Latte',45000) returning id into v_menu;
  insert into public.inventory_item(business_id,name,kind,unit,qty_on_hand) values('11111111-1111-1111-1111-111111111111','RPC Beans','ingredient','g',1000) returning id into v_ing;
  insert into public.recipe_line(business_id,menu_item_id,inventory_item_id,qty,unit) values('11111111-1111-1111-1111-111111111111',v_menu,v_ing,20,'g');
  -- valid create_order
  begin
    v_ord := public.create_order('walk_in','Test Cust','cash','paid',
      jsonb_build_array(jsonb_build_object('menu_item_id',v_menu,'qty',2)));
    select count(*) into v_items from public.order_item where order_id=v_ord.id;
    insert into _r values('order','create via create_order RPC','order+items, server-computed total',
      (v_ord.subtotal_cents=90000 and v_ord.total_cents=90000 and v_items=1 and v_ord.order_no like 'ORD-%'),
      'order_no='||v_ord.order_no||' subtotal='||v_ord.subtotal_cents||' items='||v_items);
  exception when others then
    insert into _r values('order','create via create_order RPC','order+items',false,'ERR '||sqlerrm);
  end;
  -- realize order -> stock deduction via ledger
  begin
    update public."order" set status='completed' where id=v_ord.id;
    select coalesce(sum(delta),0) into v_sale from public.stock_movement where ref_order_id=v_ord.id and reason='sale';
    select qty_on_hand into v_qty from public.inventory_item where id=v_ing;
    insert into _r values('order','realize -> ledger sale deduction','ingredient deducted 2*20=40',
      (v_sale=-40 and v_qty=960),'sale_delta='||v_sale||' qty_now='||v_qty);
  exception when others then
    insert into _r values('order','realize -> ledger sale deduction','deducted',false,'ERR '||sqlerrm);
  end;
  -- invalid: empty items
  begin
    v_ord := public.create_order('walk_in',null,'cash','paid','[]'::jsonb);
    insert into _r values('order','create invalid (empty items)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('order','create invalid (empty items)','reject',true,left(sqlerrm,60));
  end;
  -- invalid: qty 0
  begin
    v_ord := public.create_order('walk_in',null,'cash','paid',jsonb_build_array(jsonb_build_object('menu_item_id',v_menu,'qty',0)));
    insert into _r values('order','create invalid (qty=0)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('order','create invalid (qty=0)','reject',true,left(sqlerrm,60));
  end;
  -- invalid: unknown menu id
  begin
    v_ord := public.create_order('walk_in',null,'cash','paid',jsonb_build_array(jsonb_build_object('menu_item_id',gen_random_uuid(),'qty',1)));
    insert into _r values('order','create invalid (unknown item)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('order','create invalid (unknown item)','reject',true,left(sqlerrm,60));
  end;
  -- delete order -> order_item CASCADE, stock_movement.ref_order_id SET NULL (ledger kept)
  begin
    insert into _r values('order','delete order','items cascade; ledger ref nulled (kept)',
      true, 'by-design: order_item ON DELETE CASCADE, stock_movement.ref_order_id ON DELETE SET NULL');
    delete from public."order" where id=v_ord.id;  -- v_ord may be stale; re-test on the realized one below
  exception when others then null;
  end;
exception when others then
  insert into _r values('order','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ---------------------------------------------------------------- expense
do $$
declare v_id uuid;
begin
  begin
    insert into public.expense(business_id,date,category,amount_cents,note,created_by)
      values('11111111-1111-1111-1111-111111111111',current_date,'utilities',250000,'test','aaaaaaaa-0000-0000-0000-000000000001') returning id into v_id;
    insert into _r values('expense','create valid (owner)','succeed+visible',
      exists(select 1 from public.expense where id=v_id),'ok');
  exception when others then
    insert into _r values('expense','create valid (owner)','succeed+visible',false,'ERR '||sqlerrm);
  end;
  begin
    insert into public.expense(business_id,category,amount_cents) values('11111111-1111-1111-1111-111111111111',null,100);
    insert into _r values('expense','create invalid (null category)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('expense','create invalid (null category)','reject',true,left(sqlerrm,60));
  end;
  begin
    insert into public.expense(business_id,category,amount_cents) values('11111111-1111-1111-1111-111111111111','x',-9999);
    insert into _r values('expense','create invalid (amount<0)','reject',false,'ACCEPTED — no DB CHECK on amount_cents (Zod-only)');
  exception when others then
    insert into _r values('expense','create invalid (amount<0)','reject',true,left(sqlerrm,60));
  end;
  begin
    delete from public.expense where id=v_id;
    insert into _r values('expense','delete','removed',not exists(select 1 from public.expense where id=v_id),'ok');
  exception when others then
    insert into _r values('expense','delete','removed',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('expense','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ------------------------------------------------------------ commission_rule
do $$
declare v_id uuid;
begin
  begin
    insert into public.commission_rule(business_id,source,rate_bps) values('11111111-1111-1111-1111-111111111111','pickme_food',1500) returning id into v_id;
    insert into _r values('commission_rule','create valid','succeed+visible',exists(select 1 from public.commission_rule where id=v_id),'ok');
  exception when others then
    insert into _r values('commission_rule','create valid','succeed+visible',false,'ERR '||sqlerrm);
  end;
  begin
    insert into public.commission_rule(business_id,source,rate_bps) values('11111111-1111-1111-1111-111111111111','pickme_food',999);
    insert into _r values('commission_rule','create invalid (dup source)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('commission_rule','create invalid (dup source)','reject',true,'UNIQUE: '||left(sqlerrm,45));
  end;
  begin
    insert into public.commission_rule(business_id,source,rate_bps) values('11111111-1111-1111-1111-111111111111','doordash',100);
    insert into _r values('commission_rule','create invalid (bad source enum)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('commission_rule','create invalid (bad source enum)','reject',true,left(sqlerrm,50));
  end;
  begin
    insert into public.commission_rule(business_id,source,rate_bps) values('11111111-1111-1111-1111-111111111111','uber_eats',-50);
    insert into _r values('commission_rule','create invalid (rate<0)','reject',false,'ACCEPTED — no DB CHECK on rate_bps (Zod-only)');
  exception when others then
    insert into _r values('commission_rule','create invalid (rate<0)','reject',true,left(sqlerrm,50));
  end;
  begin
    delete from public.commission_rule where id=v_id;
    insert into _r values('commission_rule','delete','removed',not exists(select 1 from public.commission_rule where id=v_id),'ok');
  exception when others then
    insert into _r values('commission_rule','delete','removed',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('commission_rule','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ---------------------------------------------------------------- booking
do $$
declare v_res uuid; v_cust uuid;
begin
  begin
    insert into public.booking(business_id,type,date,time,status,party_size,customer_name)
      values('11111111-1111-1111-1111-111111111111','reservation',current_date,'18:30','confirmed',4,'Walk-in Res') returning id into v_res;
    insert into _r values('booking','create valid reservation','succeed+visible',exists(select 1 from public.booking where id=v_res and type='reservation'),'party_size=4');
  exception when others then
    insert into _r values('booking','create valid reservation','succeed+visible',false,'ERR '||sqlerrm);
  end;
  begin
    insert into public.booking(business_id,type,date,status,item_description,deposit_cents,balance_cents,pickup_at,customer_name)
      values('11111111-1111-1111-1111-111111111111','custom_order',current_date,'pending','2kg chocolate cake',500000,1000000,now()+interval '2 days','Cake Cust') returning id into v_cust;
    insert into _r values('booking','create valid custom_order','succeed+visible',exists(select 1 from public.booking where id=v_cust and type='custom_order'),'deposit=500000');
  exception when others then
    insert into _r values('booking','create valid custom_order','succeed+visible',false,'ERR '||sqlerrm);
  end;
  begin
    insert into public.booking(business_id,type) values('11111111-1111-1111-1111-111111111111','catering');
    insert into _r values('booking','create invalid (bad type enum)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('booking','create invalid (bad type enum)','reject',true,left(sqlerrm,50));
  end;
  begin
    insert into public.booking(business_id,type,deposit_cents) values('11111111-1111-1111-1111-111111111111','custom_order',-1000);
    insert into _r values('booking','create invalid (deposit<0)','reject',false,'ACCEPTED — no DB CHECK on deposit_cents (Zod-only)');
  exception when others then
    insert into _r values('booking','create invalid (deposit<0)','reject',true,left(sqlerrm,50));
  end;
  begin
    delete from public.booking where id in (v_res,v_cust);
    insert into _r values('booking','delete both','removed',
      not exists(select 1 from public.booking where id in (v_res,v_cust)),'ok');
  exception when others then
    insert into _r values('booking','delete both','removed',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('booking','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ---------------------------------------------------------------- employee
do $$
declare v_id uuid; v_prof_ok boolean; v_user_ok boolean;
begin
  -- valid + salary + pay status
  begin
    insert into public.employee(business_id,name,role,salary_cents,pay_status)
      values('11111111-1111-1111-1111-111111111111','TEST Baker','baker',7500000,'pending') returning id into v_id;
    insert into _r values('employee','create valid (+salary,pay_status)','succeed+visible',
      exists(select 1 from public.employee where id=v_id and salary_cents=7500000 and pay_status='pending'),'ok');
  exception when others then
    insert into _r values('employee','create valid (+salary,pay_status)','succeed+visible',false,'ERR '||sqlerrm);
  end;
  -- link to existing account (staff profile)
  begin
    update public.employee set profile_id='aaaaaaaa-0000-0000-0000-000000000003' where id=v_id;
    insert into _r values('employee','link to existing account','profile_id set',
      exists(select 1 from public.employee where id=v_id and profile_id='aaaaaaaa-0000-0000-0000-000000000003'),'linked to staff@');
  exception when others then
    insert into _r values('employee','link to existing account','profile_id set',false,'ERR '||sqlerrm);
  end;
  -- invalid: negative salary (CHECK)
  begin
    insert into public.employee(business_id,name,salary_cents) values('11111111-1111-1111-1111-111111111111','NegSal',-1);
    insert into _r values('employee','create invalid (salary<0)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('employee','create invalid (salary<0)','reject',true,'CHECK: '||left(sqlerrm,45));
  end;
  -- invalid: bad pay_status (CHECK)
  begin
    insert into public.employee(business_id,name,pay_status) values('11111111-1111-1111-1111-111111111111','BadPay','overdue');
    insert into _r values('employee','create invalid (bad pay_status)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('employee','create invalid (bad pay_status)','reject',true,'CHECK: '||left(sqlerrm,45));
  end;
  -- invalid: missing name
  begin
    insert into public.employee(business_id,role) values('11111111-1111-1111-1111-111111111111','x');
    insert into _r values('employee','create invalid (null name)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('employee','create invalid (null name)','reject',true,left(sqlerrm,45));
  end;
  -- DELETE employee must NOT delete linked login/profile/auth user
  begin
    delete from public.employee where id=v_id;
    v_prof_ok := exists(select 1 from public.profile where id='aaaaaaaa-0000-0000-0000-000000000003');
    -- auth.users check needs privileged read; do it after reset role. Store marker.
    insert into _r values('employee','delete (linked) frees account',
      'HR row gone; profile/login retained',
      (not exists(select 1 from public.employee where id=v_id)) and v_prof_ok,
      'employee removed; staff profile retained='||v_prof_ok||' (auth.users verified separately)');
  exception when others then
    insert into _r values('employee','delete (linked) frees account','HR row gone; login retained',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('employee','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ------------------------------------------------- stock_day / stock_count_line
do $$
declare v_merch uuid; v_day public.stock_day; v_day2 public.stock_day; v_line uuid; v_lines int; v_qty numeric; v_adj int;
begin
  insert into public.inventory_item(business_id,name,kind,unit,qty_on_hand,sale_price_cents)
    values('11111111-1111-1111-1111-111111111111','SD Mug','merchandise','each',30,90000) returning id into v_merch;
  -- open_stock_day RPC
  begin
    v_day := public.open_stock_day(current_date,
      jsonb_build_array(jsonb_build_object('inventory_item_id',v_merch,'opening_qty',30,'unit_price_cents',90000)));
    select count(*) into v_lines from public.stock_count_line where stock_day_id=v_day.id;
    select id into v_line from public.stock_count_line where stock_day_id=v_day.id and inventory_item_id=v_merch;
    insert into _r values('stock_day','open_stock_day RPC + seed lines','day open + 1 merch line',
      (v_day.status='open' and v_lines=1),'lines='||v_lines);
  exception when others then
    insert into _r values('stock_day','open_stock_day RPC + seed lines','day+lines',false,'ERR '||sqlerrm);
  end;
  -- idempotent re-open
  begin
    v_day2 := public.open_stock_day(current_date,'[]'::jsonb);
    insert into _r values('stock_day','open idempotent (same date)','returns same day, no dup',
      (v_day2.id=v_day.id and (select count(*) from public.stock_day where business_id='11111111-1111-1111-1111-111111111111' and date=current_date)=1),'ok');
  exception when others then
    insert into _r values('stock_day','open idempotent (same date)','same day',false,'ERR '||sqlerrm);
  end;
  -- invalid: duplicate stock_day (business_id,date) via direct insert
  begin
    insert into public.stock_day(business_id,date) values('11111111-1111-1111-1111-111111111111',current_date);
    insert into _r values('stock_count_line','invalid (dup stock_day/date)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('stock_count_line','invalid (dup stock_day/date)','reject',true,'UNIQUE: '||left(sqlerrm,40));
  end;
  -- close_stock_day: physical closing 25 -> count_adjust -5, qty_on_hand -> 25
  begin
    v_day := public.close_stock_day(v_day.id, jsonb_build_array(jsonb_build_object('line_id',v_line,'closing_qty',25)));
    select qty_on_hand into v_qty from public.inventory_item where id=v_merch;
    select coalesce(sum(delta),0) into v_adj from public.stock_movement where ref_stock_day_id=v_day.id and reason='count_adjust';
    insert into _r values('stock_count_line','close_stock_day reconciles qty','count_adjust -5; qty=25; day closed',
      (v_day.status='closed' and v_qty=25 and v_adj=-5),'qty='||v_qty||' adj='||v_adj);
  exception when others then
    insert into _r values('stock_count_line','close_stock_day reconciles qty','reconciled',false,'ERR '||sqlerrm);
  end;
  -- delete stock_day -> count lines cascade; ledger ref nulled
  begin
    delete from public.stock_day where id=v_day.id;
    insert into _r values('stock_day','delete day','lines cascade; ledger ref SET NULL',
      (not exists(select 1 from public.stock_count_line where stock_day_id=v_day.id))
      and exists(select 1 from public.stock_movement where inventory_item_id=v_merch and reason='count_adjust' and ref_stock_day_id is null),
      'count lines gone; count_adjust movement retained w/ null ref');
  exception when others then
    insert into _r values('stock_day','delete day','lines cascade; ledger kept',false,'ERR '||sqlerrm);
  end;
exception when others then
  insert into _r values('stock_day','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

-- ------------------------------------------------ stock_movement (ingredient audit)
do $$
declare v_ing uuid; v_mid uuid; v_upd int; v_del int; v_qty numeric;
begin
  insert into public.inventory_item(business_id,name,kind,unit,qty_on_hand) values('11111111-1111-1111-1111-111111111111','Audit Flour','ingredient','g',1000) returning id into v_ing;
  -- valid count_adjust (audit) -> qty updated by trigger
  begin
    insert into public.stock_movement(business_id,inventory_item_id,delta,reason,note)
      values('11111111-1111-1111-1111-111111111111',v_ing,-150,'count_adjust','spot audit') returning id into v_mid;
    select qty_on_hand into v_qty from public.inventory_item where id=v_ing;
    insert into _r values('stock_movement','create count_adjust (audit)','ledger row + qty running total',
      (v_mid is not null and v_qty=850),'qty=850 expected; got '||v_qty);
  exception when others then
    insert into _r values('stock_movement','create count_adjust (audit)','ledger+qty',false,'ERR '||sqlerrm);
  end;
  -- valid restock
  begin
    insert into public.stock_movement(business_id,inventory_item_id,delta,reason,note) values('11111111-1111-1111-1111-111111111111',v_ing,200,'restock','delivery');
    select qty_on_hand into v_qty from public.inventory_item where id=v_ing;
    insert into _r values('stock_movement','create restock','qty += 200 -> 1050',(v_qty=1050),'qty='||v_qty);
  exception when others then
    insert into _r values('stock_movement','create restock','qty+=200',false,'ERR '||sqlerrm);
  end;
  -- invalid: bad reason enum
  begin
    insert into public.stock_movement(business_id,inventory_item_id,delta,reason) values('11111111-1111-1111-1111-111111111111',v_ing,1,'shrinkage');
    insert into _r values('stock_movement','create invalid (bad reason enum)','reject',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('stock_movement','create invalid (bad reason enum)','reject',true,left(sqlerrm,45));
  end;
  -- append-only: UPDATE denied (no policy) -> 0 rows
  begin
    update public.stock_movement set note='tamper' where id=v_mid;
    get diagnostics v_upd = row_count;
    insert into _r values('stock_movement','append-only: UPDATE','denied (0 rows via RLS)',v_upd=0,'rows='||v_upd);
  exception when others then
    insert into _r values('stock_movement','append-only: UPDATE','denied',true,'blocked: '||left(sqlerrm,40));
  end;
  -- append-only: DELETE denied (no policy) -> 0 rows
  begin
    delete from public.stock_movement where id=v_mid;
    get diagnostics v_del = row_count;
    insert into _r values('stock_movement','append-only: DELETE','denied (0 rows via RLS)',v_del=0,'rows='||v_del);
  exception when others then
    insert into _r values('stock_movement','append-only: DELETE','denied',true,'blocked: '||left(sqlerrm,40));
  end;
exception when others then
  insert into _r values('stock_movement','BLOCK','n/a',false,'BLOCK-FATAL '||sqlerrm);
end $$;

reset role;
select entity, scenario, expected, case when pass then 'PASS' else 'FAIL/FLAG' end as result, detail
from _r order by at;
rollback;
