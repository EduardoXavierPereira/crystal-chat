/**
 * ThemeController - Manages theme and accent color settings
 * Handles theme selection (system/dark/light) and accent color swatches
 */

export class ThemeController {
  constructor({ els, state, saveUIState, signal }) {
    this.els = els;
    this.state = state;
    this.saveUIState = saveUIState;
    this.signal = signal;

    this.prefersDarkMql = this.getMediaQueryList();
    this.attachListeners();
    this.updateUI();
  }

  getMediaQueryList() {
    try {
      return window.matchMedia?.('(prefers-color-scheme: dark)') || null;
    } catch {
      return null;
    }
  }

  resolveTheme() {
    const raw = (this.state?.theme || 'system').toString();
    if (raw === 'dark' || raw === 'light') return raw;
    if (raw !== 'system') return 'dark';
    return this.prefersDarkMql?.matches ? 'dark' : 'light';
  }

  applyThemeAndAccent() {
    try {
      document.documentElement.dataset.theme = this.resolveTheme();
    } catch {
      // ignore
    }
    try {
      document.documentElement.style.setProperty('--accent', (this.state?.accent || '#7fc9ff').toString());
    } catch {
      // ignore
    }
  }

  updateThemeSegmentUI() {
    const theme = (this.state?.theme || 'system').toString();
    this.els.themeSystemBtn?.classList.toggle('active', theme === 'system');
    this.els.themeDarkBtn?.classList.toggle('active', theme === 'dark');
    this.els.themeLightBtn?.classList.toggle('active', theme === 'light');
    this.els.themeSystemBtn?.setAttribute('aria-pressed', theme === 'system' ? 'true' : 'false');
    this.els.themeDarkBtn?.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    this.els.themeLightBtn?.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  }

  updateAccentSwatchesUI() {
    const accent = (this.state?.accent || '#7fc9ff').toString().toLowerCase();
    const swatches = Array.from(this.els.accentSwatchesEl?.querySelectorAll?.('.accent-swatch') || []);
    swatches.forEach((btn) => {
      const v = (btn?.dataset?.accent || '').toString().toLowerCase();
      const isActive = v === accent;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  updateUI() {
    this.applyThemeAndAccent();
    this.updateThemeSegmentUI();
    this.updateAccentSwatchesUI();
  }

  attachListeners() {
    // Theme button clicks
    const onThemeClick = (e) => {
      const btn = e?.currentTarget;
      const next = (btn?.dataset?.theme || '').toString();
      if (next !== 'system' && next !== 'dark' && next !== 'light') return;
      this.state.theme = next;
      this.applyThemeAndAccent();
      this.updateThemeSegmentUI();
      this.saveUIState(this.state);
    };

    this.els.themeSystemBtn?.addEventListener('click', onThemeClick, { signal: this.signal });
    this.els.themeDarkBtn?.addEventListener('click', onThemeClick, { signal: this.signal });
    this.els.themeLightBtn?.addEventListener('click', onThemeClick, { signal: this.signal });

    // Accent swatch clicks
    this.els.accentSwatchesEl?.addEventListener(
      'click',
      (e) => {
        const btn = e?.target?.closest?.('.accent-swatch');
        if (!btn || !this.els.accentSwatchesEl.contains(btn)) return;
        const next = (btn?.dataset?.accent || '').toString();
        if (!next) return;
        this.state.accent = next;
        this.applyThemeAndAccent();
        this.updateAccentSwatchesUI();
        this.saveUIState(this.state);
      },
      { signal: this.signal }
    );

    // System preference change listener
    if (this.prefersDarkMql?.addEventListener) {
      this.prefersDarkMql.addEventListener(
        'change',
        () => {
          if ((this.state?.theme || 'system').toString() !== 'system') return;
          this.applyThemeAndAccent();
        },
        { signal: this.signal }
      );
    } else if (this.prefersDarkMql?.addListener) {
      const handler = () => {
        if ((this.state?.theme || 'system').toString() !== 'system') return;
        this.applyThemeAndAccent();
      };
      this.prefersDarkMql.addListener(handler);
      this.signal.addEventListener(
        'abort',
        () => {
          try {
            this.prefersDarkMql.removeListener(handler);
          } catch {
            // ignore
          }
        },
        { once: true }
      );
    }
  }
}
