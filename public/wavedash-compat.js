(function () {
  var SENTRY_HOST_TOKEN = ".ingest.us.sentry.io";
  var POINTER_LOCK_WARNING = "Unrecognized feature: 'pointer-lock'";

  function createMemoryStorage() {
    var data = {};
    return {
      getItem: function (key) {
        var normalized = String(key);
        return Object.prototype.hasOwnProperty.call(data, normalized)
          ? data[normalized]
          : null;
      },
      setItem: function (key, value) {
        data[String(key)] = String(value);
      },
      removeItem: function (key) {
        delete data[String(key)];
      },
      clear: function () {
        data = {};
      },
      key: function (index) {
        var keys = Object.keys(data);
        return keys[index] || null;
      },
    };
  }

  function isStorageUsable(storage) {
    if (!storage) return false;
    try {
      var probeKey = "__wavedash_probe__";
      storage.setItem(probeKey, "1");
      storage.removeItem(probeKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  function wrapStorageWithFallback(storage) {
    var fallback = createMemoryStorage();
    if (!storage) return fallback;

    return {
      getItem: function (key) {
        try {
          return storage.getItem(key);
        } catch (error) {
          return fallback.getItem(key);
        }
      },
      setItem: function (key, value) {
        try {
          storage.setItem(key, value);
        } catch (error) {
          fallback.setItem(key, value);
        }
      },
      removeItem: function (key) {
        try {
          storage.removeItem(key);
        } catch (error) {
          fallback.removeItem(key);
        }
      },
      clear: function () {
        try {
          storage.clear();
        } catch (error) {
          fallback.clear();
        }
      },
      key: function (index) {
        try {
          return storage.key(index);
        } catch (error) {
          return fallback.key(index);
        }
      },
    };
  }

  function installStorageGuard(storageName) {
    if (typeof window === "undefined") return;

    var existing = null;
    try {
      existing = window[storageName];
    } catch (error) {
      existing = null;
    }

    if (isStorageUsable(existing)) return;

    var safeStorage = wrapStorageWithFallback(existing);

    try {
      Object.defineProperty(window, storageName, {
        value: safeStorage,
        configurable: true,
      });
      return;
    } catch (error) {
      // Fall through to direct assignment.
    }

    try {
      window[storageName] = safeStorage;
    } catch (error) {
      // Cannot override in this runtime; app will still use native behavior.
    }
  }

  installStorageGuard("localStorage");
  installStorageGuard("sessionStorage");

  function isSentryUrl(url) {
    if (!url) return false;
    return String(url).indexOf(SENTRY_HOST_TOKEN) !== -1;
  }

  function shouldSilenceConsole(args) {
    if (!args || !args.length) return false;
    var text = String(args[0]);
    return (
      text.indexOf(POINTER_LOCK_WARNING) !== -1 ||
      (text.indexOf("ERR_BLOCKED_BY_CLIENT") !== -1 &&
        text.indexOf(SENTRY_HOST_TOKEN) !== -1)
    );
  }

  function shouldSilenceText(text) {
    if (!text) return false;
    var normalized = String(text);
    return (
      (normalized.indexOf("ERR_BLOCKED_BY_CLIENT") !== -1 &&
        normalized.indexOf(SENTRY_HOST_TOKEN) !== -1) ||
      normalized.indexOf(POINTER_LOCK_WARNING) !== -1
    );
  }

  function shouldSilenceErrorEvent(event) {
    if (!event) return false;
    if (shouldSilenceText(event.message)) return true;
    if (shouldSilenceText(event.filename)) return true;

    var target = event.target;
    if (target && target.src && shouldSilenceText(target.src)) return true;
    if (target && target.href && shouldSilenceText(target.href)) return true;
    return false;
  }

  function shouldSilenceOnError(message, source) {
    return shouldSilenceText(message) || shouldSilenceText(source);
  }

  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  ) {
    var originalOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      if (shouldSilenceOnError(message, source)) {
        return true;
      }
      if (typeof originalOnError === "function") {
        return originalOnError.call(
          this,
          message,
          source,
          lineno,
          colno,
          error,
        );
      }
      return false;
    };

    window.addEventListener(
      "error",
      function (event) {
        if (!shouldSilenceErrorEvent(event)) return;
        if (typeof event.preventDefault === "function") event.preventDefault();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      },
      true,
    );

    window.addEventListener("unhandledrejection", function (event) {
      var reason = event && event.reason;
      var message = "";
      if (typeof reason === "string") {
        message = reason;
      } else if (reason && reason.message) {
        message = reason.message;
      }

      if (!shouldSilenceText(message)) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    });
  }

  if (typeof console !== "undefined") {
    var originalWarn = console.warn ? console.warn.bind(console) : null;
    var originalError = console.error ? console.error.bind(console) : null;

    if (originalWarn) {
      console.warn = function () {
        if (shouldSilenceConsole(arguments)) return;
        originalWarn.apply(console, arguments);
      };
    }

    if (originalError) {
      console.error = function () {
        if (shouldSilenceConsole(arguments)) return;
        originalError.apply(console, arguments);
      };
    }
  }

  // Prevent noisy ERR_BLOCKED_BY_CLIENT errors from extension-blocked Sentry calls.
  if (typeof window.fetch === "function") {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      if (isSentryUrl(url)) {
        return Promise.resolve(
          new Response("", { status: 204, statusText: "No Content" }),
        );
      }
      return originalFetch(input, init);
    };
  }

  if (typeof navigator.sendBeacon === "function") {
    var originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isSentryUrl(url)) {
        return true;
      }
      return originalSendBeacon(url, data);
    };
  }

  if (typeof XMLHttpRequest !== "undefined") {
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__skipSentryRequest = isSentryUrl(url);
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      if (this.__skipSentryRequest) {
        return;
      }
      return originalSend.apply(this, arguments);
    };
  }
})();
