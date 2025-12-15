export function createSetupController({
  els,
  model,
  setModelInstallUI,
  setSetupRetryEnabled,
  showSetupModal,
  onSetupSucceeded
}) {
  const EMBEDDING_MODEL = 'embeddinggemma';

  const SETUP_STEPS = [
    { key: 'install', title: 'Install Ollama', weight: 20 },
    { key: 'start-server', title: 'Start server', weight: 10 },
    { key: 'pull-model', title: `Download model (${model})`, weight: 50 },
    { key: 'pull-embedding', title: `Download embeddings model (${EMBEDDING_MODEL})`, weight: 10 },
    { key: 'finalize', title: 'Finalize', weight: 10 }
  ];

  let setupUnsub = null;
  let setupSucceeded = false;

  let modelInstallUnsub = null;
  let modelInstallActive = false;
  let modelInstallPercent = 0;
  let modelInstallTarget = null;
  let modelDropdown = null;

  const setupStepState = Object.fromEntries(
    SETUP_STEPS.map((s) => [s.key, { status: 'pending', detail: '' }])
  );

  const setupStagePercent = Object.fromEntries(SETUP_STEPS.map((s) => [s.key, 0]));

  function computeOverallPercent() {
    let total = 0;
    let sum = 0;
    for (const s of SETUP_STEPS) {
      total += s.weight;
      const st = setupStepState[s.key].status;
      if (st === 'done') sum += s.weight;
      if (st === 'active') {
        sum += (s.weight * (setupStagePercent[s.key] || 0)) / 100;
      }
    }
    return total > 0 ? Math.round((sum / total) * 100) : 0;
  }

  function renderSetupSteps() {
    if (!els.setupStepsEl) return;
    els.setupStepsEl.innerHTML = '';
    SETUP_STEPS.forEach((s) => {
      const row = document.createElement('div');
      row.className = `setup-step ${setupStepState[s.key].status}`;

      const title = document.createElement('div');
      title.className = 'setup-step-title';
      title.textContent = s.title;

      const status = document.createElement('div');
      status.className = 'setup-step-status';
      status.textContent = setupStepState[s.key].detail || setupStepState[s.key].status;

      row.appendChild(title);
      row.appendChild(status);
      els.setupStepsEl.appendChild(row);
    });
  }

  function setSetupOverallProgress({ label, percent }) {
    if (els.setupProgressLabelEl) {
      els.setupProgressLabelEl.textContent = (label || '').toString();
    }
    if (els.setupProgressPercentEl) {
      els.setupProgressPercentEl.textContent = Number.isFinite(percent)
        ? `${Math.max(0, Math.min(100, percent))}%`
        : '';
    }
    if (els.setupProgressBarFillEl) {
      const p = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
      els.setupProgressBarFillEl.style.width = `${p}%`;
    }
  }

  function resetSetupProgressUI() {
    SETUP_STEPS.forEach((s) => {
      setupStepState[s.key].status = 'pending';
      setupStepState[s.key].detail = '';
      setupStagePercent[s.key] = 0;
    });
    renderSetupSteps();
    setSetupOverallProgress({ label: 'Preparing…', percent: 0 });
  }

  function getActiveSetupStepKey() {
    for (const s of SETUP_STEPS) {
      if (setupStepState[s.key]?.status === 'active') return s.key;
    }
    return null;
  }

  function setStepStatus(stepKey, status, detail = '') {
    if (!setupStepState[stepKey]) return;
    setupStepState[stepKey].status = status;
    setupStepState[stepKey].detail = detail;
    renderSetupSteps();
    setSetupOverallProgress({
      label: detail || SETUP_STEPS.find((s) => s.key === stepKey)?.title || 'Working…',
      percent: computeOverallPercent()
    });
  }

  function setStagePercent(stepKey, pct) {
    if (!setupStepState[stepKey]) return;
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    setupStagePercent[stepKey] = p;

    if (setupStepState[stepKey].status === 'active') {
      const baseLabel =
        stepKey === 'pull-model'
          ? 'Downloading model…'
          : SETUP_STEPS.find((s) => s.key === stepKey)?.title || 'Working…';
      setStepStatus(stepKey, 'active', `${baseLabel} ${p}%`);
    } else {
      setSetupOverallProgress({
        label: els.setupProgressLabelEl?.textContent || 'Working…',
        percent: computeOverallPercent()
      });
    }
  }

  function setSetupMainMessageForStage(stage) {
    if (!els.setupMessageEl) return;
    if (stage === 'install') {
      els.setupMessageEl.textContent =
        'Crystal Chat uses Ollama to run the AI model locally on your computer. Installing Ollama…';
      return;
    }
    if (stage === 'start-server') {
      els.setupMessageEl.textContent = 'Starting server…';
      return;
    }
    if (stage === 'pull-model') {
      els.setupMessageEl.textContent = 'Downloading model…';
      return;
    }
    if (stage === 'pull-embedding') {
      els.setupMessageEl.textContent = 'Downloading embeddings model…';
      return;
    }
    if (stage === 'finalize') {
      els.setupMessageEl.textContent = 'Finalizing setup…';
    }
  }

  async function ensureOllamaAndModel() {
    const api = window.electronAPI;
    if (!api?.ollamaCheck) return;

    showSetupModal(`Checking Ollama + ${model}...`);
    resetSetupProgressUI();
    setSetupOverallProgress({ label: `Checking dependencies for ${model}…`, percent: 0 });
    setupSucceeded = false;
    if (els.setupCloseBtn) els.setupCloseBtn.disabled = true;
    setSetupRetryEnabled(false);

    if (!setupUnsub && api.onOllamaSetupProgress) {
      setupUnsub = api.onOllamaSetupProgress((payload) => {
        if (!payload) return;

        if (payload.kind === 'stage') {
          const stage = payload.stage;
          if (stage && setupStepState[stage]) {
            setSetupMainMessageForStage(stage);
            Object.keys(setupStepState).forEach((k) => {
              if (setupStepState[k].status === 'active') setupStepState[k].status = 'pending';
            });
            setStepStatus(stage, 'active', payload.message || 'Working…');
          } else {
            setSetupOverallProgress({
              label: payload.message || 'Working…',
              percent: computeOverallPercent()
            });
          }
        }

        if (payload.kind === 'done') {
          const stage = payload.stage;
          if (stage && setupStepState[stage]) {
            setStepStatus(stage, 'done', payload.message || 'Done');
          }
        }

        if (payload.kind === 'error') {
          const stage = payload.stage;
          if (stage && setupStepState[stage]) {
            setStepStatus(stage, 'error', payload.message || 'Error');
          } else {
            setSetupOverallProgress({
              label: payload.message || 'Error',
              percent: computeOverallPercent()
            });
          }

          setSetupRetryEnabled(true);
        }

        if (payload.kind === 'log' && typeof payload.line === 'string') {
          const line = payload.line;
          const m = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
          if (m) {
            const pct = Math.max(0, Math.min(100, Number(m[1])));
            const activeKey = getActiveSetupStepKey();
            if (activeKey) setStagePercent(activeKey, pct);
          }
        }
      });
    }

    const initial = await api.ollamaCheck();

    if (!initial.hasBinary) {
      setSetupMainMessageForStage('install');
      setStepStatus('install', 'active', 'Installing Ollama…');
      const installRes = await api.ollamaInstall();
      if (!installRes?.ok) {
        if (els.setupMessageEl) els.setupMessageEl.textContent = 'Failed to install Ollama. Click Retry.';
        throw new Error('Ollama install failed.');
      }
      setStepStatus('install', 'done', 'Installed');
    } else {
      setStepStatus('install', 'done', 'Already installed');
    }

    if (!initial.serverReachable) {
      setSetupMainMessageForStage('start-server');
      setStepStatus('start-server', 'active', 'Starting server…');
      const serverRes = await api.ollamaEnsureServer();
      if (!serverRes?.ok) {
        if (els.setupMessageEl) els.setupMessageEl.textContent = 'Could not start Ollama server. Click Retry.';
        throw new Error('Ollama server not reachable.');
      }
      setStepStatus('start-server', 'done', 'Running');
    } else {
      setStepStatus('start-server', 'done', 'Already running');
    }

    let hasModel = false;
    if (api.ollamaHasModel) {
      const r = await api.ollamaHasModel(model);
      hasModel = !!r?.ok;
    } else {
      const afterServer = await api.ollamaCheck();
      hasModel = Array.isArray(afterServer.models) && afterServer.models.includes(model);
    }

    if (!hasModel) {
      setSetupMainMessageForStage('pull-model');
      setStepStatus('pull-model', 'active', 'Downloading model…');
      const pullRes = await api.ollamaPullModel(model);
      if (!pullRes?.ok) {
        if (els.setupMessageEl) els.setupMessageEl.textContent = 'Failed to download model. Click Retry.';
        throw new Error('Model download failed.');
      }

      if (api.ollamaHasModel) {
        setSetupMainMessageForStage('finalize');
        for (let i = 0; i < 30; i++) {
          const chk = await api.ollamaHasModel(model);
          if (chk?.ok) {
            hasModel = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (!hasModel) {
        throw new Error(`Model still not available after download: ${model}`);
      }
      setStepStatus('pull-model', 'done', 'Downloaded');
    } else {
      setStepStatus('pull-model', 'done', 'Already installed');
    }

    let hasEmbeddingModel = false;
    if (api.ollamaHasModel) {
      const r = await api.ollamaHasModel(EMBEDDING_MODEL);
      hasEmbeddingModel = !!r?.ok;
    }
    if (!hasEmbeddingModel) {
      setSetupMainMessageForStage('pull-embedding');
      setStepStatus('pull-embedding', 'active', 'Downloading embeddings model…');
      const pullRes = await api.ollamaPullModel(EMBEDDING_MODEL);
      if (!pullRes?.ok) {
        if (els.setupMessageEl) {
          els.setupMessageEl.textContent = 'Failed to download embeddings model. Click Retry.';
        }
        throw new Error('Embeddings model download failed.');
      }
      setStepStatus('pull-embedding', 'done', 'Downloaded');
    } else {
      setStepStatus('pull-embedding', 'done', 'Already installed');
    }

    setSetupMainMessageForStage('finalize');
    setStepStatus('finalize', 'active', 'Finalizing…');
    setupSucceeded = true;
    if (els.setupMessageEl) els.setupMessageEl.textContent = 'Ready.';
    setStepStatus('finalize', 'done', 'Done');
    if (els.setupCloseBtn) els.setupCloseBtn.disabled = false;

    onSetupSucceeded?.();
  }

  async function ensureModelInstalled(nextModel) {
    const api = window.electronAPI;
    if (!api?.ollamaCheck) return;

    const target = (nextModel || '').toString().trim();
    if (!target) return;

    modelInstallActive = true;
    modelInstallTarget = target;
    modelInstallPercent = 0;
    setModelInstallUI({ visible: true, label: `Checking ${target}…`, percent: 0 });
    modelDropdown?.setDisabled(true);

    if (!modelInstallUnsub && api.onOllamaSetupProgress) {
      modelInstallUnsub = api.onOllamaSetupProgress((payload) => {
        if (!payload || !modelInstallActive) return;
        if (payload.kind === 'stage' && payload.stage === 'pull-model') {
          const msg = payload.message || `Downloading ${modelInstallTarget || ''}…`;
          setModelInstallUI({ visible: true, label: msg, percent: modelInstallPercent });
        }
        if (payload.kind === 'log' && typeof payload.line === 'string') {
          const m = payload.line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
          if (m) {
            modelInstallPercent = Math.max(0, Math.min(100, Number(m[1])));
            setModelInstallUI({
              visible: true,
              label: `Downloading ${modelInstallTarget || ''}…`,
              percent: modelInstallPercent
            });
          }
        }
      });
    }

    try {
      const initial = await api.ollamaCheck();
      if (!initial?.hasBinary) {
        setModelInstallUI({ visible: true, label: 'Installing Ollama…', percent: 0 });
        const installRes = await api.ollamaInstall();
        if (!installRes?.ok) throw new Error('Ollama install failed.');
      }

      if (!initial?.serverReachable) {
        setModelInstallUI({ visible: true, label: 'Starting server…', percent: 0 });
        const serverRes = await api.ollamaEnsureServer();
        if (!serverRes?.ok) throw new Error('Ollama server not reachable.');
      }

      const has = await api.ollamaHasModel(target);
      if (!has?.ok) {
        modelInstallPercent = 0;
        setModelInstallUI({ visible: true, label: `Downloading ${target}…`, percent: 0 });
        const pull = await api.ollamaPullModel(target);
        if (!pull?.ok) throw new Error('Model download failed.');
        setModelInstallUI({ visible: true, label: `${target} ready.`, percent: 100 });
        await new Promise((r) => setTimeout(r, 400));
      } else {
        setModelInstallUI({ visible: false, label: '', percent: 0 });
      }
    } finally {
      modelInstallActive = false;
      modelInstallTarget = null;
      modelDropdown?.setDisabled(false);
    }
  }

  function setModelDropdown(dropdown) {
    modelDropdown = dropdown;
  }

  return {
    ensureOllamaAndModel,
    ensureModelInstalled,
    setModelDropdown,
    getSetupSucceeded: () => setupSucceeded
  };
}
