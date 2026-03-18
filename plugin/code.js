// desh bridge plugin — receives JS code from CLI, executes in Figma context

figma.showUI(__html__, { visible: true, width: 280, height: 200, themeColors: true });

var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

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
    figma.ui.postMessage({
      id: msg.id,
      type: 'error',
      message: 'Plugin execution timed out after ' + timeout + 'ms',
    });
  }, timeout);

  // Execute asynchronously without blocking the message handler
  (async function () {
    try {
      var result;
      try {
        var exprFn = new AsyncFunction('return (\n' + msg.code + '\n)');
        result = await exprFn();
      } catch (syntaxErr) {
        if (syntaxErr instanceof SyntaxError) {
          var bodyFn = new AsyncFunction(msg.code);
          result = await bodyFn();
        } else {
          throw syntaxErr;
        }
      }
      if (!done) {
        done = true;
        clearTimeout(timer);
        figma.ui.postMessage({ id: msg.id, type: 'result', value: result });
      }
    } catch (err) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        figma.ui.postMessage({
          id: msg.id,
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })();
});
