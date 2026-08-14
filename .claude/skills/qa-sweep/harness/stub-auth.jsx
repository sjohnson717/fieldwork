// AuthContext, stubbed, aliased over @/lib/AuthContext.
//
// The real one bootstraps against the platform's public-settings endpoint and
// needs a token in the page, so staff screens cannot be driven without either a
// live login — which QA must never do — or this.
//
// Set the signed-in account before the app mounts. sessionStorage as well as the
// global, because a page that redirects — which is most of what staff routing
// does — loses anything held only in the page:
//
//   qaSignIn({ email: "sam@example.com", role: "facilitator" })   // staff
//   qaSignIn({ email: "sam@example.com", role: "user" })          // signed in, no access
//   qaSignIn(null)                                               // anonymous
//
// window.__qaUser still works for a single page load.
//
// The role also drives the base44 stub's permission checks, so a page that reads
// an entity it may not read still fails here the way it would in production.

import React, { createContext, useContext } from "react";

const AuthContext = createContext(null);

const KEY = "qa.user";

const readUser = () => {
  if (typeof window === "undefined") return null;
  if (window.__qaUser) return window.__qaUser;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

if (typeof window !== "undefined") {
  window.qaSignIn = (user) => {
    try {
      if (user) sessionStorage.setItem(KEY, JSON.stringify(user));
      else sessionStorage.removeItem(KEY);
    } catch {
      // Private mode: the global below still covers a single page load.
    }
    window.__qaUser = user || null;
    return user;
  };
}

export function AuthProvider({ children }) {
  const user = readUser();
  if (typeof window !== "undefined" && window.__qa) window.__qa.user = user;

  const value = {
    user,
    isAuthenticated: !!user,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authChecked: true,
    authError: null,
    appPublicSettings: { id: "qa", public_settings: {} },
    checkUserAuth: async () => user,
    navigateToLogin: () => { window.location.href = "/login"; },
    logout: async () => { window.qaSignIn(null); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
