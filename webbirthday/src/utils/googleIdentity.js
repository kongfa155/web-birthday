const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
let scriptPromise = null;
let activeRegistration = null;

export function loadGoogleIdentityScript(timeoutMs = 10000) {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
    };
    const fail = (message) => {
      cleanup();
      script?.remove();
      scriptPromise = null;
      reject(new Error(message));
    };
    const onLoad = () => {
      if (!window.google?.accounts?.id) return fail("Không thể khởi tạo đăng nhập Google. Vui lòng thử lại.");
      cleanup();
      resolve(window.google.accounts.id);
    };
    const onError = () => fail("Không thể kết nối tới Google. Vui lòng thử lại.");
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
    }
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    timer = setTimeout(() => fail("Kết nối tới Google quá lâu. Vui lòng thử lại."), timeoutMs);
    if (!script.isConnected) document.head.appendChild(script);
  });
  return scriptPromise;
}

export function initializeGoogleSignIn({ clientId, nonce, callback }) {
  const google = window.google?.accounts?.id;
  if (!google || !clientId || !nonce) throw new Error("Đăng nhập Google chưa sẵn sàng. Vui lòng thử lại.");
  const registration = { callback };
  activeRegistration = registration;
  google.initialize({
    client_id: clientId,
    nonce,
    callback: (response) => {
      if (activeRegistration === registration) registration.callback(response);
    },
    auto_select: false,
    ux_mode: "popup",
  });
  return {
    isCurrent: () => activeRegistration === registration,
    unregister: () => { if (activeRegistration === registration) activeRegistration = null; },
  };
}

export function renderGoogleSignInButton(container, options = {}) {
  if (!window.google?.accounts?.id || !container) return;
  window.google.accounts.id.renderButton(container, {
    type: "standard", text: "signin_with", theme: "outline", size: "large", locale: "vi", width: 320, ...options,
  });
}
