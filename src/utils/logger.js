function shouldLog() {
  if (typeof window === 'undefined') return true;
  try {
    return import.meta.env.DEV || window.localStorage.getItem('dd-debug') === '1';
  } catch {
    return import.meta.env.DEV;
  }
}

function formatScope(scope) {
  return `[DD:${scope}]`;
}

export function createLogger(scope) {
  const prefix = formatScope(scope);

  return {
    debug(message, data) {
      if (!shouldLog()) return;
      console.debug(prefix, message, data ?? '');
    },
    info(message, data) {
      if (!shouldLog()) return;
      console.info(prefix, message, data ?? '');
    },
    warn(message, data) {
      if (!shouldLog()) return;
      console.warn(prefix, message, data ?? '');
    },
    error(message, data) {
      if (!shouldLog()) return;
      console.error(prefix, message, data ?? '');
    },
  };
}
