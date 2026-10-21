/**
 * CI/CD Pipeline Simulator - Core Engine & State Management
 * Vanilla JavaScript (ES6+)
 */

// --- Global State & Configuration ---
const STATE = {
  isRunning: false,
  isPaused: false,
  currentStageIndex: -1,
  speedMultiplier: 1, // 1x, 2x, 5x, or 100x (instant)
  soundEnabled: true,
  currentRunId: 104,
  activeFilterStage: 'all',
  terminalSearchQuery: '',
  autoScrollTerminal: true,

  // Selected Commit & Branch config
  selectedBranch: 'main',
  selectedCommitId: 'a8b29f0',
  triggeredBy: 'dev-alex (manual)',
  buildVersion: 'v0.1.0',

  // Stages definition
  stages: [
    {
      id: 'lint',
      name: 'Lint & Syntax Check',
      shortName: 'Lint',
      icon: 'fa-code',
      tool: 'ESLint & TypeScript compiler',
      status: 'idle', // idle, running, passed, failed, skipped
      override: 'auto', // 'auto', 'force-pass', 'force-fail'
      duration: 0,
      logs: []
    },
    {
      id: 'build',
      name: 'Build & Packaging',
      shortName: 'Build',
      icon: 'fa-cube',
      tool: 'Vite & Docker Container Engine',
      status: 'idle',
      override: 'auto',
      duration: 0,
      logs: []
    },
    {
      id: 'test',
      name: 'Automated Unit Testing',
      shortName: 'Test',
      icon: 'fa-vial-circle-check',
      tool: 'Vitest / Jest Test Runner',
      status: 'idle',
      override: 'auto',
      duration: 0,
      logs: []
    },
    {
      id: 'deploy',
      name: 'Staging Deployment',
      shortName: 'Deploy',
      icon: 'fa-cloud-arrow-up',
      tool: 'Kubernetes & ArgoCD Rollout',
      status: 'idle',
      override: 'auto',
      duration: 0,
      logs: []
    }
  ],

  // Log buffer for current run
  allLogs: [],

  // Branch & Commit repository catalogue
  repository: {
    'main': [
      {
        id: 'a8b29f0',
        message: 'feat(core): release v1.2.0 production baseline',
        author: 'Sarah Chen <schen@dev.io>',
        timestamp: '15 mins ago',
        version: 'v0.1.0',
        presetBehavior: 'pass-all'
      },
      {
        id: '3e11d04',
        message: 'chore(deps): bump vite from 5.1.0 to 5.2.0',
        author: 'dependabot[bot]',
        timestamp: '2 hours ago',
        version: 'v0.1.1',
        presetBehavior: 'pass-all'
      }
    ],
    'feature/auth': [
      {
        id: 'c5f87b2',
        message: 'feat(auth): implement OAuth2 PKCE login flow',
        author: 'Alex Rivera <arivera@dev.io>',
        timestamp: '40 mins ago',
        version: 'v0.2.0-beta.1',
        presetBehavior: 'pass-all'
      },
      {
        id: '9a402d1',
        message: 'wip(auth): jwt token rotation handler',
        author: 'Alex Rivera <arivera@dev.io>',
        timestamp: '4 hours ago',
        version: 'v0.2.0-beta.2',
        presetBehavior: 'fail-test'
      }
    ],
    'bugfix/parser': [
      {
        id: '6d20e74',
        message: 'fix(parser): handle empty JSON payload gracefully',
        author: 'Marcus Vance <mvance@dev.io>',
        timestamp: '1 hour ago',
        version: 'v0.1.2-patch',
        presetBehavior: 'pass-all'
      },
      {
        id: 'b184f93',
        message: 'fix(parser): regex recursion syntax error',
        author: 'Marcus Vance <mvance@dev.io>',
        timestamp: 'yesterday',
        version: 'v0.1.2-rc',
        presetBehavior: 'fail-lint'
      }
    ]
  },

  // SCM Accounting History (loaded from localStorage)
  history: []
};

// --- Web Audio Synthesizer (Zero external dependencies) ---
class AudioController {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(frequency, type = 'sine', duration = 0.15, gain = 0.05) {
    if (!STATE.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

      gainNode.gain.setValueAtTime(gain, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio synthesis note:', e);
    }
  }

  playStageStart() {
    this.playTone(440, 'sine', 0.08, 0.03);
  }

  playStageSuccess() {
    this.playTone(587.33, 'triangle', 0.1, 0.04);
    setTimeout(() => this.playTone(880, 'sine', 0.15, 0.04), 80);
  }

  playStageFail() {
    this.playTone(320, 'sawtooth', 0.18, 0.06);
    setTimeout(() => this.playTone(220, 'sawtooth', 0.25, 0.08), 120);
  }

  playPipelineComplete() {
    this.playTone(523.25, 'sine', 0.12, 0.04);
    setTimeout(() => this.playTone(659.25, 'sine', 0.12, 0.04), 100);
    setTimeout(() => this.playTone(783.99, 'sine', 0.22, 0.05), 200);
  }
}

const audio = new AudioController();

// --- Storage Manager ---
const Storage = {
  STORAGE_KEY: 'scm_pipeline_simulator_history_v1',
  RUN_ID_KEY: 'scm_pipeline_simulator_run_id',

  loadHistory() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load history from localStorage', e);
    }
    // Default seed history if empty
    return [
      {
        runId: 103,
        commitId: 'a8b29f0',
        branch: 'main',
        triggeredBy: 'dev-alex (manual)',
        version: 'v0.1.0',
        result: 'Passed',
        duration: '7.8s',
        timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        stageBreakdown: { lint: 'passed', build: 'passed', test: 'passed', deploy: 'passed' }
      },
      {
        runId: 102,
        commitId: '9a402d1',
        branch: 'feature/auth',
        triggeredBy: 'webhook (push)',
        version: 'v0.2.0-beta.2',
        result: 'Failed at Unit Testing',
        duration: '5.2s',
        timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        stageBreakdown: { lint: 'passed', build: 'passed', test: 'failed', deploy: 'skipped' }
      },
      {
        runId: 101,
        commitId: '6d20e74',
        branch: 'bugfix/parser',
        triggeredBy: 'ci-bot (schedule)',
        version: 'v0.1.2-patch',
        result: 'Passed',
        duration: '6.9s',
        timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
        stageBreakdown: { lint: 'passed', build: 'passed', test: 'passed', deploy: 'passed' }
      }
    ];
  },

  saveHistory(history) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('Failed to save history to localStorage', e);
    }
  },

  getNextRunId() {
    let id = 104;
    try {
      const saved = localStorage.getItem(this.RUN_ID_KEY);
      if (saved) id = parseInt(saved, 10);
    } catch (e) {}
    localStorage.setItem(this.RUN_ID_KEY, (id + 1).toString());
    return id;
  }
};

