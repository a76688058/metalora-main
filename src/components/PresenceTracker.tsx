import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function PresenceTracker() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!supabase || !user) return; // Only track authenticated users

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        // Presence synced
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            is_member: !!user,
            user_id: user?.id || null,
            full_name: profile?.full_name || 'Guest',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [user, profile]);

  return null;
}
