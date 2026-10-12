import { RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Badge, Button, Card } from '@/components/ui';
import { API_BASE_URL } from '@/constants/app';
import { useApiHealth } from '@/hooks/useApiHealth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/utils/cn';

const CONNECTION_META = {
  checking: { label: 'Checking…', dot: 'bg-ink-subtle animate-pulse', text: 'text-ink-muted' },
  online: { label: 'Connected', dot: 'bg-primary', text: 'text-primary' },
  offline: { label: 'Offline', dot: 'bg-danger', text: 'text-danger-fg' },
};

const SERVICE_VARIANTS = {
  connected: 'primary',
  connecting: 'accent',
  not_configured: 'neutral',
};

function ServiceBadge({ value }) {
  return <Badge variant={SERVICE_VARIANTS[value] ?? 'danger'}>{value.replace('_', ' ')}</Badge>;
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-bold tracking-[0.12em] text-ink-subtle uppercase">{label}</dt>
      <dd className="mt-1.5 text-sm break-all text-ink">{children}</dd>
    </div>
  );
}

/**
 * Development-only page (excluded from production builds) that checks the
 * frontend can reach GET /api/v1/health. Not part of the student UI.
 */
export default function DevStatusPage() {
  useDocumentTitle('System status');
  const { status, health, error, checkedAt, refresh } = useApiHealth();
  const connection = CONNECTION_META[status];

  return (
    <PageContainer width="narrow" className="stack-section">
      <SectionHeader
        as="h1"
        eyebrow="Developer tools"
        title="System status"
        description="Checks that the frontend can reach the CampusX API. Development only, never shown to students."
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">CampusX Backend</h2>
            <p role="status" className={cn('mt-1 inline-flex items-center gap-2 text-sm font-semibold', connection.text)}>
              <span className={cn('size-2.5 rounded-full', connection.dot)} aria-hidden="true" />
              {connection.label}
            </p>
          </div>
          <Button variant="outline" size="sm" leftIcon={RefreshCw} loading={status === 'checking'} onClick={refresh}>
            Check again
          </Button>
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-2">
          <Detail label="API base URL">
            <code className="font-mono text-xs">{API_BASE_URL}</code>
          </Detail>
          <Detail label="Last checked">{checkedAt ? checkedAt.toLocaleTimeString() : '-'}</Detail>
          {health && (
            <>
              <Detail label="Environment">{health.environment}</Detail>
              <Detail label="Database">
                <ServiceBadge value={health.database} />
              </Detail>
              <Detail label="Redis">
                <ServiceBadge value={health.redis} />
              </Detail>
            </>
          )}
        </dl>

        {status === 'offline' && (
          <p className="mt-6 rounded-2xl bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger-fg">
            {error} Start the API with <code className="font-mono">npm run backend</code> and check{' '}
            <code className="font-mono">VITE_API_URL</code> in <code className="font-mono">frontend/.env</code>.
          </p>
        )}
      </Card>
    </PageContainer>
  );
}