// --- Terminal Log Generator Helpers ---
function formatLogLine(stageShortName, type, message) {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  return {
    timestamp,
    stage: stageShortName,
    type, // 'info', 'cmd', 'success', 'error', 'warn', 'header'
    message
  };
}

// Generate realistic stage logs based on commit and stage outcome
function getStageLogScript(stageId, commit, willPass) {
  const commitId = commit.id;
  const branch = STATE.selectedBranch;

  switch (stageId) {
    case 'lint':
      if (willPass) {
        return [
          { type: 'cmd', msg: '$ npx eslint --ext .js,.ts,.tsx src/ --max-warnings=0' },
          { type: 'info', msg: 'ESLint v8.57.0 loaded with plugin:@typescript-eslint/recommended' },
          { type: 'info', msg: `Inspecting branch: ${branch} commit: [${commitId}]` },
          { type: 'info', msg: 'Running AST parsing and Prettier code style checks...' },
          { type: 'info', msg: '  ✔ 142 source files analyzed across /src/components, /src/services' },
          { type: 'info', msg: '$ npx tsc --noEmit --strict' },
          { type: 'info', msg: 'TypeScript compiler check: 0 errors, 0 warnings found.' },
          { type: 'success', msg: '✔ Linting & Static Code Analysis completed with exit code 0.' }
        ];
      } else {
        return [
          { type: 'cmd', msg: '$ npx eslint --ext .js,.ts,.tsx src/ --max-warnings=0' },
          { type: 'info', msg: 'ESLint v8.57.0 analyzing changed files...' },
          { type: 'warn', msg: 'Warning: Missing return type on public method in parser.service.ts:42' },
          { type: 'error', msg: 'Error: Parsing error: Unexpected token, expected "," (38:17)' },
          { type: 'error', msg: '  --> src/parser/stream.ts:38:17' },
          { type: 'error', msg: '      37 |   const parsed = JSON.parse(streamBuffer);' },
          { type: 'error', msg: '    > 38 |   return { data: parsed ?? null ' },
          { type: 'error', msg: '         |                                 ^' },
          { type: 'error', msg: '✖ 1 problem (1 error, 1 warning) - 0 errors fixable with --fix' },
          { type: 'error', msg: 'Process completed with exit code 1. [LINT_SYNTAX_ERROR]' }
        ];
      }

    case 'build':
      if (willPass) {
        return [
          { type: 'cmd', msg: `$ npm ci --prefer-offline --no-audit` },
          { type: 'info', msg: 'Restored 842 packages from package-lock.json in 1.4s' },
          { type: 'cmd', msg: '$ vite build --mode production' },
          { type: 'info', msg: 'vite v5.2.0 building for production...' },
          { type: 'info', msg: 'transforming (184) src/main.tsx' },
          { type: 'info', msg: 'dist/assets/index-c4f2.js   248.12 kB │ gzip: 64.21 kB' },
          { type: 'info', msg: 'dist/assets/style-99a1.css    32.40 kB │ gzip:  8.12 kB' },
          { type: 'cmd', msg: `$ docker build -t registry.cloud.internal/app:${STATE.buildVersion} .` },
          { type: 'info', msg: '[1/3] STEP FROM node:20-alpine AS builder' },
          { type: 'info', msg: '[2/3] STEP COPY dist/ /usr/share/nginx/html' },
          { type: 'info', msg: '[3/3] STEP EXPOSE 8080' },
          { type: 'success', msg: `Successfully tagged registry.cloud.internal/app:${STATE.buildVersion} (Image size: 48.2 MB)` }
        ];
      } else {
        return [
          { type: 'cmd', msg: '$ npm ci --prefer-offline' },
          { type: 'info', msg: 'added 842 packages in 1.2s' },
          { type: 'cmd', msg: '$ vite build --mode production' },
          { type: 'error', msg: 'Rollup failed to resolve import "crypto-browserify" from "src/auth/jwt.ts"' },
          { type: 'error', msg: 'Could not resolve "./jwt-vendor-polyfill" from src/auth/jwt.ts' },
          { type: 'error', msg: 'Error: Build failed with 1 fatal module bundling error.' },
          { type: 'error', msg: 'Process completed with exit code 2. [PACKAGING_FAILURE]' }
        ];
      }

    case 'test':
      if (willPass) {
        return [
          { type: 'cmd', msg: '$ npx vitest run --coverage' },
          { type: 'info', msg: 'RUN  v1.4.0 /workspace/src' },
          { type: 'info', msg: ' ✓ src/auth/jwt.spec.ts (6 tests) 142ms' },
          { type: 'info', msg: ' ✓ src/parser/stream.spec.ts (12 tests) 205ms' },
          { type: 'info', msg: ' ✓ src/api/middleware.spec.ts (8 tests) 98ms' },
          { type: 'info', msg: ' ✓ src/utils/formatters.spec.ts (15 tests) 41ms' },
          { type: 'info', msg: '---------------------------------------------------' },
          { type: 'info', msg: 'Test Files  4 passed (4)' },
          { type: 'info', msg: 'Tests       41 passed (41)' },
          { type: 'info', msg: 'Coverage    Statements: 94.2% | Branches: 91.8% | Functions: 96.0%' },
          { type: 'success', msg: '✔ All automated unit & integration test suites passed.' }
        ];
      } else {
        return [
          { type: 'cmd', msg: '$ npx vitest run --coverage' },
          { type: 'info', msg: 'RUN  v1.4.0 /workspace/src' },
          { type: 'info', msg: ' ✓ src/parser/stream.spec.ts (12 tests)' },
          { type: 'info', msg: ' ✓ src/utils/formatters.spec.ts (15 tests)' },
          { type: 'error', msg: ' ✖ src/auth/jwt.spec.ts (6 tests | 1 failed)' },
          { type: 'error', msg: '   → test("should rotate JWT token before expiration")' },
          { type: 'error', msg: '     AssertionError: expected "expired_session" to match "token_refreshed"' },
          { type: 'error', msg: '       at src/auth/jwt.spec.ts:89:14' },
          { type: 'error', msg: '       at Generator.next (<anonymous>)' },
          { type: 'error', msg: 'FAIL  Tests: 1 failed, 40 passed, 41 total' },
          { type: 'error', msg: 'Process completed with exit code 1. [TEST_SUITE_FAILURE]' }
        ];
      }

    case 'deploy':
      if (willPass) {
        return [
          { type: 'cmd', msg: `$ kubectl set image deployment/frontend web=registry.cloud.internal/app:${STATE.buildVersion} -n staging` },
          { type: 'info', msg: 'deployment.apps/frontend image updated in namespace: staging' },
          { type: 'info', msg: 'Waiting for rollout to finish: 0 of 3 updated replicas are available...' },
          { type: 'info', msg: 'Replicas updated: [pod/frontend-7b49cd-x1, pod/frontend-7b49cd-y2, pod/frontend-7b49cd-z3]' },
          { type: 'cmd', msg: '$ curl -s -f -o /dev/null https://staging.app.internal/healthz' },
          { type: 'info', msg: 'HTTP/2 200 OK - Health probe returned healthy (latency: 18ms)' },
          { type: 'info', msg: 'Running automated staging smoke tests [4/4 checks OK]' },
          { type: 'success', msg: `🚀 Successfully deployed version ${STATE.buildVersion} to Staging Environment!` }
        ];
      } else {
        return [
          { type: 'cmd', msg: `$ kubectl rollout status deployment/frontend -n staging --timeout=60s` },
          { type: 'warn', msg: 'Waiting for deployment "frontend" rollout to finish: 1 of 3 updated replicas available...' },
          { type: 'error', msg: 'Pod frontend-7b49cd-x1 failed liveness probe: HTTP probe failed with statuscode: 503' },
          { type: 'error', msg: 'CrashLoopBackOff: Container failed initialization checks' },
          { type: 'error', msg: 'Rollback initiated to previous stable revision.' },
          { type: 'error', msg: 'Deployment aborted. [DEPLOY_TIMEOUT_HEALTH_FAILED]' }
        ];
      }

    default:
      return [];
  }
}

