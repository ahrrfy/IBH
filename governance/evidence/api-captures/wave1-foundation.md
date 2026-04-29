# Wave 1 — Foundation API Captures (2026-04-29)

VPS: https://ibherp.cloud · System Owner: ahrrfy

## GET /api/v1/auth/me
```json
{
  "userId": "01KQ2NCZ9QFP8ZAR4PC1      ",
  "companyId": "01KQ28E8FXFN06M56NRA      ",
  "branchId": "01KQ28M08KVR80HXRM0V      ",
  "roles": [],
  "locale": "ar",
  "expiresAt": "2026-04-29T17:31:48.000Z"
}

```

## GET /api/v1/users
```json
{"items":[{"id":"01KQ2NCZ9QFP8ZAR4PC1      ","email":"ahrrfy@al-ruya.iq","nameAr":"مالك النظام","nameEn":"System Owner","status":"active","companyId":"01KQ28E8FXFN06M56NRA      ","branchId":"01KQ28M08KVR80HXRM0V      ","avatarUrl":null,"locale":"ar","requires2FA":false,"lastLoginAt":"2026-04-29T17:16:48.742Z","lastLoginIp":"83.171.207.57","failedLoginCount":0,"createdAt":"2026-04-25T15:51:12.949Z","updatedAt":"2026-04-29T17:16:48.743Z"},{"id":"01KQ28M0B70Z33462TBJ      ","email":"admin@al-ruya.iq","nameAr":"المدير العام","nameEn":"System Admin","status":"active","companyId":"01KQ28E8FXFN06M56NRA      ","branchId":"01KQ28M08KVR80HXRM0V      ","avatarUrl":null,"locale":"ar","requires2FA":false,"lastLoginAt":"2026-04-25T15:52:52.453Z","lastLoginIp":"187.124.183.140","fail

```

## GET /api/v1/products
```json
{"items":[{"id":"01KQD09VXWVW5HKMBTNFAZ4QEW","companyId":"01KQ28E8FXFN06M56NRA      ","sku":"DEMO-OIL-1L","nameAr":"زيت دوار الشمس 1 لتر","nameEn":"زيت دوار الشمس 1 لتر","name1":"زيت دوار الشمس 1 لتر","name2":null,"name3":null,"generatedFullName":"زيت دوار الشمس 1 لتر","categoryId":"01KQCZQN8J6NCGRE50MB31QBCE","brandId":null,"type":"storable","baseUnitId":"01KQ52FTC320TYSJD4Q4      ","saleUnitId":"01KQ52FTC320TYSJD4Q4      ","purchaseUnitId":"01KQ52FTC320TYSJD4Q4      ","defaultSalePriceIqd":"3500","defaultPurchasePriceIqd":"2200","minSalePriceIqd":"2800","description":null,"isPublishedOnline":false,"tags":["demo"],"imageUrls":[],"isActive":true,"createdAt":"2026-04-29T16:14:09.846Z","updatedAt":"2026-04-29T16:14:09.846Z","created

```

## GET /api/v1/inventory/balance
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "messageAr": "حدث خطأ في الطلب"
  },
  "meta": {
    "timestamp": "2026-04-29T17:16:58.252Z",
    "path": "/api/v1/inventory/balance",
    "method": "GET"
  }
}

```

