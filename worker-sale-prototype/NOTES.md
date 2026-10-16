## الحالة المحلية — 2026-10-16

لم يحدث اتصال حي بـGoogle/Firebase/Cloudflare، ولم يُنشأ مفتاح أو secret، ولم يحدث push أو deploy أو تغيير إنتاج. Worker يحتفظ بحارس Emulator على كل مسارات HTTP العامة؛ Wrangler على `demo-worker-sale` ويضبط `FIRESTORE_PRODUCTION_TRANSPORT_ENABLED=false`.

أُضيف نقل OAuth 2.0 لخدمة Firestore REST على هدف مثبت: `demo-gen-project-test` / `demo-named-firestore-db` مع هوية `worker-test-account@demo-gen-project-test.iam.gserviceaccount.com`. اختبرنا quote وcommit عبر مفتاح RSA اختباري عابر وOAuth mock ومحوّل إلى Emulator محلي؛ لم نختبر Google IAM ولا مفتاحاً حقيقياً. تفعيل النقل داخلياً يحتاج بيئة إنتاج دقيقة وbinding `GCP_SERVICE_ACCOUNT_PRIVATE_KEY`، لكن routes العامة تظل مقفلة حتى مراجعة منفصلة. CORS ما زال localhost فقط.

كود حساب الخدمة يتطلب مفتاحاً خاصاً طويل العمر عند التشغيل. لم يُنشأ المفتاح؛ ولم يُنفذ اعتماد keyless/WIF. حسب سياق المهمة، حساب الخدمة والدور خُصّصا سابقاً لكن لم نتحقق منهما حياً. الأذونات الموثقة: `datastore.databases.get`, `datastore.entities.get`, `datastore.entities.list`, `datastore.entities.create`, `datastore.entities.update`، ولا توجد `delete`.

واجهة طارق موصولة داخل مساحة STORE_MANAGER لكن العميل ما زال localhost/dev-preview فقط. تدعم بيعاً عادياً/عبوات/مُلوّن/خصم آمن/أربعة عروض ثابتة وطرق دفع تقليدية؛ لا تدعم الميكس، العروض المخصصة، CRM/الولاء، التغليف، تعديل/حذف الفواتير، أو إحصاءات إعادة شراء الخلطات. outbox في `localStorage` على جهاز واحد، ولا ينشئ بيعاً جديداً offline ولا يزامن بين الأجهزة.

خطر الحصة الأعلى: quote وcommit يعيدان استعلام `sales` و`sale_operations` لليوم. عند وجود إسقاط لكل فاتورة، يبلغ استعلام التاريخ وحده نحو `2 × N × (N−1)` قراءات يومية؛ قرابة 44,700 عند 150 فاتورة، قبل قراءات الكتالوج والواجهة. وثائق quote المنتهية لا تُنظّف حالياً لأن IAM لا يحتوي `delete` وTTL ليس مجانياً. Worker Free أيضاً محدود بـ100,000 طلب/يوم و10 ms CPU و50 subrequests لكل invocation. التفاصيل والحسابات في `QUOTA_AND_CAPACITY.md`.

التحقق الأخير: Worker `test:app-contract` **26/26**، Lamsa Emulator **14/14**، تكامل Worker العام **15/15**؛ التطبيق `lint` و`build` ناجحان (تحذير bundle >500 KiB)، `test:security` **49/49**، وFirestore Rules Emulator **139/139** بما فيها القاعدة المسماة.

**الحالة النهائية:** إعداد النقل المحلي موجود ومختبر بالمحاكيات، لكن لا يوجد نشر أو endpoint حي، ولا تثبت الاختبارات IAM أو الحصص أو مزامنة الأجهزة. قبل أي نشر: مراجعة diff، تقليل قراءات العمولة اليومية ومعالجة تراكم quotes، تأكيد استحقاق القاعدة للحصة المجانية وقواعدها/IAM، قرار الاعتماد (المفتاح لم يُنشأ)، ثم موافقة منفصلة على CORS وsecret وفتح المسارات والنشر.
