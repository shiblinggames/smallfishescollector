// next/dynamic, for the desktop shell: React.lazy behind a Suspense boundary.
// `ssr: false` means nothing here (there is no server). A loader may resolve to
// a module with a default export or straight to the component.

import { lazy, Suspense, type ComponentType } from 'react'

type Loaded<P> = ComponentType<P> | { default: ComponentType<P> }
type Opts = { ssr?: boolean; loading?: ComponentType<Record<string, unknown>> }

export default function dynamic<P extends object>(loader: () => Promise<Loaded<P>>, opts?: Opts): ComponentType<P> {
  const Lazy = lazy(async () => {
    const m = await loader()
    return (typeof m === 'object' && m !== null && 'default' in m) ? m : { default: m as ComponentType<P> }
  }) as unknown as ComponentType<P>
  const Loading = opts?.loading
  function Dynamic(props: P) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  return Dynamic
}
