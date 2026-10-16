# تحضير محلي لمسار مبيعات لمسة عبر Cloudflare Worker

**الحالة:** أُنجز تحضير مسار البيع الإنتاجي واختُبر محلياً باستخدام مفتاح اختبار مولّد مؤقتاً وFirestore Emulator فقط؛ **الإعداد الحالي مغلق وغير منشور**. لم يحدث اتصال حي بـGoogle/Firebase/Cloudflare، ولم يُنشأ أو يُخزّن مفتاح خدمة أو سر، ولم يحدث deploy أو push أو تغيير بيانات إنتاج. لا يزال الكود والإعدادات يحتاجان مراجعة قبل أي تفعيل حي.

## ما أُنجز محلياً

- استبدال `TEST_PUBLIC_JWK` بتحقق Firebase ID token الفعلي: RS256، مطالبات Firebase/Google، وفحص `iat` و`auth_time`؛ الشهادات العامة تُخزّن مؤقتاً وفق `Cache-Control`. الاختبارات تستخدم خادم X.509 محلياً.
- إضافة OAuth 2.0 بحساب خدمة لـFirestore REST. العامل يوقّع JWT قصير العمر من binding وقت التشغيل، يطلب نطاق `https://www.googleapis.com/auth/datastore`، ويخزّن access token مؤقتاً في الذاكرة. لا يُحفظ المفتاح داخل المشروع.
- تثبيت الهدف المتوقع في `src/productionConfig.mjs`: المشروع `demo-gen-project-test`، قاعدة Firestore المسماة `demo-named-firestore-db`، وهوية الخدمة `worker-test-account@demo-gen-project-test.iam.gserviceaccount.com`.
- إعداد الإنتاج مقفول افتراضياً بعلمين مستقلين: `FIRESTORE_PRODUCTION_TRANSPORT_ENABLED=false` و`SALE_WORKER_PRODUCTION_ENABLED=false`. مسارات Lamsa لا تقبل إلا Origin HTTPS واحداً مضبوطاً تماماً؛ وتظل كذلك مشروطة بهوية/مشروع/قاعدة الاختبار الاصطناعية ومفتاح وقت التشغيل. مسار `/api/sales` القديم وصحة Worker ما زالا على الحارس المحلي. لا توجد بيئة إنتاج ولا سر.
- اختبار quote وcommit كامليْن عبر `createFirestoreTransport`: مولّد RSA خاص بالاختبار، تبادل OAuth مموّه، وتحويل داخلي لطلبات Firestore REST ذات الهدف المثبّت إلى Emulator على loopback. تحقّق الاختبار من عدم أثر quote على المخزون، خصم المخزون مرة واحدة، سلامة إعادة المحاولة، وتخزين OAuth token المؤقت. لم يستدع الاختبار Google أو Firestore أو Cloudflare الحية.
- إعداد Wrangler الحالي يظل على `ENVIRONMENT=local-emulator` و`PROJECT_ID=demo-worker-sale` والقاعدة المسماة محلياً، مع علمي الإنتاج `false`. يحدد `CORS_ALLOWED_ORIGIN` أصل Pages الدقيق `https://mohmhran5-jpg.github.io` للاستخدام المستقبلي فقط؛ لا يوجد قسم إنتاج أو مفتاح/سر في `wrangler.toml`.
- Worker يعتمد في البيع على إسقاطات السعر والتكلفة المنفصلة: `tarek_sale_products`, `tarek_sale_bottle_sizes`, `tarek_products`, `product_costs`, `cost_catalog/store-cost-inputs`, `operational_settings/store`, و`financial_admin/store`، لا على `products`, `bottleSizes` أو `settings/store` القديمة كمصادر موثوقة للبيع.
- بيع المالك يكتب ذرياً `sales`, و`sale_operations`, و`sale_costs`, و`sale_financials` **وعداد اليوم** مع تحديث المخزون. الإسقاط التشغيلي لا يحتوي التكلفة/الربح/العمولة. كاتبات المنتجات والإعدادات والعبوات تحدّث الإسقاطات المطلوبة مع الحفاظ على المخزون canonical عبر معاملات.
- POS المالك يستمع إلى `commission_day_counters/{UTC-date}` بدلاً من جمع فواتير اليوم لتسعير العمولة. المعاملة تقارن `commissionCounterGeneration` الحالية وتحدّث العداد مع البيع أو العكس؛ أي generation قديمة أو عداد غير جاهز ترفض البيع قبل الكتابة/خصم المخزون. سجل counter owner-only، والموظف لا يقرأه ولا يكتبه.
- bootstrap التاريخي للمالك مطلوب مرة عند غياب counter لكل يوم UTC: يقارن سجلّي `sales` و`sale_operations` ويزيل التكرار، ويقبل حتى 5,000 مستند في كل مجموعة؛ البيانات الملتبسة أو الأكبر تغلق المسار. حالياً زر/نداء bootstrap يعمل في معاينة التطوير المحلية فقط، مثل سائر Worker routes؛ لا يوجد مسار bootstrap إنتاجي.
- POS المالك يرفض الآن عمداً أي فاتورة مؤرخة خارج يوم UTC الحالي؛ لا توجد تهيئة تاريخية آمنة لإعادة ترتيب عمولة الأيام السابقة، لذا هذه القدرة متوقفة fail-closed إلى أن تُصمم وتُختبر.
- `TarekSafePOS` مركّب في مساحة طارق عند وجود منحة بيع فعالة. يستخدم عقد v3 الذي لا يرسل سعر/تكلفة/ربح/عمولة من العميل، ويحصل على Firebase ID token قبل quote/commit. عنوان الخادم يأتي من `VITE_LAMSA_SALE_WORKER_URL` ويحتاج `VITE_LAMSA_SALE_WORKER_ENABLED=true` في build الإنتاج؛ في التطوير لا يقبل إلا Worker المحاكي المحلي. القيم في `.env.example` فارغة/معطّلة، لذلك لا يوجد endpoint إنتاجي في النسخة الحالية.
- سجل البيع التشغيلي الذي يراه الموظف منفصل عن بيانات التكلفة والمالية. العكس للمالك فقط مع سجل غير حاذف، وقواعد Firestore تمنع الحذف النهائي والتحديثات غير المسموحة.

