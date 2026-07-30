import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  // base44.users.inviteUser() only understands its own platform roles, so an
  // invited person arrives with no application role and no org. The intended
  // values ride on the Invitation record; acceptInvitation applies them from
  // the backend, matched to this user's own authenticated email.
  //
  // Deliberately not done here on the client: role assignment must not be
  // something the browser can ask for.
  const applyPendingInvitation = async (currentUser) => {
    if (!currentUser) return currentUser;
    // Nothing to do once they already hold a role and an org.
    if (currentUser.role && currentUser.role !== 'user' && currentUser.org_id) return currentUser;
    try {
      const res = await base44.functions.invoke('acceptInvitation', {});
      if (res?.data?.applied) {
        return await base44.auth.me();
      }
    } catch (e) {
      console.error('Failed to apply pending invitation', e);
    }
    return currentUser;
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      let currentUser;
      try {
        currentUser = await base44.auth.me();
      } catch (firstError) {
        // Retry once on spurious user_not_registered (platform timing issue)
        if (firstError.status === 403 && firstError.data?.extra_data?.reason === 'user_not_registered') {
          await new Promise(resolve => setTimeout(resolve, 1000));
          currentUser = await base44.auth.me();
        } else {
          throw firstError;
        }
      }
      currentUser = await applyPendingInvitation(currentUser);
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      // Returned so callers that need to route on the role — the login form —
      // see the invitation-applied user rather than the pre-invitation one.
      return currentUser;
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);

      if (error.status === 401 || error.status === 403) {
        const reason = error.data?.extra_data?.reason;
        setAuthError({
          type: reason === 'user_not_registered' ? 'user_not_registered' : 'auth_required',
          message: reason === 'user_not_registered' ? 'User not registered for this app' : 'Authentication required'
        });
      }
      return null;
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Return to the landing page, not window.location.href. Logging out
      // happens from /admin, which is protected — coming back to it with no
      // session means ProtectedRoute immediately fires navigateToLogin(), so
      // signing out ricochets through a blank protected page into a redirect
      // chain instead of simply landing somewhere public.
      base44.auth.logout(`${window.location.origin}/`);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Avoid passing /login as the from_url to prevent redirect loops
    const fromUrl = window.location.pathname === '/login' ? '/' : window.location.href;
    base44.auth.redirectToLogin(fromUrl);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};