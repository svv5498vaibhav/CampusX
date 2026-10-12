import { Navigate } from 'react-router';
import { Loader } from '@/components/ui';

/**
 * <Navigate> that shows a loader instead of nothing. Router navigations run as React
 * transitions, so while the destination page's code is still loading, the current screen stays
 * up. With a bare <Navigate> that screen would be blank.
 */
export function RedirectTo({ to, state, fullScreen = true }) {
  return (
    <>
      <Navigate to={to} replace state={state} />
      {fullScreen ? (
        <div className="grid min-h-dvh place-items-center">
          <Loader size="lg" label="Loading" />
        </div>
      ) : (
        <Loader centered label="Loading" />
      )}
    </>
  );
}
