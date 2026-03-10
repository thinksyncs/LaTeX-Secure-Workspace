const postLog = (message) => {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'log', message }, '*');
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
})();
