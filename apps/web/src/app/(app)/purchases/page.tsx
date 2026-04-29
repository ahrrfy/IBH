import { redirect } from 'next/navigation';

export default function PurchasesRoot() {
  redirect('/purchases/orders');
}
