import { Injectable } from '@nestjs/common';

@Injectable()
export class PhoneTransformer {
  transform(value: unknown): string | null {
    if (!value) return null;
    let phone = String(value).trim();
    if (!phone) return null;

    phone = phone.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    phone = phone.replace(/[\s\-().+]/g, '');

    if (/^07\d{8,9}$/.test(phone)) return '+964' + phone.slice(1);
    if (/^9647\d{8,9}$/.test(phone)) return '+' + phone;
    if (/^\+9647\d{8,9}$/.test('+' + phone)) return '+' + phone;
    return phone || null;
  }
}