## مفاتيح التشغيل المتوقعة مستقبلاً — ليست مفعّلة

هذه **مفاتيح إعداد مستقبلية فقط**؛ لا تضفها إلى Cloudflare أو إعداد Pages الآن. يجب أولاً مراجعة الكود وموانع الحصة والقاعدة المسماة، ثم موافقة منفصلة:

```text
ENVIRONMENT=production
PROJECT_ID=demo-gen-project-test
FIRESTORE_DATABASE_ID=demo-named-firestore-db
GCP_SERVICE_ACCOUNT_EMAIL=worker-test-account@demo-gen-project-test.iam.gserviceaccount.com
GCP_SERVICE_ACCOUNT_PRIVATE_KEY=<Cloudflare runtime secret؛ لم يُنشأ>
FIRESTORE_PRODUCTION_TRANSPORT_ENABLED=true
SALE_WORKER_PRODUCTION_ENABLED=true
CORS_ALLOWED_ORIGIN=https://mohmhran5-jpg.github.io

# Vite build settings; worker URL is a public endpoint, not a secret
VITE_LAMSA_SALE_WORKER_URL=<Worker HTTPS origin؛ غير معروف/غير منشور>
VITE_LAMSA_SALE_WORKER_ENABLED=true
```

كل معرّفات المشروع والقاعدة والخدمة أعلاه **اختبارية اصطناعية** وليست إعداداً صالحاً للموقع. المفتاح الخاص وحده سر، ويجب ألا يكون إلا runtime secret؛ **لم يُنشأ مفتاح أو سر** ولم يُنفذ keyless/WIF. عنوان Pages الذي تحققنا منه هو `https://mohmhran5-jpg.github.io`; المسار `/lamsa-perfume-pos-ai-studio/` مسار للموقع ولا يدخل في Origin الخاص بـCORS. الإنتاج يتطلب العلمين، هوية ومشروعاً وقاعدة موثقة، المفتاح، وقيمة Worker URL صحيحة؛ جميعها ما زالت غير مفعّلة. اسم عامل/عنوان حي غير متوفر، ولا يجيز هذا الإعداد النشر.

