import { Sale, StoreSettings, ReceiptDesignConfig } from '../types';

export interface BluetoothPrinterDevice {
  name?: string;
  id: string;
}

export interface ThermalPrintResult {
  success: boolean;
  message: string;
  error?: string;
}

// Common Bluetooth Thermal Receipt Printer GATT Service UUIDs
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Receipt Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Portable Thermal Printers
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip ISSC Transparent UART
  '0000af30-0000-1000-8000-00805f9b34fb', // JP-58 / Xprinter / GOOJPRT
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom POS Service
];

/**
 * Check if Web Bluetooth API is supported in the current browser/device
 */
export const isWebBluetoothSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
};

/**
 * Format thermal receipt text formatted specifically for 58mm (32 chars) or 80mm (48 chars) ticket printers
 */
export const generateMonospaceThermalTicketText = (
  sale: Sale,
  settings: StoreSettings,
  design?: ReceiptDesignConfig
): string => {
  const is58mm = design?.paperWidth === '58mm';
  const width = is58mm ? 32 : 44;
  const divider = '-'.repeat(width);
  const doubleDivider = '='.repeat(width);

  const padCenter = (str: string, len: number) => {
    if (str.length >= len) return str.slice(0, len);
    const left = Math.floor((len - str.length) / 2);
    const right = len - str.length - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  };

  const padRow = (left: string, right: string, len: number) => {
    const spaceCount = Math.max(1, len - (left.length + right.length));
    return left + ' '.repeat(spaceCount) + right;
  };

  const storeName = settings.storeName || 'لمسة عطر';
  const storeSlogan = settings.storeSlogan || 'أثر يبقى وذكرى تدوم';
  const currency = settings.currency || 'ج.م';
  const dateStr = new Date(sale.date).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const lines: string[] = [];
  lines.push(doubleDivider);
  lines.push(padCenter(storeName, width));
  if (storeSlogan) lines.push(padCenter(storeSlogan, width));
  if (settings.storePhone) lines.push(padCenter(`هاتف: ${settings.storePhone}`, width));
  if (settings.storeAddress) lines.push(padCenter(settings.storeAddress, width));
  lines.push(divider);

  lines.push(padRow(`فاتورة: #${sale.id.slice(-6)}`, `كاشير: ${sale.employeeName || 'المتجر'}`, width));
  lines.push(padCenter(dateStr, width));
  if (sale.customerName && sale.customerName !== 'عميل نقدي') {
    lines.push(padRow(`العميل: ${sale.customerName}`, sale.customerPhone || '', width));
  }
  lines.push(divider);

  lines.push(padRow('الصنف / الحجم', 'السعر', width));
  lines.push(divider);

  sale.items.forEach((item, idx) => {
    const qty = item.quantity || 1;
    const name = `${idx + 1}. ${item.productName}${qty > 1 ? ` (×${qty})` : ''}`;
    const total = `${item.sellingPrice * qty} ${currency}`;
    lines.push(padRow(name, total, width));

    if (item.bottleSize || item.essenceGrams) {
      const details = `   [${item.bottleSize || ''}مل · ${item.essenceGrams || ''}جم زيت]`;
      lines.push(details);
    }
    if (item.isMix && item.mixComponents) {
      const mixStr = `   خلطة: ${item.mixComponents.map((c) => `${c.productName} (${c.grams}جم)`).join(' + ')}`;
      lines.push(mixStr.slice(0, width));
    }
  });

  lines.push(divider);

  const totalBottles = sale.items.reduce((s, it) => s + (it.quantity || 1), 0);
  lines.push(padRow(`عدد العبوات: ${totalBottles}`, `الدفع: ${sale.paymentMethod || 'نقدي'}`, width));

  if (sale.discount && sale.discount > 0) {
    lines.push(padRow('الخصم الممنوح:', `-${sale.discount} ${currency}`, width));
  }

  lines.push(doubleDivider);
  lines.push(padRow('الإجمالي النهائي:', `${sale.totalPrice} ${currency}`, width));
  lines.push(doubleDivider);

  if (design?.perfumeCareTipText) {
    lines.push(padCenter(`نصيحة: ${design.perfumeCareTipText}`, width));
  }
  if (design?.returnPolicyText) {
    lines.push(padCenter(design.returnPolicyText, width));
  }
  if (settings.receiptFooterMessage) {
    lines.push(padCenter(settings.receiptFooterMessage, width));
  } else {
    lines.push(padCenter('شكراً لزيارتكم ونسعد بخدمتكم دائماً', width));
  }

  lines.push(padCenter('Mohamed Mhran2027©', width));
  lines.push('\n\n\n'); // Feed lines for ticket tearing

  return lines.join('\n');
};

