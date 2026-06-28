import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ActivityLogger } from '../utils/activityLogger';

export function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    ActivityLogger.log('nav', {
      path: location.pathname,
      search: location.search
    });
  }, [location]);

  return null;
}