وفق سياق المهمة، هوية الخدمة أُنشئت وربطت بدور مخصص، لكن ذلك **لم يُتحقق منه عبر Google** في هذه الجلسة. نطاق IAM الموثق للدور:

- `datastore.databases.get`
- `datastore.entities.get`
- `datastore.entities.list`
- `datastore.entities.create`
- `datastore.entities.update`

لا توجد صلاحية `delete`. هذه صلاحيات على مستوى موارد Firestore وليست تقييداً دقيقاً للحقول؛ حساب الخدمة يستطيع قراءة البيانات المالية اللازمة لمعالجة المبيعات. موافقة المستخدم على هذه المخاطرة لا تعني موافقة على إنشاء مفتاح أو تخزين سر أو تفعيل routes أو النشر.

## الواجهة وما لا يزال غير مدعوم

- الواجهة الحالية تُظهر منتجاً مفرداً أو ميكس يدوياً من مكوّنين أو ثلاثة، والعبوة والكمية، وعبوة ملوّنة عند إعداد سعر لها، خصماً يدوياً آمناً، أربعة عروض ثابتة، واختيار التغليف المعتمد كهدية أو بسعر ثابت، وطرق الدفع: نقدي/بطاقة/محفظة/تحويل. الأسعار تظهر للموظف بعد رد quote فقط؛ الميكس يُسعّر من مرجع العامل ولا تُرسل تكاليفه من المتصفح.
- **ليست حية:** endpoint الإنتاج لا يُقبل إلا كأصل HTTPS مضبوط ومطابق تماماً لإعداد build، مع علم الواجهة صريح؛ الرابط في `.env.example` فارغ والعلم `false`. Worker لا يسمح بـOrigin إلا إذا طابق `CORS_ALLOWED_ORIGIN` حرفياً، وقيمة Pages الحالية أصل مؤكد للقراءة فقط. لا يوجد Worker حي أو سر أو تفعيل إنتاجي؛ لذلك لا تعمل مزامنة المبيعات الحية بين المالك وطارق بعد. كما أن عميل bootstrap التاريخي للمالك لا يزال مقيداً بالمحاكي، ما يمنع تهيئة counter حي بأمان.
- لا توجد مبيعات جديدة دون اتصال. إذا انقطع الاتصال بعد quote، تُحفظ النية في outbox `localStorage` على هذا المتصفح فقط، وتُعاد المحاولة بنفس معرف الفاتورة بعد عودة الاتصال. هذا يمنع فقدها/تكرارها على الجهاز ضمن شروط المتصفح، لكنه لا يزامن أجهزة متعددة، والتخزين غير مشفر وقد لا يمنع سباق التبويبات في fallback؛ نقلها إلى IndexedDB يحسن المتانة المحلية فقط.
- ما يزال غير مدعوم في مسار طارق الآمن: حفظ الخلطات في مكتبة، العروض المخصصة، العملاء وCRM، استبدال/كسب نقاط الولاء، تعديل الفاتورة أو حذفها، وإحصاءات إعادة شراء الخلطات. لا يجوز تحويل هذه المسارات إلى كتابة عميل مباشرة. عكس الفاتورة للمالك فقط، كتسجيل تدقيق.
- يلزم نشر/التحقق من Firebase Google Sign-In، قواعد القاعدة المسماة، منحة بريد طارق، IAM وبيانات الاعتماد، Worker URL، bootstrap المالك، وCORS؛ لم يُختبر أي منها على خدمة حية. إعداد CORS في الكود لا يعني نشره أو تفعيله.

## مخاطر الحصص المجانية

راجع [QUOTA_AND_CAPACITY.md](./QUOTA_AND_CAPACITY.md) للتفاصيل والحسابات والمصادر الرسمية بتاريخ 16 أكتوبر 2026:

