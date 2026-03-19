// desh bridge plugin — receives JS code from CLI, executes in Figma context

figma.showUI(__html__, { visible: true, width: 280, height: 200, themeColors: true });

var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Yield helper — lets long-running evals periodically release Figma's main thread.
// Injected into every eval'd function as a parameter so generated code can call it.
// Without this, rapid sequences of figma.create* calls saturate the main thread,
// freezing the UI and starving the plugin iframe's poll loop (causing disconnects).
var __deshYield = (function () {
  var counter = 0;
  return async function (every) {
    if (++counter % (every || 5) === 0) {
      await new Promise(function (r) { setTimeout(r, 0); });
    }
  };
})();

figma.ui.on('message', function (msg) {
  if (msg.type !== 'exec') return;

  // Notify UI that execution started
  figma.ui.postMessage({ id: msg.id, type: 'exec-start', code: msg.code });

  // Run execution with a timeout to prevent hung sandbox
  var timeout = msg.timeout || 30000;

  var done = false;
  var timer = setTimeout(function () {
    if (done) return;
    done = true;
    clearInterval(heartbeat);
    figma.ui.postMessage({
      id: msg.id,
      type: 'error',
      message: 'Plugin execution timed out after ' + timeout + 'ms',
    });
  }, timeout);

  // Heartbeat — periodically tell UI we're still alive during long executions.
  // The yield helper releases the main thread so this interval can actually fire.
  var heartbeat = setInterval(function () {
    if (done) { clearInterval(heartbeat); return; }
    figma.ui.postMessage({ id: msg.id, type: 'heartbeat' });
  }, 10000);

  // Execute asynchronously without blocking the message handler
  (async function () {
    try {
      var result;
      try {
        var exprFn = new AsyncFunction('__deshYield', 'return (\n' + msg.code + '\n)');
        result = await exprFn(__deshYield);
      } catch (syntaxErr) {
        if (syntaxErr instanceof SyntaxError) {
          var bodyFn = new AsyncFunction('__deshYield', msg.code);
          result = await bodyFn(__deshYield);
        } else {
          throw syntaxErr;
        }
      }
      if (!done) {
        done = true;
        clearTimeout(timer);
        clearInterval(heartbeat);
        figma.ui.postMessage({ id: msg.id, type: 'result', value: result });
      }
    } catch (err) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        clearInterval(heartbeat);
        figma.ui.postMessage({
          id: msg.id,
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })();
});
