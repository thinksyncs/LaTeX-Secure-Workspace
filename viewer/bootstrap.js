const postLog = (message) => {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'log', message }, '*');
      return;
    }
    const vscodeApi = globalThis.acquireVsCodeApi?.();
    if (vscodeApi && typeof vscodeApi.postMessage === 'function') {
      vscodeApi.postMessage({ type: 'log', message });
    }
  } catch (_) {
    // Ignore cross-window messaging failures.
  }
};

const toMessage = (prefix, error) => {
  if (error instanceof Error) {
    return `${prefix}: ${error.stack || error.message}`;
  }
  return `${prefix}: ${String(error)}`;
};

window.addEventListener('error', (event) => {
  postLog(toMessage('[viewer-bootstrap:error]', event.error || event.message));
});

window.addEventListener('unhandledrejection', (event) => {
  postLog(toMessage('[viewer-bootstrap:unhandledrejection]', event.reason));
});

(async () => {
  postLog('[viewer-bootstrap] start');
  const getPdfUri = () => {
    const q = new URLSearchParams(window.location.search);
    const encoded = q.get('file');
    if (encoded && !encoded.startsWith('pdf..')) {
      return encoded;
    }
    return globalThis.lwPdfUri;
  };

  const openPdfFallback = async () => {
    const pdfUri = getPdfUri();
    if (!pdfUri) {
      postLog('[viewer-bootstrap] no pdf uri');
      return;
    }
    const app = globalThis.PDFViewerApplication;
    if (!app || !app.initializedPromise || typeof app.open !== 'function') {
      postLog('[viewer-bootstrap] PDFViewerApplication not ready');
      return;
    }
    await app.initializedPromise;
    if (app.pdfDocument) {
      postLog('[viewer-bootstrap] document already loaded');
      return;
    }
    postLog(`[viewer-bootstrap] fallback open ${pdfUri}`);
    await app.open({ url: pdfUri, originalUrl: pdfUri });
    postLog('[viewer-bootstrap] fallback open done');
  };

  try {
    await import('../node_modules/pdfjs-dist/build/pdf.mjs');
    postLog('[viewer-bootstrap] loaded pdf.mjs');
  } catch (error) {
    postLog(toMessage('[viewer-bootstrap] failed pdf.mjs', error));
    throw error;
  }

  try {
    await import('../out/viewer/latexworkshop.js');
    postLog('[viewer-bootstrap] loaded latexworkshop.js');
  } catch (error) {
    postLog(toMessage('[viewer-bootstrap] failed latexworkshop.js', error));
    throw error;
  }

  try {
    await openPdfFallback();
  } catch (error) {
    postLog(toMessage('[viewer-bootstrap] fallback open failed', error));
  }
})();
