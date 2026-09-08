import ShipHero from './ShipHero'
import { getShipHeroProps } from './shipHeroData'

/** The ship screen. Rendered as a SECTION of the expeditions hub, and as the
 *  whole page on /expeditions/ship, /items and /forge, which pass a focus so
 *  ShipHero drops the hub and shows only that one screen.
 *
 *  The fetch itself lives in `shipHeroData` because the chart opens this same
 *  screen over the water (see ShipSheet), and a client component cannot render
 *  an async server component. One query, three ways in, so a route, the hub and
 *  the sea can never drift apart. */
export default async function ShipHeroSection({ focus }: { focus?: 'ship' | 'items' | 'forge' }) {
  return <ShipHero focus={focus} {...await getShipHeroProps()} />
}
