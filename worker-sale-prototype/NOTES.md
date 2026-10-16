## الحالة المحلية — 2026-10-16

تغييرات القطع وbootstrap العداد أُضيفت محلياً على فرع مراجعة PR #6؛ لم تُدمج أو تُنشر. لم تُنشأ مفاتيح/أسرار، ولم تُكتب مبيعات أو بيانات إنتاج، ولم تتغير Firestore Rules أو إعدادات Billing. الاستعلامات الإدارية التي أُجريت كانت للقراءة فقط.

### ما أصبح جاهزاً محلياً

- Worker يرفض مسارات البيع والتهيئة الإنتاجية قبل `2026-10-17T00:00:00Z`، أي 03:00 بتوقيت القاهرة. بعد القطع، يحاول تطبيق المالك تهيئة العداد لكل يوم UTC عبر Worker المحدد؛ لا يسجل ذلك عملية بيع ولا يمس `lamsa_offline_queue_v1`.
- إذا ظهر سجل بيع بتاريخ القطع أو كانت بيانات bootstrap ملتبسة/تجاوزت الحد، يرفض Worker العملية ولا ينشئ baseline غير صفري. عند غياب جلسة مالك أو عدم جاهزية العداد يبقى البيع مغلقاً.
- GitHub Pages workflow يتطلب متغيري البناء `VITE_LAMSA_SALE_WORKER_URL` و`VITE_LAMSA_SALE_WORKER_ENABLED=true`؛ لا يمرر أي سر إلى الواجهة.
- لا تزال بوابتا Worker في `wrangler.toml` مغلقتين، والواجهة فارغة/معطّلة في `.env.example` حتى إنشاء Worker والتحقق من أسرار الإنتاج.

### تحقق الإدارة الحية والمانع

- لقطات الفحص السابقة تُظهر حساب Cloudflare `Offers` وخطة Workers Free — Active، وعاملاً قائماً واحداً اسمه `offers`؛ لا يوجد عامل لمسة، ولم تُجر كتابة إلى Cloudflare. لا يُستبدل `offers`.
- صفحة IAM تُظهر حساب الخدمة مربوطاً بالدور `Firestore Store Read/Write (No Delete)`. وفق إفادة المالك والوثائق، المقصود خمس صلاحيات: `datastore.databases.get`, `datastore.entities.get`, `datastore.entities.list`, `datastore.entities.create`, `datastore.entities.update`. لم يظهر في سجل الحدث نفسه أي إذن `datastore.entities.delete`، لكن صفحة تفاصيل الدور المباشرة فشلت في تحميل JavaScript؛ لذلك لم نتحقق مستقلاً من القائمة الحية ولا ننشئ مفتاحاً حتى يمكن إثباتها.
- صفحة مفاتيح حساب الخدمة لم تُحمّل كذلك؛ لم يُنشأ مفتاح جديد في هذه الجولة، ولا يُدّعى أن قائمة المفاتيح الحية خالية. هذا يمنع إنشاء/تخزين اعتماد Worker حالياً.
- Cloudflare Wrangler غير مصادق محلياً، وطلبات API للخطط أعادت خطأ مصادقة سابقاً. توجد لقطة تثبت Workers Free — Active، لكن يلزم تسجيل دخول Cloudflare قبل النشر. لن يُختار Workers Paid أو Billing/Blaze.

### الاختبارات المحلية الأخيرة

- `npm run lint`: ناجح.
- `npm run test:security`: **68/68**.
- `npm run test:firestore`: **154/154** على Firebase Emulator.
- `npm run test:app-contract`: **33/33**.
- `npm run test:prototype`: **33/33** عقود Worker، **17/17** تكامل Firestore Emulator، و**15/15** auth/stream.
- `npm run build`: ناجح؛ يوجد تحذير Vite عن chunk أكبر من 500 KiB. لا تثبت المحاكيات عمل IAM أو OAuth أو المزامنة الحية، ولم يُختبر بيع حقيقي.