// --- Main Application UI Controller ---
class PipelineSimulatorApp {
  constructor() {
    this.audio = audio;
    this.timerInterval = null;
    this.pipelineStartTime = 0;
  }

  init() {
    // 1. Load SCM history
    STATE.history = Storage.loadHistory();

    // 2. Setup DOM Event Listeners
    this.bindEvents();

    // 3. Render Initial State
    this.renderBranchOptions();
    this.renderCommitOptions();
    this.updateCommitDetailsDisplay();
    this.renderPipelineStages();
    this.renderHistoryTable();
    this.renderMetricsSummary();
    this.renderTerminalLogs();

    console.log('CI/CD Pipeline Simulator initialized.');
  }

  bindEvents() {
    // Branch Selection
    const branchSelect = document.getElementById('branch-select');
    if (branchSelect) {
      branchSelect.addEventListener('change', (e) => {
        STATE.selectedBranch = e.target.value;
        this.renderCommitOptions();
        this.updateCommitDetailsDisplay();
      });
    }

    // Commit Selection
    const commitSelect = document.getElementById('commit-select');
    if (commitSelect) {
      commitSelect.addEventListener('change', (e) => {
        STATE.selectedCommitId = e.target.value;
        this.updateCommitDetailsDisplay();
      });
    }

    // Run Pipeline Trigger Button
    const runBtn = document.getElementById('run-pipeline-btn');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        if (STATE.isRunning) {
          this.abortPipeline();
        } else {
          this.startPipeline();
        }
      });
    }

    // Speed Controls
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = parseFloat(e.currentTarget.dataset.speed);
        STATE.speedMultiplier = speed;
        document.querySelectorAll('.speed-btn').forEach(b => {
          b.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
          b.classList.add('bg-slate-800', 'text-slate-400', 'border-slate-700');
        });
        e.currentTarget.classList.remove('bg-slate-800', 'text-slate-400', 'border-slate-700');
        e.currentTarget.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
      });
    });

    // Sound toggle
    const soundToggle = document.getElementById('sound-toggle-btn');
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        STATE.soundEnabled = !STATE.soundEnabled;
        soundToggle.innerHTML = STATE.soundEnabled
          ? '<i class="fa-solid fa-volume-high text-emerald-400"></i>'
          : '<i class="fa-solid fa-volume-xmark text-slate-500"></i>';
        soundToggle.title = STATE.soundEnabled ? 'Sound Effects Enabled' : 'Sound Effects Muted';
      });
    }

    // Terminal stage filters
    document.querySelectorAll('.terminal-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const stage = e.currentTarget.dataset.stage;
        STATE.activeFilterStage = stage;
        document.querySelectorAll('.terminal-filter-btn').forEach(b => {
          b.classList.remove('bg-slate-700', 'text-white');
          b.classList.add('text-slate-400');
        });
        e.currentTarget.classList.add('bg-slate-700', 'text-white');
        e.currentTarget.classList.remove('text-slate-400');
        this.renderTerminalLogs();
      });
    });

    // Terminal search
    const termSearch = document.getElementById('terminal-search');
    if (termSearch) {
      termSearch.addEventListener('input', (e) => {
        STATE.terminalSearchQuery = e.target.value.toLowerCase().trim();
        this.renderTerminalLogs();
      });
    }

    // Terminal Clear
    const clearTermBtn = document.getElementById('clear-terminal-btn');
    if (clearTermBtn) {
      clearTermBtn.addEventListener('click', () => {
        STATE.allLogs = [];
        STATE.stages.forEach(s => s.logs = []);
        this.renderTerminalLogs();
      });
    }

    // Terminal Copy
    const copyTermBtn = document.getElementById('copy-terminal-btn');
    if (copyTermBtn) {
      copyTermBtn.addEventListener('click', () => {
        const text = STATE.allLogs.map(l => `[${l.timestamp}] [${l.stage}] ${l.message}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
          const original = copyTermBtn.innerHTML;
          copyTermBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Copied!';
          setTimeout(() => { copyTermBtn.innerHTML = original; }, 2000);
        });
      });
    }

    // Terminal Download
    const downloadTermBtn = document.getElementById('download-terminal-btn');
    if (downloadTermBtn) {
      downloadTermBtn.addEventListener('click', () => {
        const text = STATE.allLogs.map(l => `[${l.timestamp}] [${l.stage}] ${l.message}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pipeline-run-#${STATE.currentRunId}.log`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Auto-scroll toggle
    const autoScrollBtn = document.getElementById('toggle-autoscroll-btn');
    if (autoScrollBtn) {
      autoScrollBtn.addEventListener('click', () => {
        STATE.autoScrollTerminal = !STATE.autoScrollTerminal;
        autoScrollBtn.classList.toggle('text-emerald-400', STATE.autoScrollTerminal);
        autoScrollBtn.classList.toggle('text-slate-500', !STATE.autoScrollTerminal);
      });
    }

    // New Commit Modal Trigger & Form
    const openCommitModalBtn = document.getElementById('open-commit-modal-btn');
    const commitModal = document.getElementById('commit-modal');
    const closeCommitModalBtn = document.getElementById('close-commit-modal-btn');
    const cancelCommitModalBtn = document.getElementById('cancel-commit-modal-btn');
    const commitForm = document.getElementById('create-commit-form');

    if (openCommitModalBtn && commitModal) {
      openCommitModalBtn.addEventListener('click', () => {
        commitModal.classList.remove('hidden');
        commitModal.classList.add('flex');
      });
    }

    const closeModal = () => {
      if (commitModal) {
        commitModal.classList.add('hidden');
        commitModal.classList.remove('flex');
      }
    };

    if (closeCommitModalBtn) closeCommitModalBtn.addEventListener('click', closeModal);
    if (cancelCommitModalBtn) cancelCommitModalBtn.addEventListener('click', closeModal);

    if (commitForm) {
      commitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const branchInput = document.getElementById('modal-branch-input').value.trim();
        const msgInput = document.getElementById('modal-msg-input').value.trim();
        const authorInput = document.getElementById('modal-author-input').value.trim() || 'dev-alex';
        const versionInput = document.getElementById('modal-version-input').value.trim() || 'v0.1.0';
        const presetBehavior = document.getElementById('modal-behavior-select').value;

        // Generate short 7-character hash
        const newHash = Math.random().toString(16).substring(2, 9);

        // Ensure branch exists in repo
        if (!STATE.repository[branchInput]) {
          STATE.repository[branchInput] = [];
        }

        const newCommit = {
          id: newHash,
          message: msgInput,
          author: authorInput,
          timestamp: 'Just now',
          version: versionInput,
          presetBehavior: presetBehavior
        };

        STATE.repository[branchInput].unshift(newCommit);
        STATE.selectedBranch = branchInput;
        STATE.selectedCommitId = newHash;

        this.renderBranchOptions();
        this.renderCommitOptions();
        this.updateCommitDetailsDisplay();
        closeModal();
      });
    }

    // Modal File Upload Handler (Simulated Git Patch/Commit Upload)
    const fileUploadInput = document.getElementById('modal-file-upload');
    if (fileUploadInput) {
      fileUploadInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const msgInput = document.getElementById('modal-msg-input');
          if (msgInput) {
            msgInput.value = `chore(upload): apply diff from ${file.name}`;
          }
        }
      });
    }

    // History Table Controls (Filter & Export & Clear)
    const historyBranchFilter = document.getElementById('history-branch-filter');
    if (historyBranchFilter) {
      historyBranchFilter.addEventListener('change', () => this.renderHistoryTable());
    }

    const historyResultFilter = document.getElementById('history-result-filter');
    if (historyResultFilter) {
      historyResultFilter.addEventListener('change', () => this.renderHistoryTable());
    }

    const historySearch = document.getElementById('history-search');
    if (historySearch) {
      historySearch.addEventListener('input', () => this.renderHistoryTable());
    }

    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the SCM Pipeline execution accounting history?')) {
          STATE.history = [];
          Storage.saveHistory(STATE.history);
          this.renderHistoryTable();
          this.renderMetricsSummary();
        }
      });
    }

    const exportHistoryBtn = document.getElementById('export-history-btn');
    if (exportHistoryBtn) {
      exportHistoryBtn.addEventListener('click', () => {
        this.exportHistoryCsv();
      });
    }
  }

  renderBranchOptions() {
    const branchSelect = document.getElementById('branch-select');
    if (!branchSelect) return;

    const branches = Object.keys(STATE.repository);
    branchSelect.innerHTML = branches.map(b => `
      <option value="${b}" ${b === STATE.selectedBranch ? 'selected' : ''}>
        🌱 ${b}
      </option>
    `).join('');
  }

  renderCommitOptions() {
    const commitSelect = document.getElementById('commit-select');
    if (!commitSelect) return;

    const commits = STATE.repository[STATE.selectedBranch] || [];
    if (commits.length === 0) {
      commitSelect.innerHTML = `<option value="">No commits available</option>`;
      return;
    }

    // Check if current selected commit exists in this branch, otherwise pick the first
    const exists = commits.some(c => c.id === STATE.selectedCommitId);
    if (!exists) {
      STATE.selectedCommitId = commits[0].id;
    }

    commitSelect.innerHTML = commits.map(c => `
      <option value="${c.id}" ${c.id === STATE.selectedCommitId ? 'selected' : ''}>
        [${c.id}] ${c.message.length > 40 ? c.message.substring(0, 40) + '...' : c.message}
      </option>
    `).join('');
  }

  getCurrentCommit() {
    const commits = STATE.repository[STATE.selectedBranch] || [];
    return commits.find(c => c.id === STATE.selectedCommitId) || commits[0] || {
      id: 'a8b29f0',
      message: 'Initial commit baseline',
      author: 'dev-alex',
      version: 'v0.1.0',
      timestamp: 'just now',
      presetBehavior: 'pass-all'
    };
  }

  updateCommitDetailsDisplay() {
    const commit = this.getCurrentCommit();
    STATE.buildVersion = commit.version || 'v0.1.0';

    const commitHashBadge = document.getElementById('current-commit-hash');
    const commitMsgBadge = document.getElementById('current-commit-msg');
    const commitAuthorBadge = document.getElementById('current-commit-author');
    const commitVersionBadge = document.getElementById('current-commit-version');
    const presetBadge = document.getElementById('current-commit-preset');

    if (commitHashBadge) commitHashBadge.textContent = commit.id;
    if (commitMsgBadge) commitMsgBadge.textContent = commit.message;
    if (commitAuthorBadge) commitAuthorBadge.textContent = commit.author;
    if (commitVersionBadge) commitVersionBadge.textContent = commit.version;

    if (presetBadge) {
      let badgeHtml = '';
      if (commit.presetBehavior === 'fail-lint') {
        badgeHtml = '<span class="px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30">Will Fail Lint</span>';
      } else if (commit.presetBehavior === 'fail-build') {
        badgeHtml = '<span class="px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30">Will Fail Build</span>';
      } else if (commit.presetBehavior === 'fail-test') {
        badgeHtml = '<span class="px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30">Will Fail Tests</span>';
      } else if (commit.presetBehavior === 'fail-deploy') {
        badgeHtml = '<span class="px-2 py-0.5 rounded text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30">Will Fail Deploy</span>';
      } else {
        badgeHtml = '<span class="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Healthy (All Pass)</span>';
      }
      presetBadge.innerHTML = badgeHtml;
    }
  }

  renderPipelineStages() {
    const container = document.getElementById('pipeline-stages-container');
    if (!container) return;

    container.innerHTML = STATE.stages.map((stage, idx) => {
      // Status badge appearance
      let statusColor = 'text-slate-400 bg-slate-800 border-slate-700';
      let statusIcon = '<i class="fa-regular fa-clock mr-1"></i> Idle';
      let cardBorder = 'border-slate-800';
      let cardAnim = '';

      if (stage.status === 'running') {
        statusColor = 'text-blue-400 bg-blue-500/20 border-blue-500/40';
        statusIcon = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Running';
        cardBorder = 'border-blue-500';
        cardAnim = 'stage-card-running';
      } else if (stage.status === 'passed') {
        statusColor = 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40';
        statusIcon = '<i class="fa-solid fa-circle-check mr-1"></i> Passed';
        cardBorder = 'stage-card-passed';
      } else if (stage.status === 'failed') {
        statusColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40';
        statusIcon = '<i class="fa-solid fa-circle-xmark mr-1"></i> Failed';
        cardBorder = 'stage-card-failed';
      } else if (stage.status === 'skipped') {
        statusColor = 'text-amber-400 bg-amber-500/20 border-amber-500/40';
        statusIcon = '<i class="fa-solid fa-forward-step mr-1"></i> Skipped';
        cardBorder = 'border-slate-800 opacity-60';
      }

      // Connector line indicator (arrow between stages)
      const hasNext = idx < STATE.stages.length - 1;
      const isNextActive = hasNext && (stage.status === 'passed' && STATE.stages[idx + 1].status === 'running');
      const isConnectorDone = hasNext && (stage.status === 'passed' && (STATE.stages[idx + 1].status === 'passed' || STATE.stages[idx + 1].status === 'failed'));

      return `
        <div class="relative flex-1 min-w-[240px] flex items-center">
          <!-- Stage Card -->
          <div class="w-full glass-panel-elevated p-4 rounded-xl border transition-all duration-300 relative group ${cardBorder} ${cardAnim}">
            <!-- Header: Step number & Icon -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center space-x-2">
                <span class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                  ${idx + 1}
                </span>
                <span class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-sm">
                  <i class="fa-solid ${stage.icon}"></i>
                </span>
                <h4 class="font-semibold text-sm text-slate-200 tracking-tight">${stage.name}</h4>
              </div>
              
              <!-- Quick Filter logs on click -->
              <button 
                onclick="window.pipelineApp.filterTerminalToStage('${stage.shortName}')" 
                class="text-xs text-slate-400 hover:text-indigo-400 p-1 transition-colors" 
                title="View logs for this stage">
                <i class="fa-solid fa-terminal"></i>
              </button>
            </div>

            <!-- Subtitle / Tool info -->
            <p class="text-[11px] text-slate-400 font-mono mb-3 truncate" title="${stage.tool}">
              ${stage.tool}
            </p>

            <!-- Status Badge & Duration -->
            <div class="flex items-center justify-between py-2 border-t border-slate-700/50">
              <button 
                onclick="window.pipelineApp.cycleStageStatus('${stage.id}')"
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-all ${statusColor}"
                title="Click to cycle status: Idle -> Running -> Passed -> Failed">
                ${statusIcon}
              </button>
              <span class="text-xs font-mono text-slate-400">
                <i class="fa-regular fa-stopwatch mr-1 text-slate-500"></i>
                ${stage.duration > 0 ? stage.duration.toFixed(1) + 's' : '--'}
              </span>
            </div>

            <!-- Explicit Status Toggle: Passed | Running | Failed (Requested Feature) -->
            <div class="mt-2 pt-2 border-t border-slate-800/90 space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-[10px] uppercase font-bold tracking-wider text-slate-400">Status Toggle:</span>
                <span class="text-[10px] text-slate-500 font-mono">click to set</span>
              </div>
              <div class="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-[11px] font-medium">
                <button 
                  onclick="window.pipelineApp.manuallySetStageStatus('${stage.id}', 'passed')"
                  class="py-1 px-1 rounded transition-all flex items-center justify-center space-x-1 ${stage.status === 'passed' ? 'bg-emerald-600 text-white font-bold shadow-sm shadow-emerald-500/30 ring-1 ring-emerald-400' : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800'}"
                  title="Set status to Passed and output terminal logs">
                  <i class="fa-solid fa-check text-[10px]"></i>
                  <span>Passed</span>
                </button>
                <button 
                  onclick="window.pipelineApp.manuallySetStageStatus('${stage.id}', 'running')"
                  class="py-1 px-1 rounded transition-all flex items-center justify-center space-x-1 ${stage.status === 'running' ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/30 ring-1 ring-blue-400 animate-pulse' : 'text-slate-400 hover:text-blue-300 hover:bg-slate-800'}"
                  title="Set status to Running and output terminal logs">
                  <i class="fa-solid fa-spinner fa-spin text-[10px]"></i>
                  <span>Running</span>
                </button>
                <button 
                  onclick="window.pipelineApp.manuallySetStageStatus('${stage.id}', 'failed')"
                  class="py-1 px-1 rounded transition-all flex items-center justify-center space-x-1 ${stage.status === 'failed' ? 'bg-rose-600 text-white font-bold shadow-sm shadow-rose-500/30 ring-1 ring-rose-400' : 'text-slate-400 hover:text-rose-300 hover:bg-slate-800'}"
                  title="Set status to Failed and output terminal logs">
                  <i class="fa-solid fa-xmark text-[10px]"></i>
                  <span>Failed</span>
                </button>
              </div>
            </div>

            <!-- Execution Pipeline Behavior Override -->
            <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span class="text-[10px] uppercase font-bold tracking-wider text-slate-500">Pipeline Rule:</span>
              <div class="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800 text-[10px]">
                <button 
                  onclick="window.pipelineApp.setStageOverride('${stage.id}', 'auto')"
                  class="px-1.5 py-0.5 rounded transition-colors ${stage.override === 'auto' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-500 hover:text-slate-300'}"
                  title="Auto from commit">
                  Auto
                </button>
                <button 
                  onclick="window.pipelineApp.setStageOverride('${stage.id}', 'force-pass')"
                  class="px-1.5 py-0.5 rounded transition-colors ${stage.override === 'force-pass' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-500 hover:text-emerald-400'}"
                  title="Always Pass">
                  Pass
                </button>
                <button 
                  onclick="window.pipelineApp.setStageOverride('${stage.id}', 'force-fail')"
                  class="px-1.5 py-0.5 rounded transition-colors ${stage.override === 'force-fail' ? 'bg-rose-600 text-white font-medium' : 'text-slate-500 hover:text-rose-400'}"
                  title="Always Fail">
                  Fail
                </button>
              </div>
            </div>
          </div>

          <!-- Connecting Arrow (Visible on desktop) -->
          ${hasNext ? `
            <div class="hidden lg:flex items-center justify-center w-8 shrink-0 relative z-10">
              <div class="w-full h-0.5 ${isConnectorDone ? 'bg-emerald-500' : (isNextActive ? 'bg-blue-500 animate-pulse' : 'bg-slate-700')}"></div>
              <i class="fa-solid fa-chevron-right text-[11px] absolute ${isConnectorDone ? 'text-emerald-400' : (isNextActive ? 'text-blue-400 animate-bounce' : 'text-slate-600')}"></i>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  cycleStageStatus(stageId) {
    const stage = STATE.stages.find(s => s.id === stageId);
    if (!stage) return;
    const states = ['idle', 'running', 'passed', 'failed'];
    const nextIdx = (states.indexOf(stage.status) + 1) % states.length;
    this.manuallySetStageStatus(stageId, states[nextIdx]);
  }

  manuallySetStageStatus(stageId, newStatus) {
    const stage = STATE.stages.find(s => s.id === stageId);
    if (!stage) return;

    stage.status = newStatus;
    const commit = this.getCurrentCommit();

    if (newStatus === 'running') {
      stage.duration = 1.2;
      this.audio.playStageStart();
      this.appendLog(stage.shortName, 'header', `\n[STAGE STATUS TOGGLED -> RUNNING] ${stage.name}`);
      this.appendLog(stage.shortName, 'cmd', `$ ${stage.tool} --verbose --dry-run=false`);
      this.appendLog(stage.shortName, 'info', `Initialized execution worker container in staging cluster...`);
      this.appendLog(stage.shortName, 'info', `Streaming telemetry logs for stage: ${stage.name}`);
    } else if (newStatus === 'passed') {
      stage.duration = 2.4;
      this.audio.playStageSuccess();
      this.appendLog(stage.shortName, 'header', `\n[STAGE STATUS TOGGLED -> PASSED] ${stage.name}`);
      const logs = getStageLogScript(stage.id, commit, true);
      logs.forEach(l => this.appendLog(stage.shortName, l.type, l.msg));
    } else if (newStatus === 'failed') {
      stage.duration = 1.9;
      this.audio.playStageFail();
      this.appendLog(stage.shortName, 'header', `\n[STAGE STATUS TOGGLED -> FAILED] ${stage.name}`);
      const logs = getStageLogScript(stage.id, commit, false);
      logs.forEach(l => this.appendLog(stage.shortName, l.type, l.msg));
    } else {
      stage.status = 'idle';
      stage.duration = 0;
    }

    // Automatically focus terminal filter on this stage so the user instantly sees the log output
    this.filterTerminalToStage(stage.shortName);
    this.renderPipelineStages();
    this.updateProgressBar();
  }

  setStageOverride(stageId, override) {
    const stage = STATE.stages.find(s => s.id === stageId);
    if (stage) {
      stage.override = override;
      this.renderPipelineStages();
    }
  }

  filterTerminalToStage(stageShortName) {
    STATE.activeFilterStage = stageShortName;
    document.querySelectorAll('.terminal-filter-btn').forEach(b => {
      if (b.dataset.stage === stageShortName) {
        b.classList.add('bg-slate-700', 'text-white');
        b.classList.remove('text-slate-400');
      } else {
        b.classList.remove('bg-slate-700', 'text-white');
        b.classList.add('text-slate-400');
      }
    });
    this.renderTerminalLogs();
  }

  renderTerminalLogs() {
    const terminalBody = document.getElementById('terminal-content');
    if (!terminalBody) return;

    let logs = STATE.allLogs;

    // Filter by stage if selected
    if (STATE.activeFilterStage !== 'all') {
      logs = logs.filter(l => l.stage.toLowerCase() === STATE.activeFilterStage.toLowerCase());
    }

    // Filter by search query if present
    if (STATE.terminalSearchQuery) {
      logs = logs.filter(l => l.message.toLowerCase().includes(STATE.terminalSearchQuery));
    }

    if (logs.length === 0) {
      terminalBody.innerHTML = `
        <div class="py-12 text-center text-slate-500 font-mono text-sm">
          <i class="fa-solid fa-terminal mb-2 text-2xl block text-slate-600"></i>
          <span>No terminal log outputs recorded for the current filter. Click "Run Pipeline" to start.</span>
        </div>
      `;
      return;
    }

    terminalBody.innerHTML = logs.map(log => {
      let colorClass = 'text-slate-300';
      let badgeClass = 'text-slate-500 bg-slate-800/60';

      if (log.type === 'cmd') {
        colorClass = 'text-cyan-300 font-semibold';
      } else if (log.type === 'success') {
        colorClass = 'text-emerald-400 font-medium';
        badgeClass = 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40';
      } else if (log.type === 'error') {
        colorClass = 'text-rose-400 font-bold';
        badgeClass = 'text-rose-400 bg-rose-950/60 border border-rose-800/40';
      } else if (log.type === 'warn') {
        colorClass = 'text-amber-300';
        badgeClass = 'text-amber-400 bg-amber-950/60 border border-amber-800/40';
      } else if (log.type === 'header') {
        colorClass = 'text-indigo-300 font-bold';
        badgeClass = 'text-indigo-400 bg-indigo-950/60 border border-indigo-800/40';
      }

      return `
        <div class="flex items-start space-x-2 py-0.5 leading-relaxed hover:bg-slate-800/30 px-1 rounded transition-colors font-mono text-xs">
          <span class="text-slate-600 select-none text-[10px] w-16 shrink-0">${log.timestamp}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold tracking-wider shrink-0 select-none ${badgeClass}">
            ${log.stage}
          </span>
          <span class="break-all whitespace-pre-wrap ${colorClass}">${this.escapeHtml(log.message)}</span>
        </div>
      `;
    }).join('');

    if (STATE.autoScrollTerminal) {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  }

  appendLog(stageShortName, type, message) {
    const logItem = formatLogLine(stageShortName, type, message);
    STATE.allLogs.push(logItem);

    const stageObj = STATE.stages.find(s => s.shortName.toLowerCase() === stageShortName.toLowerCase());
    if (stageObj) {
      stageObj.logs.push(logItem);
    }

    this.renderTerminalLogs();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Pipeline Execution Machine ---
  async startPipeline() {
    if (STATE.isRunning) return;

    STATE.isRunning = true;
    STATE.isPaused = false;
    STATE.currentRunId = Storage.getNextRunId();
    this.pipelineStartTime = Date.now();

    // Reset stages
    STATE.stages.forEach(s => {
      s.status = 'idle';
      s.duration = 0;
      s.logs = [];
    });
    STATE.allLogs = [];

    this.updateRunButton(true);
    this.renderPipelineStages();
    this.renderTerminalLogs();

    const commit = this.getCurrentCommit();

    // Log banner
    this.appendLog('SYS', 'header', `========================================================================`);
    this.appendLog('SYS', 'header', `🚀 CI/CD Pipeline Execution Triggered for Build #${STATE.currentRunId}`);
    this.appendLog('SYS', 'info', `Commit ID     : ${commit.id} ("${commit.message}")`);
    this.appendLog('SYS', 'info', `Target Branch : ${STATE.selectedBranch}`);
    this.appendLog('SYS', 'info', `Triggered By  : ${STATE.triggeredBy}`);
    this.appendLog('SYS', 'info', `Build Version : ${STATE.buildVersion}`);
    this.appendLog('SYS', 'info', `Runner Host   : k8s-runner-pool-prod-04 (Ubuntu 22.04 LTS x86_64)`);
    this.appendLog('SYS', 'header', `========================================================================\n`);

    let pipelinePassed = true;
    let failedStageName = '';

    // Execute stages sequentially
    for (let i = 0; i < STATE.stages.length; i++) {
      if (!STATE.isRunning) {
        // Aborted
        pipelinePassed = false;
        failedStageName = 'Aborted manually';
        break;
      }

      STATE.currentStageIndex = i;
      const stage = STATE.stages[i];

      // Mark running
      stage.status = 'running';
      this.renderPipelineStages();
      this.updateProgressBar();
      this.audio.playStageStart();

      this.appendLog(stage.shortName, 'header', `\n--- Stage [${i + 1}/${STATE.stages.length}]: ${stage.name} ---`);

      // Determine outcome based on override or commit preset
      const willPass = this.determineStageOutcome(stage, commit);

      const stageStart = Date.now();
      const logs = getStageLogScript(stage.id, commit, willPass);

      // Stream logs with timed delay
      for (const item of logs) {
        if (!STATE.isRunning) break;
        this.appendLog(stage.shortName, item.type, item.msg);

        // Simulated time delay per line adjusted by speedMultiplier
        const baseDelay = 180 / STATE.speedMultiplier;
        await this.sleep(baseDelay);
      }

      stage.duration = (Date.now() - stageStart) / 1000;

      if (!willPass) {
        stage.status = 'failed';
        pipelinePassed = false;
        failedStageName = stage.name;
        this.audio.playStageFail();
        this.appendLog(stage.shortName, 'error', `✖ Stage failed. Halting pipeline execution.`);
        
        // Mark subsequent stages as skipped
        for (let j = i + 1; j < STATE.stages.length; j++) {
          STATE.stages[j].status = 'skipped';
          STATE.stages[j].duration = 0;
        }
        break;
      } else {
        stage.status = 'passed';
        this.audio.playStageSuccess();
        this.appendLog(stage.shortName, 'success', `✔ Stage completed successfully in ${stage.duration.toFixed(1)}s.`);
      }

      this.renderPipelineStages();
      this.updateProgressBar();
    }

    // Pipeline finish handling
    const totalDuration = ((Date.now() - this.pipelineStartTime) / 1000).toFixed(1) + 's';
    STATE.isRunning = false;
    this.updateRunButton(false);
    this.renderPipelineStages();
    this.updateProgressBar();

    const finalResult = pipelinePassed ? 'Passed' : `Failed at ${failedStageName}`;

    if (pipelinePassed) {
      this.audio.playPipelineComplete();
      this.appendLog('SYS', 'success', `\n🎉 PIPELINE SUCCESSFUL: All stages passed in ${totalDuration}. Ready for production release.`);
      this.triggerStagingBannerSuccess();
    } else {
      this.appendLog('SYS', 'error', `\n💥 PIPELINE FAILED: Execution aborted at stage "${failedStageName}". Check logs for diagnostic breakdown.`);
    }

    // Record into persistent SCM Accounting Table
    const breakdown = {};
    STATE.stages.forEach(s => breakdown[s.id] = s.status);

    const record = {
      runId: STATE.currentRunId,
      commitId: commit.id,
      branch: STATE.selectedBranch,
      triggeredBy: STATE.triggeredBy,
      version: STATE.buildVersion,
      result: finalResult,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      stageBreakdown: breakdown
    };

    STATE.history.unshift(record);
    Storage.saveHistory(STATE.history);

    this.renderHistoryTable();
    this.renderMetricsSummary();
  }

  determineStageOutcome(stage, commit) {
    // 1. Check direct override toggle
    if (stage.override === 'force-pass') return true;
    if (stage.override === 'force-fail') return false;

    // 2. Otherwise use commit's preset behavior
    const preset = commit.presetBehavior || 'pass-all';

    if (preset === 'fail-lint' && stage.id === 'lint') return false;
    if (preset === 'fail-build' && stage.id === 'build') return false;
    if (preset === 'fail-test' && stage.id === 'test') return false;
    if (preset === 'fail-deploy' && stage.id === 'deploy') return false;

    return true;
  }

  abortPipeline() {
    STATE.isRunning = false;
    this.appendLog('SYS', 'warn', 'Pipeline execution aborted by user intervention.');
    this.updateRunButton(false);
  }

  updateRunButton(isRunning) {
    const btn = document.getElementById('run-pipeline-btn');
    if (!btn) return;

    if (isRunning) {
      btn.innerHTML = '<i class="fa-solid fa-stop mr-2"></i> Abort Pipeline';
      btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-500', 'border-emerald-500');
      btn.classList.add('bg-rose-600', 'hover:bg-rose-500', 'border-rose-500');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-play mr-2"></i> Run Pipeline';
      btn.classList.remove('bg-rose-600', 'hover:bg-rose-500', 'border-rose-500');
      btn.classList.add('bg-emerald-600', 'hover:bg-emerald-500', 'border-emerald-500');
    }
  }

  updateProgressBar() {
    const bar = document.getElementById('pipeline-progress-bar');
    const label = document.getElementById('pipeline-progress-label');
    if (!bar) return;

    const total = STATE.stages.length;
    const completed = STATE.stages.filter(s => s.status === 'passed').length;
    const failed = STATE.stages.filter(s => s.status === 'failed').length;
    const running = STATE.stages.filter(s => s.status === 'running').length;

    let pct = 0;
    if (completed === total) {
      pct = 100;
    } else {
      pct = Math.round(((completed + (running ? 0.5 : 0)) / total) * 100);
    }

    bar.style.width = `${pct}%`;

    if (failed > 0) {
      bar.className = 'h-full transition-all duration-300 bg-rose-500';
    } else if (completed === total) {
      bar.className = 'h-full transition-all duration-300 bg-emerald-500';
    } else {
      bar.className = 'h-full transition-all duration-300 bg-indigo-500';
    }

    if (label) {
      label.textContent = `${pct}%`;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  triggerStagingBannerSuccess() {
    const banner = document.getElementById('staging-live-card');
    if (banner) {
      banner.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-950/20');
      const verSpan = document.getElementById('live-staging-version');
      if (verSpan) verSpan.textContent = STATE.buildVersion;
      setTimeout(() => {
        banner.classList.remove('ring-2', 'ring-emerald-500');
      }, 3000);
    }
  }

  // --- SCM Accounting Table & Metrics ---
  renderHistoryTable() {
    const tbody = document.getElementById('scm-history-tbody');
    const countBadge = document.getElementById('history-count-badge');
    if (!tbody) return;

    let items = [...STATE.history];

    // Filter by branch
    const branchFilter = document.getElementById('history-branch-filter')?.value || 'all';
    if (branchFilter !== 'all') {
      items = items.filter(i => i.branch === branchFilter);
    }

    // Filter by result
    const resultFilter = document.getElementById('history-result-filter')?.value || 'all';
    if (resultFilter === 'passed') {
      items = items.filter(i => i.result === 'Passed');
    } else if (resultFilter === 'failed') {
      items = items.filter(i => i.result.startsWith('Failed'));
    }

    // Search query
    const searchQuery = document.getElementById('history-search')?.value.toLowerCase().trim() || '';
    if (searchQuery) {
      items = items.filter(i => 
        i.commitId.toLowerCase().includes(searchQuery) ||
        i.triggeredBy.toLowerCase().includes(searchQuery) ||
        i.version.toLowerCase().includes(searchQuery) ||
        i.branch.toLowerCase().includes(searchQuery)
      );
    }

    if (countBadge) countBadge.textContent = `${items.length} records`;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-slate-500 font-mono text-sm">
            <i class="fa-solid fa-folder-open mb-2 text-xl block text-slate-600"></i>
            No matching SCM pipeline execution history found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items.map(item => {
      const isSuccess = item.result === 'Passed';
      const resultBadge = isSuccess
        ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
             <i class="fa-solid fa-circle-check mr-1.5"></i> Passed
           </span>`
        : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
             <i class="fa-solid fa-circle-xmark mr-1.5"></i> ${item.result}
           </span>`;

      // Formatted date
      const dateStr = new Date(item.timestamp).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-850 transition-colors group">
          <!-- Build ID -->
          <td class="py-3 px-4 font-mono font-bold text-slate-300 text-xs">
            #${item.runId}
          </td>

          <!-- Commit ID -->
          <td class="py-3 px-4">
            <button 
              onclick="window.pipelineApp.selectHistoryCommit('${item.branch}', '${item.commitId}')" 
              class="inline-flex items-center space-x-1 font-mono text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 hover:border-indigo-500/40 transition-colors"
              title="Load this commit into simulator">
              <i class="fa-solid fa-code-commit text-[10px]"></i>
              <span>${item.commitId}</span>
            </button>
          </td>

          <!-- Branch -->
          <td class="py-3 px-4">
            <span class="inline-flex items-center space-x-1.5 text-xs text-slate-300 font-mono">
              <i class="fa-solid fa-code-branch text-emerald-400"></i>
              <span class="truncate max-w-[130px]" title="${item.branch}">${item.branch}</span>
            </span>
          </td>

          <!-- Triggered By -->
          <td class="py-3 px-4 text-xs text-slate-300">
            <div class="flex items-center space-x-1.5">
              <span class="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-300 font-bold">
                ${item.triggeredBy.charAt(0).toUpperCase()}
              </span>
              <span>${item.triggeredBy}</span>
            </div>
          </td>

          <!-- Build Version -->
          <td class="py-3 px-4 font-mono text-xs font-medium text-amber-300">
            <span class="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              ${item.version}
            </span>
          </td>

          <!-- Result -->
          <td class="py-3 px-4">
            ${resultBadge}
          </td>

          <!-- Timestamp & Actions -->
          <td class="py-3 px-4 text-right">
            <div class="flex items-center justify-end space-x-2">
              <span class="text-xs text-slate-400 font-mono hidden md:inline" title="${item.timestamp}">
                ${dateStr} (${item.duration})
              </span>
              <button 
                onclick="window.pipelineApp.deleteHistoryItem(${item.runId})"
                class="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-all" 
                title="Delete entry">
                <i class="fa-regular fa-trash-can text-xs"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  selectHistoryCommit(branch, commitId) {
    if (STATE.repository[branch]) {
      STATE.selectedBranch = branch;
      STATE.selectedCommitId = commitId;
      this.renderBranchOptions();
      this.renderCommitOptions();
      this.updateCommitDetailsDisplay();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  deleteHistoryItem(runId) {
    STATE.history = STATE.history.filter(h => h.runId !== runId);
    Storage.saveHistory(STATE.history);
    this.renderHistoryTable();
    this.renderMetricsSummary();
  }

  exportHistoryCsv() {
    if (STATE.history.length === 0) {
      alert('No history records to export.');
      return;
    }

    const headers = ['Run ID', 'Commit ID', 'Branch', 'Triggered By', 'Version', 'Result', 'Duration', 'Timestamp'];
    const rows = STATE.history.map(item => [
      item.runId,
      item.commitId,
      `"${item.branch}"`,
      `"${item.triggeredBy}"`,
      `"${item.version}"`,
      `"${item.result}"`,
      `"${item.duration}"`,
      `"${item.timestamp}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `scm_accounting_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  renderMetricsSummary() {
    const total = STATE.history.length;
    const passed = STATE.history.filter(h => h.result === 'Passed').length;
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 100;

    const totalBuildsEl = document.getElementById('metric-total-builds');
    const successRateEl = document.getElementById('metric-success-rate');
    const activeVersionEl = document.getElementById('metric-active-version');

    if (totalBuildsEl) totalBuildsEl.textContent = total.toString();
    if (successRateEl) {
      successRateEl.textContent = `${successRate}%`;
      successRateEl.className = `text-2xl font-bold font-mono ${successRate >= 80 ? 'text-emerald-400' : (successRate >= 50 ? 'text-amber-400' : 'text-rose-400')}`;
    }
    if (activeVersionEl) activeVersionEl.textContent = STATE.buildVersion;
  }
}

// Global bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.pipelineApp = new PipelineSimulatorApp();
  window.pipelineApp.init();
});
