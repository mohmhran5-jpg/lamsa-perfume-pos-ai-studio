## الحالة المحلية — 2026-10-16

العمل الحالي محصور بفرع مراجعة محلي؛ لم يُنشر Worker أو Pages، ولم يُدمج إلى `main` أو يُدفع هذا التحديث. لم يحدث اتصال حي بـGoogle/Firebase/Cloudflare، ولم يُنشأ مفتاح أو secret أو تُغيّر بيانات إنتاج.

واجهة طارق تستخدم الآن عميل v3 موحداً للاقتباس والاعتماد وإعادة المحاولة. تأخذ Firebase ID token من الجلسة وتُرسله فقط إلى endpoint المحدد في build؛ لا ترسل سعر البيع أو التكلفة أو الربح أو العمولة. عنوان الإنتاج يتطلب `VITE_LAMSA_SALE_WORKER_URL` صحيحاً و`VITE_LAMSA_SALE_WORKER_ENABLED=true`؛ القالب فارغ ومعطّل. التطوير يقبل المحاكي المحلي فقط.

Worker يقبل في الإنتاج، من حيث الكود فقط، علمي `SALE_WORKER_PRODUCTION_ENABLED` و`FIRESTORE_PRODUCTION_TRANSPORT_ENABLED` وOrigin HTTPS دقيقاً. Origin Pages المثبت للـCORS هو `https://mohmhran5-jpg.github.io` بلا مسار المشروع. Wrangler يترك العلمين `false`، وإعداد Firestore الحالي اصطناعي، ولا يوجد Worker URL أو سر؛ لذلك المسارات غير متاحة إنتاجياً. preflight قد يضيف طلب Worker عند العبور بين الأصلين لكنه لا يقرأ أو يكتب Firestore.

OAuth ما زال يستخدم نطاق `https://www.googleapis.com/auth/datastore`. أذونات IAM المذكورة سابقاً هي `datastore.databases.get`, `datastore.entities.get`, `datastore.entities.list`, `datastore.entities.create`, `datastore.entities.update`، ولا تتضمن `delete`؛ لم نتحقق من الدور الحي ولم نوسّعه. المفتاح الخاص لم يُنشأ، ولا يوجد مسار keyless/WIF.

الموانع قبل أي تشغيل حي: قاعدة Firestore المستهدفة مسماة وأهلية القاعدة المسماة للحصة المجانية غير مضمونة بل صفحة التسعير تستثنيها؛ شرط المجانية لا يسمح باعتبارها جاهزة. كما أن bootstrap التاريخي للمالك ما زال مقصوراً على المحاكي، ولذلك لا يوجد مسار مهيأ لcounter حي. يلزم حسم قاعدة `(default)` أو التوافق مع شرط المجانية، ومراجعة تفويض Google/Firestore وتهيئة العداد، ثم موافقة مستقلة قبل إعداد الأسرار أو فتح العامل أو النشر.

الاختبارات المحلية الحالية: تطبيق `lint` و`build` ناجحان (تحذير Vite عن chunk أكبر من 500 KiB)، `test:security` **54/54**، قواعد Firestore Emulator **143/143**، Worker contract/runtime policy **31/31**، وWorker/Firestore Emulator integration **16/16**. الاختبارات تستخدم بيانات/رموزاً اصطناعية ولا تثبت IAM أو المصادقة أو الحصة الحية أو مزامنة الأجهزة في الإنتاج.
