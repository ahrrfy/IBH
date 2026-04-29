import { redirect } from 'next/navigation';

export default function FinanceRoot() {
  redirect('/finance/journal-entries');
}
