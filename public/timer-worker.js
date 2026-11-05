// Worker timers aren't throttled in hidden tabs, so the alarm still rings on time.
setInterval(() => postMessage(0), 250);
