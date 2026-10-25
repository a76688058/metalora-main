import { hasCompleteShipping, type CheckoutShippingFields } from "../src/lib/checkoutShipping";

const valid: CheckoutShippingFields = {
  name: "테스트",
  phone: "01000000000",
  zipCode: "44992",
  address: "테스트주소",
  addressDetail: "테스트상세",
};

const fields = ["name", "phone", "zipCode", "address", "addressDetail"] as const;
const failures: string[] = [];

function assert(condition: boolean, label: string): void {
  if (!condition) failures.push(label);
}

let count = 0;

for (const field of fields) {
  const empty: CheckoutShippingFields = { ...valid, [field]: "" };
  count += 1;
  assert(hasCompleteShipping(empty) === false, `${field} empty`);

  const whitespace: CheckoutShippingFields = { ...valid, [field]: "   " };
  count += 1;
  assert(hasCompleteShipping(whitespace) === false, `${field} whitespace`);
}

count += 1;
assert(hasCompleteShipping(valid) === true, "all fields non-blank");

count += 1;
assert(
  hasCompleteShipping({
    name: "",
    phone: "",
    zipCode: "",
    address: "",
    addressDetail: "",
  }) === false,
  "all fields empty",
);

count += 1;
assert(
  hasCompleteShipping({
    name: "   ",
    phone: "   ",
    zipCode: "   ",
    address: "   ",
    addressDetail: "   ",
  }) === false,
  "all fields whitespace",
);

if (failures.length > 0) {
  console.error(`FAIL checkout shipping predicate: ${failures.length} of ${count}`);
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`PASS checkout shipping predicate: ${count} assertions`);