/**
 * Clean isolated HTML printing for 58mm and 80mm thermal ticket printers.
 * Bypasses all main-page CSS, modals, and headers/footers to print directly to continuous thermal roll paper.
 */
export const printThermalReceiptViaIframe = (
  receiptElementId: string,
  paperWidth: '58mm' | '80mm' | 'A4' = '58mm'
): Promise<boolean> => {
  return new Promise((resolve) => {
    const sourceEl = document.getElementById(receiptElementId);
    if (!sourceEl) {
      console.warn(`Receipt element with ID #${receiptElementId} not found, falling back to window.print()`);
      window.print();
      resolve(true);
      return;
    }

    // Clone receipt HTML to preserve clean styling
    const receiptHtml = sourceEl.outerHTML;

    // Remove any existing print iframes
    const oldIframe = document.getElementById('thermal-print-frame');
    if (oldIframe) {
      oldIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'thermal-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const is58mm = paperWidth === '58mm';
    const mmWidth = is58mm ? '58mm' : paperWidth === 'A4' ? '210mm' : '80mm';

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      resolve(true);
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>طباعة تذكرة حرارية</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Readex+Pro:wght@400;600;700;800&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          @page {
            size: ${is58mm ? '58mm auto' : paperWidth === 'A4' ? 'A4 portrait' : '80mm auto'};
            margin: 0 !important;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            width: ${mmWidth} !important;
            max-width: ${mmWidth} !important;
            font-family: 'Cairo', 'Readex Pro', 'Tajawal', sans-serif !important;
            font-weight: 700;
          }
          #${receiptElementId} {
            width: 100% !important;
            max-width: ${mmWidth} !important;
            margin: 0 auto !important;
            padding: ${is58mm ? '3mm' : '5mm'} !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          /* Ensure high thermal contrast */
          img {
            max-width: 100%;
            filter: contrast(150%) grayscale(100%);
          }
        </style>
      </head>
      <body>
        ${receiptHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 250);
          };
        </script>
      </body>
      </html>
    `);
    doc.close();

    // Cleanup iframe after printing
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {}
      resolve(true);
    }, 2500);
  });
};

/**
 * Direct ESC/POS Bluetooth Thermal Printing
 * Supports portable Bluetooth ticket printers (58mm / 80mm) via Web Bluetooth API.
 */
export const printReceiptViaWebBluetooth = async (
  sale: Sale,
  settings: StoreSettings,
  design?: ReceiptDesignConfig
): Promise<ThermalPrintResult> => {
  if (!isWebBluetoothSupported()) {
    return {
      success: false,
      message: 'تقنية البلوتوث المباشر (Web Bluetooth) غير مدعومة على هذا المتصفح. يمكنك استخدام الطباعة الحرارية المباشرة.',
    };
  }

  try {
    const nav = navigator as unknown as {
      bluetooth: {
        requestDevice(options: unknown): Promise<any>;
      };
    };

    // Prompt user to select paired or nearby Bluetooth thermal printer
    const device = await nav.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'MPT' },
        { namePrefix: 'POS' },
        { namePrefix: 'RP' },
        { namePrefix: 'MTP' },
        { namePrefix: 'Thermal' },
        { namePrefix: 'Printer' },
        { namePrefix: '58' },
        { namePrefix: '80' },
        { namePrefix: 'JP' },
        { namePrefix: 'XP' },
        { namePrefix: 'Blue' },
      ],
      optionalServices: PRINTER_SERVICES,
    }).catch(async () => {
      // Fallback: If filtered search fails, accept all Bluetooth devices
      return await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICES,
      });
    });

    if (!device) {
      return { success: false, message: 'تم إلغاء تحديد الطابعة' };
    }

    const server = await device.gatt.connect();

    // Find the printer GATT service
    let printerService: any = null;
    for (const serviceUuid of PRINTER_SERVICES) {
      try {
        printerService = await server.getPrimaryService(serviceUuid);
        if (printerService) break;
      } catch {}
    }

    if (!printerService) {
      // Try discovering any primary service with write characteristic
      const services = await server.getPrimaryServices();
      if (services && services.length > 0) {
        printerService = services[0];
      }
    }

    if (!printerService) {
      return {
        success: false,
        message: 'تعذر العثور على قناة الطباعة في جهاز البلوتوث المتصل.',
      };
    }

    // Find writable characteristic
    const characteristics = await printerService.getCharacteristics();
    const writeCharacteristic = characteristics.find(
      (c: any) => c.properties.write || c.properties.writeWithoutResponse
    );

    if (!writeCharacteristic) {
      return {
        success: false,
        message: 'لا توجد خاصية إرسال البيانات (Write) في الطابعة المحددة.',
      };
    }

    // Generate ESC/POS commands
    const ticketText = generateMonospaceThermalTicketText(sale, settings, design);

    // ESC/POS Initialization: ESC @ (0x1B, 0x40)
    const initCmd = new Uint8Array([0x1b, 0x40]);
    // Center alignment: ESC a 1 (0x1B, 0x61, 0x01)
    const alignCenterCmd = new Uint8Array([0x1b, 0x61, 0x01]);
    // Cut paper / feed lines: GS V 66 0 (0x1D, 0x56, 0x42, 0x00)
    const cutPaperCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00, 0x0a, 0x0a, 0x0a]);

    // Encode text as UTF-8
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(ticketText);

    // Combine into full payload
    const totalLength = initCmd.length + alignCenterCmd.length + textBytes.length + cutPaperCmd.length;
    const payload = new Uint8Array(totalLength);
    let offset = 0;

    payload.set(initCmd, offset);
    offset += initCmd.length;

    payload.set(alignCenterCmd, offset);
    offset += alignCenterCmd.length;

    payload.set(textBytes, offset);
    offset += textBytes.length;

    payload.set(cutPaperCmd, offset);

    // Send payload in chunks of 128 bytes to prevent buffer overflow
    const CHUNK_SIZE = 128;
    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      if (writeCharacteristic.properties.writeWithoutResponse) {
        await writeCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await writeCharacteristic.writeValue(chunk);
      }
      // Small delay between Bluetooth chunks
      await new Promise((r) => setTimeout(r, 20));
    }

    return {
      success: true,
      message: `تم إرسال الفاتورة بنجاح إلى طابعة البلوتوث [${device.name || 'طابعة حرارية'}]!`,
    };
  } catch (error: any) {
    console.error('Bluetooth thermal print error:', error);
    return {
      success: false,
      message: error?.message || 'حدث خطأ أثناء الاتصال بطابعة البلوتوث.',
      error: String(error),
    };
  }
};

/**
 * Launch RawBT / Android Bluetooth Print App
 * Widely used by mobile cashiers with 58mm portable Bluetooth printers on Android.
 */
export const openRawBTPrint = (
  sale: Sale,
  settings: StoreSettings,
  design?: ReceiptDesignConfig
): boolean => {
  try {
    const text = generateMonospaceThermalTicketText(sale, settings, design);
    const encoded = encodeURIComponent(text);
    // Standard RawBT intent URL
    const rawbtUrl = `rawbt:${encoded}`;
    window.location.href = rawbtUrl;
    return true;
  } catch (e) {
    console.warn('Could not launch RawBT:', e);
    return false;
  }
};
