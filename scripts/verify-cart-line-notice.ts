import {
  classifyCartLine,
  readSeenUnit,
  writeSeenUnit,
  type CartNoticeProduct,
} from "../src/lib/cartLineNotice";

const failures: string[] = [];
let count = 0;

function assert(condition: boolean, label: string): void {
  count += 1;
  if (!condition) failures.push(label);
}

const catalog: CartNoticeProduct = {
  is_visible: true,
  options: [{ id: "m", price: 54900, stock: 3, isActive: true }],
};

assert(
  classifyCartLine({
    kind: "catalog",
    product: catalog,
    optionId: "m",
    workshopUnit: 0,
    seenUnit: null,
  }).statusMessage === null,
  "available catalog has no status",
);

const changed = classifyCartLine({
  kind: "catalog",
  product: catalog,
  optionId: "m",
  workshopUnit: 0,
  seenUnit: 49000,
});
assert(changed.priceChanged === true, "price change detected");
assert(changed.currentUnit === 54900, "current unit stays the catalog price");
assert(
  changed.priceMessage === "가격이 변경되었습니다. 이전 ₩49,000 · 현재 ₩54,900",
  "price notice names both amounts",
);
assert(changed.block === null, "price change does not block the line");

assert(
  classifyCartLine({
    kind: "catalog",
    product: null,
    optionId: "m",
    workshopUnit: 0,
    seenUnit: 54900,
  }).statusMessage === "상품 정보를 찾을 수 없습니다.",
  "missing product",
);

assert(
  classifyCartLine({
    kind: "catalog",
    product: { ...catalog, is_visible: false },
    optionId: "m",
    workshopUnit: 0,
    seenUnit: null,
  }).statusMessage === "현재 판매하지 않는 상품입니다.",
  "hidden product",
);

assert(
  classifyCartLine({
    kind: "catalog",
    product: catalog,
    optionId: "gone",
    workshopUnit: 0,
    seenUnit: 54900,
  }).statusMessage === "선택한 옵션을 찾을 수 없습니다.",
  "missing option",
);

assert(
  classifyCartLine({
    kind: "catalog",
    product: {
      is_visible: true,
      options: [{ id: "m", price: 54900, stock: 3, isActive: false }],
    },
    optionId: "m",
    workshopUnit: 0,
    seenUnit: null,
  }).statusMessage === "품절",
  "inactive option",
);

assert(
  classifyCartLine({
    kind: "catalog",
    product: {
      is_visible: true,
      options: [{ id: "m", price: 54900, stock: 0, isActive: true }],
    },
    optionId: "m",
    workshopUnit: 0,
    seenUnit: null,
  }).block === "sold_out",
  "zero stock",
);

assert(
  classifyCartLine({
    kind: "catalog",
    product: {
      is_visible: true,
      options: [{ id: "m", price: 54900, isActive: true }],
    },
    optionId: "m",
    workshopUnit: 0,
    seenUnit: null,
  }).block === null,
  "missing stock is not sold out",
);

const workshop = classifyCartLine({
  kind: "workshop",
  product: null,
  optionId: "",
  workshopUnit: 54900,
  seenUnit: 54900,
});
assert(workshop.block === null && workshop.priceChanged === false, "workshop snapshot unchanged");

const workshopMissing = classifyCartLine({
  kind: "workshop",
  product: null,
  optionId: "",
  workshopUnit: 0,
  seenUnit: null,
});
assert(workshopMissing.statusMessage === "가격을 확인할 수 없습니다.", "workshop without a price");
assert(workshopMissing.block === null, "workshop price notice does not replace server pricing");

const zeroPrice = classifyCartLine({
  kind: "catalog",
  product: {
    is_visible: true,
    options: [{ id: "m", price: 0, stock: 2, isActive: true }],
  },
  optionId: "m",
  workshopUnit: 0,
  seenUnit: null,
});
assert(zeroPrice.block === null && zeroPrice.currentUnit === 0, "zero catalog price stays orderable");

assert(
  classifyCartLine({
    kind: "catalog",
    product: {
      is_visible: true,
      options: [{ id: "m", price: "no", stock: 2, isActive: true }],
    },
    optionId: "m",
    workshopUnit: 0,
    seenUnit: null,
  }).block === "price_unknown",
  "unreadable catalog price",
);

const storage = new Map<string, string>();
const memory = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
  key: (index: number) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size;
  },
} as Storage;

writeSeenUnit("user-a", "item-1", 49000, memory);
assert(readSeenUnit("user-a", "item-1", memory) === 49000, "seen price persists");
assert(readSeenUnit("user-b", "item-1", memory) === null, "seen price stays on one account");
writeSeenUnit("user-a", "item-1", 54900, memory);
assert(readSeenUnit("user-a", "item-1", memory) === 54900, "seen price can be replaced");
storage.set("metalora-cart-seen-price:user-a", "{");
assert(readSeenUnit("user-a", "item-1", memory) === null, "corrupt storage does not invent a price");

if (failures.length > 0) {
  console.error(`FAIL cart line notice: ${failures.length} of ${count}`);
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`PASS cart line notice: ${count} assertions`);