- Workers Free: 100,000 طلب وارد/يوم، 10 ms CPU لكل invocation، و50 subrequests لكل invocation. يجب قياس CPU الفعلي؛ المصادقة وتوقيع JWT وتسعير الميكس قد يقترب من الحد، ولا يمكن استنتاج نجاح الإنتاج من Emulator.
- الحصة المجانية العامة لـFirestore هي 50,000 قراءة، 20,000 كتابة، 20,000 حذف يومياً، 1 GiB تخزين و10 GiB نقل صادر شهرياً. لكن صفحة [Firestore pricing](https://cloud.google.com/firestore/pricing) تستثني قواعد البيانات المسماة صراحةً من الحصة المجانية، بينما صفحة quotas العامة لا تحدد هل القاعدة المجانية الوحيدة يمكن أن تكون named. قاعدة المشروع المستهدفة مسماة؛ **لا يمكن ضمان المجانية حالياً**، وهذا مانع تشغيل ضمن شرط عدم تفعيل billing.
- خطر المسح التربيعي السابق أزيل: quote/commit يقرآن counter ومستندات البيع اللازمة فقط، لا يمسحان مجموعتي مبيعات اليوم. bootstrap يقرأ التاريخ مرة عند غياب counter، بحد 5,000 نتيجة لكل من `sales` و`sale_operations`، ثم يغلق إذا تجاوز السقف أو كان السجل ملتبساً. استهلاك listeners وبقية مستندات الكتالوج والمخزون يظل ضمن حصة المشروع.
- لكل بيع آمن توجد وثيقة quote مؤقتة تُكتب ثم تُحدّث، ولا تُحذف؛ IAM لا يتضمن `delete`، وTTL ليس مجانياً وفق التوثيق، لذا يلزم حل احتفاظ/تنظيف مراجع لا يفتح صلاحيات غير مطلوبة.
- لا ضمان أن التشغيل سيظل مجانياً عند تجاوز الحصص؛ المستخدم طلب عدم تفعيل Billing/Blaze، ولم يتم فحص حالة الفوترة الحية.

## نتائج التحقق المحلي الأخيرة

- `npm run test:app-contract`: **31/31**، ويشمل سياسة origin الدقيقة، استجابة preflight الفعلية، والبوابة المغلقة.
- `npm run test:prototype`: **31/31** اختبارات عقود Worker، **17/17** تكامل Lamsa Emulator، و**15/15** فحوص auth/stream. تشمل mix v3، التغليف المجاني/المدفوع، bootstrap التاريخي، stale quote/generation، OAuth RS256/Firestore REST، وعميل Tarek quote/commit وإعادة المحاولة عبر محاكي محلي.
- التطبيق: `npm run lint` و`npm run build` ناجحان؛ Vite أصدر تحذير حجم chunk أكبر من 500 KiB.
- `npm run test:security`: **64/64**.
- `npm run test:firestore`: **150/150** على Emulator، مع اختبار قاعدة التطبيق المسماة في مشروع تجريبي، وتحقق من owner counter update ورفض generation قديمة.

كل النتائج محلية ومصطنعة؛ اختبارات CORS تختبر السياسة البرمجية فقط. لا تثبت IAM أو OAuth أو المصادقة أو الحصص الحية، ولا تعني أن الموقع يعمل بمزامنة طارق.

## ما يلزم قبل النشر

1. مراجعة diff المحلي، خصوصاً `src/index.mjs`, `src/googleServiceAccountAuth.mjs`, `src/productionConfig.mjs`, `src/lamsaSaleWorker.mjs`, `components/TarekSafePOS.tsx`, `services/workerSaleClient.ts`، وتغييرات اختبارات Emulator.
2. مراجعة موانع العداد: تصميم bootstrap إنتاجي بعد الموافقة، وسقف الـ5,000 سجل، وتعريف يوم العمل UTC مقابل القاهرة، مع خطة احتفاظ بوثائق quote وقياس CPU/requests/reads/writes دون تشغيل إنتاجي.
3. حسم تعارض الوضوح في الوثائق حول قاعدة Firestore المسماة؛ صفحة pricing تقول إنها غير مؤهلة للحصة المجانية. إذا كان شرط عدم تفعيل billing ثابتاً، يلزم قرار مستقل بشأن قاعدة `(default)` ومدى توافقها مع البيانات الفعلية قبل أي تغيير.
4. إكمال مسار bootstrap إنتاجي للمالك وفحصه على محاكي قبل اعتباره جاهزاً؛ النسخة الحالية تقصر bootstrap على المحاكي. لا يُنشأ مفتاح أو secret قبل مراجعة البديل والموافقة.
5. بعد مراجعة المخرجات والحمولة الدقيقة، طلب موافقة منفصلة على أي تغيير حي. لا نشر أو تغيير حي حدث هنا.
