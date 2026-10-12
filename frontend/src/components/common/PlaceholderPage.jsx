import { Hammer } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Badge, Card, EmptyState } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * Honest stand-in for a campus space that is not built yet. Lists what is
 * planned instead of showing invented content.
 */
export function PlaceholderPage({
  icon,
  eyebrow,
  title,
  description,
  planned = [],
  note = 'This space opens in an upcoming phase of CampusX.',
  banner,
}) {
  useDocumentTitle(eyebrow);

  return (
    <PageContainer>
      <SectionHeader
        as="h1"
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <Badge variant="accent" icon={Hammer}>
            Under construction
          </Badge>
        }
      />

      {banner && <div className="mt-6">{banner}</div>}

      <Card padding="none" className="campus-grid mt-6 overflow-hidden sm:mt-8">
        <EmptyState icon={icon} title="This part of campus is being built" description={note} />

        {planned.length > 0 && (
          <div className="border-t border-line bg-surface px-5 py-5 sm:px-8">
            <p className="text-xs font-bold tracking-[0.12em] text-ink-subtle uppercase">Planned here</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {planned.map((item) => (
                <li key={item}>
                  <Badge variant="primary">{item}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
