function createMockApi() {
  return {
    postMessage(message) {
      console.log("[Mock VSCode] postMessage:", message?.type);
    },
  };
}

export function getVsCodeApi() {
  if (typeof window === "undefined") {
    return createMockApi();
  }

  if (window.__nyxusVscodeApi) {
    return window.__nyxusVscodeApi;
  }

  const api = typeof window.acquireVsCodeApi === "function"
    ? window.acquireVsCodeApi()
    : createMockApi();

  window.__nyxusVscodeApi = api;
  return api;
}
