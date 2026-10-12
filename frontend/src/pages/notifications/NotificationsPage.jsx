import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences';
import { Button, Modal } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** /notifications: everything that happened around the student's campus life, newest first. */
export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <PageContainer width="narrow">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Notifications</h1>
          <p className="mt-1 text-ink-muted">Likes, comments and news from your campus, all in one place.</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={Settings2} onClick={() => setSettingsOpen(true)}>
          Settings
        </Button>
      </header>

      <NotificationCenter />

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Notification settings" description="Choose what you hear about. Changes save straight away.">
        <NotificationPreferences />
      </Modal>
    </PageContainer>
  );
}
