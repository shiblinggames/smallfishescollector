import SaltRoadDigestView from './SaltRoadDigestView'
import { folkState } from '../sea/folkActions'

/**
 * WHERE YOU STAND WITH THE NINE.
 *
 * The regulars are the one system on this sea a captain can sail past for a
 * week without discovering, and the payoff for the ones who do not is a month
 * of sailing per person. Until now the only place that showed it was a modal
 * hanging off the chart, which meant the longest relationship in the game was
 * also the one with the least evidence that it existed.
 *
 * ── READ-ONLY, AND THAT IS THE POINT ────────────────────────────────────────
 *
 * No talking, no gifts, no tapping through. Rapport moves by pulling alongside
 * somebody on the water, and the moment it can be worked from a menu, sailing
 * out to find Meg stops being the point of Meg. The tavern is allowed to
 * remember them; it is not allowed to replace them.
 *
 * ── AND IT IS A DIGEST, NOT THE WALL ────────────────────────────────────────
 *
 * Three faces and two numbers. Nine cards here would be a roster, and this page
 * already has a room and a crew above it; the full set lives on the chart,
 * where the people are. The three shown are the ones you have got FURTHEST
 * with, because that is the part worth being reminded of.
 */
export default async function SaltRoadDigest() {
  return <SaltRoadDigestView rap={await folkState()} />
}
