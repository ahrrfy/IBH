import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-16 bg-gray-900 text-gray-200">
      <div className="mx-auto max-w-7xl px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-right">
        <div>
          <h3 className="text-white font-semibold mb-4">عن الرؤيا</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li><Link href="/about" className="hover:text-white">من نحن</Link></li>
            <li><Link href="/careers" className="hover:text-white">الوظائف</Link></li>
            <li><Link href="/privacy" className="hover:text-white">سياسة الخصوصية</Link></li>
            <li><Link href="/terms" className="hover:text-white">الشروط والأحكام</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-4">المساعدة</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li><Link href="/help/shipping" className="hover:text-white">معلومات التوصيل</Link></li>
            <li><Link href="/help/returns" className="hover:text-white">الإرجاع والاستبدال</Link></li>
            <li><Link href="/help/payment" className="hover:text-white">طرق الدفع</Link></li>
            <li><Link href="/help/faq" className="hover:text-white">الأسئلة الشائعة</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-4">اتصل بنا</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>هاتف: 07700000000</li>
            <li>واتساب: 07700000000</li>
            <li>البريد: info@ibherp.cloud</li>
            <li>بغداد، العراق</li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-4">تابعنا</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li><a href="#" className="hover:text-white">فيسبوك</a></li>
            <li><a href="#" className="hover:text-white">إنستغرام</a></li>
            <li><a href="#" className="hover:text-white">تيك توك</a></li>
            <li><a href="#" className="hover:text-white">يوتيوب</a></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-800 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} الرؤيا — جميع الحقوق محفوظة
      </div>
    </footer>
  );
}
