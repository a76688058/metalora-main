export type CheckoutShippingFields = {
  name: string;
  phone: string;
  zipCode: string;
  address: string;
  addressDetail: string;
};

export function hasCompleteShipping(shipping: CheckoutShippingFields): boolean {
  return [shipping.name, shipping.phone, shipping.zipCode, shipping.address, shipping.addressDetail]
    .every((value) => value.trim() !== '');
}
