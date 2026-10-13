import { Sale, Expense, StoreSettings } from '../types';

export interface TelegramSettings {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifySales: boolean;
  notifyLowStock: boolean;
  notifyExpenses: boolean;
  notifyDailySummary: boolean;
}

const STORAGE_KEY = 'lamsa_telegram_settings_v1';

export const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
  botToken: '',
  chatId: '',
  enabled: false,
  notifySales: true,
  notifyLowStock: true,
  notifyExpenses: true,
  notifyDailySummary: true,
};

export const loadTelegramSettings = (): TelegramSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TELEGRAM_SETTINGS;
    return { ...DEFAULT_TELEGRAM_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    console.error('Failed to load Telegram settings:', err);
    return DEFAULT_TELEGRAM_SETTINGS;
  }
};

export const saveTelegramSettings = (settings: TelegramSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save Telegram settings:', err);
  }
};

export const sendTelegramMessage = async (
  botToken: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<{ success: boolean; error?: string }> => {
  if (!botToken || !chatId) {
    return { success: false, error: 'رمز البوت (Bot Token) ومعرف القناة/المستخدم (Chat ID) مطلوبة' };
  }

  const cleanToken = botToken.trim();
  const cleanChatId = chatId.trim();
  const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();

    if (data.ok) {
      return { success: true };
    } else {
      return { success: false, error: data.description || 'فشل إرسال الرسالة إلى تليجرام' };
    }
  } catch (err: any) {
    console.error('Telegram API error:', err);
    return { success: false, error: err.message || 'حدث خطأ بالاتصال بخوادم تليجرام' };
  }
};

export const testTelegramConnection = async (
  botToken: string,
  chatId: string,
  storeName: string = 'لمسة عطر'
): Promise<{ success: boolean; error?: string }> => {
  const msg = `✨ <b>${storeName} - تجربة الربط المباشر مع تليجرام</b>
  
✅ <b>تم الربط بنجاح!</b>
ستصلك تنبيهات المبيعات اللحظية، نواقص المخزون الحرج، والمصروفات مباشرة على هذه القناة.

⏱️ <i>الوقت: ${new Date().toLocaleString('ar-EG')}</i>`;

  return sendTelegramMessage(botToken, chatId, msg);
};

export const dispatchSaleTelegramAlert = async (
  sale: Sale,
  settings?: StoreSettings
): Promise<boolean> => {
  const config = loadTelegramSettings();
  if (!config.enabled || !config.notifySales || !config.botToken || !config.chatId) {
    return false;
  }

  const storeName = settings?.storeName || 'لمسة عطر';
  const currency = settings?.currency || 'ج.م';

  const itemsListHtml = (sale.items || [])
    .map((item, idx) => {
      const qtyStr = (item.quantity && item.quantity > 1) ? ` (x${item.quantity})` : '';
      return `${idx + 1}. <b>${item.productName}</b> - ${item.sellingPrice} ${currency}${qtyStr}`;
    })
    .join('\n');

  const text = `🛍️ <b>فاتورة مبيعات جديدة - ${storeName}</b>

💰 <b>المبلغ الإجمالي:</b> ${sale.totalPrice.toLocaleString('ar-EG')} ${currency}
📦 <b>عدد الأصناف:</b> ${sale.items?.length || 0}
👤 <b>العميل:</b> ${sale.customerName || 'عميل نقدي'}
💳 <b>طريقة الدفع:</b> ${sale.paymentMethod || 'نقدي'}
👨‍د <b>الكاشير:</b> ${sale.employeeName || 'مدير المتجر'}
⏱️ <b>التاريخ والوقت:</b> ${sale.date || new Date().toLocaleString('ar-EG')}

📋 <b>تفاصيل العطور:</b>
${itemsListHtml}

✨ <i>تم تسجيل العملية ومزامنتها بالنظام</i>`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text);
  return res.success;
};

export const dispatchLowStockTelegramAlert = async (
  productName: string,
  currentStockGrams: number,
  minThresholdGrams: number,
  storeName: string = 'لمسة عطر'
): Promise<boolean> => {
  const config = loadTelegramSettings();
  if (!config.enabled || !config.notifyLowStock || !config.botToken || !config.chatId) {
    return false;
  }

  const text = `🚨 <b>تنبيه مخزون منخفض وحرج! - ${storeName}</b>

🧪 <b>اسم العطر / الخام:</b> ${productName}
📉 <b>الرصيد المتبقي بالدرج:</b> <u>${currentStockGrams} جم</u>
⚠️ <b>حد الخطر الأدنى:</b> ${minThresholdGrams} جم
⏱️ <b>الوقت:</b> ${new Date().toLocaleString('ar-EG')}

🛒 <b>الإجراء المطلوب:</b> يرجى التوجيه بإعادة الشراء والتوريد فوراً لتفادي نفاد الصنف وتوقف المبيعات!`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text);
  return res.success;
};

export const dispatchExpenseTelegramAlert = async (
  expense: Expense,
  settings?: StoreSettings
): Promise<boolean> => {
  const config = loadTelegramSettings();
  if (!config.enabled || !config.notifyExpenses || !config.botToken || !config.chatId) {
    return false;
  }

  const storeName = settings?.storeName || 'لمسة عطر';
  const currency = settings?.currency || 'ج.م';

  const text = `💸 <b>تسجيل مصروف جديد - ${storeName}</b>

📝 <b>البيان:</b> ${expense.title || expense.category}
💰 <b>المبلغ:</b> ${expense.amount.toLocaleString('ar-EG')} ${currency}
📂 <b>الفئة:</b> ${expense.category}
👨‍د <b>بواسطة:</b> ${(expense as any).recordedBy || 'الإدارة'}
⏱️ <b>التاريخ:</b> ${expense.date}`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text);
  return res.success;
};
