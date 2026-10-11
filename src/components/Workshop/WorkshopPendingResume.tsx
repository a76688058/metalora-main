import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { hasWorkshopPendingAdd } from './pendingCartAuth';

/**
 * Mounted with the customer shell, which is present after OAuth returns.
 * Opens Workshop once when a logged-in session still has a pending add.
 * WorkshopView owns the file restore and the single cart submit.
 */
export default function WorkshopPendingResume() {
  const { user, requestCustomAccess } = useAuth();
  const openedRef = useRef(false);

  useEffect(() => {
    if (!user || openedRef.current) return;
    if (!hasWorkshopPendingAdd()) return;
    openedRef.current = true;
    requestCustomAccess();
  }, [user, requestCustomAccess]);

  return null;
}
