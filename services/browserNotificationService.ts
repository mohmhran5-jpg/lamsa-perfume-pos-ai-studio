/**
 * Browser & Mobile Web Push Notification Service for Lamsa Perfume POS
 * Manages native browser and mobile OS notifications (Android PWA / iOS / Windows / macOS).
 * Delivers instant background alerts for sales, critical low-stock thresholds, and owner directives.
 */

import { soundAlertService } from './soundAlertService';

export interface PushNotificationPayload {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  vibrate?: number[];
  data?: Record<string, any>;
  playSound?: boolean;
  soundType?: 'sale' | 'warning' | 'notification' | 'register';
  requireInteraction?: boolean;
}

class BrowserNotificationService {
  private isPushSupported: boolean = false;
  private defaultIcon = 'https://l.top4top.io/p_31142jfec0.png';

  constructor() {
    this.isPushSupported = typeof window !== 'undefined' && 'Notification' in window;
  }

  public isSupported(): boolean {
    return this.isPushSupported;
  }

  public getPermission(): NotificationPermission {
    if (!this.isPushSupported) return 'denied';
    return Notification.permission;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.isPushSupported) return false;
    try {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Dispatches a rich native OS / Mobile push notification.
   * Leverages Service Worker if registered for high-fidelity Android PWA background delivery,
   * falling back to window.Notification on desktop.
   */
  public async sendNotification(
    payloadOrTitle: PushNotificationPayload | string,
    options?: Partial<PushNotificationPayload>
  ): Promise<boolean> {
    const payload: PushNotificationPayload =
      typeof payloadOrTitle === 'string'
        ? { title: payloadOrTitle, ...options }
        : payloadOrTitle;

    // Dispatch custom in-app event so UI listeners can display in-app banner simultaneously
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('lamsa_push_notification_dispatched', {
            detail: payload,
          })
        );
      }
    } catch {
      // ignore
    }

    // 1. Play smart audio cue if requested
    if (payload.playSound !== false) {
      try {
        if (payload.soundType === 'sale') {
          soundAlertService.playSaleChime();
        } else if (payload.soundType === 'warning') {
          soundAlertService.playAlertChime();
        } else if (payload.soundType === 'register') {
          soundAlertService.playRegisterSuccessChime();
        } else {
          soundAlertService.playNotificationChime();
        }
      } catch {
        // ignore audio errors
      }
    }

    // 2. Vibrate device (especially on Android smartphones)
    if (typeof window !== 'undefined' && 'navigator' in window && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(payload.vibrate || [180, 90, 180]);
      } catch {
        // ignore vibration
      }
    }

    if (!this.isPushSupported || Notification.permission !== 'granted') {
      return false;
    }

    const title = payload.title || 'لمسة عطر';
    const notificationOptions: NotificationOptions = {
      body: payload.body || '',
      tag: payload.tag || `lamsa-push-${Date.now()}`,
      icon: payload.icon || this.defaultIcon,
      badge: payload.badge || this.defaultIcon,
      dir: 'rtl',
      lang: 'ar',
      requireInteraction: payload.requireInteraction || false,
      data: payload.data || {},
    };

    // 3. Attempt delivery through active Service Worker (Best for Android & PWA)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, notificationOptions);
          return true;
        }
      } catch (swErr) {
        console.warn('SW notification fallback to window.Notification:', swErr);
      }
    }

    // 4. Fallback to standard window.Notification
    try {
      const instance = new Notification(title, notificationOptions);
      instance.onclick = () => {
        window.focus();
        instance.close();
      };
      return true;
    } catch (e) {
      console.warn('Native notification dispatch error:', e);
      return false;
    }
  }

  /**
   * Convenience test push notification
   */
  public async sendTestNotification(): Promise<boolean> {
    const granted = await this.requestPermission();
    if (!granted) return false;

    return this.sendNotification({
      title: '✨ لمسة عطر | إشعار تجريبي ناجح',
      body: 'تم تفعيل إشعارات المتصفح والموبايل بنجاح. ستصلك تنبيهات المبيعات الحية، خطوط خطر المخزون، وتوجيهات الإدارة لحظياً!',
      soundType: 'register',
      vibrate: [200, 100, 200],
    });
  }
}

export const browserNotificationService = new BrowserNotificationService();
