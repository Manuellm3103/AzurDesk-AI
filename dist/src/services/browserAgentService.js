// Browser Agent: web automation skill using Playwright when available, stub otherwise.
import { now } from './_utils.js';

let playwright = null;
try {
  playwright = await import('playwright');
} catch {
  playwright = null;
}

class BrowserAgentService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async _ensure() {
    if (!playwright) return { available: false, error: 'playwright no instalado' };
    if (!this.browser) {
      this.browser = await playwright.chromium.launch({ headless: true });
      this.page = await this.browser.newPage();
    }
    return { available: true, page: this.page };
  }

  async navigate(url) {
    const ctx = await this._ensure();
    if (!ctx.available) return { success: false, error: ctx.error };
    await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return { success: true, url: ctx.page.url(), title: await ctx.page.title() };
  }

  async extractText(selector) {
    const ctx = await this._ensure();
    if (!ctx.available) return { success: false, error: ctx.error };
    const texts = await ctx.page.$$eval(selector || 'body', els => els.map(e => e.innerText).slice(0, 50));
    return { success: true, texts };
  }

  async click(selector) {
    const ctx = await this._ensure();
    if (!ctx.available) return { success: false, error: ctx.error };
    await ctx.page.click(selector);
    return { success: true };
  }

  async fill(selector, value) {
    const ctx = await this._ensure();
    if (!ctx.available) return { success: false, error: ctx.error };
    await ctx.page.fill(selector, value);
    return { success: true };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    return { success: true };
  }
}

export default new BrowserAgentService();
